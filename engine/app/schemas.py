"""
schemas.py: Pydantic v2 schemas defining API models for FastAPI service.
Must strictly match docs/API_CONTRACT.md and server/src/contract.ts.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    db_ok: bool
    forecast_nights_count: int
    first_night: Optional[str]
    last_night: Optional[str]


class ConfigResponse(BaseModel):
    pool_usd: float
    accrual: str
    policy_mode: str
    model_for_policy: str
    default_haircut_pct: float
    default_overdraft_apr_pct: float
    q_star_zero_overdraft: float
    q_star_cost_optimal: float


class NightsResponse(BaseModel):
    nights: List[str]


class ForecastItem(BaseModel):
    model: str
    quantile: float
    buffer_usd: float


class ForecastResponse(BaseModel):
    night_date: str
    forecasts: List[ForecastItem]


class DecisionDetails(BaseModel):
    buffer_usd: float
    sweep_usd: float
    quantile_used: float
    model: str
    reason: str
    q_star_zero: float
    q_star_opt: float


class NightResultSchema(BaseModel):
    interest: float
    break_fee: float
    broken_amount: float
    overdraft_peak: float
    overdraft_cost: float
    net_pnl: float
    shortfall_peak: float
    payouts_honored: bool
    idle_cash_at_17: float


class TraceRowSchema(BaseModel):
    ts: str
    deposits: float
    withdrawals: float
    net_flow: float
    cash: float
    repo: float
    overdraft: float
    event: Optional[str] = None
    event_amount: float
    event_fee: float


class NightDetailResponse(BaseModel):
    night_date: str
    strategy: str
    is_custom: bool
    decision: DecisionDetails
    result: NightResultSchema
    actual_required_usd: float
    trace: List[TraceRowSchema]


class StrategyKpi(BaseModel):
    strategy: str
    nights: int
    interest: float
    break_fees: float
    overdraft_cost: float
    net_pnl: float
    net_yield_bps: float
    mean_buffer: float
    repo_break_nights: int
    overdraft_nights: int
    payout_success_rate: float


class KpisResponse(BaseModel):
    through: str
    strategies: List[StrategyKpi]


class DecisionLogRow(BaseModel):
    night_date: str
    strategy: str
    model: str
    quantile_used: float
    buffer_usd: float
    sweep_usd: float
    repo_apy: float
    reason: str
    interest: float
    break_fee: float
    overdraft_cost: float
    net_pnl: float


class DecisionsResponse(BaseModel):
    decisions: List[DecisionLogRow]


class ErrorResponse(BaseModel):
    detail: str
