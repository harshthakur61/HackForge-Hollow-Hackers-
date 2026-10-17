"""
policy.py: Decides buffer allocation and overnight repo sweep.
Uses critical fractile q* = Cu / (Cu + Co) to select target quantile
and linearly interpolates from the chosen forecasting model's predictions.
"""

from dataclasses import dataclass
import datetime
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd
from engine.app.config import (
    POOL_USD,
    ACCRUAL,
    POLICY_MODE,
    MODEL_FOR_POLICY,
    DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
    DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
    get_target_quantile,
)


@dataclass
class Decision:
    night_date: datetime.date
    buffer_usd: float
    sweep_usd: float
    quantile_used: float
    model: str
    reason: str


def compute_target_quantiles(
    repo_rate_apy: float,
    haircut_pct: float = DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
    overdraft_apr_pct: float = DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
    accrual: str = "overnight_1d",
) -> tuple[float, float]:
    """
    Computes both target quantiles:
    (q_zero_overdraft, q_cost_optimal)
    """
    q_zero = get_target_quantile(
        repo_rate_apy_pct=repo_rate_apy,
        haircut_pct=haircut_pct,
        overdraft_apr_pct=overdraft_apr_pct,
        mode="zero_overdraft",
        accrual=accrual,
    )
    q_opt = get_target_quantile(
        repo_rate_apy_pct=repo_rate_apy,
        haircut_pct=haircut_pct,
        overdraft_apr_pct=overdraft_apr_pct,
        mode="cost_optimal",
        accrual=accrual,
    )
    return q_zero, q_opt


def interpolate_buffer_at_quantile(
    forecasts: Dict[float, float],
    target_q: float,
) -> float:
    """
    Linearly interpolates buffer value at target_q from dictionary of {quantile: forecast_buffer}.
    Ensures monotonic non-decreasing buffer values across quantiles.
    """
    if not forecasts:
        return 0.0

    sorted_items = sorted(forecasts.items(), key=lambda x: x[0])
    qs = np.array([item[0] for item in sorted_items], dtype=float)
    bufs = np.array([item[1] for item in sorted_items], dtype=float)

    # Enforce monotonicity: higher quantiles must have >= buffer
    monotone_bufs = np.maximum.accumulate(bufs)

    val = float(np.interp(target_q, qs, monotone_bufs))
    return val


def decide(
    night_date: datetime.date,
    forecasts_for_night: pd.DataFrame,
    pool: float = POOL_USD,
    repo_rate: float = 4.05,
    config: Optional[Dict[str, Any]] = None,
    haircut_pct: float = DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
    overdraft_apr_pct: float = DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
    mode: Optional[str] = None,
    model_override: Optional[str] = None,
) -> Decision:
    """
    Makes the buffer & sweep decision for night_date.
    forecasts_for_night: DataFrame with columns ['model', 'quantile', 'buffer_usd'] for this night.
    """
    cfg = config or {}
    accrual = cfg.get("ACCRUAL", ACCRUAL)
    active_mode = mode or cfg.get("POLICY_MODE", POLICY_MODE)
    model_name = model_override or cfg.get("MODEL_FOR_POLICY", MODEL_FOR_POLICY)

    q_zero, q_opt = compute_target_quantiles(
        repo_rate_apy=repo_rate,
        haircut_pct=haircut_pct,
        overdraft_apr_pct=overdraft_apr_pct,
        accrual=accrual,
    )

    if active_mode == "cost_optimal":
        target_q = q_opt
    else:
        target_q = q_zero

    # Extract quantile forecasts for the selected model
    m_df = forecasts_for_night[forecasts_for_night["model"] == model_name]
    if m_df.empty:
        # Fallback to any model present
        m_df = forecasts_for_night
        model_name = m_df["model"].iloc[0] if not m_df.empty else "UNKNOWN"

    forecast_dict = {
        float(row["quantile"]): float(row["buffer_usd"])
        for _, row in m_df.iterrows()
    }

    raw_buffer = interpolate_buffer_at_quantile(forecast_dict, target_q)
    buffer_usd = float(np.clip(raw_buffer, 0.0, pool))
    sweep_usd = float(pool - buffer_usd)

    reason = (
        f"Mode={active_mode}, Model={model_name}, q*={target_q:.4f} "
        f"(q*_zero={q_zero:.4f}, q*_opt={q_opt:.4f}), "
        f"Buffer=${buffer_usd:,.2f}, Sweep=${sweep_usd:,.2f}, "
        f"RepoRate={repo_rate:.4f}%, Haircut={haircut_pct:.2f}%, "
        f"OverdraftAPR={overdraft_apr_pct:.2f}%"
    )

    return Decision(
        night_date=night_date,
        buffer_usd=buffer_usd,
        sweep_usd=sweep_usd,
        quantile_used=target_q,
        model=model_name,
        reason=reason,
    )
