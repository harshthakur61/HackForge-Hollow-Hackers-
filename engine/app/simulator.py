"""
simulator.py: Simulates overnight cash flow and repo mechanics for the 15-hour window
(17:00 on date D through 07:00 on date D+1).
"""

import datetime
from dataclasses import dataclass
from typing import Sequence, Optional, Dict, Any
import numpy as np
from engine.app.config import (
    POOL_USD,
    ACCRUAL,
    POLICY_MODE,
    DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
    DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
)


@dataclass
class NightResult:
    interest: float
    break_fee: float
    broken_amount: float
    overdraft_peak: float
    overdraft_cost: float
    net_pnl: float
    shortfall_peak: float
    payouts_honored: bool
    idle_cash_at_17: float


def simulate_night(
    flows_15h: Sequence[float],
    pool: float = POOL_USD,
    buffer: float = 0.0,
    repo_rate: float = 4.05,
    config: Optional[Dict[str, Any]] = None,
) -> NightResult:
    """
    Simulates a 15-hour overnight window (17:00 to 07:00):
    - flows_15h: sequence of 15 hourly net cash flows (net_flow_usd).
    - pool: starting cash pool at 17:00.
    - buffer: cash reserved in Tier 0.
    - repo_rate: floating APY % for Tier 1 repo.
    """
    cfg = config or {}
    mode = cfg.get("POLICY_MODE", POLICY_MODE)
    accrual = cfg.get("ACCRUAL", ACCRUAL)
    haircut_pct = float(cfg.get("haircut_pct", DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT))
    overdraft_apr = float(cfg.get("overdraft_apr", DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT))

    # Clamp buffer to [0, pool]
    buffer = float(np.clip(buffer, 0.0, pool))
    swept_initial = float(pool - buffer)
    idle_cash_at_17 = buffer

    # Accrual multiplier for overnight repo interest
    if accrual == "15h":
        repo_rate_eff = (repo_rate / 100.0 / 365.0) * (15.0 / 24.0)
    else:  # "overnight_1d"
        repo_rate_eff = repo_rate / 100.0 / 365.0

    # Hourly overdraft cost rate per dollar
    hourly_od_rate = overdraft_apr / 100.0 / 365.0 / 24.0

    broken_amount = 0.0
    break_fee = 0.0
    overdraft_cost = 0.0
    overdraft_peak = 0.0
    shortfall_peak = 0.0

    # Shortfall = cumulative cash below zero
    cumulative_cash = buffer
    EPSILON = 1e-4

    for flow in flows_15h:
        cumulative_cash += float(flow)

        if cumulative_cash < -EPSILON:
            shortfall = -cumulative_cash
            if shortfall > shortfall_peak:
                shortfall_peak = shortfall

            if mode == "zero_overdraft":
                # Cover shortfall by breaking repo early
                new_broken = min(shortfall, swept_initial)
                if new_broken > broken_amount:
                    additional_break = new_broken - broken_amount
                    break_fee += additional_break * (haircut_pct / 100.0)
                    broken_amount = new_broken

                # Overdraft occurs only if shortfall exceeds entire repo balance
                current_od = max(0.0, shortfall - swept_initial)
                if current_od > overdraft_peak:
                    overdraft_peak = current_od
                if current_od > 0.0:
                    overdraft_cost += current_od * hourly_od_rate
            else:
                # "cost_optimal": no repo breaking; entire shortfall is covered by overdraft
                current_od = shortfall
                if current_od > overdraft_peak:
                    overdraft_peak = current_od
                overdraft_cost += current_od * hourly_od_rate

    # At 08:00 maturity: interest paid on remaining unbroken repo principal
    swept_remaining = max(0.0, swept_initial - broken_amount)
    interest = swept_remaining * repo_rate_eff

    net_pnl = interest - break_fee - overdraft_cost

    return NightResult(
        interest=interest,
        break_fee=break_fee,
        broken_amount=broken_amount,
        overdraft_peak=overdraft_peak,
        overdraft_cost=overdraft_cost,
        net_pnl=net_pnl,
        shortfall_peak=shortfall_peak,
        payouts_honored=True,
        idle_cash_at_17=idle_cash_at_17,
    )


def simulate_night_trace(
    hourly_rows_15h: Any,
    pool: float = POOL_USD,
    buffer: float = 0.0,
    repo_rate: float = 4.05,
    config: Optional[Dict[str, Any]] = None,
) -> tuple[NightResult, list[dict]]:
    """
    Simulates night and returns (NightResult, trace) where trace contains
    15 hourly rows (17:00 to 07:00) plus the 16th row for 08:00 settlement.
    """
    cfg = config or {}
    mode = cfg.get("POLICY_MODE", POLICY_MODE)
    accrual = cfg.get("ACCRUAL", ACCRUAL)
    haircut_pct = float(cfg.get("haircut_pct", DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT))
    overdraft_apr = float(cfg.get("overdraft_apr", DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT))

    # Convert DataFrame to list of dicts if necessary
    if hasattr(hourly_rows_15h, "to_dict"):
        rows = hourly_rows_15h.to_dict(orient="records")
    else:
        rows = list(hourly_rows_15h)

    buffer = float(np.clip(buffer, 0.0, pool))
    swept_initial = float(pool - buffer)
    idle_cash_at_17 = buffer

    if accrual == "15h":
        repo_rate_eff = (repo_rate / 100.0 / 365.0) * (15.0 / 24.0)
    else:
        repo_rate_eff = repo_rate / 100.0 / 365.0

    hourly_od_rate = overdraft_apr / 100.0 / 365.0 / 24.0

    broken_amount = 0.0
    break_fee = 0.0
    overdraft_cost = 0.0
    overdraft_peak = 0.0
    shortfall_peak = 0.0

    cumulative_cash = buffer
    EPSILON = 1e-4

    trace = []

    for r in rows:
        flow = float(r.get("net_flow_usd", r.get("net_flow", 0.0)))
        dep = float(r.get("deposits_usd", r.get("deposits", 0.0)))
        wd = float(r.get("withdrawals_usd", r.get("withdrawals", 0.0)))
        ts_val = r.get("ts", r.get("timestamp", ""))
        ts_str = ts_val.isoformat() if hasattr(ts_val, "isoformat") else str(ts_val)

        cumulative_cash += flow

        event = None
        event_amount = 0.0
        event_fee = 0.0
        current_od = 0.0

        if cumulative_cash < -EPSILON:
            shortfall = -cumulative_cash
            if shortfall > shortfall_peak:
                shortfall_peak = shortfall

            if mode == "zero_overdraft":
                new_broken = min(shortfall, swept_initial)
                if new_broken > broken_amount:
                    add_break = new_broken - broken_amount
                    add_fee = add_break * (haircut_pct / 100.0)
                    break_fee += add_fee
                    broken_amount = new_broken
                    event = "repo_break"
                    event_amount = add_break
                    event_fee = add_fee

                current_od = max(0.0, shortfall - swept_initial)
                if current_od > overdraft_peak:
                    overdraft_peak = current_od
                if current_od > 0.0:
                    od_fee_hour = current_od * hourly_od_rate
                    overdraft_cost += od_fee_hour
                    if event is None:
                        event = "overdraft"
                        event_amount = current_od
                        event_fee = od_fee_hour

                # Effective cash position after repo break / overdraft
                cash_after = max(0.0, cumulative_cash + broken_amount + current_od)
            else:  # cost_optimal
                current_od = shortfall
                if current_od > overdraft_peak:
                    overdraft_peak = current_od
                od_fee_hour = current_od * hourly_od_rate
                overdraft_cost += od_fee_hour
                event = "overdraft"
                event_amount = current_od
                event_fee = od_fee_hour

                # In cost_optimal, cash is maintained by overdraft facility
                cash_after = 0.0
        else:
            cash_after = max(0.0, cumulative_cash)

        repo_remaining = max(0.0, swept_initial - broken_amount)

        trace.append({
            "ts": ts_str,
            "deposits": dep,
            "withdrawals": wd,
            "net_flow": flow,
            "cash": cash_after,
            "repo": repo_remaining,
            "overdraft": current_od,
            "event": event,
            "event_amount": event_amount,
            "event_fee": event_fee,
        })

    # At 08:00 maturity
    swept_remaining = max(0.0, swept_initial - broken_amount)
    interest = swept_remaining * repo_rate_eff
    net_pnl = interest - break_fee - overdraft_cost

    # 16th row: 08:00 settlement
    last_ts_str = trace[-1]["ts"] if trace else "2026-01-01T07:00:00"
    try:
        last_dt = datetime.datetime.fromisoformat(last_ts_str)
        settle_ts = (last_dt + datetime.timedelta(hours=1)).isoformat()
    except Exception:
        settle_ts = f"{last_ts_str} +1h"

    trace.append({
        "ts": settle_ts,
        "deposits": 0.0,
        "withdrawals": 0.0,
        "net_flow": 0.0,
        "cash": pool + net_pnl,
        "repo": 0.0,
        "overdraft": 0.0,
        "event": None,
        "event_amount": 0.0,
        "event_fee": 0.0,
    })

    result = NightResult(
        interest=interest,
        break_fee=break_fee,
        broken_amount=broken_amount,
        overdraft_peak=overdraft_peak,
        overdraft_cost=overdraft_cost,
        net_pnl=net_pnl,
        shortfall_peak=shortfall_peak,
        payouts_honored=True,
        idle_cash_at_17=idle_cash_at_17,
    )

    return result, trace
