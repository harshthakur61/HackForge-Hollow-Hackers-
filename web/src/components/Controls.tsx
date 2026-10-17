/**
 * Controls.tsx: Simulation replay controls (Play, Pause, Reset, Speed),
 * night date picker (from /api/nights), strategy selector (S4 vs S5),
 * quantile slider (0.50 to 0.99 with q* marks), pool input, and pending-config chip.
 */

import React, { useState } from "react";
import { Play, Pause, RotateCcw, FastForward, Clock, Settings2 } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { useReplaySocket } from "../hooks/useReplaySocket";
import { useNightsQuery, useConfigQuery } from "../hooks/useQueries";
import { formatMillions } from "../utils/formatters";

const SPEED_OPTIONS = [
  { label: "1x", tickMs: 1000 },
  { label: "5x", tickMs: 200 },
  { label: "20x", tickMs: 50 },
  { label: "100x", tickMs: 10 },
];

export const Controls: React.FC = () => {
  const { startReplay, pauseReplay, resumeReplay, resetReplay, setSpeed, seekNight, setConfig } =
    useReplaySocket();

  const replayStatus = useReplayStore((s) => s.replayStatus);
  const pendingConfig = useReplayStore((s) => s.pendingConfig);
  const setPendingConfig = useReplayStore((s) => s.setPendingConfig);

  const { data: nightsData, isLoading: nightsLoading } = useNightsQuery();
  const { data: configData } = useConfigQuery();

  const [activeStrategy, setActiveStrategy] = useState<string>("S4_policy_zero_overdraft");
  const [selectedQuantile, setSelectedQuantile] = useState<number>(0.98);
  const [poolInput, setPoolInput] = useState<number>(100000000);

  const isPlaying = replayStatus.state === "playing";
  const isPaused = replayStatus.state === "paused";
  const isIdle = replayStatus.state === "idle" || replayStatus.state === "finished";

  // Critical fractiles from /config
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

  const handleSpeedChange = (tickMs: number) => {
    setSpeed(tickMs);
  };

  const handleSeek = (nightDate: string) => {
    seekNight(nightDate);
  };

  const handleStrategyChange = (strat: string) => {
    setActiveStrategy(strat);
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
    <section className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2">
          <button
            id="start-replay-btn"
            onClick={handleStartOrToggle}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all ${
              isPlaying
                ? "bg-warning/10 border border-warning/30 text-warning hover:bg-warning/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" /> Pause
              </>
            ) : isPaused ? (
              <>
                <Play className="w-4 h-4 fill-current" /> Resume
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> Start Replay
              </>
            )}
          </button>

          <button
            id="reset-replay-btn"
            onClick={resetReplay}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Reset replay to beginning"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border border-border">
          <span className="text-[11px] font-semibold text-muted-foreground px-2 flex items-center gap-1">
            <FastForward className="w-3 h-3" /> Speed:
          </span>
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.tickMs}
              id={`speed-${opt.label}-btn`}
              onClick={() => handleSpeedChange(opt.tickMs)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                replayStatus.tickMs === opt.tickMs
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Night Picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="night-picker" className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Seek Night:
          </label>
          <select
            id="night-picker"
            value={replayStatus.nightDate}
            onChange={(e) => handleSeek(e.target.value)}
            disabled={nightsLoading}
            className="text-xs bg-muted/60 border border-border rounded-lg px-2.5 py-1.5 text-foreground font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
          >
            {nightsData?.nights.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Configuration Row */}
      <div className="pt-3 border-t border-border/60 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Strategy Selector Toggle */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1">
              <Settings2 className="w-3.5 h-3.5 text-primary" /> Strategy:
            </label>
            {hasPending && pendingConfig.strategy && (
              <span className="text-[10px] font-medium text-warning bg-warning/10 border border-warning/30 px-1.5 py-0.5 rounded">
                Pending at 17:00
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/40 border border-border rounded-lg">
            <button
              onClick={() => handleStrategyChange("S4_policy_zero_overdraft")}
              className={`px-2 py-1.5 text-[11px] font-semibold rounded-md text-left transition-colors ${
                activeStrategy === "S4_policy_zero_overdraft"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="font-bold">S4: Zero-Overdraft</div>
              <div className="text-[9px] text-muted-foreground">Default policy (breaks repo)</div>
            </button>
            <button
              onClick={() => handleStrategyChange("S5_policy_cost_optimal")}
              className={`px-2 py-1.5 text-[11px] font-semibold rounded-md text-left transition-colors ${
                activeStrategy === "S5_policy_cost_optimal"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="font-bold">S5: Cost-Optimal</div>
              <div className="text-[9px] text-muted-foreground">Allows emergency overdraft</div>
            </button>
          </div>
        </div>

        {/* Quantile Slider (0.50 to 0.99) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="quantile-slider" className="font-semibold text-foreground">
              Target Quantile $q$:
            </label>
            <span className="font-mono font-bold text-primary">
              {selectedQuantile.toFixed(4)}
            </span>
          </div>
          <div className="relative pt-1">
            <input
              id="quantile-slider"
              type="range"
              min="0.50"
              max="0.99"
              step="0.001"
              value={selectedQuantile}
              onChange={(e) => handleQuantileChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            {/* Critical fractile tick markers on slider */}
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
              <span>0.50</span>
              <span
                className="text-primary font-bold cursor-pointer"
                onClick={() => handleQuantileChange(qStarOpt)}
                title={`q* Cost-Optimal: ${qStarOpt}`}
              >
                q*opt ({qStarOpt.toFixed(2)})
              </span>
              <span
                className="text-primary font-bold cursor-pointer"
                onClick={() => handleQuantileChange(qStarZero)}
                title={`q* Zero-Overdraft: ${qStarZero}`}
              >
                q*zero ({qStarZero.toFixed(2)})
              </span>
              <span>0.99</span>
            </div>
          </div>
        </div>

        {/* Pool Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="pool-input" className="font-semibold text-foreground">
              Replenished Pool:
            </label>
            <span className="font-mono text-muted-foreground text-[11px]">
              {formatMillions(poolInput, 0)}
            </span>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2 text-xs text-muted-foreground font-mono">$</span>
            <input
              id="pool-input"
              type="number"
              step="1000000"
              min="10000000"
              value={poolInput}
              onChange={(e) => handlePoolChange(parseFloat(e.target.value) || 100000000)}
              className="w-full text-xs font-mono bg-muted/60 border border-border rounded-lg pl-7 pr-3 py-1.5 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Pending Config Notification Chip */}
      {hasPending && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning">
          <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
          <span>
            <strong>Configuration pending:</strong> New parameters will take effect cleanly at the next 17:00 decision (never mid-night).
          </span>
        </div>
      )}
    </section>
  );
};
