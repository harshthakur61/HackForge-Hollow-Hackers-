"""
test_sleeve.py: Tests for Strategic Sleeve (Tier 2 Bonds & Tier 3 Equities).
Verifies:
(a) weights 100/0/0 reproduce repo-only exactly and excess is 0;
(b) sleeve disabled leaves every stored S0-S6 result and /kpis identical to the cent;
(c) bond value at each hour equals units * price index / 100 for hand-picked timestamps;
(d) equity value equals units * price;
(e) risk-budget weights sum to 1, respect REPO_FLOOR, and shrink the equity weight as T falls;
(f) waterfall: a hand-built night with a small pool sells bonds before equities and equities
    before any overdraft in zero_overdraft mode, charges 2% and 15% of the amounts sold,
    and sells nothing in cost_optimal mode;
(g) accounting identity for every path: total_mv = repo + bond clean + carry + equity;
(h) neutral stress parameters with sleeve weights still reproduce the backtest.
"""

import pytest
import numpy as np
from starlette.testclient import TestClient

from engine.app.main import app, get_db, _load_sleeve_market_data
from engine.app.config import (
    SLEEVE_USD,
    REPO_FLOOR,
    RISK_TOLERANCE_T,
    ACCRUAL,
    SLEEVE_PRESETS,
)
from engine.app.sleeve import (
    compute_risk_budget_weights,
    parse_weights,
    simulate_sleeve_path,
    calculate_sleeve_summary,
    simulate_liquidity_waterfall,
)
from engine.app.schemas import SleeveWeights

client = TestClient(app)


@pytest.fixture(scope="module")
def window_market_data():
    """Loads all hourly rows for the full replay window."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT MIN(night_date) as min_date, MAX(night_date) as max_date FROM forecasts;")
            dates = cur.fetchone()
            first_date = dates["min_date"]
            last_date = dates["max_date"]

    import datetime
    start_ts = datetime.datetime(first_date.year, first_date.month, first_date.day, 17, 0, 0)
    end_ts = datetime.datetime(last_date.year, last_date.month, last_date.day, 17, 0, 0) + datetime.timedelta(hours=15)
    rows = _load_sleeve_market_data(start_ts, end_ts)
    return rows


def test_a_weights_100_0_0_reproduce_repo_only_and_excess_is_zero(window_market_data):
    """(a) weights 100/0/0 reproduce repo-only exactly and excess is 0."""
    w = SleeveWeights(repo=1.0, bonds=0.0, equity=0.0)
    path = simulate_sleeve_path(window_market_data, w, SLEEVE_USD, accrual=ACCRUAL)

    assert len(path) == len(window_market_data)
    for r in path:
        assert r.bond_clean_mv == 0.0
        assert r.bond_carry == 0.0
        assert r.equity_mv == 0.0
        assert np.isclose(r.repo_mv, r.benchmark_mv, atol=1e-6)
        assert np.isclose(r.total_mv, r.benchmark_mv, atol=1e-6)
        assert np.isclose(r.excess_vs_repo, 0.0, atol=1e-6)

    summary = calculate_sleeve_summary(path, window_market_data[0], window_market_data[-1], SLEEVE_USD)
    assert np.isclose(summary.excess_pnl_vs_repo, 0.0, atol=1e-4)


def test_b_sleeve_disabled_leaves_stored_s0_s6_and_kpis_identical_to_cent():
    """(b) sleeve disabled leaves every stored S0-S6 result and /kpis identical to the cent."""
    resp = client.get("/kpis")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    expected_net_pnls = {
        "S0_all_cash": 0.00,
        "S1_fixed_10": -6340443.46,
        "S2_fixed_20": -1711506.01,
        "S3_static": 2030262.39,
        "S4_policy_zero_overdraft": 2330538.98,
        "S5_policy_cost_optimal": 2846851.61,
        "S6_oracle": 2946341.25,
    }

    strat_map = {s["strategy"]: s for s in data["strategies"]}
    for name, expected in expected_net_pnls.items():
        assert name in strat_map, f"Missing strategy {name}"
        actual = strat_map[name]["net_pnl"]
        assert round(actual, 2) == expected, f"{name}: expected {expected}, got {actual}"


def test_c_bond_value_at_each_hour_equals_units_times_price_index(window_market_data):
    """(c) bond value at each hour equals units * price index / 100 for hand-picked timestamps."""
    w = SleeveWeights(repo=0.2, bonds=0.5, equity=0.3)
    p_b0 = float(window_market_data[0]["tier2_bond_price_index"])
    bond_capital = SLEEVE_USD * w.bonds
    units = bond_capital / (p_b0 / 100.0)

    path = simulate_sleeve_path(window_market_data, w, SLEEVE_USD, accrual=ACCRUAL)

    # Hand-picked indices across the 7,384 hours
    sample_indices = [0, 1, 24, 100, 500, 1000, 3000, 5000, len(path) - 1]
    for idx in sample_indices:
        row = window_market_data[idx]
        p_b = float(row["tier2_bond_price_index"])
        expected_clean = units * (p_b / 100.0)
        actual_clean = path[idx].bond_clean_mv
        assert np.isclose(actual_clean, expected_clean, atol=1e-5), (
            f"Hour {idx} ({row['ts']}): expected {expected_clean}, got {actual_clean}"
        )


def test_d_equity_value_equals_units_times_price(window_market_data):
    """(d) equity value equals units * price."""
    w = SleeveWeights(repo=0.2, bonds=0.5, equity=0.3)
    p_e0 = float(window_market_data[0]["tier3_stock_index_price"])
    equity_capital = SLEEVE_USD * w.equity
    units = equity_capital / p_e0

    path = simulate_sleeve_path(window_market_data, w, SLEEVE_USD, accrual=ACCRUAL)

    sample_indices = [0, 1, 24, 100, 500, 1000, 3000, 5000, len(path) - 1]
    for idx in sample_indices:
        row = window_market_data[idx]
        p_e = float(row["tier3_stock_index_price"])
        expected_mv = units * p_e
        actual_mv = path[idx].equity_mv
        assert np.isclose(actual_mv, expected_mv, atol=1e-5), (
            f"Hour {idx} ({row['ts']}): expected {expected_mv}, got {actual_mv}"
        )


def test_e_risk_budget_weights_sum_to_1_respect_repo_floor_and_shrink_equity_as_T_falls(window_market_data):
    """(e) risk-budget weights sum to 1, respect REPO_FLOOR, and shrink the equity weight as T falls."""
    row0 = window_market_data[0]

    # Baseline T = 0.05
    w_base, working = compute_risk_budget_weights(row0, T=0.05)
    assert np.isclose(w_base.repo + w_base.bonds + w_base.equity, 1.0, atol=1e-6)
    assert w_base.repo >= REPO_FLOOR - 1e-6
    assert w_base.bonds >= 0.0
    assert w_base.equity >= 0.0

    # Shrink T: 0.05 -> 0.03 -> 0.02 -> 0.01
    t_values = [0.05, 0.03, 0.02, 0.01, 0.005]
    prev_eq_weight = float("inf")

    for t in t_values:
        w, wrk = compute_risk_budget_weights(row0, T=t)
        total = w.repo + w.bonds + w.equity
        assert np.isclose(total, 1.0, atol=1e-6), f"T={t}: weights sum to {total}"
        assert w.repo >= REPO_FLOOR - 1e-6, f"T={t}: repo weight {w.repo} below floor {REPO_FLOOR}"
        assert w.equity < prev_eq_weight, f"T={t}: equity weight {w.equity} did not shrink vs prev {prev_eq_weight}"
        prev_eq_weight = w.equity


def test_f_waterfall_hand_built_night():
    """
    (f) waterfall: a hand-built night with a small pool sells bonds before equities
    and equities before any overdraft in zero_overdraft mode, charges 2% and 15%
    of the amounts sold, and sells nothing in cost_optimal mode.
    """
    shortfall = 500000.0
    swept_repo = 0.0
    avail_bonds = 300000.0
    avail_equity = 400000.0
    bond_hc = 2.0
    eq_hc = 15.0

    # zero_overdraft mode
    res_zero = simulate_liquidity_waterfall(
        shortfall=shortfall,
        swept_repo=swept_repo,
        mode="zero_overdraft",
        sleeve_bonds=avail_bonds,
        sleeve_equities=avail_equity,
        bond_haircut_pct=bond_hc,
        equity_haircut_pct=eq_hc,
    )

    assert len(res_zero.events) == 2
    # Event 1: bonds sold first
    ev_bonds = res_zero.events[0]
    assert ev_bonds.asset == "bonds"
    assert ev_bonds.amount == 300000.0
    assert ev_bonds.fee == 300000.0 * 0.02  # 6,000.0

    # Event 2: equities sold next for the remaining 200,000
    ev_eq = res_zero.events[1]
    assert ev_eq.asset == "equities"
    assert ev_eq.amount == 200000.0
    assert ev_eq.fee == 200000.0 * 0.15  # 30,000.0

    assert res_zero.bonds_sold == 300000.0
    assert res_zero.equities_sold == 200000.0
    assert res_zero.remaining_overdraft == 0.0
    assert res_zero.total_fees == 6000.0 + 30000.0  # 36,000.0

    # cost_optimal mode: sell nothing and overdraft
    res_cost = simulate_liquidity_waterfall(
        shortfall=shortfall,
        swept_repo=swept_repo,
        mode="cost_optimal",
        sleeve_bonds=avail_bonds,
        sleeve_equities=avail_equity,
        bond_haircut_pct=bond_hc,
        equity_haircut_pct=eq_hc,
    )

    assert len(res_cost.events) == 0
    assert res_cost.bonds_sold == 0.0
    assert res_cost.equities_sold == 0.0
    assert res_cost.total_fees == 0.0
    assert res_cost.remaining_overdraft == 500000.0


def test_g_accounting_identity_for_every_path(window_market_data):
    """(g) accounting identity for every path: total_mv = repo + bond clean + carry + equity."""
    configs = ["risk_budget", "conservative", "income", "balanced", "growth"]

    for c in configs:
        w, _ = parse_weights(preset=c, row0=window_market_data[0])
        path = simulate_sleeve_path(window_market_data, w, SLEEVE_USD, accrual=ACCRUAL)

        for r in path:
            expected_total = r.repo_mv + r.bond_clean_mv + r.bond_carry + r.equity_mv
            assert np.isclose(r.total_mv, expected_total, atol=1e-4), (
                f"Accounting breach on {r.ts} for {c}: total={r.total_mv}, sum={expected_total}"
            )


def test_h_neutral_stress_parameters_with_sleeve_weights_reproduce_backtest():
    """(h) neutral stress parameters with sleeve weights still reproduce the backtest."""
    payload = {
        "night_date": "2026-02-26",
        "scenario": "withdrawal_surge",
        "params": {"m": 1.0, "hour_from": 0, "hour_to": 14},
        "strategy": "S4_policy_zero_overdraft",
        "mode": "zero_overdraft",
        "informed": False,
        "sleeve_preset": "balanced",
        "sleeve_usd": 50000000.0,
    }
    resp = client.post("/stress/night", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["deltas"]["net_pnl"] == 0.0
    assert data["deltas"]["break_fee"] == 0.0
    assert data["deltas"]["overdraft_cost"] == 0.0
    assert data["waterfall_fees"] == 0.0
    assert data["waterfall_bonds_sold"] == 0.0
    assert data["waterfall_equities_sold"] == 0.0


def test_i_no_field_of_tick_depends_on_later_hour(window_market_data):
    """(i) no field of a tick depends on a later hour."""
    import copy
    w = SleeveWeights(repo=0.4, bonds=0.4, equity=0.2)

    # Simulate base path
    base_path = simulate_sleeve_path(window_market_data, w, SLEEVE_USD, accrual=ACCRUAL)

    # Test several test points t
    test_points = [10, 50, 100, 500, 1000]
    for t in test_points:
        # Create a copy of rows up to t
        truncated_rows = [copy.deepcopy(r) for r in window_market_data[: t + 1]]

        # Path simulated only up to t
        trunc_path = simulate_sleeve_path(truncated_rows, w, SLEEVE_USD, accrual=ACCRUAL)

        # The row at t must be strictly identical in trunc_path and base_path
        r_base = base_path[t]
        r_trunc = trunc_path[t]

        assert r_base.ts == r_trunc.ts
        assert np.isclose(r_base.repo_mv, r_trunc.repo_mv, atol=1e-8)
        assert np.isclose(r_base.bond_clean_mv, r_trunc.bond_clean_mv, atol=1e-8)
        assert np.isclose(r_base.bond_carry, r_trunc.bond_carry, atol=1e-8)
        assert np.isclose(r_base.equity_mv, r_trunc.equity_mv, atol=1e-8)
        assert np.isclose(r_base.total_mv, r_trunc.total_mv, atol=1e-8)
        assert np.isclose(r_base.benchmark_mv, r_trunc.benchmark_mv, atol=1e-8)
        assert np.isclose(r_base.excess_vs_repo, r_trunc.excess_vs_repo, atol=1e-8)

        # Perturb future rows (t+1 onwards) wildly
        perturbed_rows = [copy.deepcopy(r) for r in window_market_data]
        for f in range(t + 1, len(perturbed_rows)):
            perturbed_rows[f]["tier2_bond_price_index"] = 999.0
            perturbed_rows[f]["tier3_stock_index_price"] = 99999.0
            perturbed_rows[f]["tier1_repo_rate_apy"] = 50.0

        perturbed_path = simulate_sleeve_path(perturbed_rows, w, SLEEVE_USD, accrual=ACCRUAL)
        r_pert = perturbed_path[t]

        # The row at t must STILL be strictly identical
        assert np.isclose(r_base.repo_mv, r_pert.repo_mv, atol=1e-8)
        assert np.isclose(r_base.bond_clean_mv, r_pert.bond_clean_mv, atol=1e-8)
        assert np.isclose(r_base.bond_carry, r_pert.bond_carry, atol=1e-8)
        assert np.isclose(r_base.equity_mv, r_pert.equity_mv, atol=1e-8)
        assert np.isclose(r_base.total_mv, r_pert.total_mv, atol=1e-8)
        assert np.isclose(r_base.benchmark_mv, r_pert.benchmark_mv, atol=1e-8)
        assert np.isclose(r_base.excess_vs_repo, r_pert.excess_vs_repo, atol=1e-8)
