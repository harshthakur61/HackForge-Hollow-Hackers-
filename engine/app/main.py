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
)
from engine.app.policy import (
    compute_target_quantiles,
    interpolate_buffer_at_quantile,
    decide,
)
from engine.app.simulator import simulate_night_trace
from engine.app.strategies import STRATEGY_NAMES
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
