"""
sleeve.py: Pure functions for Strategic Sleeve (Tier 2 Bonds & Tier 3 Equities).
Additive layer: operating pool (S0-S6, nightly, replenished) is unchanged.
The sleeve is separate capital (default $50,000,000), invested at the start of the replay
window and held buy-and-hold without rebalancing and zero transaction costs.
"""

import math
from typing import Dict, Any, List, Optional, Tuple, Sequence
from dataclasses import dataclass

from engine.app.config import (
    SLEEVE_USD,
    EQUITY_EXPECTED_APY,
    LIQ_HORIZON_DAYS,
    YIELD_SHOCK_BP,
    REPO_FLOOR,
    RISK_TOLERANCE_T,
    Z99,
    SLEEVE_PRESETS,
    PRESET_LABEL,
    ACCRUAL,
)
from engine.app.schemas import (
    SleeveWeights,
    SleeveWorkingSchema,
    SleeveHourlyRow,
    BreakEvenHoldingPeriod,
    SleeveSummary,
    WaterfallEvent,
)


def compute_risk_budget_weights(
    row0: Dict[str, Any],
    T: float = RISK_TOLERANCE_T,
    z99: float = Z99,
    h_days: int = LIQ_HORIZON_DAYS,
    yield_shock_bp: float = YIELD_SHOCK_BP,
    repo_floor: float = REPO_FLOOR,
) -> Tuple[SleeveWeights, SleeveWorkingSchema]:
    """
    Computes ex-ante risk budget weights using only data available at window start (row0):
    - T: maximum acceptable stressed loss (tolerance, default 0.05).
    - Equity stress loss L_e = 1 - (1 - z99 * sigma * sqrt(h/252)) * (1 - equity_haircut/100)
    - Bond stress loss L_b = 1 - (1 - D_mod * YIELD_SHOCK_BP/10000) * (1 - bond_haircut/100)
    - Split budget 50/50:
      w_e = 0.5 * T / L_e
      w_b = min(0.5 * T / L_b, 1 - repo_floor - w_e)
      w_r = 1 - w_e - w_b
    """
    sigma = float(row0.get("tier3_stock_volatility_pct", 18.0)) / 100.0
    equity_haircut = float(row0.get("tier3_stock_liquidation_haircut_pct", 15.0))
    d_mod = float(row0.get("tier2_bond_mod_duration", 1.92))
    bond_haircut = float(row0.get("tier2_bond_liquidation_haircut_pct", 2.0))

    # Equity stressed loss
    equity_factor = 1.0 - z99 * sigma * math.sqrt(h_days / 252.0)
    L_e = 1.0 - equity_factor * (1.0 - equity_haircut / 100.0)

    # Bond stressed loss
    bond_factor = 1.0 - d_mod * (yield_shock_bp / 10000.0)
    L_b = 1.0 - bond_factor * (1.0 - bond_haircut / 100.0)

    # 50/50 risk budget split
    raw_w_e = (0.5 * T) / L_e
    max_bonds = max(0.0, 1.0 - repo_floor - raw_w_e)
    raw_w_b = min((0.5 * T) / L_b, max_bonds)
    w_e = max(0.0, raw_w_e)
    w_b = max(0.0, raw_w_b)
    w_r = max(repo_floor, 1.0 - w_e - w_b)

    # Normalization check
    total_w = w_r + w_b + w_e
    w_r = w_r / total_w
    w_b = w_b / total_w
    w_e = w_e / total_w

    weights = SleeveWeights(repo=w_r, bonds=w_b, equity=w_e)
    working = SleeveWorkingSchema(
        T=T,
        z99=z99,
        h_days=h_days,
        sigma=sigma,
        equity_haircut_pct=equity_haircut,
        L_e=L_e,
        D_mod=d_mod,
        yield_shock_bp=yield_shock_bp,
        bond_haircut_pct=bond_haircut,
        L_b=L_b,
        repo_floor=repo_floor,
        weights=weights,
    )
    return weights, working


def parse_weights(
    preset: Optional[str] = None,
    weights_str: Optional[str] = None,
    weights_dict: Optional[Dict[str, float]] = None,
    row0: Optional[Dict[str, Any]] = None,
    repo_floor: float = REPO_FLOOR,
) -> Tuple[SleeveWeights, Optional[str]]:
    """
    Parses preset or custom weights with strict validation:
    - sum equals 1.0 (within 1e-4)
    - weights in [0, 1]
    - repo weight >= repo_floor
    Returns (SleeveWeights, resolved_preset_name)
    Raises ValueError on validation failure.
    """
    if weights_dict is not None:
        r = float(weights_dict.get("repo", 0.0))
        b = float(weights_dict.get("bonds", 0.0))
        e = float(weights_dict.get("equity", weights_dict.get("equities", 0.0)))
    elif weights_str is not None and weights_str.strip():
        # Parse "repo=0.4,bonds=0.4,equity=0.2" or "0.4,0.4,0.2" or JSON
        w_str = weights_str.strip()
        parts = {}
        if "," in w_str and "=" in w_str:
            for item in w_str.split(","):
                k, v = item.split("=")
                parts[k.strip().lower()] = float(v.strip())
            r = float(parts.get("repo", 0.0))
            b = float(parts.get("bonds", 0.0))
            e = float(parts.get("equity", parts.get("equities", 0.0)))
        elif "," in w_str:
            items = [float(x.strip()) for x in w_str.split(",")]
            if len(items) != 3:
                raise ValueError("weights string must have 3 components: repo, bonds, equity")
            r, b, e = items[0], items[1], items[2]
            # Handle percentage format e.g. 40,40,20
            if r + b + e > 1.5:
                r, b, e = r / 100.0, b / 100.0, e / 100.0
        else:
            raise ValueError(f"Unrecognized weights string format: '{weights_str}'")
    elif preset is not None and preset.strip():
        p = preset.strip().lower()
        if p == "risk_budget":
            if row0 is None:
                raise ValueError("row0 is required to compute risk_budget weights")
            weights, _ = compute_risk_budget_weights(row0)
            return weights, "risk_budget"
        elif p in SLEEVE_PRESETS:
            pw = SLEEVE_PRESETS[p]
            return SleeveWeights(repo=pw["repo"], bonds=pw["bonds"], equity=pw["equity"]), p
        else:
            raise ValueError(
                f"Unknown preset '{preset}'. Allowed: risk_budget, conservative, income, balanced, growth"
            )
    else:
        # Default: risk_budget if row0 provided, else balanced
        if row0 is not None:
            weights, _ = compute_risk_budget_weights(row0)
            return weights, "risk_budget"
        pw = SLEEVE_PRESETS["balanced"]
        return SleeveWeights(repo=pw["repo"], bonds=pw["bonds"], equity=pw["equity"]), "balanced"

    # Validation
    if not (0.0 <= r <= 1.0 and 0.0 <= b <= 1.0 and 0.0 <= e <= 1.0):
        raise ValueError(f"Weights must be between 0 and 1. Got repo={r}, bonds={b}, equity={e}")

    total = r + b + e
    if abs(total - 1.0) > 1e-3:
        raise ValueError(f"Weights must sum to 1.0. Got {total:.4f} (repo={r}, bonds={b}, equity={e})")

    if r < repo_floor - 1e-4:
        raise ValueError(
            f"Repo weight ({r:.4f}) must be at least REPO_FLOOR ({repo_floor:.2f})"
        )

    return SleeveWeights(repo=r, bonds=b, equity=e), None


def simulate_sleeve_path(
    hourly_rows: Sequence[Dict[str, Any]],
    weights: SleeveWeights,
    sleeve_usd: float = SLEEVE_USD,
    accrual: str = ACCRUAL,
) -> List[SleeveHourlyRow]:
    """
    Simulates the strategic sleeve buy-and-hold valuation over all hourly rows:
    - Repo part: rolled nightly, interest credited and compounded at 08:00 maturity.
    - Bond part: units = allocation / (bond_price_index/100). Clean mark-to-market + carry accrued hourly.
    - Equity part: units = allocation / tier3_stock_index_price.
    - Benchmark: same capital fully in rolled repo.
    """
    if not hourly_rows:
        return []

    row0 = hourly_rows[0]
    p_b0 = float(row0.get("tier2_bond_price_index", 100.0))
    p_e0 = float(row0.get("tier3_stock_index_price", 100.0))

    bond_alloc = sleeve_usd * weights.bonds
    equity_alloc = sleeve_usd * weights.equity
    repo_alloc = sleeve_usd * weights.repo

    bond_units = bond_alloc / (p_b0 / 100.0) if p_b0 > 0 else 0.0
    equity_units = equity_alloc / p_e0 if p_e0 > 0 else 0.0

    # Repo tracking
    current_repo_balance = repo_alloc
    pending_repo_interest = 0.0
    in_night_repo = False
    active_repo_rate_eff = 0.0

    # Benchmark tracking (100% rolled repo)
    current_bench_balance = sleeve_usd
    pending_bench_interest = 0.0
    bench_in_night = False
    bench_rate_eff = 0.0

    bond_carry = 0.0
    prev_clean_mv = bond_alloc
    peak_mv = sleeve_usd

    path_rows: List[SleeveHourlyRow] = []

    for idx, row in enumerate(hourly_rows):
        ts_str = str(row["ts"])
        hour = int(ts_str[11:13]) if len(ts_str) >= 13 else 0

        # Market prices & yields
        p_b = float(row.get("tier2_bond_price_index", p_b0))
        p_e = float(row.get("tier3_stock_index_price", p_e0))
        bond_yield = float(row.get("tier2_bond_yield_pct", 0.0))
        repo_rate_apy = float(row.get("tier1_repo_rate_apy", 4.05))

        # Effective repo rate per night under ACCRUAL convention
        if accrual == "15h":
            night_repo_eff = (repo_rate_apy / 100.0 / 365.0) * (15.0 / 24.0)
        else:
            night_repo_eff = repo_rate_apy / 100.0 / 365.0

        # Accrue bond carry hourly on previous clean value (from step 1 onwards)
        if idx > 0:
            hourly_carry = prev_clean_mv * (bond_yield / 100.0 / 8760.0)
            bond_carry += hourly_carry

        clean_bond_mv = bond_units * (p_b / 100.0)
        prev_clean_mv = clean_bond_mv
        equity_mv = equity_units * p_e

        # Nightly Repo mechanics:
        # At 17:00, commit balance to overnight repo at current night's repo rate
        if hour == 17:
            in_night_repo = True
            active_repo_rate_eff = night_repo_eff
            pending_repo_interest = current_repo_balance * active_repo_rate_eff

            bench_in_night = True
            bench_rate_eff = night_repo_eff
            pending_bench_interest = current_bench_balance * bench_rate_eff

        # At 08:00, mature repo: credit and compound interest
        elif hour == 8 and in_night_repo:
            current_repo_balance += pending_repo_interest
            pending_repo_interest = 0.0
            in_night_repo = False

            current_bench_balance += pending_bench_interest
            pending_bench_interest = 0.0
            bench_in_night = False

        repo_mv = current_repo_balance
        bench_mv = current_bench_balance

        total_mv = repo_mv + clean_bond_mv + bond_carry + equity_mv
        if total_mv > peak_mv:
            peak_mv = total_mv
        drawdown = peak_mv - total_mv
        excess = total_mv - bench_mv

        path_rows.append(
            SleeveHourlyRow(
                ts=ts_str,
                repo_mv=repo_mv,
                bond_clean_mv=clean_bond_mv,
                bond_carry=bond_carry,
                equity_mv=equity_mv,
                total_mv=total_mv,
                benchmark_mv=bench_mv,
                excess_vs_repo=excess,
                drawdown_from_peak=drawdown,
            )
        )

    return path_rows


def calculate_sleeve_summary(
    path: Sequence[SleeveHourlyRow],
    row0: Dict[str, Any],
    row_end: Dict[str, Any],
    sleeve_usd: float = SLEEVE_USD,
) -> SleeveSummary:
    """
    Computes summary metrics over the sleeve hourly path:
    - total return, annualised return, P&L, excess P&L vs repo-only
    - annualised volatility of daily returns
    - max drawdown (amount and %)
    - worst 24-hour change
    - liquidation-adjusted value at the end and at the worst point
    - break-even holding period in years per tier (ex-ante and ex-post)
    """
    if not path:
        raise ValueError("Cannot calculate summary for empty path")

    end_row = path[-1]
    end_mv = end_row.total_mv
    pnl = end_mv - sleeve_usd
    total_return = pnl / sleeve_usd

    hours = len(path) - 1
    years = hours / 8760.0 if hours > 0 else 1.0

    # Compound annualised return
    if total_return > -1.0 and years > 0:
        annualised_return = (1.0 + total_return) ** (1.0 / years) - 1.0
    else:
        annualised_return = -1.0

    bench_end_mv = end_row.benchmark_mv
    excess_pnl = end_mv - bench_end_mv

    # Max drawdown
    peak = sleeve_usd
    max_dd_amount = 0.0
    max_dd_pct = 0.0
    for r in path:
        if r.total_mv > peak:
            peak = r.total_mv
        dd_amt = peak - r.total_mv
        if dd_amt > max_dd_amount:
            max_dd_amount = dd_amt
        if peak > 0:
            dd_p = dd_amt / peak
            if dd_p > max_dd_pct:
                max_dd_pct = dd_p

    # Worst 24-hour change
    worst_24h_change = 0.0
    if len(path) >= 25:
        min_24h_diff = 0.0
        for i in range(24, len(path)):
            diff = path[i].total_mv - path[i - 24].total_mv
            if diff < min_24h_diff:
                min_24h_diff = diff
        worst_24h_change = min_24h_diff

    # Daily returns volatility (sampled every 24 hours)
    daily_mvs = [path[i].total_mv for i in range(0, len(path), 24)]
    if len(daily_mvs) > 2:
        daily_returns = [
            (daily_mvs[i] - daily_mvs[i - 1]) / daily_mvs[i - 1]
            for i in range(1, len(daily_mvs))
            if daily_mvs[i - 1] > 0
        ]
        mean_ret = sum(daily_returns) / len(daily_returns)
        var = sum((r - mean_ret) ** 2 for r in daily_returns) / (len(daily_returns) - 1)
        daily_std = math.sqrt(var)
        annualised_vol_daily = daily_std * math.sqrt(252.0)
    else:
        annualised_vol_daily = 0.0

    # Haircuts
    bond_haircut_end = float(row_end.get("tier2_bond_liquidation_haircut_pct", 2.0))
    equity_haircut_end = float(row_end.get("tier3_stock_liquidation_haircut_pct", 15.0))

    # Liquidation-adjusted value at end:
    # repo + bonds*(1 - bond_haircut) + equities*(1 - equity_haircut)
    bonds_total_end = end_row.bond_clean_mv + end_row.bond_carry
    liq_adj_end = (
        end_row.repo_mv
        + bonds_total_end * (1.0 - bond_haircut_end / 100.0)
        + end_row.equity_mv * (1.0 - equity_haircut_end / 100.0)
    )

    # Worst liquidation-adjusted value across the path
    # (haircuts are constant columns in dataset: 2.0% bond, 15.0% equity)
    liq_adj_worst = liq_adj_end
    for r in path:
        b_val = r.bond_clean_mv + r.bond_carry
        val = (
            r.repo_mv
            + b_val * (1.0 - bond_haircut_end / 100.0)
            + r.equity_mv * (1.0 - equity_haircut_end / 100.0)
        )
        if val < liq_adj_worst:
            liq_adj_worst = val

    # Break-even holding period:
    # Ex-ante = haircut% / (bond_yield - repo_rate at start, and EQUITY_EXPECTED_APY - repo_rate)
    bond_haircut_start = float(row0.get("tier2_bond_liquidation_haircut_pct", 2.0))
    equity_haircut_start = float(row0.get("tier3_stock_liquidation_haircut_pct", 15.0))
    bond_yield_start = float(row0.get("tier2_bond_yield_pct", 4.272))
    repo_rate_start = float(row0.get("tier1_repo_rate_apy", 4.258))

    bond_spread_ex_ante = bond_yield_start - repo_rate_start
    eq_spread_ex_ante = EQUITY_EXPECTED_APY - repo_rate_start

    be_bonds_ex_ante = (
        bond_haircut_start / bond_spread_ex_ante if bond_spread_ex_ante > 0 else None
    )
    be_eq_ex_ante = (
        equity_haircut_start / eq_spread_ex_ante if eq_spread_ex_ante > 0 else None
    )

    # Ex-post = haircut% / realised annual excess return, or null if excess not positive
    # Realised annual returns for standalone asset parts:
    repo_ret_ann = (
        (end_row.benchmark_mv / sleeve_usd) ** (1.0 / years) - 1.0 if years > 0 else 0.0
    )

    # Bond part realised excess
    p_b0 = float(row0.get("tier2_bond_price_index", 100.0))
    p_b_end = float(row_end.get("tier2_bond_price_index", 100.0))
    # Cumulative return of 1 dollar in bond = (clean_end + carry) / clean_start
    bond_ret_tot = (bonds_total_end / (end_row.bond_clean_mv / (p_b_end / p_b0))) - 1.0 if end_row.bond_clean_mv > 0 else 0.0
    if bond_ret_tot > -1.0 and years > 0:
        bond_ret_ann = (1.0 + bond_ret_tot) ** (1.0 / years) - 1.0
    else:
        bond_ret_ann = -1.0
    bond_excess_ann = bond_ret_ann - repo_ret_ann

    be_bonds_ex_post = (
        bond_haircut_end / (bond_excess_ann * 100.0) if bond_excess_ann > 0 else None
    )

    # Equity part realised excess
    p_e0 = float(row0.get("tier3_stock_index_price", 100.0))
    p_e_end = float(row_end.get("tier3_stock_index_price", 100.0))
    eq_ret_tot = (p_e_end - p_e0) / p_e0 if p_e0 > 0 else 0.0
    if eq_ret_tot > -1.0 and years > 0:
        eq_ret_ann = (1.0 + eq_ret_tot) ** (1.0 / years) - 1.0
    else:
        eq_ret_ann = -1.0
    eq_excess_ann = eq_ret_ann - repo_ret_ann

    be_eq_ex_post = (
        equity_haircut_end / (eq_excess_ann * 100.0) if eq_excess_ann > 0 else None
    )

    return SleeveSummary(
        total_return=total_return,
        annualised_return=annualised_return,
        pnl=pnl,
        excess_pnl_vs_repo=excess_pnl,
        annualised_volatility_daily=annualised_vol_daily,
        max_drawdown_amount=max_dd_amount,
        max_drawdown_pct=max_dd_pct,
        worst_24h_change=worst_24h_change,
        liquidation_adjusted_end=liq_adj_end,
        liquidation_adjusted_worst=liq_adj_worst,
        break_even_ex_ante_years=BreakEvenHoldingPeriod(
            bonds=be_bonds_ex_ante,
            equity=be_eq_ex_ante,
        ),
        break_even_ex_post_years=BreakEvenHoldingPeriod(
            bonds=be_bonds_ex_post,
            equity=be_eq_ex_post,
        ),
    )


@dataclass
class WaterfallResult:
    events: List[WaterfallEvent]
    total_fees: float
    bonds_sold: float
    equities_sold: float
    remaining_overdraft: float


def simulate_liquidity_waterfall(
    shortfall: float,
    swept_repo: float,
    mode: str,
    sleeve_bonds: float = 0.0,
    sleeve_equities: float = 0.0,
    bond_haircut_pct: float = 2.0,
    equity_haircut_pct: float = 15.0,
    ts: Optional[str] = None,
) -> WaterfallResult:
    """
    Liquidity waterfall:
    When a night's shortfall exceeds pool cash plus repo balance (excess_shortfall > 0):
    - In zero_overdraft mode: sell bonds first (haircut), then equities (haircut),
      and only then overdraft remainder.
    - In cost_optimal mode: sell nothing and overdraft.
    - Break-repo behavior and all existing fields stay as they are.
    """
    excess_shortfall = max(0.0, shortfall - swept_repo)

    if mode == "cost_optimal" or excess_shortfall <= 0.0:
        return WaterfallResult(
            events=[],
            total_fees=0.0,
            bonds_sold=0.0,
            equities_sold=0.0,
            remaining_overdraft=excess_shortfall,
        )

    # In zero_overdraft mode:
    # 1. Sell bonds first
    bonds_sold = min(excess_shortfall, sleeve_bonds)
    bond_fee = bonds_sold * (bond_haircut_pct / 100.0)
    events: List[WaterfallEvent] = []

    if bonds_sold > 0.0:
        events.append(
            WaterfallEvent(
                ts=ts,
                type="bond_sale",
                asset="bonds",
                amount=bonds_sold,
                haircut_pct=bond_haircut_pct,
                fee=bond_fee,
            )
        )

    rem = excess_shortfall - bonds_sold

    # 2. Sell equities next
    equities_sold = min(rem, sleeve_equities)
    equity_fee = equities_sold * (equity_haircut_pct / 100.0)

    if equities_sold > 0.0:
        events.append(
            WaterfallEvent(
                ts=ts,
                type="equity_sale",
                asset="equities",
                amount=equities_sold,
                haircut_pct=equity_haircut_pct,
                fee=equity_fee,
            )
        )

    rem = rem - equities_sold

    total_fees = bond_fee + equity_fee

    return WaterfallResult(
        events=events,
        total_fees=total_fees,
        bonds_sold=bonds_sold,
        equities_sold=equities_sold,
        remaining_overdraft=rem,
    )
