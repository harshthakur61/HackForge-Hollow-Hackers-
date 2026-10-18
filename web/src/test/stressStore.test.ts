/**
 * stressStore.test.ts: Vitest unit tests for useStressStore.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useStressStore } from "../store/useStressStore";

describe("useStressStore unit tests", () => {
  beforeEach(() => {
    useStressStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("initializes with correct default configuration", () => {
    const state = useStressStore.getState();
    expect(state.scenario).toBe("withdrawal_surge");
    expect(state.surgeParams).toEqual({ m: 2.0, hour_from: 3, hour_to: 9 });
    expect(state.bankRunParams).toEqual({ x: 25.0, k: 3, start_hour: 2 });
    expect(state.freezeParams).toEqual({ f: 0.0, hour_from: 0, hour_to: 14 });
    expect(state.nightDate).toBe("2026-10-03");
    expect(state.strategy).toBe("S4_policy_zero_overdraft");
    expect(state.mode).toBe("zero_overdraft");
    expect(state.informed).toBe(false);
    expect(state.nightFilter).toBe("all");
    expect(state.nightResult).toBeNull();
    expect(state.batchResult).toBeNull();
  });

  it("updates scenarios and returns active params appropriately", () => {
    const store = useStressStore.getState();

    // Default scenario: withdrawal_surge
    expect(store.getActiveParams()).toEqual({ m: 2.0, hour_from: 3, hour_to: 9 });

    // Switch to bank_run
    store.setScenario("bank_run");
    expect(useStressStore.getState().scenario).toBe("bank_run");
    expect(useStressStore.getState().getActiveParams()).toEqual({ x: 25.0, k: 3, start_hour: 2 });

    // Update bank_run params
    store.updateBankRunParams({ x: 30.0, k: 4 });
    expect(useStressStore.getState().bankRunParams).toEqual({ x: 30.0, k: 4, start_hour: 2 });
    expect(useStressStore.getState().getActiveParams()).toEqual({ x: 30.0, k: 4, start_hour: 2 });

    // Switch to deposit_freeze
    store.setScenario("deposit_freeze");
    expect(useStressStore.getState().scenario).toBe("deposit_freeze");
    expect(useStressStore.getState().getActiveParams()).toEqual({ f: 0.0, hour_from: 0, hour_to: 14 });
  });

  it("toggles informed advance-warning mode, policy mode, and batch filters", () => {
    const store = useStressStore.getState();

    store.setInformed(true);
    expect(useStressStore.getState().informed).toBe(true);

    store.setMode("cost_optimal");
    expect(useStressStore.getState().mode).toBe("cost_optimal");

    store.setNightFilter("fri_sat");
    expect(useStressStore.getState().nightFilter).toBe("fri_sat");

    store.setNightDate("2026-07-03");
    expect(useStressStore.getState().nightDate).toBe("2026-07-03");
  });

  it("resets state back to defaults cleanly", () => {
    const store = useStressStore.getState();
    store.setScenario("bank_run");
    store.setInformed(true);
    store.setNightDate("2026-08-15");

    store.reset();
    const resetState = useStressStore.getState();
    expect(resetState.scenario).toBe("withdrawal_surge");
    expect(resetState.informed).toBe(false);
    expect(resetState.nightDate).toBe("2026-10-03");
  });

  it("handles night simulation fetch error gracefully", async () => {
    const store = useStressStore.getState();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Parameter m out of bounds" }),
    } as Response);

    await store.runNightSimulation();

    const state = useStressStore.getState();
    expect(state.isNightLoading).toBe(false);
    expect(state.nightError).toBe("Parameter m out of bounds");
    expect(state.nightResult).toBeNull();
  });
});
