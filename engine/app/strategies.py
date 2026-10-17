"""
strategies.py: Defines all evaluation strategies for buffer allocation.
Maps each night to a buffer allocation:
- S0: All-cash (buffer = pool)
- S1: Fixed 10% of pool
- S2: Fixed 20% of pool
- S3: Static baseline (B0 empirical quantile at q* from prior nights only)
- S4: Policy engine in zero_overdraft mode
- S5: Policy engine in cost_optimal mode
- S6: Oracle (buffer = actual required_buffer_usd, theoretical upper bound)
"""

import datetime
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd
from engine.app.config import POOL_USD, get_target_quantile
from engine.app.policy import decide, Decision


STRATEGY_NAMES = [
    "S0_all_cash",
    "S1_fixed_10",
    "S2_fixed_20",
    "S3_static",
    "S4_policy_zero_overdraft",
    "S5_policy_cost_optimal",
    "S6_oracle",
]


def get_strategy_buffer(
    strategy: str,
    night_date: datetime.date,
    forecasts_for_night: pd.DataFrame,
    prior_targets: pd.Series,
    actual_required_usd: float,
    repo_rate: float,
    haircut_pct: float,
    overdraft_apr: float,
    pool: float = POOL_USD,
    config: Optional[Dict[str, Any]] = None,
) -> tuple[float, Optional[Decision]]:
    """
    Returns (buffer_usd, decision_obj_or_None) for the given strategy and night.
    """
    cfg = config or {}
    accrual = cfg.get("ACCRUAL", "overnight_1d")

    if strategy == "S0_all_cash":
        return pool, None

    elif strategy == "S1_fixed_10":
        return 0.10 * pool, None

    elif strategy == "S2_fixed_20":
        return 0.20 * pool, None

    elif strategy == "S3_static":
        q_target = get_target_quantile(
            repo_rate_apy_pct=repo_rate,
            haircut_pct=haircut_pct,
            overdraft_apr_pct=overdraft_apr,
            mode="zero_overdraft",
            accrual=accrual,
        )
        if len(prior_targets) > 0:
            b = float(np.percentile(prior_targets, q_target * 100.0))
        else:
            b = 0.0
        return float(np.clip(b, 0.0, pool)), None

    elif strategy == "S4_policy_zero_overdraft":
        dec = decide(
            night_date=night_date,
            forecasts_for_night=forecasts_for_night,
            pool=pool,
            repo_rate=repo_rate,
            config=config,
            haircut_pct=haircut_pct,
            overdraft_apr_pct=overdraft_apr,
            mode="zero_overdraft",
        )
        return dec.buffer_usd, dec

    elif strategy == "S5_policy_cost_optimal":
        dec = decide(
            night_date=night_date,
            forecasts_for_night=forecasts_for_night,
            pool=pool,
            repo_rate=repo_rate,
            config=config,
            haircut_pct=haircut_pct,
            overdraft_apr_pct=overdraft_apr,
            mode="cost_optimal",
        )
        return dec.buffer_usd, dec

    elif strategy == "S6_oracle":
        return float(np.clip(actual_required_usd, 0.0, pool)), None

    else:
        raise ValueError(f"Unknown strategy: {strategy}")
