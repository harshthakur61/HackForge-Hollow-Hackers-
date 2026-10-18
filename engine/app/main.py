"""
main.py: FastAPI service for Reserve Juggler Engine (port 8000).
Provides REST endpoints for health, config, nights, forecasts,
night simulation traces, cumulative KPIs, and decision audit logs.
"""

import sys
from pathlib import Path

# Ensure both repo root and engine dir are on sys.path for local uvicorn execution
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
ENGINE_ROOT = Path(__file__).resolve().parent.parent
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
import psycopg
from psycopg.rows import dict_row
import pandas as pd
import numpy as np

from engine.app.config import (
    DATABASE_URL,
    POOL_USD,
    ACCRUAL,
    POLICY_MODE,
    MODEL_FOR_POLICY,
    DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
    DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
    get_target_quantile,
    SLEEVE_USD,
    EQUITY_EXPECTED_APY,
    LIQ_HORIZON_DAYS,
    YIELD_SHOCK_BP,
    REPO_FLOOR,
    RISK_TOLERANCE_T,
    Z99,
    SLEEVE_PRESETS,
    PRESET_LABEL,
)
from engine.app.policy import (
    compute_target_quantiles,
    interpolate_buffer_at_quantile,
    decide,
)
from engine.app.simulator import simulate_night, simulate_night_trace, NightResult
from engine.app.strategies import STRATEGY_NAMES
from engine.app.stress import (
    validate_stress_params,
    apply_stress_to_hourly_rows,
    compute_scenario_extra_trough,
    get_stressed_buffer,
)
from engine.app.sleeve import (
    compute_risk_budget_weights,
    parse_weights,
    simulate_sleeve_path,
    calculate_sleeve_summary,
    simulate_liquidity_waterfall,
)
from engine.app.schemas import (
    HealthResponse,
    ConfigResponse,
    NightsResponse,
    ForecastItem,
    ForecastResponse,
    DecisionDetails,
    NightResultSchema,
    TraceRowSchema,
    NightDetailResponse,
    StrategyKpi,
    KpisResponse,
    DecisionLogRow,
    DecisionsResponse,
    ErrorResponse,
    StressNightRequest,
    StressDeltas,
    StressNightResponse,
    StressBatchRequest,
    StressBatchStrategyRow,
    StressBatchResponse,
    SleeveWeights,
    SleeveWorkingSchema,
    SleeveConfigResponse,
    SleeveHourlyRow,
    BreakEvenHoldingPeriod,
    SleeveSummary,
    SleevePathResponse,
    SleeveCompareResultItem,
    SleeveCompareResponse,
    WaterfallEvent,
)

app = FastAPI(
    title="Reserve Juggler Engine",
    description="Deterministic policy engine, simulator trace, and audit API.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def normalize_strategy_name(name: str) -> str:
    s = name.strip()
    mapping = {
        "s0": "S0_all_cash",
        "s1": "S1_fixed_10",
        "s2": "S2_fixed_20",
        "s3": "S3_static",
        "s4": "S4_policy_zero_overdraft",
        "s5": "S5_policy_cost_optimal",
        "s6": "S6_oracle",
        "s0_all_cash": "S0_all_cash",
        "s1_fixed_10": "S1_fixed_10",
        "s2_fixed_20": "S2_fixed_20",
        "s3_static": "S3_static",
        "s4_policy_zero_overdraft": "S4_policy_zero_overdraft",
        "s5_policy_cost_optimal": "S5_policy_cost_optimal",
        "s6_oracle": "S6_oracle",
    }
    low = s.lower()
    return mapping.get(low, s)


@app.get("/health", response_model=HealthResponse)
def get_health():
    """Returns database connectivity, count of forecast nights, and boundary dates."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(DISTINCT night_date), MIN(night_date), MAX(night_date) FROM forecasts;"
                )
                row = cur.fetchone()
                count = row["count"] if row else 0
                first_d = row["min"].isoformat() if row and row["min"] else None
                last_d = row["max"].isoformat() if row and row["max"] else None
        return HealthResponse(
            status="ok",
            db_ok=True,
            forecast_nights_count=count,
            first_night=first_d,
            last_night=last_d,
        )
    except Exception as e:
        return HealthResponse(
            status=f"error: {str(e)}",
            db_ok=False,
            forecast_nights_count=0,
            first_night=None,
            last_night=None,
        )


@app.get("/config", response_model=ConfigResponse)
def get_config():
    """Returns effective runtime configuration and baseline critical fractiles."""
    q_zero, q_opt = compute_target_quantiles(
        repo_rate_apy=4.05,
        haircut_pct=DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
        overdraft_apr_pct=DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
        accrual=ACCRUAL,
    )
    return ConfigResponse(
        pool_usd=POOL_USD,
        accrual=ACCRUAL,
        policy_mode=POLICY_MODE,
        model_for_policy=MODEL_FOR_POLICY,
        default_haircut_pct=DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT,
        default_overdraft_apr_pct=DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT,
        q_star_zero_overdraft=round(q_zero, 4),
        q_star_cost_optimal=round(q_opt, 4),
    )


@app.get("/nights", response_model=NightsResponse)
def get_nights():
    """Returns sorted list of night dates that have forecasts."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT night_date FROM forecasts ORDER BY night_date ASC;"
            )
            rows = cur.fetchall()
    return NightsResponse(nights=[r["night_date"].isoformat() for r in rows])


@app.get(
    "/forecast/{night_date}",
    response_model=ForecastResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_forecast(night_date: str):
    """
    Returns quantile forecasts per model for that night.
    Never includes actual required buffer outcome.
    """
    try:
        date_obj = datetime.date.fromisoformat(night_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format: {night_date}. Expected YYYY-MM-DD",
        )

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model, quantile, buffer_usd
                FROM forecasts
                WHERE night_date = %s
                ORDER BY model ASC, quantile ASC;
                """,
                (date_obj,),
            )
            rows = cur.fetchall()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No forecasts found for night {night_date}",
        )

    items = [
        ForecastItem(
            model=r["model"],
            quantile=float(r["quantile"]),
            buffer_usd=float(r["buffer_usd"]),
        )
        for r in rows
    ]
    return ForecastResponse(night_date=night_date, forecasts=items)


@app.get(
    "/night/{night_date}",
    response_model=NightDetailResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def get_night_detail(
    night_date: str,
    strategy: str = Query("S4", description="Strategy name, e.g. S4, S1, S5"),
    mode: Optional[str] = Query(None, description="zero_overdraft or cost_optimal"),
    quantile: Optional[float] = Query(None, description="Target quantile override"),
    pool: Optional[float] = Query(None, description="Pool override in USD"),
):
    """
    Simulates or retrieves the decision, simulation result, and 16-row trace for a night.
    With no overrides: returns stored decision row and trace for the strategy.
    With overrides: recomputes via policy.decide and simulate_night_trace, marks strategy 'custom'.
    """
    try:
        date_obj = datetime.date.fromisoformat(night_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format: {night_date}. Expected YYYY-MM-DD",
        )

    if quantile is not None and not (0.0 <= quantile <= 1.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quantile override must be between 0.0 and 1.0",
        )

    if pool is not None and pool <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Pool override must be greater than 0",
        )

    if mode is not None and mode not in ("zero_overdraft", "cost_optimal"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mode override must be 'zero_overdraft' or 'cost_optimal'",
        )

    norm_strategy = normalize_strategy_name(strategy)
    is_custom = (mode is not None) or (quantile is not None) or (pool is not None)

    # 1. Fetch 15 hourly market_data rows for the overnight window: 17:00 on D through 07:00 on D+1
    start_ts = datetime.datetime.combine(date_obj, datetime.time(17, 0))
    end_ts = datetime.datetime.combine(
        date_obj + datetime.timedelta(days=1), datetime.time(7, 0)
    )

    with get_db() as conn:
        with conn.cursor() as cur:
            # Check date exists in forecasts
            cur.execute(
                "SELECT actual_required_usd FROM forecasts WHERE night_date = %s LIMIT 1;",
                (date_obj,),
            )
            fc_row = cur.fetchone()
            if not fc_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Night {night_date} not found in walk-forward evaluation",
                )
            actual_required_usd = float(fc_row["actual_required_usd"])

            cur.execute(
                """
                SELECT ts, deposits_usd, withdrawals_usd, net_flow_usd,
                       tier1_repo_rate_apy, tier1_early_redemption_haircut_pct as early_redemption_haircut_pct,
                       emergency_overdraft_penalty_apr_pct
                FROM market_data
                WHERE ts >= %s AND ts <= %s
                ORDER BY ts ASC;
                """,
                (start_ts, end_ts),
            )
            hourly_rows = cur.fetchall()

            if not hourly_rows:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No hourly market data found for night {night_date}",
                )

            # Stored decision lookup
            cur.execute(
                """
                SELECT * FROM decisions
                WHERE night_date = %s AND strategy = %s;
                """,
                (date_obj, norm_strategy),
            )
            stored_decision = cur.fetchone()

            # Forecast rows for this night (needed for decision overrides or custom)
            cur.execute(
                """
                SELECT model, quantile, buffer_usd
                FROM forecasts
                WHERE night_date = %s
                ORDER BY model ASC, quantile ASC;
                """,
                (date_obj,),
            )
            all_forecast_rows = cur.fetchall()

    repo_rate = float(hourly_rows[0]["tier1_repo_rate_apy"])
    haircut_pct = float(hourly_rows[0]["early_redemption_haircut_pct"])
    overdraft_apr = float(hourly_rows[0]["emergency_overdraft_penalty_apr_pct"])

    q_zero, q_opt = compute_target_quantiles(
        repo_rate_apy=repo_rate,
        haircut_pct=haircut_pct,
        overdraft_apr_pct=overdraft_apr,
        accrual=ACCRUAL,
    )

    # 2. If NO overrides and stored decision exists: return exact stored record + trace
    if not is_custom and stored_decision is not None:
        stored_buf = float(stored_decision["buffer_usd"])
        stored_sweep = float(stored_decision["sweep_usd"])
        stored_q = float(stored_decision["quantile_used"])
        stored_model = stored_decision["model"]
        stored_reason = stored_decision["reason"]

        sim_mode = (
            "cost_optimal" if "cost_optimal" in norm_strategy else "zero_overdraft"
        )
        sim_cfg = {
            "POLICY_MODE": sim_mode,
            "ACCRUAL": ACCRUAL,
            "haircut_pct": haircut_pct,
            "overdraft_apr": overdraft_apr,
        }

        trace_res, trace_rows = simulate_night_trace(
            hourly_rows_15h=hourly_rows,
            pool=POOL_USD,
            buffer=stored_buf,
            repo_rate=repo_rate,
            config=sim_cfg,
        )

        decision_obj = DecisionDetails(
            buffer_usd=stored_buf,
            sweep_usd=stored_sweep,
            quantile_used=stored_q,
            model=stored_model,
            reason=stored_reason,
            q_star_zero=round(q_zero, 4),
            q_star_opt=round(q_opt, 4),
        )

        result_obj = NightResultSchema(
            interest=float(stored_decision["interest"]),
            break_fee=float(stored_decision["break_fee"]),
            broken_amount=trace_res.broken_amount,
            overdraft_peak=trace_res.overdraft_peak,
            overdraft_cost=float(stored_decision["overdraft_cost"]),
            net_pnl=float(stored_decision["net_pnl"]),
            shortfall_peak=trace_res.shortfall_peak,
            payouts_honored=True,
            idle_cash_at_17=stored_buf,
        )

        return NightDetailResponse(
            night_date=night_date,
            strategy=stored_decision["strategy"],
            is_custom=False,
            decision=decision_obj,
            result=result_obj,
            actual_required_usd=actual_required_usd,
            trace=[TraceRowSchema(**r) for r in trace_rows],
        )

    # 3. Custom override or un-persisted combination
    eff_pool = pool if pool is not None else POOL_USD
    eff_mode = mode if mode is not None else (
        "cost_optimal" if "cost_optimal" in norm_strategy else POLICY_MODE
    )

    df_fc = pd.DataFrame(all_forecast_rows)
    m_df = df_fc[df_fc["model"] == MODEL_FOR_POLICY]
    if m_df.empty:
        m_df = df_fc
    fc_dict = {float(r["quantile"]): float(r["buffer_usd"]) for _, r in m_df.iterrows()}

    if quantile is not None:
        used_q = quantile
        raw_buffer = interpolate_buffer_at_quantile(fc_dict, used_q)
        buf_usd = float(np.clip(raw_buffer, 0.0, eff_pool))
        sweep_usd = float(eff_pool - buf_usd)
        model_name = MODEL_FOR_POLICY
        reason = (
            f"Custom override: Quantile={used_q:.4f}, Mode={eff_mode}, "
            f"Buffer=${buf_usd:,.2f}, Sweep=${sweep_usd:,.2f}"
        )
    else:
        dec = decide(
            night_date=date_obj,
            forecasts_for_night=df_fc,
            pool=eff_pool,
            repo_rate=repo_rate,
            config={"ACCRUAL": ACCRUAL, "POLICY_MODE": eff_mode},
            haircut_pct=haircut_pct,
            overdraft_apr_pct=overdraft_apr,
            mode=eff_mode,
            model_override=MODEL_FOR_POLICY,
        )
        buf_usd = dec.buffer_usd
        sweep_usd = dec.sweep_usd
        used_q = dec.quantile_used
        model_name = dec.model
        reason = f"Custom override: {dec.reason}"

    sim_cfg = {
        "POLICY_MODE": eff_mode,
        "ACCRUAL": ACCRUAL,
        "haircut_pct": haircut_pct,
        "overdraft_apr": overdraft_apr,
    }

    sim_res, trace_rows = simulate_night_trace(
        hourly_rows_15h=hourly_rows,
        pool=eff_pool,
        buffer=buf_usd,
        repo_rate=repo_rate,
        config=sim_cfg,
    )

    decision_obj = DecisionDetails(
        buffer_usd=buf_usd,
        sweep_usd=sweep_usd,
        quantile_used=used_q,
        model=model_name,
        reason=reason,
        q_star_zero=round(q_zero, 4),
        q_star_opt=round(q_opt, 4),
    )

    result_obj = NightResultSchema(
        interest=sim_res.interest,
        break_fee=sim_res.break_fee,
        broken_amount=sim_res.broken_amount,
        overdraft_peak=sim_res.overdraft_peak,
        overdraft_cost=sim_res.overdraft_cost,
        net_pnl=sim_res.net_pnl,
        shortfall_peak=sim_res.shortfall_peak,
        payouts_honored=True,
        idle_cash_at_17=sim_res.idle_cash_at_17,
    )

    return NightDetailResponse(
        night_date=night_date,
        strategy="custom",
        is_custom=True,
        decision=decision_obj,
        result=result_obj,
        actual_required_usd=actual_required_usd,
        trace=[TraceRowSchema(**r) for r in trace_rows],
    )


@app.get("/kpis", response_model=KpisResponse)
def get_kpis(
    through: Optional[str] = Query(None, description="Calculate KPIs through YYYY-MM-DD")
):
    """
    Cumulative KPIs per strategy up to specified date.
    Calculates: net_pnl, interest, break_fees, overdraft_cost,
    repo_break_nights, overdraft_nights, nights, payout_success_rate,
    and net yield in bps of pool annualized.
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            if through is None:
                cur.execute("SELECT MAX(night_date) as max_d FROM decisions;")
                row = cur.fetchone()
                through_date = row["max_d"] if row and row["max_d"] else datetime.date(2026, 12, 30)
            else:
                try:
                    through_date = datetime.date.fromisoformat(through)
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"Invalid date format: {through}. Expected YYYY-MM-DD",
                    )

            cur.execute(
                """
                SELECT strategy, COUNT(*) as nights,
                       SUM(interest) as interest,
                       SUM(break_fee) as break_fees,
                       SUM(overdraft_cost) as overdraft_cost,
                       SUM(net_pnl) as net_pnl,
                       AVG(buffer_usd) as mean_buffer,
                       SUM(CASE WHEN break_fee > 0 THEN 1 ELSE 0 END) as repo_break_nights,
                       SUM(CASE WHEN overdraft_cost > 0 THEN 1 ELSE 0 END) as overdraft_nights
                FROM decisions
                WHERE night_date <= %s
                GROUP BY strategy
                ORDER BY strategy ASC;
                """,
                (through_date,),
            )
            rows = cur.fetchall()

    strategies_kpi = []
    for r in rows:
        n = int(r["nights"])
        tot_pnl = float(r["net_pnl"])
        tot_int = float(r["interest"])
        tot_bf = float(r["break_fees"])
        tot_od = float(r["overdraft_cost"])
        mean_buf = float(r["mean_buffer"])
        brk_n = int(r["repo_break_nights"])
        od_n = int(r["overdraft_nights"])

        # Net yield in bps of pool annualized: (tot_net_pnl / pool) * (365 / n) * 10,000
        bps = (tot_pnl / POOL_USD) * (365.0 / n) * 10000.0 if n > 0 else 0.0

        strategies_kpi.append(
            StrategyKpi(
                strategy=r["strategy"],
                nights=n,
                interest=round(tot_int, 2),
                break_fees=round(tot_bf, 2),
                overdraft_cost=round(tot_od, 2),
                net_pnl=round(tot_pnl, 2),
                net_yield_bps=round(bps, 2),
                mean_buffer=round(mean_buf, 2),
                repo_break_nights=brk_n,
                overdraft_nights=od_n,
                payout_success_rate=100.0,
            )
        )

    return KpisResponse(through=through_date.isoformat(), strategies=strategies_kpi)


@app.get("/decisions", response_model=DecisionsResponse)
def get_decisions(
    limit: int = Query(50, ge=1, le=500),
    before: Optional[str] = Query(None, description="Filter nights before or on YYYY-MM-DD"),
    strategy: Optional[str] = Query(None, description="Strategy alias or full name"),
):
    """Returns decision audit log rows ordered by night_date DESC."""
    query = "SELECT * FROM decisions WHERE 1=1"
    params = []

    if before is not None:
        try:
            b_date = datetime.date.fromisoformat(before)
            query += " AND night_date <= %s"
            params.append(b_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid date format: {before}. Expected YYYY-MM-DD",
            )

    if strategy is not None:
        norm_s = normalize_strategy_name(strategy)
        query += " AND strategy = %s"
        params.append(norm_s)

    query += " ORDER BY night_date DESC, strategy ASC LIMIT %s;"
    params.append(limit)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    decisions = [
        DecisionLogRow(
            night_date=r["night_date"].isoformat(),
            strategy=r["strategy"],
            model=r["model"],
            quantile_used=float(r["quantile_used"]),
            buffer_usd=float(r["buffer_usd"]),
            sweep_usd=float(r["sweep_usd"]),
            repo_apy=float(r["repo_apy"]),
            reason=r["reason"],
            interest=float(r["interest"]),
            break_fee=float(r["break_fee"]),
            overdraft_cost=float(r["overdraft_cost"]),
            net_pnl=float(r["net_pnl"]),
        )
        for r in rows
    ]

    return DecisionsResponse(decisions=decisions)


# --- Stress Testing Endpoints ---

_BATCH_CACHE = None


def get_batch_eval_data():
    global _BATCH_CACHE
    if _BATCH_CACHE is not None:
        return _BATCH_CACHE

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ts, deposits_usd, withdrawals_usd, net_flow_usd,
                       tier1_repo_rate_apy, tier1_early_redemption_haircut_pct as early_redemption_haircut_pct,
                       emergency_overdraft_penalty_apr_pct
                FROM market_data
                ORDER BY ts ASC;
            """)
            raw_market = cur.fetchall()

            cur.execute("""
                SELECT night_date, strategy, buffer_usd, sweep_usd, repo_apy,
                       interest, break_fee, overdraft_cost, net_pnl
                FROM decisions
                ORDER BY night_date ASC, strategy ASC;
            """)
            decisions_rows = cur.fetchall()

    market_by_ts = {r["ts"]: r for r in raw_market}
    decisions_map = {}
    eval_dates_set = set()
    for d in decisions_rows:
        d_date = d["night_date"]
        eval_dates_set.add(d_date)
        decisions_map[(d_date, d["strategy"])] = d

    eval_dates = sorted(list(eval_dates_set))
    night_windows = {}

    for d_date in eval_dates:
        start_ts = datetime.datetime(d_date.year, d_date.month, d_date.day, 17, 0, 0)
        win_rows = []
        for h in range(15):
            curr = start_ts + datetime.timedelta(hours=h)
            if curr in market_by_ts:
                win_rows.append(market_by_ts[curr])

        if len(win_rows) == 15:
            night_windows[d_date] = {
                "rows": win_rows,
                "repo_rate": float(win_rows[0]["tier1_repo_rate_apy"]),
                "haircut_pct": float(win_rows[0]["early_redemption_haircut_pct"]),
                "overdraft_apr": float(win_rows[0]["emergency_overdraft_penalty_apr_pct"]),
            }

    _BATCH_CACHE = {
        "eval_dates": eval_dates,
        "night_windows": night_windows,
        "decisions_map": decisions_map,
    }
    return _BATCH_CACHE


@app.post(
    "/stress/night",
    response_model=StressNightResponse,
    summary="Simulate stress scenario for a single night",
)
def stress_night(body: StressNightRequest):
    try:
        validated_params = validate_stress_params(body.scenario, body.params)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    try:
        date_obj = datetime.date.fromisoformat(body.night_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format: {body.night_date}. Expected YYYY-MM-DD",
        )

    start_ts = datetime.datetime(date_obj.year, date_obj.month, date_obj.day, 17, 0, 0)
    end_ts = start_ts + datetime.timedelta(hours=14)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM market_data
                WHERE ts >= %s AND ts <= %s
                ORDER BY ts ASC;
                """,
                (start_ts, end_ts),
            )
            hourly_rows = cur.fetchall()

    if len(hourly_rows) < 15:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Overnight data for {body.night_date} is incomplete (found {len(hourly_rows)} rows).",
        )

    norm_strategy = normalize_strategy_name(body.strategy or "S4_policy_zero_overdraft")
    repo_rate = float(hourly_rows[0].get("tier1_repo_rate_apy", 4.05))
    haircut_pct = float(hourly_rows[0].get("early_redemption_haircut_pct", hourly_rows[0].get("tier1_early_redemption_haircut_pct", DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT)))
    overdraft_apr = float(hourly_rows[0].get("emergency_overdraft_penalty_apr_pct", DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT))

    q_zero, q_opt = compute_target_quantiles(
        repo_rate_apy=repo_rate,
        haircut_pct=haircut_pct,
        overdraft_apr_pct=overdraft_apr,
        accrual=ACCRUAL,
    )

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM decisions WHERE night_date = %s AND strategy = %s;",
                (date_obj, norm_strategy),
            )
            stored_dec = cur.fetchone()

            cur.execute(
                "SELECT model, quantile, buffer_usd FROM forecasts WHERE night_date = %s ORDER BY model ASC, quantile ASC;",
                (date_obj,),
            )
            all_forecast_rows = cur.fetchall()

    if stored_dec is not None:
        base_buffer = float(stored_dec["buffer_usd"])
        base_sweep = float(stored_dec["sweep_usd"])
        base_quantile = float(stored_dec["quantile_used"])
        base_model = stored_dec["model"]
        base_reason = stored_dec["reason"]
    else:
        mode = body.mode or ("cost_optimal" if "cost_optimal" in norm_strategy else "zero_overdraft")
        f_df = pd.DataFrame(all_forecast_rows)
        dec = decide(
            night_date=date_obj,
            forecasts_for_night=f_df,
            pool=POOL_USD,
            repo_rate=repo_rate,
            config={"ACCRUAL": ACCRUAL, "POLICY_MODE": mode},
            haircut_pct=haircut_pct,
            overdraft_apr_pct=overdraft_apr,
            mode=mode,
        )
        base_buffer = dec.buffer_usd
        base_sweep = dec.sweep_usd
        base_quantile = dec.quantile_used
        base_model = dec.model
        base_reason = dec.reason

    sim_mode = body.mode or ("cost_optimal" if "cost_optimal" in norm_strategy else "zero_overdraft")
    sim_cfg = {
        "POLICY_MODE": sim_mode,
        "ACCRUAL": ACCRUAL,
        "haircut_pct": haircut_pct,
        "overdraft_apr": overdraft_apr,
    }

    base_res, base_trace_rows = simulate_night_trace(
        hourly_rows_15h=hourly_rows,
        pool=POOL_USD,
        buffer=base_buffer,
        repo_rate=repo_rate,
        config=sim_cfg,
    )

    baseline_decision = DecisionDetails(
        buffer_usd=base_buffer,
        sweep_usd=base_sweep,
        quantile_used=base_quantile,
        model=base_model,
        reason=base_reason,
        q_star_zero=q_zero,
        q_star_opt=q_opt,
    )

    stressed_rows = apply_stress_to_hourly_rows(
        hourly_rows_15h=hourly_rows,
        scenario=body.scenario,
        params=validated_params,
        pool=POOL_USD,
    )

    extra_outflow_trough = compute_scenario_extra_trough(hourly_rows, stressed_rows)

    stressed_buffer = get_stressed_buffer(
        strategy=norm_strategy,
        baseline_buffer=base_buffer,
        extra_outflow_trough=extra_outflow_trough,
        stressed_rows_15h=stressed_rows,
        pool=POOL_USD,
        informed=body.informed,
    )
    stressed_sweep = float(max(0.0, POOL_USD - stressed_buffer))

    if body.informed and norm_strategy in ("S3_static", "S4_policy_zero_overdraft", "S5_policy_cost_optimal"):
        stressed_reason = (
            f"{base_reason} [WHAT-IF: assumes advance warning, extra buffer=${extra_outflow_trough:,.2f}]"
        )
    elif norm_strategy in ("S6_oracle", "S6"):
        stressed_reason = f"Oracle recomputed on stressed flows: buffer=${stressed_buffer:,.2f}"
    else:
        stressed_reason = base_reason

    stressed_decision = DecisionDetails(
        buffer_usd=stressed_buffer,
        sweep_usd=stressed_sweep,
        quantile_used=base_quantile if norm_strategy != "S6_oracle" else 1.0,
        model=base_model,
        reason=stressed_reason,
        q_star_zero=q_zero,
        q_star_opt=q_opt,
    )

    stressed_res, stressed_trace_rows = simulate_night_trace(
        hourly_rows_15h=stressed_rows,
        pool=POOL_USD,
        buffer=stressed_buffer,
        repo_rate=repo_rate,
        config=sim_cfg,
    )

    deltas = StressDeltas(
        net_pnl=stressed_res.net_pnl - base_res.net_pnl,
        break_fee=stressed_res.break_fee - base_res.break_fee,
        overdraft_cost=stressed_res.overdraft_cost - base_res.overdraft_cost,
        broken_amount=stressed_res.broken_amount - base_res.broken_amount,
        overdraft_peak=stressed_res.overdraft_peak - base_res.overdraft_peak,
        shortfall_peak=stressed_res.shortfall_peak - base_res.shortfall_peak,
        interest=stressed_res.interest - base_res.interest,
    )

    def to_result_schema(r: NightResult) -> NightResultSchema:
        return NightResultSchema(
            interest=r.interest,
            break_fee=r.break_fee,
            broken_amount=r.broken_amount,
            overdraft_peak=r.overdraft_peak,
            overdraft_cost=r.overdraft_cost,
            net_pnl=r.net_pnl,
            shortfall_peak=r.shortfall_peak,
            payouts_honored=r.payouts_honored,
            idle_cash_at_17=r.idle_cash_at_17,
        )

    waterfall_res = None
    if body.sleeve_preset or body.sleeve_weights:
        try:
            sl_weights, _ = parse_weights(
                preset=body.sleeve_preset,
                weights_dict=body.sleeve_weights,
                row0=hourly_rows[0],
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )
        s_usd = body.sleeve_usd or SLEEVE_USD
        avail_bonds = s_usd * sl_weights.bonds
        avail_eq = s_usd * sl_weights.equity
        bond_hc = float(hourly_rows[0].get("tier2_bond_liquidation_haircut_pct", 2.0))
        eq_hc = float(hourly_rows[0].get("tier3_stock_liquidation_haircut_pct", 15.0))
        waterfall_res = simulate_liquidity_waterfall(
            shortfall=stressed_res.shortfall_peak,
            swept_repo=stressed_sweep,
            mode=sim_mode,
            sleeve_bonds=avail_bonds,
            sleeve_equities=avail_eq,
            bond_haircut_pct=bond_hc,
            equity_haircut_pct=eq_hc,
            ts=stressed_trace_rows[0]["ts"] if stressed_trace_rows else None,
        )

    return StressNightResponse(
        night_date=body.night_date,
        scenario=body.scenario,
        params=validated_params,
        strategy=norm_strategy,
        mode=sim_mode,
        informed=body.informed,
        baseline_decision=baseline_decision,
        stressed_decision=stressed_decision,
        baseline_result=to_result_schema(base_res),
        stressed_result=to_result_schema(stressed_res),
        deltas=deltas,
        baseline_trace=[TraceRowSchema(**r) for r in base_trace_rows],
        stressed_trace=[TraceRowSchema(**r) for r in stressed_trace_rows],
        waterfall_events=waterfall_res.events if waterfall_res else None,
        waterfall_fees=waterfall_res.total_fees if waterfall_res else 0.0,
        waterfall_bonds_sold=waterfall_res.bonds_sold if waterfall_res else 0.0,
        waterfall_equities_sold=waterfall_res.equities_sold if waterfall_res else 0.0,
    )


BATCH_STRATEGIES = [
    "S1_fixed_10",
    "S2_fixed_20",
    "S3_static",
    "S4_policy_zero_overdraft",
    "S5_policy_cost_optimal",
    "S6_oracle",
]


@app.post(
    "/stress/batch",
    response_model=StressBatchResponse,
    summary="Batch simulate stress scenario across evaluation nights",
)
def stress_batch(body: StressBatchRequest):
    try:
        validated_params = validate_stress_params(body.scenario, body.params)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    if body.night_filter not in ("all", "fri_sat", "payday"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"night_filter must be one of: 'all', 'fri_sat', 'payday'. Got '{body.night_filter}'",
        )

    cache = get_batch_eval_data()
    all_eval_dates = cache["eval_dates"]
    night_windows = cache["night_windows"]
    decisions_map = cache["decisions_map"]

    if body.night_filter == "fri_sat":
        filtered_dates = [d for d in all_eval_dates if d.weekday() in (4, 5)]
    elif body.night_filter == "payday":
        filtered_dates = [d for d in all_eval_dates if d.day in (1, 15)]
    else:
        filtered_dates = all_eval_dates

    strat_data = {
        s: {
            "net_pnl": 0.0,
            "break_fee": 0.0,
            "overdraft_cost": 0.0,
            "repo_break_nights": 0,
            "overdraft_nights": 0,
            "worst_shortfall": 0.0,
            "base_net_pnl": 0.0,
            "base_break_fee": 0.0,
            "base_overdraft_cost": 0.0,
            "base_repo_break_nights": 0,
            "base_overdraft_nights": 0,
            "base_worst_shortfall": 0.0,
        }
        for s in BATCH_STRATEGIES
    }

    for d in filtered_dates:
        if d not in night_windows:
            continue
        w = night_windows[d]
        base_rows = w["rows"]
        repo_rate = w["repo_rate"]
        haircut = w["haircut_pct"]
        od_apr = w["overdraft_apr"]

        stressed_rows = apply_stress_to_hourly_rows(
            hourly_rows_15h=base_rows,
            scenario=body.scenario,
            params=validated_params,
            pool=POOL_USD,
        )
        extra_trough = compute_scenario_extra_trough(base_rows, stressed_rows)

        base_flows = [float(r.get("net_flow_usd", r.get("net_flow", 0.0))) for r in base_rows]
        stressed_flows = [float(r.get("net_flow_usd", r.get("net_flow", 0.0))) for r in stressed_rows]

        for s in BATCH_STRATEGIES:
            mode = "cost_optimal" if s == "S5_policy_cost_optimal" else "zero_overdraft"
            cfg = {
                "POLICY_MODE": mode,
                "ACCRUAL": ACCRUAL,
                "haircut_pct": haircut,
                "overdraft_apr": od_apr,
            }

            base_dec = decisions_map.get((d, s))
            if base_dec is not None:
                base_buf = float(base_dec["buffer_usd"])
            else:
                if s == "S1_fixed_10": base_buf = 0.10 * POOL_USD
                elif s == "S2_fixed_20": base_buf = 0.20 * POOL_USD
                elif s == "S6_oracle": base_buf = max(0.0, -float(np.min(np.cumsum(base_flows))))
                else: base_buf = 0.0

            b_res = simulate_night(
                flows_15h=base_flows,
                pool=POOL_USD,
                buffer=base_buf,
                repo_rate=repo_rate,
                config=cfg,
            )

            s_buf = get_stressed_buffer(
                strategy=s,
                baseline_buffer=base_buf,
                extra_outflow_trough=extra_trough,
                stressed_rows_15h=stressed_rows,
                pool=POOL_USD,
                informed=body.informed,
            )

            s_res = simulate_night(
                flows_15h=stressed_flows,
                pool=POOL_USD,
                buffer=s_buf,
                repo_rate=repo_rate,
                config=cfg,
            )

            sd = strat_data[s]
            sd["base_net_pnl"] += b_res.net_pnl
            sd["base_break_fee"] += b_res.break_fee
            sd["base_overdraft_cost"] += b_res.overdraft_cost
            if b_res.broken_amount > 1e-4 or b_res.break_fee > 1e-4:
                sd["base_repo_break_nights"] += 1
            if b_res.overdraft_peak > 1e-4 or b_res.overdraft_cost > 1e-4:
                sd["base_overdraft_nights"] += 1
            if b_res.shortfall_peak > sd["base_worst_shortfall"]:
                sd["base_worst_shortfall"] = b_res.shortfall_peak

            sd["net_pnl"] += s_res.net_pnl
            sd["break_fee"] += s_res.break_fee
            sd["overdraft_cost"] += s_res.overdraft_cost
            if s_res.broken_amount > 1e-4 or s_res.break_fee > 1e-4:
                sd["repo_break_nights"] += 1
            if s_res.overdraft_peak > 1e-4 or s_res.overdraft_cost > 1e-4:
                sd["overdraft_nights"] += 1
            if s_res.shortfall_peak > sd["worst_shortfall"]:
                sd["worst_shortfall"] = s_res.shortfall_peak

    rows = []
    for s in BATCH_STRATEGIES:
        sd = strat_data[s]
        rows.append(
            StressBatchStrategyRow(
                strategy=s,
                net_pnl=round(sd["net_pnl"], 2),
                break_fee=round(sd["break_fee"], 2),
                overdraft_cost=round(sd["overdraft_cost"], 2),
                repo_break_nights=sd["repo_break_nights"],
                overdraft_nights=sd["overdraft_nights"],
                worst_shortfall=round(sd["worst_shortfall"], 2),
                baseline_net_pnl=round(sd["base_net_pnl"], 2),
                baseline_break_fee=round(sd["base_break_fee"], 2),
                baseline_overdraft_cost=round(sd["base_overdraft_cost"], 2),
                baseline_repo_break_nights=sd["base_repo_break_nights"],
                baseline_overdraft_nights=sd["base_overdraft_nights"],
                baseline_worst_shortfall=round(sd["base_worst_shortfall"], 2),
                delta_net_pnl=round(sd["net_pnl"] - sd["base_net_pnl"], 2),
                delta_break_fee=round(sd["break_fee"] - sd["base_break_fee"], 2),
                delta_overdraft_cost=round(sd["overdraft_cost"] - sd["base_overdraft_cost"], 2),
                delta_repo_break_nights=sd["repo_break_nights"] - sd["base_repo_break_nights"],
                delta_overdraft_nights=sd["overdraft_nights"] - sd["base_overdraft_nights"],
                delta_worst_shortfall=round(sd["worst_shortfall"] - sd["base_worst_shortfall"], 2),
            )
        )

    s4_info = strat_data["S4_policy_zero_overdraft"]
    count = len(filtered_dates)
    summary_text = (
        f"Across {count} nights under {body.scenario}, the policy (S4) broke repo on "
        f"{s4_info['repo_break_nights']} of {count} nights and paid ${s4_info['break_fee']:,.2f} in fees "
        f"with {s4_info['overdraft_nights']} overdraft nights."
    )

    batch_wf_events = []
    total_wf_fees = 0.0
    if (body.sleeve_preset or body.sleeve_weights) and filtered_dates:
        s_usd = body.sleeve_usd or SLEEVE_USD
        first_d = filtered_dates[0]
        first_rows = night_windows[first_d]
        try:
            sl_weights, _ = parse_weights(
                preset=body.sleeve_preset,
                weights_dict=body.sleeve_weights,
                row0=first_rows[0],
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )
        avail_bonds = s_usd * sl_weights.bonds
        avail_eq = s_usd * sl_weights.equity
        bond_hc = float(first_rows[0].get("tier2_bond_liquidation_haircut_pct", 2.0))
        eq_hc = float(first_rows[0].get("tier3_stock_liquidation_haircut_pct", 15.0))
        for d in filtered_dates:
            rows_d = night_windows[d]
            s4_dec = decisions_map.get((d, "S4_policy_zero_overdraft"))
            s4_buf = float(s4_dec["buffer_usd"]) if s4_dec else 0.0
            st_rows = stressed_windows[d]
            extra_tr = extra_troughs[d]
            st_buf = get_stressed_buffer("S4_policy_zero_overdraft", s4_buf, extra_tr, st_rows, POOL_USD, body.informed)
            st_sweep = float(max(0.0, POOL_USD - st_buf))
            st_flows = [float(r["net_flow_usd"]) for r in st_rows]
            st_res = simulate_night(st_flows, POOL_USD, st_buf, float(rows_d[0].get("tier1_repo_rate_apy", 4.05)), {"POLICY_MODE": "zero_overdraft"})
            if st_res.shortfall_peak > st_sweep:
                wf = simulate_liquidity_waterfall(
                    shortfall=st_res.shortfall_peak,
                    swept_repo=st_sweep,
                    mode="zero_overdraft",
                    sleeve_bonds=avail_bonds,
                    sleeve_equities=avail_eq,
                    bond_haircut_pct=bond_hc,
                    equity_haircut_pct=eq_hc,
                    ts=f"{d}T17:00:00",
                )
                batch_wf_events.extend(wf.events)
                total_wf_fees += wf.total_fees

    return StressBatchResponse(
        scenario=body.scenario,
        params=validated_params,
        informed=body.informed,
        night_filter=body.night_filter,
        nights_count=count,
        summary_text=summary_text,
        results=rows,
        waterfall_events=batch_wf_events if (body.sleeve_preset or body.sleeve_weights) else None,
        total_waterfall_fees=total_wf_fees,
    )


# --- Strategic Sleeve Endpoints ---

_SLEEVE_DATA_CACHE = None

def _load_sleeve_market_data(start_ts: datetime.datetime, end_ts: datetime.datetime):
    global _SLEEVE_DATA_CACHE
    if _SLEEVE_DATA_CACHE is not None:
        c_start, c_end, c_rows = _SLEEVE_DATA_CACHE
        if c_start <= start_ts and c_end >= end_ts:
            return [r for r in c_rows if start_ts <= r["ts"] <= end_ts]

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM market_data
                WHERE ts >= %s AND ts <= %s
                ORDER BY ts ASC;
                """,
                (start_ts, end_ts),
            )
            rows = cur.fetchall()

    if _SLEEVE_DATA_CACHE is None:
        _SLEEVE_DATA_CACHE = (start_ts, end_ts, rows)
    return rows


@app.get(
    "/sleeve/config",
    response_model=SleeveConfigResponse,
    summary="Get Strategic Sleeve configuration and risk-budget working",
)
def get_sleeve_config():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT MIN(night_date) as min_date FROM forecasts;")
            first_row = cur.fetchone()
            if not first_row or not first_row["min_date"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No forecasts found in database.",
                )
            first_date = first_row["min_date"]
            start_ts = datetime.datetime(first_date.year, first_date.month, first_date.day, 17, 0, 0)
            cur.execute("SELECT * FROM market_data WHERE ts = %s;", (start_ts,))
            row0 = cur.fetchone()

    if row0 is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Market data row for window start not found.",
        )

    weights, working = compute_risk_budget_weights(row0)
    presets_dict = {
        k: SleeveWeights(repo=v["repo"], bonds=v["bonds"], equity=v["equity"])
        for k, v in SLEEVE_PRESETS.items()
    }
    preset_labels = {k: PRESET_LABEL for k in SLEEVE_PRESETS}

    return SleeveConfigResponse(
        sleeve_usd=SLEEVE_USD,
        presets=presets_dict,
        preset_labels=preset_labels,
        parameters={
            "sleeve_usd": SLEEVE_USD,
            "equity_expected_apy": EQUITY_EXPECTED_APY,
            "liq_horizon_days": LIQ_HORIZON_DAYS,
            "yield_shock_bp": YIELD_SHOCK_BP,
            "repo_floor": REPO_FLOOR,
            "risk_tolerance_t": RISK_TOLERANCE_T,
            "z99": Z99,
            "accrual": ACCRUAL,
        },
        risk_budget_working=working,
    )


@app.get(
    "/sleeve/path",
    response_model=SleevePathResponse,
    summary="Get Strategic Sleeve hourly path and summary",
)
def get_sleeve_path(
    preset: Optional[str] = Query(None),
    weights: Optional[str] = Query(None),
    sleeve_usd: Optional[float] = Query(None),
):
    s_usd = sleeve_usd if (sleeve_usd is not None and sleeve_usd > 0) else SLEEVE_USD

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT MIN(night_date) as min_date, MAX(night_date) as max_date FROM forecasts;")
            dates = cur.fetchone()
            if not dates or not dates["min_date"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No forecasts found.",
                )
            first_date = dates["min_date"]
            last_date = dates["max_date"]

    start_ts = datetime.datetime(first_date.year, first_date.month, first_date.day, 17, 0, 0)
    end_ts = datetime.datetime(last_date.year, last_date.month, last_date.day, 17, 0, 0) + datetime.timedelta(hours=15)

    hourly_rows = _load_sleeve_market_data(start_ts, end_ts)
    if not hourly_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No market data found for replay window.",
        )

    try:
        parsed_weights, resolved_preset = parse_weights(
            preset=preset,
            weights_str=weights,
            row0=hourly_rows[0],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    path = simulate_sleeve_path(hourly_rows, parsed_weights, s_usd, accrual=ACCRUAL)
    summary = calculate_sleeve_summary(path, hourly_rows[0], hourly_rows[-1], s_usd)

    return SleevePathResponse(
        preset=resolved_preset,
        sleeve_usd=s_usd,
        weights=parsed_weights,
        path=path,
        summary=summary,
    )


@app.get(
    "/sleeve/compare",
    response_model=SleeveCompareResponse,
    summary="Compare Strategic Sleeve summaries across presets and risk budget",
)
def get_sleeve_compare(through: Optional[str] = Query(None)):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT MIN(night_date) as min_date, MAX(night_date) as max_date FROM forecasts;")
            dates = cur.fetchone()
            if not dates or not dates["min_date"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No forecasts found.",
                )
            first_date = dates["min_date"]
            last_date = dates["max_date"]

    start_ts = datetime.datetime(first_date.year, first_date.month, first_date.day, 17, 0, 0)

    if through:
        try:
            through_date = datetime.date.fromisoformat(through)
            end_ts = datetime.datetime(through_date.year, through_date.month, through_date.day, 17, 0, 0) + datetime.timedelta(hours=15)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid date format for through: {through}. Expected YYYY-MM-DD.",
            )
    else:
        through = str(last_date)
        end_ts = datetime.datetime(last_date.year, last_date.month, last_date.day, 17, 0, 0) + datetime.timedelta(hours=15)

    hourly_rows = _load_sleeve_market_data(start_ts, end_ts)
    if not hourly_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No market data found for window.",
        )

    row0 = hourly_rows[0]
    row_end = hourly_rows[-1]

    configs = ["risk_budget", "conservative", "income", "balanced", "growth"]
    results = {}

    for c in configs:
        w, _ = parse_weights(preset=c, row0=row0)
        p = simulate_sleeve_path(hourly_rows, w, SLEEVE_USD, accrual=ACCRUAL)
        summ = calculate_sleeve_summary(p, row0, row_end, SLEEVE_USD)
        results[c] = SleeveCompareResultItem(weights=w, summary=summ)

    return SleeveCompareResponse(
        through=through,
        sleeve_usd=SLEEVE_USD,
        results=results,
    )
