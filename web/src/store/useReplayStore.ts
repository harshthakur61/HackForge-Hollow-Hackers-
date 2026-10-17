/**
 * useReplayStore.ts: Central Zustand store managing replay state, streaming ticks,
 * events, decisions, settlements, and contract validation badges.
 */

import { create } from "zustand";
import {
  ReplayStatus,
  ReplayTick,
  DecisionEvent,
  ReplayEvent,
  SettlementEvent,
  StrategyKpi,
} from "../contract";

export type ConnectionState = "connected" | "reconnecting" | "disconnected" | "engine_down";

export interface SettledNightRecord {
  night_date: string;
  net_pnl: number;
  interest: number;
  break_fee: number;
  overdraft_cost: number;
  forecast_buffer_usd: number;
  actual_required_usd: number;
  covered: boolean;
  cumulative: Record<string, StrategyKpi>;
}

export interface CurrentNightSlice {
  nightDate: string | null;
  decision: DecisionEvent | null;
  hourlyTicks: ReplayTick[];
  events: ReplayEvent[];
}

export interface ValidationErrorBadge {
  id: string;
  ts: string;
  eventName: string;
  message: string;
}

export interface ReplayStoreState {
  // Connection & Validation
  connection: ConnectionState;
  validationBadges: ValidationErrorBadge[];

  // Replay Clock
  replayStatus: ReplayStatus;

  // Active Pending Config
  pendingConfig: {
    strategy?: string;
    mode?: "zero_overdraft" | "cost_optimal";
    quantile?: number;
    pool?: number;
  };

  // Current Night Slice (Reset on each new decision)
  currentNight: CurrentNightSlice;

  // History & Cumulative KPIs
  settledHistory: SettledNightRecord[];
  latestCumulativeKpis: Record<string, StrategyKpi> | null;

  // Global Event Feed (max 200)
  eventFeed: ReplayEvent[];

  // Selected decision for audit side panel
  selectedDecisionDate: string | null;

  // Actions / Reducers
  setConnection: (status: ConnectionState) => void;
  addValidationError: (eventName: string, message: string) => void;
  dismissValidationError: (id: string) => void;
  setReplayStatus: (status: ReplayStatus) => void;
  setPendingConfig: (cfg: Partial<ReplayStoreState["pendingConfig"]>) => void;
  clearPendingConfig: () => void;
  setSelectedDecisionDate: (date: string | null) => void;

  // Reducer Actions for WebSocket events
  handleDecision: (event: DecisionEvent) => void;
  handleTick: (tick: ReplayTick) => void;
  handleEvent: (event: ReplayEvent) => void;
  handleSettlement: (event: SettlementEvent) => void;
  resetAll: () => void;
}

const initialReplayStatus: ReplayStatus = {
  state: "idle",
  simTime: "2026-02-26T17:00:00",
  tickMs: 1000,
  strategy: "S4_policy_zero_overdraft",
  mode: "zero_overdraft",
  nightDate: "2026-02-26",
};

const initialCurrentNight: CurrentNightSlice = {
  nightDate: null,
  decision: null,
  hourlyTicks: [],
  events: [],
};

export const useReplayStore = create<ReplayStoreState>((set) => ({
  connection: "disconnected",
  validationBadges: [],
  replayStatus: initialReplayStatus,
  pendingConfig: {},
  currentNight: initialCurrentNight,
  settledHistory: [],
  latestCumulativeKpis: null,
  eventFeed: [],
  selectedDecisionDate: null,

  setConnection: (status) => set({ connection: status }),

  addValidationError: (eventName, message) =>
    set((state) => ({
      validationBadges: [
        {
          id: `${Date.now()}-${Math.random()}`,
          ts: new Date().toISOString(),
          eventName,
          message,
        },
        ...state.validationBadges,
      ].slice(0, 5), // Keep latest 5 badges
    })),

  dismissValidationError: (id) =>
    set((state) => ({
      validationBadges: state.validationBadges.filter((b) => b.id !== id),
    })),

  setReplayStatus: (status) =>
    set({
      replayStatus: status,
    }),

  setPendingConfig: (cfg) =>
    set((state) => ({
      pendingConfig: { ...state.pendingConfig, ...cfg },
    })),

  clearPendingConfig: () => set({ pendingConfig: {} }),

  setSelectedDecisionDate: (date) => set({ selectedDecisionDate: date }),

  // 1. Decision resets the current night slice
  handleDecision: (decisionEv) =>
    set({
      currentNight: {
        nightDate: decisionEv.night_date,
        decision: decisionEv,
        hourlyTicks: [],
        events: [],
      },
      // When 17:00 decision arrives, any queued pending config has taken effect
      pendingConfig: {},
    }),

  // 2. Ticks append in strict chronological order; out-of-order ticks are ignored
  handleTick: (tick) =>
    set((state) => {
      const ticks = state.currentNight.hourlyTicks;
      if (ticks.length > 0) {
        const lastTickTs = new Date(ticks[ticks.length - 1].ts).getTime();
        const incomingTs = new Date(tick.ts).getTime();
        // Ignore out-of-order or duplicate ticks
        if (incomingTs <= lastTickTs) {
          return state;
        }
      }
      return {
        currentNight: {
          ...state.currentNight,
          hourlyTicks: [...ticks, tick],
        },
        replayStatus: {
          ...state.replayStatus,
          simTime: tick.ts,
        },
      };
    }),

  // 3. Event handler adds to active night events and global event feed (max 200)
  handleEvent: (ev) =>
    set((state) => ({
      currentNight: {
        ...state.currentNight,
        events: [...state.currentNight.events, ev],
      },
      eventFeed: [ev, ...state.eventFeed].slice(0, 200),
    })),

  // 4. Settlement appends exactly one history row and updates cumulative KPIs
  handleSettlement: (settleEv) =>
    set((state) => {
      // Check if this night was already recorded to avoid duplicate entries
      const exists = state.settledHistory.some(
        (h) => h.night_date === settleEv.night_date
      );
      if (exists) {
        return { latestCumulativeKpis: settleEv.cumulative };
      }

      const newRecord: SettledNightRecord = {
        night_date: settleEv.night_date,
        net_pnl: settleEv.net_pnl,
        interest: settleEv.interest,
        break_fee: settleEv.break_fee,
        overdraft_cost: settleEv.overdraft_cost,
        forecast_buffer_usd: settleEv.forecast_buffer_usd,
        actual_required_usd: settleEv.actual_required_usd,
        covered: settleEv.covered,
        cumulative: settleEv.cumulative,
      };

      return {
        settledHistory: [...state.settledHistory, newRecord],
        latestCumulativeKpis: settleEv.cumulative,
      };
    }),

  resetAll: () =>
    set({
      replayStatus: initialReplayStatus,
      pendingConfig: {},
      currentNight: initialCurrentNight,
      settledHistory: [],
      latestCumulativeKpis: null,
      eventFeed: [],
      selectedDecisionDate: null,
      validationBadges: [],
    }),
}));

// Selector to get chart data: strictly returns received hourly points up to the latest tick
export function selectNightChartData(currentNight: CurrentNightSlice) {
  if (!currentNight.decision) return [];
  const bufferUsd = currentNight.decision.decision.buffer_usd;

  return currentNight.hourlyTicks.map((tick) => ({
    ts: tick.ts,
    time: tick.ts.slice(11, 16),
    cash: tick.balances.cash,
    repo: tick.balances.repo,
    overdraft: tick.balances.overdraft,
    buffer: bufferUsd,
    phase: tick.phase,
    simulated: tick.simulated,
  }));
}
