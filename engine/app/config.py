"""
config.py: Global configuration parameters for Reserve Juggler.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DOTENV_PATH = REPO_ROOT / ".env"

if DOTENV_PATH.exists():
    load_dotenv(dotenv_path=DOTENV_PATH)
else:
    load_dotenv()

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://juggler:juggler@localhost:5432/treasury",
)

# Pool convention (PROJECT_SPEC.md Hard Rule 3):
# Each night starts at 17:00 with config POOL_USD, assumed externally replenished.
POOL_USD = float(os.getenv("POOL_USD", "100000000.0"))

# Accrual convention: "overnight_1d" (default, 1/365) or "15h" (15/24/365)
ACCRUAL = os.getenv("ACCRUAL", "overnight_1d")

# Policy mode: "zero_overdraft" (default) or "cost_optimal"
POLICY_MODE = os.getenv("POLICY_MODE", "zero_overdraft")

# Default model used for policy decisions:
# Set to the model with lowest total cost at q nearest 0.98 in docs/forecast/results.md
# (B1 had total cost $1,054,015.08 vs M2 $1,232,896.13; configurable)
MODEL_FOR_POLICY = os.getenv("MODEL_FOR_POLICY", "B1")

# Default rates & fees if not provided per row
DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT = 0.5
DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT = 12.0

# Quantiles to evaluate in forecast models
EVALUATION_QUANTILES = [0.5, 0.9, 0.95, 0.98, 0.99]


def get_target_quantile(
    repo_rate_apy_pct: float = 4.05,
    haircut_pct: float = DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
    overdraft_apr_pct: float = DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
    mode: str = "zero_overdraft",
    accrual: str = "overnight_1d",
) -> float:
    """
    Computes critical fractile q* = Cu / (Cu + Co)
    Co: opportunity cost of forgone repo yield per dollar.
        If accrual == "15h": (repo_rate_apy / 100 / 365) * (15 / 24)
        Else ("overnight_1d"): repo_rate_apy / 100 / 365

    Cu: penalty of shortfall per dollar.
        - "zero_overdraft": early redemption haircut = haircut_pct / 100
        - "cost_optimal": overdraft APR per day = overdraft_apr_pct / 100 / 365
    """
    if accrual == "15h":
        Co = (repo_rate_apy_pct / 100.0 / 365.0) * (15.0 / 24.0)
    else:
        Co = repo_rate_apy_pct / 100.0 / 365.0

    if mode == "cost_optimal":
        Cu = overdraft_apr_pct / 100.0 / 365.0
    else:  # "zero_overdraft"
        Cu = haircut_pct / 100.0

    return Cu / (Cu + Co)
