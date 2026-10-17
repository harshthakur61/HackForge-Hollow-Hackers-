import { describe, it, expect, beforeEach } from "vitest";
import { useReplayStore } from "../store/useReplayStore";
import { DecisionEvent, ReplayTick, SettlementEvent } from "../contract";

const mockDecision: DecisionEvent = {
  night_date: "2026-02-26",
  decision: {
    buffer_usd: 10_000_000,
    sweep_usd: 90_000_000,
    quantile_used: 0.98,
    model: "B1",
    reason: "Test decision",
    q_star_zero: 0.9783,
    q_star_opt: 0.7477,
  },
  forecasts: [{ model: "B1", quantile: 0.98, buffer_usd: 10_000_000 }],
  pool: 100_000_000,
  q_star: 0.9783,
};

const tick1: ReplayTick = {
  ts: "2026-02-26T17:00:00",
  phase: "night",
  simulated: true,
  deposits: 1000,
  withdrawals: 500,
  net_flow: 500,
  balances: { cash: 10_500_000, repo: 90_000_000, overdraft: 0 },
  repo_apy: 4.05,
};

const tick2: ReplayTick = {
  ts: "2026-02-26T18:00:00",
  phase: "night",
  simulated: true,
  deposits: 2000,
  withdrawals: 1000,
  net_flow: 1000,
  balances: { cash: 11_500_000, repo: 90_000_000, overdraft: 0 },
  repo_apy: 4.05,
};

// Out of order tick (earlier timestamp)
const outOfOrderTick: ReplayTick = {
  ts: "2026-02-26T17:30:00",
  phase: "night",
  simulated: true,
  deposits: 500,
  withdrawals: 500,
  net_flow: 0,
  balances: { cash: 10_000_000, repo: 90_000_000, overdraft: 0 },
  repo_apy: 4.05,
};

const mockSettlement: SettlementEvent = {
  night_date: "2026-02-26",
  interest: 10000,
  break_fee: 0,
  overdraft_cost: 0,
  net_pnl: 10000,
  actual_required_usd: 5000000,
  forecast_buffer_usd: 10000000,
  covered: true,
  cumulative: {
    S4_policy_zero_overdraft: {
      strategy: "S4_policy_zero_overdraft",
      nights: 1,
      interest: 10000,
      break_fees: 0,
      overdraft_cost: 0,
      net_pnl: 10000,
      net_yield_bps: 365,
      mean_buffer: 10000000,
      repo_break_nights: 0,
      overdraft_nights: 0,
      payout_success_rate: 100,
    },
  },
};

describe("Zustand store reducer tests", () => {
  beforeEach(() => {
    useReplayStore.getState().resetAll();
  });

  it("handleDecision resets the current night slice", () => {
    // Populate dummy state
    useReplayStore.getState().handleTick(tick1);
    expect(useReplayStore.getState().currentNight.hourlyTicks.length).toBe(1);

    // Now dispatch decision
    useReplayStore.getState().handleDecision(mockDecision);

    const currentNight = useReplayStore.getState().currentNight;
    expect(currentNight.nightDate).toBe("2026-02-26");
    expect(currentNight.decision).toEqual(mockDecision);
    expect(currentNight.hourlyTicks).toEqual([]);
    expect(currentNight.events).toEqual([]);
  });

  it("handleTick appends ticks in strict order and ignores out-of-order ticks", () => {
    useReplayStore.getState().handleDecision(mockDecision);

    // Append first tick
    useReplayStore.getState().handleTick(tick1);
    expect(useReplayStore.getState().currentNight.hourlyTicks.length).toBe(1);

    // Append second tick (valid, 18:00 > 17:00)
    useReplayStore.getState().handleTick(tick2);
    expect(useReplayStore.getState().currentNight.hourlyTicks.length).toBe(2);
    expect(useReplayStore.getState().currentNight.hourlyTicks[1].ts).toBe("2026-02-26T18:00:00");

    // Try to append out-of-order tick (17:30 <= 18:00)
    useReplayStore.getState().handleTick(outOfOrderTick);
    // Must be ignored!
    expect(useReplayStore.getState().currentNight.hourlyTicks.length).toBe(2);

    // Try duplicate tick (18:00)
    useReplayStore.getState().handleTick(tick2);
    expect(useReplayStore.getState().currentNight.hourlyTicks.length).toBe(2);
  });

  it("handleSettlement appends exactly one history row and updates cumulative KPIs", () => {
    expect(useReplayStore.getState().settledHistory.length).toBe(0);

    useReplayStore.getState().handleSettlement(mockSettlement);
    expect(useReplayStore.getState().settledHistory.length).toBe(1);
    expect(useReplayStore.getState().settledHistory[0].night_date).toBe("2026-02-26");
    expect(useReplayStore.getState().settledHistory[0].net_pnl).toBe(10000);
    expect(useReplayStore.getState().latestCumulativeKpis).toEqual(mockSettlement.cumulative);

    // Dispatching the same settlement event again should not duplicate history
    useReplayStore.getState().handleSettlement(mockSettlement);
    expect(useReplayStore.getState().settledHistory.length).toBe(1);
  });
});
