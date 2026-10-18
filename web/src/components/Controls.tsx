/**
 * Controls.tsx: Compact replay toolbar and Scenario Settings side panel (Drawer).
 * Toolbar: Start, Pause/Resume, Reset, Speed selector, Night picker.
 * Scenario Settings side panel: Strategy, Quantile, Pool, with "Pending, applies at next 17:00" banner.
 */

import React, { useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SlidersHorizontal,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { useReplaySocket } from "../hooks/useReplaySocket";
import { useNightsQuery, useConfigQuery } from "../hooks/useQueries";
import { formatMillions } from "../utils/formatters";
import Drawer from "./common/Drawer";
import Tooltip from "./common/Tooltip";

const SPEED_OPTIONS = [
  { label: "0.1x", tickMs: 10000 },
  { label: "1x", tickMs: 1000 },
  { label: "5x", tickMs: 200 },
  { label: "20x", tickMs: 50 },
  { label: "Max", tickMs: 10 },
];

export const DEMO_NIGHTS = [
  {
    date: "2026-10-03",
    label: "2026-10-03: Heavy Saturday Outflow ($41.2M covered)",
  },
  {
    date: "2026-08-15",
    label: "2026-08-15: Mid-Month Payday Drain ($33.8M covered)",
  },
  {
    date: "2026-07-03",
    label: "2026-07-03: >4-Sigma Shock & Repo Break ($9.5M broken)",
  },
];

const STRATEGY_OPTIONS = [
  {
    key: "S4_policy_zero_overdraft",
    label: "S4: Zero-Overdraft Policy (default)",
    mode: "zero_overdraft" as const,
    desc: "Dynamically calibrated buffer to minimize overdraft penalty exposure.",
  },
  {
    key: "S5_policy_cost_optimal",
    label: "S5: Cost-Optimal Policy",
    mode: "cost_optimal" as const,
    desc: "Balances repo early-break haircut against overdraft interest APR.",
  },
  {
    key: "S3_static",
    label: "S3: Static Baseline (P98 buffer)",
    mode: "zero_overdraft" as const,
    desc: "Fixed historical quantile buffer without day-of-week or shock adjustments.",
  },
  {
    key: "S2_fixed_20",
    label: "S2: Fixed 20% Reserve",
    mode: "zero_overdraft" as const,
    desc: "Holds 20% buffer in cash; sweeps 80% to repo.",
  },
  {
    key: "S1_fixed_10",
    label: "S1: Fixed 10% Reserve",
    mode: "zero_overdraft" as const,
    desc: "Holds 10% buffer in cash; sweeps 90% to repo (high overdrafts).",
  },
  {
    key: "S0_all_cash",
    label: "S0: All Cash Reserve",
    mode: "zero_overdraft" as const,
    desc: "Zero repo investment; zero yield and zero liquidity penalty.",
  },
  {
    key: "S6_oracle",
    label: "S6: Oracle (upper bound, not deployable)",
    mode: "cost_optimal" as const,
    desc: "Perfect foresight benchmark knowing exact overnight trough at 17:00.",
  },
];

export const Controls: React.FC = () => {
  const {
    startReplay,
    pauseReplay,
    resumeReplay,
    resetReplay,
    setSpeed,
    seekNight,
    setConfig,
  } = useReplaySocket();

  const replayStatus = useReplayStore((s) => s.replayStatus);
  const pendingConfig = useReplayStore((s) => s.pendingConfig);
  const setPendingConfig = useReplayStore((s) => s.setPendingConfig);
  const clearPendingConfig = useReplayStore((s) => s.clearPendingConfig);

  const { data: nightsData, isLoading: nightsLoading } = useNightsQuery();
  const { data: configData } = useConfigQuery();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string>(
    replayStatus.strategy || "S4_policy_zero_overdraft"
  );
  const [selectedQuantile, setSelectedQuantile] = useState<number>(0.98);
  const [poolInput, setPoolInput] = useState<number>(100000000);

  const isPlaying = replayStatus.state === "playing";
  const isPaused = replayStatus.state === "paused";
  const isIdle = replayStatus.state === "idle" || replayStatus.state === "finished";

  const qStarZero = configData?.q_star_zero_overdraft ?? 0.9783;
  const qStarOpt = configData?.q_star_cost_optimal ?? 0.7477;

  const handleStartOrToggle = () => {
    if (isIdle) {
      startReplay();
    } else if (isPlaying) {
      pauseReplay();
    } else if (isPaused) {
      resumeReplay();
    }
  };

  const handleSpeedSelect = (tickMs: number) => {
    setSpeed(tickMs);
  };

  const handleSeekNight = (nightDate: string) => {
    seekNight(nightDate);
  };

  const handleStrategyChange = (strat: string) => {
    setSelectedStrategy(strat);
    const mode = strat.includes("cost_optimal") ? "cost_optimal" : "zero_overdraft";
    setConfig({ strategy: strat, mode });
    setPendingConfig({ strategy: strat, mode });
  };

  const handleQuantileChange = (q: number) => {
    setSelectedQuantile(q);
    setConfig({ quantile: q });
    setPendingConfig({ quantile: q });
  };

  const handlePoolChange = (val: number) => {
    setPoolInput(val);
    setConfig({ pool: val });
    setPendingConfig({ pool: val });
  };

  const hasPending = Object.keys(pendingConfig).length > 0;

  return (
    <>
      {/* Compact Replay Toolbar */}
      <div
        id="replay-toolbar"
        className="bg-surface border border-border-subtle rounded-md p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-3"
      >
        {/* Left: Playback & Reset */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            id="play-pause-button"
            onClick={handleStartOrToggle}
            aria-label={
              isIdle ? "Start Replay" : isPlaying ? "Pause Replay" : "Resume Replay"
            }
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
              isIdle
                ? "bg-accent-primary hover:bg-accent-hover text-white shadow-xs"
                : isPlaying
                ? "bg-warn text-white hover:bg-warn/90"
                : "bg-pos text-white hover:bg-pos/90"
            }`}
          >
            {isIdle ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Start Replay</span>
              </>
            ) : isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Resume</span>
              </>
            )}
          </button>

          <button
            type="button"
            id="reset-replay-button"
            onClick={resetReplay}
            aria-label="Reset simulation to initial state"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-medium border border-border-subtle bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Speed Selector */}
          <div
            role="group"
            aria-label="Replay speed"
            className="inline-flex rounded-sm border border-border-subtle bg-subtle/50 p-0.5 ml-1"
          >
            {SPEED_OPTIONS.map((opt) => {
              const isSelected = replayStatus.tickMs === opt.tickMs;
              return (
                <button
                  key={opt.label}
                  type="button"
                  id={`speed-${opt.label}`}
                  onClick={() => handleSpeedSelect(opt.tickMs)}
                  className={`px-2 py-0.5 text-2xs font-mono font-medium rounded-xs transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary ${
                    isSelected
                      ? "bg-surface text-accent-primary font-bold shadow-xs border border-border-subtle"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center / Right: Night Picker & Scenario Settings */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Night Picker Dropdown */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-text-muted hidden sm:inline" aria-hidden="true" />
            <select
              id="night-picker"
              aria-label="Select simulation night"
              value={replayStatus.nightDate || ""}
              onChange={(e) => handleSeekNight(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono rounded-sm border border-border-subtle bg-surface text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary max-w-[210px]"
            >
              <optgroup label="Key Stress & Scenario Nights">
                {DEMO_NIGHTS.map((dn) => (
                  <option key={dn.date} value={dn.date}>
                    {dn.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="All Available Nights">
                {nightsLoading ? (
                  <option disabled>Loading nights...</option>
                ) : (
                  (nightsData?.nights || []).map((d) => (
                    <option key={d} value={d}>
                      Night of {d}
                    </option>
                  ))
                )}
              </optgroup>
            </select>
          </div>

          {/* Scenario Settings Side Panel Trigger */}
          <button
            type="button"
            id="scenario-settings-button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open Scenario settings panel"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
              hasPending
                ? "bg-warn-bg text-warn border-warn/40 font-semibold"
                : "border-border-subtle bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Scenario settings</span>
            {hasPending && (
              <span className="w-1.5 h-1.5 rounded-full bg-warn" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Scenario Settings Side Panel (Drawer) */}
      <Drawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Scenario Settings"
        subtitle="Configure simulation strategy, quantile parameters, and capital pool"
        width="md"
        footer={
          <div className="flex items-center justify-between w-full">
            {hasPending ? (
              <button
                type="button"
                onClick={clearPendingConfig}
                className="text-xs text-text-muted hover:text-text-primary underline"
              >
                Clear pending
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="px-3 py-1.5 rounded-sm text-xs font-medium bg-accent-primary text-white hover:bg-accent-hover transition-colors"
            >
              Done
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Pending Status Alert */}
          {hasPending ? (
            <div
              role="status"
              className="p-3 rounded-sm bg-warn-bg border border-warn/40 text-xs text-warn flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold block">Pending parameter changes:</span>
                <span className="mt-0.5 block">
                  Settings are queued and will apply automatically at the next 17:00 sweep decision.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-sm bg-subtle border border-border-subtle text-xs text-text-secondary">
              Parameters are synced with the active replay run.
            </div>
          )}

          {/* Strategy Selection */}
          <div className="space-y-2">
            <label
              htmlFor="scenario-strategy-select"
              className="text-xs font-semibold text-text-primary block"
            >
              Treasury Strategy
            </label>
            <select
              id="scenario-strategy-select"
              value={selectedStrategy}
              onChange={(e) => handleStrategyChange(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-sm border border-border-subtle bg-surface text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary font-mono"
            >
              {STRATEGY_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="text-2xs text-text-muted">
              {STRATEGY_OPTIONS.find((s) => s.key === selectedStrategy)?.desc}
            </p>
          </div>

          {/* Target Quantile Parameter Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-primary flex items-center gap-1">
                Target Forecast Quantile (q*)
                <Tooltip content="Calibration quantile for the buffer model. Higher quantiles allocate more buffer to avoid early repo breaks." />
              </span>
              <span className="font-mono font-bold text-accent-primary tabular-nums">
                q = {selectedQuantile.toFixed(4)}
              </span>
            </div>

            <input
              id="quantile-slider"
              type="range"
              min="0.50"
              max="0.99"
              step="0.005"
              value={selectedQuantile}
              onChange={(e) => handleQuantileChange(parseFloat(e.target.value))}
              aria-label="Target forecast quantile"
              className="w-full accent-accent-primary"
            />

            <div className="flex items-center justify-between text-2xs text-text-muted font-mono">
              <button
                type="button"
                onClick={() => handleQuantileChange(qStarOpt)}
                className="underline hover:text-text-primary"
              >
                q*(opt) = {qStarOpt.toFixed(4)}
              </button>
              <button
                type="button"
                onClick={() => handleQuantileChange(qStarZero)}
                className="underline hover:text-text-primary"
              >
                q*(zero) = {qStarZero.toFixed(4)}
              </button>
              <button
                type="button"
                onClick={() => handleQuantileChange(0.99)}
                className="underline hover:text-text-primary"
              >
                P99 = 0.9900
              </button>
            </div>
          </div>

          {/* Capital Pool USD Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-primary flex items-center gap-1">
                Initial Pool (USD)
                <Tooltip content="Base cash pool assumed replenished daily at 17:00 from external operating accounts." />
              </span>
              <span className="font-mono text-text-muted tabular-nums">
                {formatMillions(poolInput, 0)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="pool-usd-input"
                type="number"
                min="10000000"
                max="1000000000"
                step="10000000"
                value={poolInput}
                onChange={(e) => handlePoolChange(parseFloat(e.target.value) || 100000000)}
                aria-label="Initial pool USD"
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-sm border border-border-subtle bg-surface text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary tabular-nums"
              />
            </div>
            <p className="text-2xs text-text-muted">
              Default: $100,000,000 USD. Evaluated per 15-hour overnight cycle.
            </p>
          </div>

          {/* Institutional Note */}
          <div className="p-3 rounded-sm bg-subtle/50 border border-border-subtle text-2xs text-text-muted space-y-1">
            <div className="font-semibold text-text-secondary">Execution Protocol</div>
            <div>
              Parameter changes sent over WebSocket will not disrupt currently running ticks. The simulation engine will bind new parameters at the next 17:00 decision cycle.
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
};

export default Controls;
