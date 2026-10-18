/**
 * useStressStore.ts: Zustand store managing Stress Lab configuration, parameters,
 * execution state, and responses for single-night deep dives and multi-strategy batches.
 */

import { create } from "zustand";
import {
  StressNightResponse,
  StressBatchResponse,
  StressNightResponseSchema,
  StressBatchResponseSchema,
} from "../contract";

export type StressScenario = "withdrawal_surge" | "bank_run" | "deposit_freeze";
export type BatchNightFilter = "all" | "fri_sat" | "payday";

export interface WithdrawalSurgeParams {
  m: number;
  hour_from: number;
  hour_to: number;
}

export interface BankRunParams {
  x: number;
  k: number;
  start_hour: number;
}

export interface DepositFreezeParams {
  f: number;
  hour_from: number;
  hour_to: number;
}

export interface StressStoreState {
  // Scenario & Params
  scenario: StressScenario;
  surgeParams: WithdrawalSurgeParams;
  bankRunParams: BankRunParams;
  freezeParams: DepositFreezeParams;

  // Single Night Controls
  nightDate: string;
  strategy: string;
  mode: "zero_overdraft" | "cost_optimal";
  informed: boolean;

  // Batch Filter Controls
  nightFilter: BatchNightFilter;

  // Strategic Sleeve Weights
  sleevePreset: string;
  sleeveWeights?: { repo: number; bonds: number; equity: number };

  // Execution & Results
  isNightLoading: boolean;
  nightError: string | null;
  nightResult: StressNightResponse | null;

  isBatchLoading: boolean;
  batchError: string | null;
  batchResult: StressBatchResponse | null;

  // Actions
  setScenario: (scenario: StressScenario) => void;
  updateSurgeParams: (params: Partial<WithdrawalSurgeParams>) => void;
  updateBankRunParams: (params: Partial<BankRunParams>) => void;
  updateFreezeParams: (params: Partial<DepositFreezeParams>) => void;
  setNightDate: (date: string) => void;
  setStrategy: (strat: string) => void;
  setMode: (mode: "zero_overdraft" | "cost_optimal") => void;
  setInformed: (informed: boolean) => void;
  setNightFilter: (filter: BatchNightFilter) => void;
  setSleevePreset: (preset: string) => void;
  setSleeveWeights: (weights: { repo: number; bonds: number; equity: number }) => void;

  getActiveParams: () => Record<string, any>;
  runNightSimulation: () => Promise<void>;
  runBatchSimulation: () => Promise<void>;
  reset: () => void;
}

const defaultSurgeParams: WithdrawalSurgeParams = {
  m: 2.0,
  hour_from: 3,
  hour_to: 9,
};

const defaultBankRunParams: BankRunParams = {
  x: 25.0,
  k: 3,
  start_hour: 2,
};

const defaultFreezeParams: DepositFreezeParams = {
  f: 0.0,
  hour_from: 0,
  hour_to: 14,
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const useStressStore = create<StressStoreState>((set, get) => ({
  scenario: "withdrawal_surge",
  surgeParams: { ...defaultSurgeParams },
  bankRunParams: { ...defaultBankRunParams },
  freezeParams: { ...defaultFreezeParams },

  nightDate: "2026-10-03", // Saturday large drain night by default
  strategy: "S4_policy_zero_overdraft",
  mode: "zero_overdraft",
  informed: false,

  nightFilter: "all",
  sleevePreset: "risk_budget",
  sleeveWeights: undefined,

  isNightLoading: false,
  nightError: null,
  nightResult: null,

  isBatchLoading: false,
  batchError: null,
  batchResult: null,

  setScenario: (scenario) => set({ scenario }),
  updateSurgeParams: (params) =>
    set((state) => ({ surgeParams: { ...state.surgeParams, ...params } })),
  updateBankRunParams: (params) =>
    set((state) => ({ bankRunParams: { ...state.bankRunParams, ...params } })),
  updateFreezeParams: (params) =>
    set((state) => ({ freezeParams: { ...state.freezeParams, ...params } })),
  setNightDate: (nightDate) => set({ nightDate }),
  setStrategy: (strategy) => set({ strategy }),
  setMode: (mode) => set({ mode }),
  setInformed: (informed) => set({ informed }),
  setNightFilter: (nightFilter) => set({ nightFilter }),
  setSleevePreset: (sleevePreset) => set({ sleevePreset }),
  setSleeveWeights: (sleeveWeights) => set({ sleeveWeights }),

  getActiveParams: () => {
    const s = get();
    if (s.scenario === "withdrawal_surge") return s.surgeParams;
    if (s.scenario === "bank_run") return s.bankRunParams;
    return s.freezeParams;
  },

  runNightSimulation: async () => {
    const state = get();
    set({ isNightLoading: true, nightError: null });
    try {
      const activeParams = state.getActiveParams();
      const payload: Record<string, any> = {
        night_date: state.nightDate,
        scenario: state.scenario,
        params: activeParams,
        strategy: state.strategy,
        mode: state.mode,
        informed: state.informed,
      };
      if (state.sleevePreset === "custom" && state.sleeveWeights) {
        payload.sleeve_weights = state.sleeveWeights;
      } else if (state.sleevePreset && state.sleevePreset !== "custom") {
        payload.sleeve_preset = state.sleevePreset;
      }

      const resp = await fetch(`${API_BASE}/api/stress/night`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || `HTTP ${resp.status}`);
      }

      const json = await resp.json();
      const parsed = StressNightResponseSchema.parse(json);
      set({ nightResult: parsed, isNightLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ nightError: msg, isNightLoading: false });
    }
  },

  runBatchSimulation: async () => {
    const state = get();
    set({ isBatchLoading: true, batchError: null });
    try {
      const activeParams = state.getActiveParams();
      const payload: Record<string, any> = {
        scenario: state.scenario,
        params: activeParams,
        informed: state.informed,
        night_filter: state.nightFilter,
      };
      if (state.sleevePreset === "custom" && state.sleeveWeights) {
        payload.sleeve_weights = state.sleeveWeights;
      } else if (state.sleevePreset && state.sleevePreset !== "custom") {
        payload.sleeve_preset = state.sleevePreset;
      }

      const resp = await fetch(`${API_BASE}/api/stress/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.error || `HTTP ${resp.status}`);
      }

      const json = await resp.json();
      const parsed = StressBatchResponseSchema.parse(json);
      set({ batchResult: parsed, isBatchLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ batchError: msg, isBatchLoading: false });
    }
  },

  reset: () =>
    set({
      scenario: "withdrawal_surge",
      surgeParams: { ...defaultSurgeParams },
      bankRunParams: { ...defaultBankRunParams },
      freezeParams: { ...defaultFreezeParams },
      nightDate: "2026-10-03",
      strategy: "S4_policy_zero_overdraft",
      mode: "zero_overdraft",
      informed: false,
      nightFilter: "all",
      sleevePreset: "risk_budget",
      sleeveWeights: undefined,
      isNightLoading: false,
      nightError: null,
      nightResult: null,
      isBatchLoading: false,
      batchError: null,
      batchResult: null,
    }),
}));
