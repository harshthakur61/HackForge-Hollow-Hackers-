"""
stress.py: Pure functions for synthetic liquidity stress testing.
Supports three stress scenarios applied strictly to night flows (after 17:00 decision):
1. withdrawal_surge: multiply withdrawals by m (1.0 to 4.0) between hour_from and hour_to.
2. bank_run: extra outflow of x% of POOL_USD (1 to 40) spread evenly over k hours (1 to 6) starting at start_hour.
3. deposit_freeze: multiply deposits by f (0.0 to 1.0) between hour_from and hour_to.

Stress is applied ONLY to flows after the 17:00 decision.
The decision for each strategy is computed exactly as in the backtest from stored forecasts,
so the shock is a surprise when informed=False.
When informed=True, the buffer for forecast-based strategies (S3, S4, S5) is increased by
the deterministic extra cumulative outflow of the scenario (the trough of the added flow).
"""

from copy import deepcopy
import datetime
from typing import Sequence, Dict, Any, List, Optional, Tuple
import numpy as np

from engine.app.config import POOL_USD, ACCRUAL, POLICY_MODE, MODEL_FOR_POLICY
from engine.app.simulator import simulate_night, simulate_night_trace, NightResult


def validate_stress_params(scenario: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates scenario parameters against allowed bounds.
    Raises ValueError with explanatory message if invalid.
    """
    if scenario == "withdrawal_surge":
        if "m" not in params:
            raise ValueError("withdrawal_surge requires parameter 'm'")
        m = float(params["m"])
        if m < 1.0 or m > 4.0:
            raise ValueError(f"m must be between 1.0 and 4.0, got {m}")

        hour_from = int(params.get("hour_from", 0))
        hour_to = int(params.get("hour_to", 14))
        if hour_from < 0 or hour_from > 14:
            raise ValueError(f"hour_from must be between 0 and 14, got {hour_from}")
        if hour_to < 0 or hour_to > 14:
            raise ValueError(f"hour_to must be between 0 and 14, got {hour_to}")
        if hour_from > hour_to:
            raise ValueError(f"hour_from ({hour_from}) cannot be greater than hour_to ({hour_to})")
        return {"m": m, "hour_from": hour_from, "hour_to": hour_to}

    elif scenario == "bank_run":
        if "x" not in params:
            raise ValueError("bank_run requires parameter 'x'")
        x = float(params["x"])
        # Support extra 0 for neutral backtest equivalence testing
        if x < 0.0 or x > 40.0:
            raise ValueError(f"x must be between 0.0 and 40.0, got {x}")

        k = int(params.get("k", 1))
        if k < 1 or k > 6:
            raise ValueError(f"k must be between 1 and 6, got {k}")

        start_hour = int(params.get("start_hour", 0))
        if start_hour < 0 or start_hour > 14:
            raise ValueError(f"start_hour must be between 0 and 14, got {start_hour}")
        if start_hour + k > 15:
            raise ValueError(f"start_hour + k must be <= 15, got {start_hour} + {k} = {start_hour + k}")
        return {"x": x, "k": k, "start_hour": start_hour}

    elif scenario == "deposit_freeze":
        if "f" not in params:
            raise ValueError("deposit_freeze requires parameter 'f'")
        f = float(params["f"])
        if f < 0.0 or f > 1.0:
            raise ValueError(f"f must be between 0.0 and 1.0, got {f}")

        hour_from = int(params.get("hour_from", 0))
        hour_to = int(params.get("hour_to", 14))
        if hour_from < 0 or hour_from > 14:
            raise ValueError(f"hour_from must be between 0 and 14, got {hour_from}")
        if hour_to < 0 or hour_to > 14:
            raise ValueError(f"hour_to must be between 0 and 14, got {hour_to}")
        if hour_from > hour_to:
            raise ValueError(f"hour_from ({hour_from}) cannot be greater than hour_to ({hour_to})")
        return {"f": f, "hour_from": hour_from, "hour_to": hour_to}

    else:
        raise ValueError(f"Unknown scenario '{scenario}'. Allowed: withdrawal_surge, bank_run, deposit_freeze")


def apply_stress_to_hourly_rows(
    hourly_rows_15h: Sequence[Dict[str, Any]],
    scenario: str,
    params: Dict[str, Any],
    pool: float = POOL_USD,
) -> List[Dict[str, Any]]:
    """
    Applies stress ONLY to flows of the 15-hour night (after the 17:00 decision).
    Returns a new list of dicts with updated withdrawals, deposits, and net_flow.
    Preserves exact original net_flow when neutral parameters are supplied.
    """
    validated = validate_stress_params(scenario, params)
    stressed_rows = []

    if scenario == "withdrawal_surge":
        m = validated["m"]
        h_from = validated["hour_from"]
        h_to = validated["hour_to"]
        for idx, row in enumerate(hourly_rows_15h):
            r = dict(row)
            dep = float(r.get("deposits_usd", r.get("deposits", 0.0)))
            wd = float(r.get("withdrawals_usd", r.get("withdrawals", 0.0)))
            orig_net = float(r.get("net_flow_usd", r.get("net_flow", dep - wd)))
            extra_wd = 0.0
            if h_from <= idx <= h_to:
                extra_wd = wd * (m - 1.0)
                wd = wd * m
            net = orig_net - extra_wd
            r["deposits_usd"] = dep
            r["deposits"] = dep
            r["withdrawals_usd"] = wd
            r["withdrawals"] = wd
            r["net_flow_usd"] = net
            r["net_flow"] = net
            stressed_rows.append(r)

    elif scenario == "bank_run":
        x = validated["x"]
        k = validated["k"]
        start_hour = validated["start_hour"]
        total_outflow = (x / 100.0) * pool
        extra_per_hour = total_outflow / k if k > 0 else 0.0

        for idx, row in enumerate(hourly_rows_15h):
            r = dict(row)
            dep = float(r.get("deposits_usd", r.get("deposits", 0.0)))
            wd = float(r.get("withdrawals_usd", r.get("withdrawals", 0.0)))
            orig_net = float(r.get("net_flow_usd", r.get("net_flow", dep - wd)))
            extra_outflow = 0.0
            if start_hour <= idx < start_hour + k:
                extra_outflow = extra_per_hour
                wd = wd + extra_per_hour
            net = orig_net - extra_outflow
            r["deposits_usd"] = dep
            r["deposits"] = dep
            r["withdrawals_usd"] = wd
            r["withdrawals"] = wd
            r["net_flow_usd"] = net
            r["net_flow"] = net
            stressed_rows.append(r)

    elif scenario == "deposit_freeze":
        f = validated["f"]
        h_from = validated["hour_from"]
        h_to = validated["hour_to"]
        for idx, row in enumerate(hourly_rows_15h):
            r = dict(row)
            dep = float(r.get("deposits_usd", r.get("deposits", 0.0)))
            wd = float(r.get("withdrawals_usd", r.get("withdrawals", 0.0)))
            orig_net = float(r.get("net_flow_usd", r.get("net_flow", dep - wd)))
            lost_dep = 0.0
            if h_from <= idx <= h_to:
                lost_dep = dep * (1.0 - f)
                dep = dep * f
            net = orig_net - lost_dep
            r["deposits_usd"] = dep
            r["deposits"] = dep
            r["withdrawals_usd"] = wd
            r["withdrawals"] = wd
            r["net_flow_usd"] = net
            r["net_flow"] = net
            stressed_rows.append(r)

    return stressed_rows


def compute_scenario_extra_trough(
    baseline_rows_15h: Sequence[Dict[str, Any]],
    stressed_rows_15h: Sequence[Dict[str, Any]],
) -> float:
    """
    Computes the deterministic extra cumulative outflow of the scenario:
    The trough (min cumsum) of the added delta net flows (stressed - baseline).
    Returns max(0.0, -min_cumsum_delta).
    """
    delta_flows = []
    for b, s in zip(baseline_rows_15h, stressed_rows_15h):
        b_net = float(b.get("net_flow_usd", b.get("net_flow", 0.0)))
        s_net = float(s.get("net_flow_usd", s.get("net_flow", 0.0)))
        delta_flows.append(s_net - b_net)

    cumsum_delta = np.cumsum(delta_flows)
    min_cumsum_delta = float(np.min(cumsum_delta)) if len(cumsum_delta) > 0 else 0.0
    extra_outflow = max(0.0, -min_cumsum_delta)
    return float(extra_outflow)


def get_stressed_buffer(
    strategy: str,
    baseline_buffer: float,
    extra_outflow_trough: float,
    stressed_rows_15h: Sequence[Dict[str, Any]],
    pool: float = POOL_USD,
    informed: bool = False,
) -> float:
    """
    Determines buffer for a strategy under stress:
    - S0: always pool
    - S1: fixed 10% pool
    - S2: fixed 20% pool
    - S3, S4, S5 (forecast-based):
        if informed=False: baseline_buffer (the shock is a surprise)
        if informed=True: min(pool, baseline_buffer + extra_outflow_trough)
    - S6 (Oracle):
        recomputed on stressed flows: max(0, -min cumulative stressed net flow) clamped to [0, pool]
    """
    norm = strategy.lower().strip()

    if "s0" in norm or "all_cash" in norm:
        return float(pool)

    elif "s1" in norm or "fixed_10" in norm:
        return float(0.10 * pool)

    elif "s2" in norm or "fixed_20" in norm:
        return float(0.20 * pool)

    elif "s6" in norm or "oracle" in norm:
        stressed_flows = [float(r.get("net_flow_usd", r.get("net_flow", 0.0))) for r in stressed_rows_15h]
        cum = np.cumsum(stressed_flows)
        min_cum = float(np.min(cum)) if len(cum) > 0 else 0.0
        req = max(0.0, -min_cum)
        return float(np.clip(req, 0.0, pool))

    else:
        # Forecast-based: S3, S4, S5
        if informed:
            return float(np.clip(baseline_buffer + extra_outflow_trough, 0.0, pool))
        else:
            return float(np.clip(baseline_buffer, 0.0, pool))
