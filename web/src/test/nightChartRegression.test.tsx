/**
 * nightChartRegression.test.tsx: Regression test suite for Phase 4.
 * Tests:
 * 1. Store/selector: 10 ticks growing 1..10 with new array references;
 *    daytime ticks (09:00 - 16:00) ignored; new decision resets slice.
 * 2. Component: NightChart renders hour-by-hour with caption "Hour N of 16, last tick HH:MM";
 *    toggling table view does not reset data points.
 * 3. Strategy & Model label mapping: every contract strategy has a label; model codes translated.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useReplayStore, selectNightChartData } from "../store/useReplayStore";
import { NightChart } from "../components/NightChart";
import { DecisionEvent, ReplayTick } from "../contract";
import {
  STRATEGY_LABELS,
  getStrategyLabel,
  getModelLabel,
  CONTRACT_STRATEGY_IDS,
} from "../utils/labels";

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

function createTick(hour: number, day = "2026-02-26"): ReplayTick {
  const isNight = hour >= 17 || hour <= 8;
  const hourStr = String(hour).padStart(2, "0");
  const ts = `${day}T${hourStr}:00:00`;
  return {
    ts,
    phase: isNight && hour !== 8 ? "night" : "day",
    simulated: isNight && hour !== 8,
    deposits: 100,
    withdrawals: 50,
    net_flow: 50,
    balances: {
      cash: isNight ? 12_000_000 : 100_000_000,
      repo: isNight ? 88_000_000 : 0,
      overdraft: 0,
    },
    repo_apy: 4.1,
  };
}

describe("Phase 4: Store & Selector Regression Tests", () => {
  beforeEach(() => {
    useReplayStore.getState().resetAll();
  });

  it("grows 1,2,...,10 with new array references on each tick, ignores daytime ticks, and resets on new decision", () => {
    const store = useReplayStore.getState();

    // 1. Send decision
    act(() => {
      store.handleDecision(mockDecision);
    });

    let prevRef: unknown[] = [];
    const overnightHours = [17, 18, 19, 20, 21, 22, 23, 0, 1, 2]; // 10 ticks

    // Feed 10 ticks (17:00 through 02:00)
    for (let i = 0; i < overnightHours.length; i++) {
      const h = overnightHours[i];
      const day = h >= 17 ? "2026-02-26" : "2026-02-27";
      const tick = createTick(h, day);

      act(() => {
        useReplayStore.getState().handleTick(tick);
      });

      const currentNight = useReplayStore.getState().currentNight;
      const chartData = selectNightChartData(currentNight);

      // Assert selector's output length grows exactly 1, 2, ..., 10
      expect(chartData.length).toBe(i + 1);

      // Assert new array reference each time
      expect(chartData).not.toBe(prevRef);
      prevRef = chartData;
    }

    // Complete the overnight window up to 08:00 (hours 3, 4, 5, 6, 7, 8)
    const remainingOvernightHours = [3, 4, 5, 6, 7, 8];
    for (const h of remainingOvernightHours) {
      act(() => {
        useReplayStore.getState().handleTick(createTick(h, "2026-02-27"));
      });
    }

    // Overnight window reaches exactly 16 points (17:00 to 08:00)
    const nightDataAt08 = selectNightChartData(useReplayStore.getState().currentNight);
    expect(nightDataAt08.length).toBe(16);

    // 2. Daytime ticks (09:00 through 16:00) MUST NOT be appended to overnight chart series
    const daytimeHours = [9, 10, 11, 12, 13, 14, 15, 16];
    for (const h of daytimeHours) {
      act(() => {
        useReplayStore.getState().handleTick(createTick(h, "2026-02-27"));
      });
    }

    const nightDataAfterDaytime = selectNightChartData(useReplayStore.getState().currentNight);
    // MUST still be exactly 16 points!
    expect(nightDataAfterDaytime.length).toBe(16);

    // 3. A new "decision" resets the night series
    const nextDecision: DecisionEvent = {
      ...mockDecision,
      night_date: "2026-02-27",
    };
    act(() => {
      useReplayStore.getState().handleDecision(nextDecision);
    });

    const resetData = selectNightChartData(useReplayStore.getState().currentNight);
    expect(resetData.length).toBe(0);
  });
});

describe("Phase 4: Component Rendering & Interaction Regression Tests", () => {
  beforeEach(() => {
    useReplayStore.getState().resetAll();
  });

  it("renders hour-by-hour stream with 'Hour N of 16, last tick HH:MM' caption without reset on toggle", () => {
    // Initialize decision and 3 ticks
    act(() => {
      useReplayStore.getState().handleDecision(mockDecision);
      useReplayStore.getState().handleTick(createTick(17, "2026-02-26"));
      useReplayStore.getState().handleTick(createTick(18, "2026-02-26"));
      useReplayStore.getState().handleTick(createTick(19, "2026-02-26"));
    });

    const { rerender } = render(<NightChart />);

    // Assert caption is rendered: "Hour 3 of 16, last tick 19:00"
    expect(screen.getByText(/Hour 3 of 16, last tick 19:00/i)).toBeInTheDocument();

    // Dispatch next tick (20:00)
    act(() => {
      useReplayStore.getState().handleTick(createTick(20, "2026-02-26"));
    });
    rerender(<NightChart />);

    // Caption updates to "Hour 4 of 16, last tick 20:00"
    expect(screen.getByText(/Hour 4 of 16, last tick 20:00/i)).toBeInTheDocument();

    // Toggle "View as table"
    const toggleButton = screen.getByRole("button", { name: /view as table|switch to data table view/i });
    fireEvent.click(toggleButton);

    // Table view is active with 4 rows
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBe(5); // 1 header + 4 data rows

    // Dispatch another tick while in table view (21:00)
    act(() => {
      useReplayStore.getState().handleTick(createTick(21, "2026-02-26"));
    });
    rerender(<NightChart />);

    // Table view now has 5 data rows (does not reset or lose points)
    expect(screen.getAllByRole("row").length).toBe(6); // 1 header + 5 data rows

    // Switch back to chart view
    const switchBackBtn = screen.getByRole("button", { name: /chart view|switch to chart view/i });
    fireEvent.click(switchBackBtn);

    // Caption reflects Hour 5 of 16, last tick 21:00
    expect(screen.getByText(/Hour 5 of 16, last tick 21:00/i)).toBeInTheDocument();
  });
});

describe("Phase 3: Label Mapping Consistency Tests", () => {
  it("provides institutional labels for every strategy key in the contract", () => {
    // Fails if any strategy id in the contract lacks a label
    expect(CONTRACT_STRATEGY_IDS).toContain("S0_all_cash");
    expect(CONTRACT_STRATEGY_IDS).toContain("S1_fixed_10");
    expect(CONTRACT_STRATEGY_IDS).toContain("S2_fixed_20");
    expect(CONTRACT_STRATEGY_IDS).toContain("S3_static");
    expect(CONTRACT_STRATEGY_IDS).toContain("S4_policy_zero_overdraft");
    expect(CONTRACT_STRATEGY_IDS).toContain("S5_policy_cost_optimal");
    expect(CONTRACT_STRATEGY_IDS).toContain("S6_oracle");

    for (const key of CONTRACT_STRATEGY_IDS) {
      const label = getStrategyLabel(key);
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
      expect(STRATEGY_LABELS[key]).toBeDefined();
    }

    expect(STRATEGY_LABELS.S0_all_cash).toBe("S0 All cash");
    expect(STRATEGY_LABELS.S1_fixed_10).toBe("S1 Fixed 10% buffer");
    expect(STRATEGY_LABELS.S2_fixed_20).toBe("S2 Fixed 20% buffer");
    expect(STRATEGY_LABELS.S3_static).toBe("S3 Static quantile buffer");
    expect(STRATEGY_LABELS.S4_policy_zero_overdraft).toBe("S4 Zero-overdraft policy (default)");
    expect(STRATEGY_LABELS.S5_policy_cost_optimal).toBe("S5 Cost-optimal policy (uses overdraft)");
    expect(STRATEGY_LABELS.S6_oracle).toBe("S6 Oracle (upper bound, not deployable)");
  });

  it("correctly translates known forecast model codes and falls back to raw code", () => {
    expect(getModelLabel("B0")).toBe("Static historical quantile");
    expect(getModelLabel("B1")).toBe("Same-weekday historical quantile forecast");
    expect(getModelLabel("B2")).toBe("Recent same-weekday maximum");
    expect(getModelLabel("M1")).toBe("XGBoost quantile model");
    expect(getModelLabel("M2")).toBe("XGBoost quantile model with conformal calibration");
    expect(getModelLabel("UNKNOWN_MODEL_99")).toBe("UNKNOWN_MODEL_99");
  });
});
