#!/usr/bin/env python3
"""
backtest_strategies.py: Evaluates all buffer allocation strategies across the 308 walk-forward nights.
Persists decision records to PostgreSQL 'decisions' table.
Generates charts and summary report in docs/backtest/.
"""

import sys
from pathlib import Path

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import psycopg
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from dotenv import load_dotenv

from engine.app.config import (
    DATABASE_URL,
    POOL_USD,
    ACCRUAL,
    POLICY_MODE,
    MODEL_FOR_POLICY,
    DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
    DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
)
from engine.app.policy import interpolate_buffer_at_quantile
from engine.app.simulator import simulate_night, NightResult
from engine.app.strategies import STRATEGY_NAMES, get_strategy_buffer


def load_backtest_data(db_url: str):
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            # 1. Hourly market data
            cur.execute("SELECT * FROM market_data ORDER BY ts ASC;")
            cols = [desc[0] for desc in cur.description]
            df_hourly = pd.DataFrame(cur.fetchall(), columns=cols)

            # 2. Persisted walk-forward forecasts
            cur.execute("SELECT * FROM forecasts ORDER BY night_date ASC, model ASC, quantile ASC;")
            f_cols = [desc[0] for desc in cur.description]
            df_forecasts = pd.DataFrame(cur.fetchall(), columns=f_cols)

    for c in df_hourly.columns:
        if c != "ts" and c not in ("repo_sweep_window_open", "repo_sweep_mature"):
            df_hourly[c] = pd.to_numeric(df_hourly[c])

    for c in ["quantile", "buffer_usd", "actual_required_usd"]:
        df_forecasts[c] = pd.to_numeric(df_forecasts[c])

    return df_hourly, df_forecasts


def build_nightly_windows(df_hourly: pd.DataFrame) -> dict:
    """
    Builds a dictionary mapping sweep_date -> {
        'flows_15h': list of 15 hourly flows,
        'repo_rate': float,
        'haircut_pct': float,
        'overdraft_apr': float,
        'min_cumsum': float,
        'required_buffer_usd': float,
        'dow': int,
        'is_fri_sat': bool,
        'has_outlier': bool
    }
    """
    df = df_hourly.copy()
    df["hour"] = df["ts"].dt.hour
    stats = df.groupby("hour").agg({
        "deposits_usd": ["mean", "std"],
        "withdrawals_usd": ["mean", "std"],
    })

    outlier_ts = set()
    for _, r in df.iterrows():
        h = r["hour"]
        dm, ds = stats.loc[h, ("deposits_usd", "mean")], stats.loc[h, ("deposits_usd", "std")]
        wm, ws = stats.loc[h, ("withdrawals_usd", "mean")], stats.loc[h, ("withdrawals_usd", "std")]
        if abs(r["deposits_usd"] - dm) / ds > 4.0 or abs(r["withdrawals_usd"] - wm) / ws > 4.0:
            outlier_ts.add(r["ts"])

    sweep_indices = df[df["repo_sweep_window_open"] == True].index
    windows = {}
    for idx in sweep_indices:
        if idx + 15 <= len(df):
            win = df.iloc[idx : idx + 15]
            sweep_ts = win.iloc[0]["ts"]
            d = sweep_ts.date()
            cumsum = win["net_flow_usd"].cumsum()
            min_cumsum = float(cumsum.min())
            req_buf = max(0.0, -min_cumsum)
            repo_rate = float(win.iloc[0]["tier1_repo_rate_apy"])
            haircut = float(win.iloc[0]["tier1_early_redemption_haircut_pct"])
            od_apr = float(win.iloc[0]["emergency_overdraft_penalty_apr_pct"])
            dow = sweep_ts.weekday()
            has_outlier = any(ts in outlier_ts for ts in win["ts"])

            windows[d] = {
                "sweep_date": d,
                "flows_15h": win["net_flow_usd"].tolist(),
                "repo_rate": repo_rate,
                "haircut_pct": haircut,
                "overdraft_apr": od_apr,
                "min_cumsum": min_cumsum,
                "required_buffer_usd": req_buf,
                "dow": dow,
                "is_fri_sat": dow in (4, 5),
                "has_outlier": has_outlier,
            }

    return windows


def run_strategy_backtest(
    df_hourly: pd.DataFrame,
    df_forecasts: pd.DataFrame,
    pool: float = POOL_USD,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Executes all strategies across the common 308 evaluation nights.
    """
    windows = build_nightly_windows(df_hourly)
    eval_dates = sorted(df_forecasts["night_date"].unique())

    all_dates_sorted = sorted(windows.keys())
    target_history_map = {d: windows[d]["required_buffer_usd"] for d in all_dates_sorted}

    results = []

    for d in eval_dates:
        w = windows[d]
        flows = w["flows_15h"]
        repo_rate = w["repo_rate"]
        haircut = w["haircut_pct"]
        od_apr = w["overdraft_apr"]
        actual_req = w["required_buffer_usd"]
        dow = w["dow"]
        is_fri_sat = w["is_fri_sat"]
        has_outlier = w["has_outlier"]

        # Prior targets strictly before date d
        prior_targets = pd.Series([target_history_map[k] for k in all_dates_sorted if k < d])
        f_night = df_forecasts[df_forecasts["night_date"] == d]

        for strat in STRATEGY_NAMES:
            # Policy mode override for S4 vs S5
            if strat == "S4_policy_zero_overdraft":
                strat_mode = "zero_overdraft"
            elif strat == "S5_policy_cost_optimal":
                strat_mode = "cost_optimal"
            else:
                strat_mode = POLICY_MODE

            cfg = {
                "POLICY_MODE": strat_mode,
                "ACCRUAL": ACCRUAL,
                "MODEL_FOR_POLICY": MODEL_FOR_POLICY,
                "haircut_pct": haircut,
                "overdraft_apr": od_apr,
            }

            buffer_usd, dec = get_strategy_buffer(
                strategy=strat,
                night_date=d,
                forecasts_for_night=f_night,
                prior_targets=prior_targets,
                actual_required_usd=actual_req,
                repo_rate=repo_rate,
                haircut_pct=haircut,
                overdraft_apr=od_apr,
                pool=pool,
                config=cfg,
            )

            sim_res: NightResult = simulate_night(
                flows_15h=flows,
                pool=pool,
                buffer=buffer_usd,
                repo_rate=repo_rate,
                config=cfg,
            )

            # Metadata for decision table
            if dec:
                model_used = dec.model
                quantile_used = dec.quantile_used
                reason = dec.reason
            else:
                model_used = "RULE"
                quantile_used = 1.0 if strat in ("S0_all_cash", "S6_oracle") else 0.0
                reason = f"Strategy={strat}, Buffer=${buffer_usd:,.2f}"

            results.append({
                "night_date": d,
                "strategy": strat,
                "model": model_used,
                "quantile_used": quantile_used,
                "buffer_usd": buffer_usd,
                "sweep_usd": pool - buffer_usd,
                "repo_apy": repo_rate,
                "reason": reason,
                "interest": sim_res.interest,
                "break_fee": sim_res.break_fee,
                "broken_amount": sim_res.broken_amount,
                "overdraft_cost": sim_res.overdraft_cost,
                "overdraft_peak": sim_res.overdraft_peak,
                "net_pnl": sim_res.net_pnl,
                "shortfall_peak": sim_res.shortfall_peak,
                "payouts_honored": sim_res.payouts_honored,
                "idle_cash_at_17": sim_res.idle_cash_at_17,
                "actual_required_usd": actual_req,
                "is_fri_sat": is_fri_sat,
                "has_outlier": has_outlier,
            })

    # Sensitivity table for S4 across fixed quantiles
    sensitivity_records = []
    sens_quantiles = [0.90, 0.95, 0.98, 0.99, 0.995]

    for d in eval_dates:
        w = windows[d]
        flows = w["flows_15h"]
        repo_rate = w["repo_rate"]
        haircut = w["haircut_pct"]
        od_apr = w["overdraft_apr"]
        f_night = df_forecasts[
            (df_forecasts["night_date"] == d) & (df_forecasts["model"] == MODEL_FOR_POLICY)
        ]
        f_dict = {float(r["quantile"]): float(r["buffer_usd"]) for _, r in f_night.iterrows()}

        for q in sens_quantiles:
            buf = float(np.clip(interpolate_buffer_at_quantile(f_dict, q), 0.0, pool))
            cfg = {
                "POLICY_MODE": "zero_overdraft",
                "ACCRUAL": ACCRUAL,
                "haircut_pct": haircut,
                "overdraft_apr": od_apr,
            }
            res = simulate_night(
                flows_15h=flows,
                pool=pool,
                buffer=buf,
                repo_rate=repo_rate,
                config=cfg,
            )
            sensitivity_records.append({
                "night_date": d,
                "quantile": q,
                "buffer_usd": buf,
                "interest": res.interest,
                "break_fee": res.break_fee,
                "broken_amount": res.broken_amount,
                "overdraft_cost": res.overdraft_cost,
                "net_pnl": res.net_pnl,
                "shortfall_peak": res.shortfall_peak,
            })

    return pd.DataFrame(results), pd.DataFrame(sensitivity_records)


def compute_strategy_summary(df_strat: pd.DataFrame, pool: float = POOL_USD) -> pd.DataFrame:
    """
    Computes summary table for a subset of nights.
    """
    oracle_pnl = df_strat[df_strat["strategy"] == "S6_oracle"]["net_pnl"].sum()
    rows = []

    for strat in STRATEGY_NAMES:
        sdf = df_strat[df_strat["strategy"] == strat]
        if sdf.empty:
            continue

        n_nights = len(sdf)
        tot_interest = float(sdf["interest"].sum())
        tot_break_fee = float(sdf["break_fee"].sum())
        tot_od_cost = float(sdf["overdraft_cost"].sum())
        tot_net_pnl = float(sdf["net_pnl"].sum())

        # Net yield in bps of pool per year: (P&L / pool) * (365 / N) * 10,000 bps
        net_yield_bps = (tot_net_pnl / pool) * (365.0 / n_nights) * 10000.0

        mean_buffer = float(sdf["buffer_usd"].mean())
        mean_idle = float(sdf["idle_cash_at_17"].mean())
        break_nights = int((sdf["broken_amount"] > 0).sum())
        od_nights = int((sdf["overdraft_cost"] > 0).sum())
        worst_shortfall = float(sdf["shortfall_peak"].max())
        payout_rate = float(sdf["payouts_honored"].mean()) * 100.0
        capture_ratio = (tot_net_pnl / oracle_pnl) if oracle_pnl > 0 else 0.0

        rows.append({
            "strategy": strat,
            "nights": n_nights,
            "interest": tot_interest,
            "break_fees": tot_break_fee,
            "overdraft_cost": tot_od_cost,
            "net_pnl": tot_net_pnl,
            "net_yield_bps": net_yield_bps,
            "mean_buffer": mean_buffer,
            "mean_idle_17": mean_idle,
            "break_nights": break_nights,
            "od_nights": od_nights,
            "worst_shortfall": worst_shortfall,
            "payout_success_pct": payout_rate,
            "capture_ratio": capture_ratio,
        })

    return pd.DataFrame(rows)


def compute_sensitivity_summary(df_sens: pd.DataFrame, oracle_pnl: float, pool: float = POOL_USD) -> pd.DataFrame:
    rows = []
    quantiles = sorted(df_sens["quantile"].unique())

    for q in quantiles:
        qdf = df_sens[np.isclose(df_sens["quantile"], q)]
        n_nights = len(qdf)
        tot_interest = float(qdf["interest"].sum())
        tot_break_fee = float(qdf["break_fee"].sum())
        tot_od_cost = float(qdf["overdraft_cost"].sum())
        tot_pnl = float(qdf["net_pnl"].sum())
        net_yield_bps = (tot_pnl / pool) * (365.0 / n_nights) * 10000.0
        mean_buf = float(qdf["buffer_usd"].mean())
        break_nights = int((qdf["broken_amount"] > 0).sum())
        od_nights = int((qdf["overdraft_cost"] > 0).sum())
        capture = (tot_pnl / oracle_pnl) if oracle_pnl > 0 else 0.0

        rows.append({
            "quantile": q,
            "mean_buffer": mean_buf,
            "interest": tot_interest,
            "break_fees": tot_break_fee,
            "overdraft_cost": tot_od_cost,
            "net_pnl": tot_pnl,
            "net_yield_bps": net_yield_bps,
            "break_nights": break_nights,
            "od_nights": od_nights,
            "capture_ratio": capture,
        })

    return pd.DataFrame(rows)


def persist_decisions_to_db(df_strat: pd.DataFrame, db_url: str):
    cols = [
        "night_date",
        "strategy",
        "model",
        "quantile_used",
        "buffer_usd",
        "sweep_usd",
        "repo_apy",
        "reason",
        "interest",
        "break_fee",
        "overdraft_cost",
        "net_pnl",
    ]
    records = []
    for _, r in df_strat.iterrows():
        records.append((
            r["night_date"],
            r["strategy"],
            r["model"],
            float(r["quantile_used"]),
            float(r["buffer_usd"]),
            float(r["sweep_usd"]),
            float(r["repo_apy"]),
            r["reason"],
            float(r["interest"]),
            float(r["break_fee"]),
            float(r["overdraft_cost"]),
            float(r["net_pnl"]),
        ))

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE decisions;")
            copy_sql = f"COPY decisions ({', '.join(cols)}) FROM STDIN"
            with cur.copy(copy_sql) as copy:
                for row in records:
                    copy.write_row(row)
        conn.commit()


def generate_charts(
    df_strat: pd.DataFrame,
    out_dir: Path,
):
    out_dir.mkdir(parents=True, exist_ok=True)
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")

    eval_dates = sorted(df_strat["night_date"].unique())

    # 1. Cumulative Net P&L by Strategy
    fig, ax = plt.subplots(figsize=(12, 6), dpi=300)
    colors = {
        "S0_all_cash": "#94a3b8",
        "S1_fixed_10": "#f59e0b",
        "S2_fixed_20": "#d97706",
        "S3_static": "#6366f1",
        "S4_policy_zero_overdraft": "#2563eb",
        "S5_policy_cost_optimal": "#059669",
        "S6_oracle": "#0f172a",
    }
    linestyles = {
        "S0_all_cash": ":",
        "S1_fixed_10": "--",
        "S2_fixed_20": "-.",
        "S3_static": "--",
        "S4_policy_zero_overdraft": "-",
        "S5_policy_cost_optimal": "-",
        "S6_oracle": "-",
    }

    for strat in STRATEGY_NAMES:
        sdf = df_strat[df_strat["strategy"] == strat].sort_values("night_date")
        cum_pnl = sdf["net_pnl"].cumsum() / 1e3  # in thousands USD
        final_val = cum_pnl.iloc[-1]
        ax.plot(
            sdf["night_date"],
            cum_pnl,
            label=f"{strat} (${final_val:,.1f}k)",
            color=colors.get(strat, "#6b7280"),
            ls=linestyles.get(strat, "-"),
            lw=2.0 if strat in ("S4_policy_zero_overdraft", "S5_policy_cost_optimal", "S6_oracle") else 1.4,
        )

    ax.set_ylabel("Cumulative Net P&L ($ Thousands)")
    ax.set_xlabel("Night Date")
    ax.set_title("Walk-Forward Cumulative Net P&L by Strategy (308 Nights)", fontsize=13, fontweight="bold")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    ax.legend(loc="upper left", frameon=True)
    plt.tight_layout()
    plt.savefig(out_dir / "cumulative_pnl_by_strategy.png")
    plt.close()

    # 2. Buffer vs Actual Required Buffer for 8 weeks (last 56 nights)
    last_8w_dates = eval_dates[-56:]
    sub_8w = df_strat[df_strat["night_date"].isin(last_8w_dates)]

    fig, ax = plt.subplots(figsize=(13, 6), dpi=300)
    actual_b = [
        sub_8w[(sub_8w["night_date"] == d) & (sub_8w["strategy"] == "S6_oracle")]["buffer_usd"].iloc[0] / 1e6
        for d in last_8w_dates
    ]
    s4_b = [
        sub_8w[(sub_8w["night_date"] == d) & (sub_8w["strategy"] == "S4_policy_zero_overdraft")]["buffer_usd"].iloc[0] / 1e6
        for d in last_8w_dates
    ]
    s5_b = [
        sub_8w[(sub_8w["night_date"] == d) & (sub_8w["strategy"] == "S5_policy_cost_optimal")]["buffer_usd"].iloc[0] / 1e6
        for d in last_8w_dates
    ]
    s3_b = [
        sub_8w[(sub_8w["night_date"] == d) & (sub_8w["strategy"] == "S3_static")]["buffer_usd"].iloc[0] / 1e6
        for d in last_8w_dates
    ]
    s2_b = [
        sub_8w[(sub_8w["night_date"] == d) & (sub_8w["strategy"] == "S2_fixed_20")]["buffer_usd"].iloc[0] / 1e6
        for d in last_8w_dates
    ]

    ax.plot(last_8w_dates, actual_b, label="Actual Required Buffer", color="#0f172a", lw=2.2, marker="o", markersize=4)
    ax.plot(last_8w_dates, s4_b, label="S4 Zero Overdraft Buffer", color="#2563eb", lw=2)
    ax.plot(last_8w_dates, s5_b, label="S5 Cost Optimal Buffer", color="#059669", lw=1.8, ls="--")
    ax.plot(last_8w_dates, s3_b, label="S3 Static Buffer", color="#6366f1", lw=1.5, ls=":")
    ax.plot(last_8w_dates, s2_b, label="S2 Fixed 20% ($20M)", color="#d97706", lw=1.2, ls="-.")

    ax.set_ylabel("Buffer Allocated (USD Millions)")
    ax.set_xlabel("Night Date")
    ax.set_title("Strategy Buffer Allocation vs Actual Required Buffer (8 Weeks)", fontsize=13, fontweight="bold")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.legend(loc="upper right", frameon=True)
    plt.tight_layout()
    plt.savefig(out_dir / "buffer_vs_actual_8weeks.png")
    plt.close()


def print_and_write_results(
    t_all: pd.DataFrame,
    t_frisat: pd.DataFrame,
    t_outliers: pd.DataFrame,
    t_sens: pd.DataFrame,
    docs_dir: Path,
):
    def print_terminal_table(df: pd.DataFrame, title: str):
        print("\n" + "=" * 125)
        print(title)
        print("=" * 125)
        print(f"{'Strategy':>24} | {'Interest ($)':>14} | {'Break Fee':>11} | {'Overdraft':>11} | {'Net P&L ($)':>14} | {'Yield(bps)':>10} | {'Mean Buf($)':>14} | {'Breaks':>6} | {'ODs':>5} | {'Capture':>8}")
        print("-" * 125)
        for _, r in df.iterrows():
            print(
                f"{r['strategy']:>24} | {r['interest']:14,.2f} | {r['break_fees']:11,.2f} | "
                f"{r['overdraft_cost']:11,.2f} | {r['net_pnl']:14,.2f} | {r['net_yield_bps']:10.2f} | "
                f"{r['mean_buffer']:14,.2f} | {int(r['break_nights']):6d} | {int(r['od_nights']):5d} | "
                f"{r['capture_ratio']:8.4f}"
            )

    print_terminal_table(t_all, "TABLE 1: STRATEGY PERFORMANCE — ALL EVALUATION NIGHTS (308 NIGHTS)")
    print_terminal_table(t_frisat, "TABLE 2: STRATEGY PERFORMANCE — FRIDAY & SATURDAY NIGHTS ONLY (88 NIGHTS)")
    print_terminal_table(t_outliers, "TABLE 3: STRATEGY PERFORMANCE — NIGHTS WITH >4-SIGMA OUTLIER HOUR (24 NIGHTS)")

    print("\n" + "=" * 105)
    print("DIAGNOSTIC SENSITIVITY TABLE FOR S4 (EVALUATED ON SAME NIGHTS, NOT TUNED)")
    print("=" * 105)
    print(f"{'Quantile q':>10} | {'Mean Buffer ($)':>16} | {'Interest ($)':>14} | {'Break Fees ($)':>14} | {'Net P&L ($)':>14} | {'Yield(bps)':>10} | {'Breaks':>7} | {'Capture':>8}")
    print("-" * 105)
    for _, r in t_sens.iterrows():
        print(
            f"{r['quantile']:10.3f} | {r['mean_buffer']:16,.2f} | {r['interest']:14,.2f} | "
            f"{r['break_fees']:14,.2f} | {r['net_pnl']:14,.2f} | {r['net_yield_bps']:10.2f} | "
            f"{int(r['break_nights']):7d} | {r['capture_ratio']:8.4f}"
        )

    # Write docs/backtest/results.md
    res_md = docs_dir / "results.md"
    with open(res_md, "w") as f:
        f.write("# Strategy Backtest and Policy Engine Results\n\n")
        f.write("Evaluation framework: 308 out-of-sample nights (indices 56 to 363). Each night starts with a replenished pool of $100,000,000. All decisions are executed at 17:00 and simulated over the 15-hour overnight window through 08:00 maturity.\n\n")
        f.write("> **Selection Bias Note**: The default model used for S4 and S5 (`MODEL_FOR_POLICY = 'B1'`) was selected based on achieving the lowest total cost in the Step 3 evaluation over the same out-of-sample nights. This diagnostic selection is subject to in-sample model selection bias.\n\n")
        f.write("---\n\n")

        f.write("## 1. Visualizations\n\n")
        f.write("![Cumulative Net PnL](cumulative_pnl_by_strategy.png)\n\n")
        f.write("![Buffer vs Actual 8 Weeks](buffer_vs_actual_8weeks.png)\n\n")
        f.write("---\n\n")

        f.write("## 2. Strategy Performance Comparison\n\n")
        for df_t, title in [
            (t_all, "Table 1: All Evaluation Nights (308 Nights)"),
            (t_frisat, "Table 2: Friday & Saturday Nights Only (88 Nights)"),
            (t_outliers, "Table 3: Nights Containing a >4-Sigma Outlier Hour (24 Nights)"),
        ]:
            f.write(f"### {title}\n\n")
            f.write("| Strategy | Total Interest ($) | Break Fees ($) | Overdraft Cost ($) | Net P&L ($) | Net Yield (bps) | Mean Buffer ($) | Break Nights | Overdraft Nights | Worst Shortfall ($) | Payout Success | Capture Ratio |\n")
            f.write("|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n")
            for _, r in df_t.iterrows():
                f.write(
                    f"| `{r['strategy']}` | {r['interest']:,.2f} | {r['break_fees']:,.2f} | "
                    f"{r['overdraft_cost']:,.2f} | {r['net_pnl']:,.2f} | {r['net_yield_bps']:.2f} | "
                    f"{r['mean_buffer']:,.2f} | {int(r['break_nights'])} | {int(r['od_nights'])} | "
                    f"{r['worst_shortfall']:,.2f} | {r['payout_success_pct']:.1f}% | {r['capture_ratio']:.4f} |\n"
                )
            f.write("\n")

        f.write("### Table 4: Diagnostic Sensitivity for S4 Across Quantiles (Evaluated on Same Nights, Not Tuned)\n\n")
        f.write("| Quantile $q$ | Mean Buffer ($) | Total Interest ($) | Break Fees ($) | Overdraft Cost ($) | Net P&L ($) | Net Yield (bps) | Break Nights | Overdraft Nights | Capture Ratio |\n")
        f.write("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n")
        for _, r in t_sens.iterrows():
            f.write(
                f"| {r['quantile']:.3f} | {r['mean_buffer']:,.2f} | {r['interest']:,.2f} | "
                f"{r['break_fees']:,.2f} | {r['overdraft_cost']:,.2f} | {r['net_pnl']:,.2f} | "
                f"{r['net_yield_bps']:.2f} | {int(r['break_nights'])} | {int(r['od_nights'])} | {r['capture_ratio']:.4f} |\n"
            )
        f.write("\n")

    print(f"\nReport written to {res_md}")


def main():
    docs_dir = REPO_ROOT / "docs" / "backtest"
    docs_dir.mkdir(parents=True, exist_ok=True)

    print(f"Connecting to database at {DATABASE_URL}...")
    df_hourly, df_forecasts = load_backtest_data(DATABASE_URL)
    print(f"Loaded {len(df_hourly)} hourly rows and {len(df_forecasts)} forecast rows.")

    print(f"Running strategy backtest across {len(df_forecasts['night_date'].unique())} evaluation nights...")
    df_strat, df_sens = run_strategy_backtest(df_hourly, df_forecasts, pool=POOL_USD)
    print(f"Backtest completed: generated {len(df_strat)} strategy simulation records.")

    # Compute summary tables
    t_all = compute_strategy_summary(df_strat, pool=POOL_USD)
    t_frisat = compute_strategy_summary(df_strat[df_strat["is_fri_sat"] == True], pool=POOL_USD)
    t_outliers = compute_strategy_summary(df_strat[df_strat["has_outlier"] == True], pool=POOL_USD)

    oracle_pnl = float(df_strat[df_strat["strategy"] == "S6_oracle"]["net_pnl"].sum())
    t_sens = compute_sensitivity_summary(df_sens, oracle_pnl=oracle_pnl, pool=POOL_USD)

    # Persist decisions to Postgres
    print("\nPersisting decisions to PostgreSQL 'decisions' table...")
    persist_decisions_to_db(df_strat, DATABASE_URL)
    print("Decisions persisted successfully.")

    # Generate charts and write markdown report
    print("\nGenerating charts and results.md...")
    generate_charts(df_strat, docs_dir)
    print_and_write_results(t_all, t_frisat, t_outliers, t_sens, docs_dir)


if __name__ == "__main__":
    main()
