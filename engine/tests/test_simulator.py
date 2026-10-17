import datetime
import pytest
import numpy as np
import pandas as pd
from engine.app.simulator import simulate_night, NightResult
from engine.app.strategies import STRATEGY_NAMES, get_strategy_buffer
from engine.app.config import POOL_USD, DEFAULT_EARLY_REDEMPTION_HAIRCUT_PCT, DEFAULT_EMERGENCY_OVERDRAFT_APR_PCT


def test_a_all_cash_never_breaks_or_overdrafts_and_earns_zero():
    # Negative flows that would drain non-cash reserves
    flows = [-10_000_000.0] * 5 + [2_000_000.0] * 10
    res = simulate_night(
        flows_15h=flows,
        pool=100_000_000.0,
        buffer=100_000_000.0,
        repo_rate=4.05,
    )
    assert res.interest == 0.0
    assert res.break_fee == 0.0
    assert res.broken_amount == 0.0
    assert res.overdraft_peak == 0.0
    assert res.overdraft_cost == 0.0
    assert res.net_pnl == 0.0
    assert res.payouts_honored is True
    assert res.idle_cash_at_17 == 100_000_000.0


def test_b_oracle_never_breaks_or_overdrafts():
    flows = [-5_000_000.0, -10_000_000.0, -8_000_000.0, 3_000_000.0] + [0.0] * 11
    # Minimum cumulative net flow is -23M -> required buffer = 23M
    cumsum = np.cumsum(flows)
    oracle_buffer = max(0.0, -float(np.min(cumsum)))
    assert oracle_buffer == 23_000_000.0

    res = simulate_night(
        flows_15h=flows,
        pool=100_000_000.0,
        buffer=oracle_buffer,
        repo_rate=4.05,
    )
    assert res.broken_amount == 0.0
    assert res.break_fee == 0.0
    assert res.overdraft_peak == 0.0
    assert res.overdraft_cost == 0.0
    assert res.shortfall_peak == 0.0
    assert res.payouts_honored is True
    assert res.interest > 0.0
    assert res.net_pnl == res.interest


def test_c_hand_built_night_5m_shortfall():
    # Pool 100M, Buffer 20M, Swept 80M. Flow = -25M in hour 0 -> deficit of exactly 5M
    flows = [-25_000_000.0] + [0.0] * 14
    res = simulate_night(
        flows_15h=flows,
        pool=100_000_000.0,
        buffer=20_000_000.0,
        repo_rate=4.05,
        config={"haircut_pct": 0.5, "POLICY_MODE": "zero_overdraft"},
    )
    assert res.broken_amount == 5_000_000.0
    # Fee at 0.5% on 5,000,000 = 25,000
    assert res.break_fee == 25_000.0
    assert res.overdraft_peak == 0.0
    assert res.overdraft_cost == 0.0
    assert res.shortfall_peak == 5_000_000.0
    # Remaining swept = 75M earning interest
    expected_interest = 75_000_000.0 * (4.05 / 100.0 / 365.0)
    assert np.isclose(res.interest, expected_interest)
    assert np.isclose(res.net_pnl, expected_interest - 25_000.0)


def test_d_shortfall_larger_than_repo_balance():
    # Pool 100M, Buffer 20M -> Repo = 80M.
    # Flow = -110M -> Deficit = 90M.
    # Entire 80M repo broken, remaining 10M is overdraft.
    flows = [-110_000_000.0] + [0.0] * 14
    res = simulate_night(
        flows_15h=flows,
        pool=100_000_000.0,
        buffer=20_000_000.0,
        repo_rate=4.05,
        config={"haircut_pct": 0.5, "overdraft_apr": 12.0, "POLICY_MODE": "zero_overdraft"},
    )
    assert res.broken_amount == 80_000_000.0
    assert res.break_fee == 80_000_000.0 * 0.005  # 400,000
    assert res.overdraft_peak == 10_000_000.0
    assert res.interest == 0.0  # all repo broken
    assert res.overdraft_cost > 0.0
    assert res.payouts_honored is True


def test_e_cost_optimal_mode_hourly_overdraft_cost():
    # Pool 100M, Buffer 10M.
    # Hour 0 flow = -15M -> cash balance becomes -5M -> overdraft balance = 5M
    # Hour 1 flow = -5M -> cash balance becomes -10M -> overdraft balance = 10M
    # Hours 2-14 (13 hours) flow = 0 -> overdraft balance remains 10M
    flows = [-15_000_000.0, -5_000_000.0] + [0.0] * 13
    overdraft_apr = 12.0
    hourly_rate = overdraft_apr / 100.0 / 365.0 / 24.0

    # Expected overdraft cost: 1 hour at 5M + 14 hours at 10M
    expected_cost = 5_000_000.0 * hourly_rate + 14 * (10_000_000.0 * hourly_rate)

    res = simulate_night(
        flows_15h=flows,
        pool=100_000_000.0,
        buffer=10_000_000.0,
        repo_rate=4.05,
        config={"POLICY_MODE": "cost_optimal", "overdraft_apr": overdraft_apr},
    )
    assert res.broken_amount == 0.0
    assert res.break_fee == 0.0
    assert np.isclose(res.overdraft_cost, expected_cost)
    # Repo was untouched (90M)
    expected_interest = 90_000_000.0 * (4.05 / 100.0 / 365.0)
    assert np.isclose(res.interest, expected_interest)
    assert np.isclose(res.net_pnl, expected_interest - expected_cost)


def test_f_and_g_accounting_identity_and_payouts_honored():
    # Test a battery of randomized nights across all strategies
    np.random.seed(42)
    sample_flows = [
        np.random.normal(loc=-1_000_000.0, scale=8_000_000.0, size=15).tolist()
        for _ in range(20)
    ]
    pool = 100_000_000.0

    for flows in sample_flows:
        for mode in ["zero_overdraft", "cost_optimal"]:
            for buf_ratio in [0.0, 0.1, 0.2, 0.5, 1.0]:
                buf = buf_ratio * pool
                res = simulate_night(
                    flows_15h=flows,
                    pool=pool,
                    buffer=buf,
                    repo_rate=4.10,
                    config={"POLICY_MODE": mode, "haircut_pct": 0.5, "overdraft_apr": 12.0},
                )
                # Identity f: net_pnl = interest - break_fee - overdraft_cost
                assert np.isclose(res.net_pnl, res.interest - res.break_fee - res.overdraft_cost)
                # Identity g: payouts_honored is True
                assert res.payouts_honored is True
