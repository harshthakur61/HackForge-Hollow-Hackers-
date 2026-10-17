import { describe, it, expect } from "vitest";
import { selectNightChartData, CurrentNightSlice } from "../store/useReplayStore";
import { DecisionEvent, ReplayTick } from "../contract";

const mockDecision: DecisionEvent = {
  night_date: "2026-02-26",
  decision: {
    buffer_usd: 12_000_000,
    sweep_usd: 88_000_000,
    quantile_used: 0.98,
    model: "B1",
    reason: "Test",
    q_star_zero: 0.9783,
    q_star_opt: 0.7477,
  },
  forecasts: [],
  pool: 100_000_000,
  q_star: 0.9783,
};

const tickHour17: ReplayTick = {
  ts: "2026-02-26T17:00:00",
  phase: "night",
  simulated: true,
  deposits: 100,
  withdrawals: 50,
  net_flow: 50,
  balances: { cash: 12_000_050, repo: 88_000_000, overdraft: 0 },
  repo_apy: 4.1,
};

const tickHour18: ReplayTick = {
  ts: "2026-02-26T18:00:00",
  phase: "night",
  simulated: true,
  deposits: 200,
  withdrawals: 150,
  net_flow: 50,
  balances: { cash: 12_000_100, repo: 88_000_000, overdraft: 0 },
  repo_apy: 4.1,
};

describe("Chart data selector tests", () => {
  it("never returns points beyond the latest tick", () => {
    // 1. When no ticks have been received yet, returns empty array
    const emptyNight: CurrentNightSlice = {
      nightDate: "2026-02-26",
      decision: mockDecision,
      hourlyTicks: [],
      events: [],
    };
    expect(selectNightChartData(emptyNight)).toEqual([]);

    // 2. When 1 tick has arrived (17:00), returns exactly 1 point
    const nightWithOneTick: CurrentNightSlice = {
      ...emptyNight,
      hourlyTicks: [tickHour17],
    };
    const data1 = selectNightChartData(nightWithOneTick);
    expect(data1.length).toBe(1);
    expect(data1[0].ts).toBe("2026-02-26T17:00:00");
    expect(data1[0].time).toBe("17:00");
    expect(data1[0].buffer).toBe(12_000_000);

    // 3. When 2 ticks have arrived (17:00 and 18:00), returns exactly 2 points
    const nightWithTwoTicks: CurrentNightSlice = {
      ...emptyNight,
      hourlyTicks: [tickHour17, tickHour18],
    };
    const data2 = selectNightChartData(nightWithTwoTicks);
    expect(data2.length).toBe(2);
    expect(data2[0].time).toBe("17:00");
    expect(data2[1].time).toBe("18:00");
    // Ensure no future hours (e.g. 19:00, 20:00, etc.) are present
    expect(data2.some((d) => d.time === "19:00")).toBe(false);
  });
});
