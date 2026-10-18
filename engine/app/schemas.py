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


# --- Stress Testing Schemas ---

class StressNightRequest(BaseModel):
    night_date: str
    scenario: str
    params: dict
    strategy: Optional[str] = "S4_policy_zero_overdraft"
    mode: Optional[str] = None
    informed: bool = False
    sleeve_weights: Optional[dict] = None
    sleeve_preset: Optional[str] = None
    sleeve_usd: Optional[float] = None


class WaterfallEvent(BaseModel):
    ts: Optional[str] = None
    type: str = "bond_sale"  # "bond_sale" | "equity_sale" | "repo_break" | "overdraft"
    asset: Optional[str] = None
    amount: float
    fee: float
    haircut_pct: Optional[float] = None


class StressDeltas(BaseModel):
    net_pnl: float
    break_fee: float
    overdraft_cost: float
    broken_amount: float
    overdraft_peak: float
    shortfall_peak: float
    interest: float


class StressNightResponse(BaseModel):
    night_date: str
    scenario: str
    params: dict
    strategy: str
    mode: str
    informed: bool
    baseline_decision: DecisionDetails
    stressed_decision: DecisionDetails
    baseline_result: NightResultSchema
    stressed_result: NightResultSchema
    deltas: StressDeltas
    baseline_trace: List[TraceRowSchema]
    stressed_trace: List[TraceRowSchema]
    waterfall_events: Optional[List[WaterfallEvent]] = None
    waterfall_fees: Optional[float] = 0.0
    waterfall_bonds_sold: Optional[float] = 0.0
    waterfall_equities_sold: Optional[float] = 0.0


class StressBatchRequest(BaseModel):
    scenario: str
    params: dict
    informed: bool = False
    night_filter: str = "all"  # "all" | "fri_sat" | "payday"
    sleeve_weights: Optional[dict] = None
    sleeve_preset: Optional[str] = None
    sleeve_usd: Optional[float] = None


class StressBatchStrategyRow(BaseModel):
    strategy: str
    net_pnl: float
    break_fee: float
    overdraft_cost: float
    repo_break_nights: int
    overdraft_nights: int
    worst_shortfall: float
    baseline_net_pnl: float
    baseline_break_fee: float
    baseline_overdraft_cost: float
    baseline_repo_break_nights: int
    baseline_overdraft_nights: int
    baseline_worst_shortfall: float
    delta_net_pnl: float
    delta_break_fee: float
    delta_overdraft_cost: float
    delta_repo_break_nights: int
    delta_overdraft_nights: int
    delta_worst_shortfall: float


class StressBatchResponse(BaseModel):
    scenario: str
    params: dict
    informed: bool
    night_filter: str
    nights_count: int
    summary_text: str
    results: List[StressBatchStrategyRow]
    waterfall_events: Optional[List[WaterfallEvent]] = None
    total_waterfall_fees: Optional[float] = 0.0


# --- Strategic Sleeve Schemas ---

class SleeveWeights(BaseModel):
    repo: float
    bonds: float
    equity: float


class SleeveWorkingSchema(BaseModel):
    T: float
    z99: float
    h_days: int
    sigma: float
    equity_haircut_pct: float
    L_e: float
    D_mod: float
    yield_shock_bp: float
    bond_haircut_pct: float
    L_b: float
    repo_floor: float
    weights: SleeveWeights


class SleeveConfigResponse(BaseModel):
    sleeve_usd: float
    presets: dict[str, SleeveWeights]
    preset_labels: dict[str, str]
    parameters: dict
    risk_budget_working: SleeveWorkingSchema


class SleeveHourlyRow(BaseModel):
    ts: str
    repo_mv: float
    bond_clean_mv: float
    bond_carry: float
    equity_mv: float
    total_mv: float
    benchmark_mv: float
    excess_vs_repo: float
    drawdown_from_peak: float


class BreakEvenHoldingPeriod(BaseModel):
    bonds: Optional[float] = None
    equity: Optional[float] = None


class SleeveSummary(BaseModel):
    total_return: float
    annualised_return: float
    pnl: float
    excess_pnl_vs_repo: float
    annualised_volatility_daily: float
    max_drawdown_amount: float
    max_drawdown_pct: float
    worst_24h_change: float
    liquidation_adjusted_end: float
    liquidation_adjusted_worst: float
    break_even_ex_ante_years: BreakEvenHoldingPeriod
    break_even_ex_post_years: BreakEvenHoldingPeriod


class SleevePathResponse(BaseModel):
    preset: Optional[str] = None
    sleeve_usd: float
    weights: SleeveWeights
    path: List[SleeveHourlyRow]
    summary: SleeveSummary


class SleeveCompareResultItem(BaseModel):
    weights: SleeveWeights
    summary: SleeveSummary


class SleeveCompareResponse(BaseModel):
    through: str
    sleeve_usd: float
    results: dict[str, SleeveCompareResultItem]
