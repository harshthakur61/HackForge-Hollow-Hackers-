"""
test_api.py: Unit tests for FastAPI engine service using starlette.testclient.TestClient.
Tests:
(a) /night/{date} with defaults equals the stored decisions row for S4;
(b) trace length is correct (16 rows) and its final accounting matches NightResult;
(c) a higher quantile override never lowers the buffer;
(d) unknown date -> 404;
(e) /kpis through the last night equals the totals in docs/backtest/results.md;
(f) /forecast never contains actual outcomes.
"""

import pytest
import numpy as np
from starlette.testclient import TestClient
from engine.app.main import app, get_db

client = TestClient(app)


def test_a_night_defaults_equals_stored_decisions_for_s4():
    test_date = "2026-02-26"
    resp = client.get(f"/night/{test_date}")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["night_date"] == test_date
    assert data["strategy"] == "S4_policy_zero_overdraft"
    assert data["is_custom"] is False

    # Check against stored row in database
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM decisions WHERE night_date = %s AND strategy = 'S4_policy_zero_overdraft';",
                (test_date,),
            )
            stored = cur.fetchone()

    assert stored is not None
    assert np.isclose(data["decision"]["buffer_usd"], float(stored["buffer_usd"]))
    assert np.isclose(data["decision"]["sweep_usd"], float(stored["sweep_usd"]))
    assert np.isclose(data["decision"]["quantile_used"], float(stored["quantile_used"]))
    assert data["decision"]["model"] == stored["model"]
    assert np.isclose(data["result"]["interest"], float(stored["interest"]))
    assert np.isclose(data["result"]["break_fee"], float(stored["break_fee"]))
    assert np.isclose(data["result"]["overdraft_cost"], float(stored["overdraft_cost"]))
    assert np.isclose(data["result"]["net_pnl"], float(stored["net_pnl"]))


def test_b_trace_length_and_final_accounting_matches_night_result():
    test_date = "2026-02-26"
    resp = client.get(f"/night/{test_date}")
    assert resp.status_code == 200
    data = resp.json()

    trace = data["trace"]
    # 15 overnight rows (17:00 through 07:00) + 1 row for 08:00 settlement = 16 rows
    assert len(trace) == 16

    # 16th row is 08:00 settlement
    settlement_row = trace[-1]
    assert settlement_row["deposits"] == 0.0
    assert settlement_row["withdrawals"] == 0.0
    assert settlement_row["net_flow"] == 0.0
    assert settlement_row["repo"] == 0.0
    assert settlement_row["overdraft"] == 0.0

    # Final cash accounting in trace must equal initial pool + net_pnl
    pool_usd = 100_000_000.0
    expected_final_cash = pool_usd + data["result"]["net_pnl"]
    assert np.isclose(settlement_row["cash"], expected_final_cash, atol=1e-2)

    # Net PnL accounting identity: interest - break_fee - overdraft_cost
    assert np.isclose(
        data["result"]["net_pnl"],
        data["result"]["interest"]
        - data["result"]["break_fee"]
        - data["result"]["overdraft_cost"],
        atol=1e-2,
    )


def test_c_higher_quantile_override_never_lowers_buffer():
    test_date = "2026-03-01"
    r_low = client.get(f"/night/{test_date}?quantile=0.90")
    assert r_low.status_code == 200
    data_low = r_low.json()
    assert data_low["is_custom"] is True
    assert data_low["strategy"] == "custom"

    r_high = client.get(f"/night/{test_date}?quantile=0.99")
    assert r_high.status_code == 200
    data_high = r_high.json()
    assert data_high["is_custom"] is True
    assert data_high["strategy"] == "custom"

    assert (
        data_high["decision"]["buffer_usd"] >= data_low["decision"]["buffer_usd"]
    ), f"Higher quantile buffer {data_high['decision']['buffer_usd']} was lower than {data_low['decision']['buffer_usd']}"


def test_d_unknown_date_returns_404():
    resp_night = client.get("/night/1999-01-01")
    assert resp_night.status_code == 404
    assert "detail" in resp_night.json()

    resp_forecast = client.get("/forecast/1999-01-01")
    assert resp_forecast.status_code == 404
    assert "detail" in resp_forecast.json()


def test_e_kpis_through_last_night_equals_backtest_results_table():
    resp = client.get("/kpis?through=2026-12-30")
    assert resp.status_code == 200
    data = resp.json()

    strat_map = {s["strategy"]: s for s in data["strategies"]}

    # Ground truth values from docs/backtest/results.md Table 1:
    expected = {
        "S0_all_cash": {
            "interest": 0.00,
            "break_fees": 0.00,
            "overdraft_cost": 0.00,
            "net_pnl": 0.00,
            "net_yield_bps": 0.00,
            "mean_buffer": 100_000_000.00,
            "repo_break_nights": 0,
            "overdraft_nights": 0,
        },
        "S1_fixed_10": {
            "interest": 2_849_267.82,
            "break_fees": 9_189_711.28,
            "overdraft_cost": 0.00,
            "net_pnl": -6_340_443.46,
            "net_yield_bps": -751.38,
            "mean_buffer": 10_000_000.00,
            "repo_break_nights": 122,
            "overdraft_nights": 0,
        },
        "S2_fixed_20": {
            "interest": 2_617_273.10,
            "break_fees": 4_328_779.12,
            "overdraft_cost": 0.00,
            "net_pnl": -1_711_506.01,
            "net_yield_bps": -202.82,
            "mean_buffer": 20_000_000.00,
            "repo_break_nights": 85,
            "overdraft_nights": 0,
        },
        "S3_static": {
            "interest": 2_168_742.21,
            "break_fees": 138_479.82,
            "overdraft_cost": 0.00,
            "net_pnl": 2_030_262.39,
            "net_yield_bps": 240.60,
            "mean_buffer": 35_945_807.02,
            "repo_break_nights": 4,
            "overdraft_nights": 0,
        },
        "S4_policy_zero_overdraft": {
            "interest": 2_653_808.27,
            "break_fees": 323_269.29,
            "overdraft_cost": 0.00,
            "net_pnl": 2_330_538.98,
            "net_yield_bps": 276.18,
            "mean_buffer": 21_522_953.54,
            "repo_break_nights": 10,
            "overdraft_nights": 0,
        },
        "S5_policy_cost_optimal": {
            "interest": 2_866_323.24,
            "break_fees": 0.00,
            "overdraft_cost": 19_471.63,
            "net_pnl": 2_846_851.61,
            "net_yield_bps": 337.37,
            "mean_buffer": 15_460_999.97,
            "repo_break_nights": 0,
            "overdraft_nights": 70,
        },
        "S6_oracle": {
            "interest": 2_946_341.25,
            "break_fees": 0.00,
            "overdraft_cost": 0.00,
            "net_pnl": 2_946_341.25,
            "net_yield_bps": 349.16,
            "mean_buffer": 13_103_605.46,
            "repo_break_nights": 0,
            "overdraft_nights": 0,
        },
    }

    for strat_name, exp in expected.items():
        assert strat_name in strat_map, f"Strategy {strat_name} missing from KPI response"
        s = strat_map[strat_name]
        assert s["nights"] == 308
        assert np.isclose(s["interest"], exp["interest"], atol=0.01)
        assert np.isclose(s["break_fees"], exp["break_fees"], atol=0.01)
        assert np.isclose(s["overdraft_cost"], exp["overdraft_cost"], atol=0.01)
        assert np.isclose(s["net_pnl"], exp["net_pnl"], atol=0.01)
        assert np.isclose(s["net_yield_bps"], exp["net_yield_bps"], atol=0.05)
        assert np.isclose(s["mean_buffer"], exp["mean_buffer"], atol=0.01)
        assert s["repo_break_nights"] == exp["repo_break_nights"]
        assert s["overdraft_nights"] == exp["overdraft_nights"]
        assert s["payout_success_rate"] == 100.0


def test_f_forecast_never_contains_actual_outcomes():
    resp = client.get("/forecast/2026-02-26")
    assert resp.status_code == 200
    data = resp.json()

    assert "actual_required_usd" not in data
    assert "actual" not in data
    assert "actual_outcome" not in data

    forecasts = data["forecasts"]
    assert len(forecasts) > 0
    for fc in forecasts:
        assert "actual_required_usd" not in fc
        assert "actual" not in fc
        assert "actual_outcome" not in fc
        assert "model" in fc
        assert "quantile" in fc
        assert "buffer_usd" in fc
