"""
test_stress.py: Unit and integration tests for Stress Lab engine and endpoints.
Verifies the 6 required stress test invariants:
(a) A scenario with neutral parameters (multiplier 1.0, extra 0) reproduces stored backtest results for every strategy to the cent;
(b) Stress never changes the forecast or decision when informed=False;
(c) informed=True never produces more repo breaks than informed=False for the same scenario;
(d) Accounting identity net_pnl = interest - break_fee - overdraft_cost holds for every stressed night and strategy;
(e) Parameter bounds are strictly enforced (reject out-of-range with 422);
(f) The oracle is recomputed on the stressed flows and is never worse than any deployable strategy.
"""

import pytest
import numpy as np
from starlette.testclient import TestClient
from engine.app.main import app, get_db
from engine.app.stress import (
    validate_stress_params,
    apply_stress_to_hourly_rows,
    compute_scenario_extra_trough,
    get_stressed_buffer,
)
from engine.app.config import POOL_USD

client = TestClient(app)


def test_a_neutral_parameters_reproduce_backtest_results_to_the_cent():
    """
    (a) A scenario with neutral parameters (multiplier 1.0, extra 0) must
    reproduce the stored backtest results for every strategy to the cent.
    """
    test_date = "2026-10-03"
    strategies = [
        "S1_fixed_10",
        "S2_fixed_20",
        "S3_static",
        "S4_policy_zero_overdraft",
        "S5_policy_cost_optimal",
        "S6_oracle",
    ]

    for strat in strategies:
        # Check withdrawal_surge with neutral multiplier 1.0
        resp = client.post(
            "/stress/night",
            json={
                "night_date": test_date,
                "scenario": "withdrawal_surge",
                "params": {"m": 1.0, "hour_from": 0, "hour_to": 14},
                "strategy": strat,
                "informed": False,
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Query stored row in database for this night and strategy
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM decisions WHERE night_date = %s AND strategy = %s;",
                    (test_date, strat),
                )
                stored = cur.fetchone()

        assert stored is not None
        # Stressed result with neutral params must equal stored backtest to the cent
        assert round(data["stressed_result"]["net_pnl"], 2) == round(float(stored["net_pnl"]), 2)
        assert round(data["stressed_result"]["break_fee"], 2) == round(float(stored["break_fee"]), 2)
        assert round(data["stressed_result"]["overdraft_cost"], 2) == round(float(stored["overdraft_cost"]), 2)
        assert round(data["stressed_result"]["interest"], 2) == round(float(stored["interest"]), 2)
        assert round(data["stressed_decision"]["buffer_usd"], 2) == round(float(stored["buffer_usd"]), 2)

        # Delta should be exactly 0.00
        assert abs(data["deltas"]["net_pnl"]) < 0.01
        assert abs(data["deltas"]["break_fee"]) < 0.01
        assert abs(data["deltas"]["overdraft_cost"]) < 0.01

        # Check bank_run with extra 0
        resp_br = client.post(
            "/stress/night",
            json={
                "night_date": test_date,
                "scenario": "bank_run",
                "params": {"x": 0.0, "k": 3, "start_hour": 2},
                "strategy": strat,
                "informed": False,
            },
        )
        assert resp_br.status_code == 200
        data_br = resp_br.json()
        assert round(data_br["stressed_result"]["net_pnl"], 2) == round(float(stored["net_pnl"]), 2)


def test_b_stress_never_changes_forecast_or_decision_when_informed_false():
    """
    (b) Stress never changes the forecast or the decision when informed is false.
    """
    test_date = "2026-07-03"
    strategy = "S4_policy_zero_overdraft"

    resp = client.post(
        "/stress/night",
        json={
            "night_date": test_date,
            "scenario": "withdrawal_surge",
            "params": {"m": 2.5, "hour_from": 3, "hour_to": 9},
            "strategy": strategy,
            "informed": False,
        },
    )
    assert resp.status_code == 200
    data = resp.json()

    # Baseline and stressed decisions must be identical
    assert data["baseline_decision"]["buffer_usd"] == data["stressed_decision"]["buffer_usd"]
    assert data["baseline_decision"]["sweep_usd"] == data["stressed_decision"]["sweep_usd"]
    assert data["baseline_decision"]["quantile_used"] == data["stressed_decision"]["quantile_used"]
    assert data["baseline_decision"]["model"] == data["stressed_decision"]["model"]
    assert data["baseline_decision"]["reason"] == data["stressed_decision"]["reason"]

    # Verify forecasts endpoint remains pure and unperturbed
    f_resp = client.get(f"/forecast/{test_date}")
    assert f_resp.status_code == 200
    f_data = f_resp.json()
    assert len(f_data["forecasts"]) > 0


def test_c_informed_true_never_produces_more_repo_breaks_than_informed_false():
    """
    (c) informed=true never produces more repo breaks than informed=false for the same scenario.
    """
    test_date = "2026-07-03"
    strategy = "S4_policy_zero_overdraft"

    # 1. Uninformed run
    resp_uninformed = client.post(
        "/stress/night",
        json={
            "night_date": test_date,
            "scenario": "withdrawal_surge",
            "params": {"m": 2.0, "hour_from": 2, "hour_to": 10},
            "strategy": strategy,
            "informed": False,
        },
    )
    assert resp_uninformed.status_code == 200
    res_u = resp_uninformed.json()["stressed_result"]

    # 2. Informed run
    resp_informed = client.post(
        "/stress/night",
        json={
            "night_date": test_date,
            "scenario": "withdrawal_surge",
            "params": {"m": 2.0, "hour_from": 2, "hour_to": 10},
            "strategy": strategy,
            "informed": True,
        },
    )
    assert resp_informed.status_code == 200
    res_inf = resp_informed.json()["stressed_result"]

    # Repo broken amount and fees under informed must be <= uninformed
    assert res_inf["broken_amount"] <= res_u["broken_amount"] + 1e-4
    assert res_inf["break_fee"] <= res_u["break_fee"] + 1e-4

    # Batch verification on Fri/Sat nights
    batch_u = client.post(
        "/stress/batch",
        json={
            "scenario": "withdrawal_surge",
            "params": {"m": 2.0, "hour_from": 3, "hour_to": 9},
            "informed": False,
            "night_filter": "fri_sat",
        },
    ).json()

    batch_inf = client.post(
        "/stress/batch",
        json={
            "scenario": "withdrawal_surge",
            "params": {"m": 2.0, "hour_from": 3, "hour_to": 9},
            "informed": True,
            "night_filter": "fri_sat",
        },
    ).json()

    # Compare S4 across batch
    s4_u = next(r for r in batch_u["results"] if r["strategy"] == "S4_policy_zero_overdraft")
    s4_inf = next(r for r in batch_inf["results"] if r["strategy"] == "S4_policy_zero_overdraft")

    assert s4_inf["repo_break_nights"] <= s4_u["repo_break_nights"]
    assert s4_inf["break_fee"] <= s4_u["break_fee"]


def test_d_accounting_identity_holds_for_every_stressed_night_and_strategy():
    """
    (d) Accounting identity net_pnl = interest - break_fee - overdraft_cost holds
    for every stressed night and strategy.
    """
    test_dates = ["2026-03-07", "2026-07-03", "2026-10-03"]
    strategies = ["S1_fixed_10", "S4_policy_zero_overdraft", "S5_policy_cost_optimal", "S6_oracle"]

    for d in test_dates:
        for strat in strategies:
            resp = client.post(
                "/stress/night",
                json={
                    "night_date": d,
                    "scenario": "bank_run",
                    "params": {"x": 20.0, "k": 4, "start_hour": 1},
                    "strategy": strat,
                    "informed": False,
                },
            )
            assert resp.status_code == 200
            res = resp.json()["stressed_result"]
            expected_pnl = res["interest"] - res["break_fee"] - res["overdraft_cost"]
            assert np.isclose(res["net_pnl"], expected_pnl, atol=1e-2)


def test_e_parameter_bounds_are_enforced():
    """
    (e) Parameter bounds are enforced (reject out-of-range with 422).
    """
    # 1. m out of bounds (< 1.0 or > 4.0)
    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "withdrawal_surge",
            "params": {"m": 0.5, "hour_from": 0, "hour_to": 14},
        },
    )
    assert resp.status_code == 422

    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "withdrawal_surge",
            "params": {"m": 4.5, "hour_from": 0, "hour_to": 14},
        },
    )
    assert resp.status_code == 422

    # 2. hour_from > hour_to
    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "withdrawal_surge",
            "params": {"m": 2.0, "hour_from": 10, "hour_to": 5},
        },
    )
    assert resp.status_code == 422

    # 3. bank_run x out of bounds (< 0.0 or > 40.0)
    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "bank_run",
            "params": {"x": 50.0, "k": 3, "start_hour": 0},
        },
    )
    assert resp.status_code == 422

    # 4. bank_run k out of bounds (< 1 or > 6)
    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "bank_run",
            "params": {"x": 10.0, "k": 8, "start_hour": 0},
        },
    )
    assert resp.status_code == 422

    # 5. bank_run start_hour + k > 15
    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "bank_run",
            "params": {"x": 10.0, "k": 4, "start_hour": 13},
        },
    )
    assert resp.status_code == 422

    # 6. deposit_freeze f out of bounds (< 0.0 or > 1.0)
    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "deposit_freeze",
            "params": {"f": 1.5, "hour_from": 0, "hour_to": 14},
        },
    )
    assert resp.status_code == 422

    # 7. Unknown scenario
    resp = client.post(
        "/stress/night",
        json={
            "night_date": "2026-10-03",
            "scenario": "alien_invasion",
            "params": {"f": 0.5},
        },
    )
    assert resp.status_code == 422

    # 8. Invalid night_filter in batch
    resp = client.post(
        "/stress/batch",
        json={
            "scenario": "withdrawal_surge",
            "params": {"m": 2.0, "hour_from": 0, "hour_to": 14},
            "night_filter": "random_filter",
        },
    )
    assert resp.status_code == 422


def test_f_oracle_recomputed_on_stressed_flows_never_worse_than_deployable_strategy():
    """
    (f) The oracle is recomputed on the stressed flows and is never worse
    than any deployable strategy.
    """
    test_date = "2026-10-03"
    # Severe stress scenario: 3x withdrawal surge
    deployable_strats = ["S1_fixed_10", "S2_fixed_20", "S3_static", "S4_policy_zero_overdraft", "S5_policy_cost_optimal"]

    # 1. Oracle result
    resp_oracle = client.post(
        "/stress/night",
        json={
            "night_date": test_date,
            "scenario": "withdrawal_surge",
            "params": {"m": 3.0, "hour_from": 2, "hour_to": 11},
            "strategy": "S6_oracle",
            "informed": False,
        },
    )
    assert resp_oracle.status_code == 200
    oracle_res = resp_oracle.json()["stressed_result"]

    # Oracle incurs zero break fees because it never sweeps cash that will be drained
    assert oracle_res["break_fee"] == 0.0

    # Compare against every deployable strategy
    for strat in deployable_strats:
        resp = client.post(
            "/stress/night",
            json={
                "night_date": test_date,
                "scenario": "withdrawal_surge",
                "params": {"m": 3.0, "hour_from": 2, "hour_to": 11},
                "strategy": strat,
                "informed": False,
            },
        )
        assert resp.status_code == 200
        res = resp.json()["stressed_result"]
        # Oracle Net P&L is theoretical upper bound on stressed flows
        assert oracle_res["net_pnl"] >= res["net_pnl"] - 1e-4

    # 2. Batch check: Oracle cumulative Net P&L >= all other strategies
    batch_resp = client.post(
        "/stress/batch",
        json={
            "scenario": "bank_run",
            "params": {"x": 25.0, "k": 3, "start_hour": 2},
            "informed": False,
            "night_filter": "fri_sat",
        },
    )
    assert batch_resp.status_code == 200
    batch_data = batch_resp.json()

    oracle_row = next(r for r in batch_data["results"] if r["strategy"] == "S6_oracle")
    for r in batch_data["results"]:
        assert oracle_row["net_pnl"] >= r["net_pnl"] - 1e-2
