/**
 * StressControls.tsx: Interactive control panel for synthetic liquidity stress testing.
 * Provides scenario selector, parameter sliders with units, night picker, strategy & mode toggles,
 * informed advance-warning toggle, and batch filters.
 */

import React from "react";
import {
  Flame,
  Zap,
  Snowflake,
  Play,
  RotateCcw,
  Layers,
  Calendar,
  Sliders,
} from "lucide-react";
import { useStressStore, StressScenario, BatchNightFilter } from "../../store/useStressStore";
import { formatHourOffset } from "../../utils/formatters";
import { STRATEGY_LABELS, CONTRACT_STRATEGY_IDS, SLEEVE_PRESET_LABELS } from "../../utils/labels";

export const StressControls: React.FC = () => {
  const {
    scenario,
    surgeParams,
    bankRunParams,
    freezeParams,
    nightDate,
    strategy,
    mode,
    informed,
    nightFilter,
    sleevePreset,
    sleeveWeights,
    isNightLoading,
    isBatchLoading,
    nightError,
    batchError,
    setScenario,
    updateSurgeParams,
    updateBankRunParams,
    updateFreezeParams,
    setNightDate,
    setStrategy,
    setMode,
    setInformed,
    setNightFilter,
    setSleevePreset,
    setSleeveWeights,
    runNightSimulation,
    runBatchSimulation,
    reset,
  } = useStressStore();

  const scenarios: { id: StressScenario; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: "withdrawal_surge",
      label: "Withdrawal Surge",
      icon: <Flame className="w-4 h-4 text-danger" />,
      desc: "Multiply night withdrawals by m (1.0x - 4.0x)",
    },
    {
      id: "bank_run",
      label: "Bank Run",
      icon: <Zap className="w-4 h-4 text-warning" />,
      desc: "Instant outflow of x% of pool over k hours",
    },
    {
      id: "deposit_freeze",
      label: "Deposit Freeze",
      icon: <Snowflake className="w-4 h-4 text-cyan-400" />,
      desc: "Reduce night deposits by fraction f (0.0x - 1.0x)",
    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">
      {/* Header & Scenario Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground tracking-tight">
              Stress Lab Scenario Configuration
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Test policy robustness against synthetic tail shocks applied strictly after the 17:00 sweep decision.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
            title="Reset parameters to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Scenario Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {scenarios.map((sc) => (
          <button
            key={sc.id}
            id={`scenario-${sc.id}`}
            onClick={() => setScenario(sc.id)}
            className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
              scenario === sc.id
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-border bg-card hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
              {sc.icon}
              {sc.label}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{sc.desc}</p>
          </button>
        ))}
      </div>

      {/* Dynamic Scenario Parameter Sliders */}
      <div className="bg-muted/30 border border-border/80 rounded-lg p-4 space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Scenario Parameters: {scenario.replace("_", " ")}
        </div>

        {scenario === "withdrawal_surge" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Withdrawal Multiplier (m)</span>
                <span className="font-mono text-primary font-bold">{surgeParams.m.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.1"
                aria-label="Withdrawal multiplier (m)"
                value={surgeParams.m}
                onChange={(e) => updateSurgeParams({ m: parseFloat(e.target.value) })}
                className="w-full accent-primary cursor-pointer"
                id="param-slider-m"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>1.0x (Normal)</span>
                <span>2.5x</span>
                <span>4.0x (Extreme)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Start Hour</span>
                <span className="font-mono text-foreground font-semibold">
                  {formatHourOffset(surgeParams.hour_from)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="14"
                step="1"
                aria-label="Surge start hour"
                value={surgeParams.hour_from}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateSurgeParams({
                    hour_from: val,
                    hour_to: Math.max(val, surgeParams.hour_to),
                  });
                }}
                className="w-full accent-primary cursor-pointer"
                id="param-slider-hour-from"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>17:00 (H0)</span>
                <span>07:00 (H14)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">End Hour</span>
                <span className="font-mono text-foreground font-semibold">
                  {formatHourOffset(surgeParams.hour_to)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="14"
                step="1"
                aria-label="Surge end hour"
                value={surgeParams.hour_to}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateSurgeParams({
                    hour_to: val,
                    hour_from: Math.min(val, surgeParams.hour_from),
                  });
                }}
                className="w-full accent-primary cursor-pointer"
                id="param-slider-hour-to"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>17:00 (H0)</span>
                <span>07:00 (H14)</span>
              </div>
            </div>
          </div>
        )}

        {scenario === "bank_run" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Extra Outflow (% of Pool)</span>
                <span className="font-mono text-warning font-bold">
                  {bankRunParams.x}% (${(bankRunParams.x).toFixed(0)}M)
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="40.0"
                step="1.0"
                aria-label="Extra outflow percent of pool (x)"
                value={bankRunParams.x}
                onChange={(e) => updateBankRunParams({ x: parseFloat(e.target.value) })}
                className="w-full accent-warning cursor-pointer"
                id="param-slider-x"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>1% ($1M)</span>
                <span>20% ($20M)</span>
                <span>40% ($40M)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Run Duration (k hours)</span>
                <span className="font-mono text-foreground font-semibold">
                  {bankRunParams.k} {bankRunParams.k === 1 ? "hour" : "hours"}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                aria-label="Run duration in hours (k)"
                value={bankRunParams.k}
                onChange={(e) => {
                  const kVal = parseInt(e.target.value, 10);
                  updateBankRunParams({
                    k: kVal,
                    start_hour: Math.min(bankRunParams.start_hour, 15 - kVal),
                  });
                }}
                className="w-full accent-warning cursor-pointer"
                id="param-slider-k"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>1 hour</span>
                <span>3 hours</span>
                <span>6 hours</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Start Night Hour</span>
                <span className="font-mono text-foreground font-semibold">
                  {formatHourOffset(bankRunParams.start_hour)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max={15 - bankRunParams.k}
                step="1"
                aria-label="Bank run start night hour"
                value={bankRunParams.start_hour}
                onChange={(e) => updateBankRunParams({ start_hour: parseInt(e.target.value, 10) })}
                className="w-full accent-warning cursor-pointer"
                id="param-slider-start-hour"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>17:00 (H0)</span>
                <span>Max {formatHourOffset(15 - bankRunParams.k)}</span>
              </div>
            </div>
          </div>
        )}

        {scenario === "deposit_freeze" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Deposits Multiplier (f)</span>
                <span className="font-mono text-cyan-400 font-bold">
                  {freezeParams.f.toFixed(2)}x ({((1 - freezeParams.f) * 100).toFixed(0)}% frozen)
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                aria-label="Deposits multiplier (f)"
                value={freezeParams.f}
                onChange={(e) => updateFreezeParams({ f: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400 cursor-pointer"
                id="param-slider-f"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0.0x (100% Freeze)</span>
                <span>0.5x (50%)</span>
                <span>1.0x (Normal)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Freeze Start Hour</span>
                <span className="font-mono text-foreground font-semibold">
                  {formatHourOffset(freezeParams.hour_from)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="14"
                step="1"
                aria-label="Deposit freeze start hour"
                value={freezeParams.hour_from}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateFreezeParams({
                    hour_from: val,
                    hour_to: Math.max(val, freezeParams.hour_to),
                  });
                }}
                className="w-full accent-cyan-400 cursor-pointer"
                id="param-slider-freeze-from"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>17:00 (H0)</span>
                <span>07:00 (H14)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">Freeze End Hour</span>
                <span className="font-mono text-foreground font-semibold">
                  {formatHourOffset(freezeParams.hour_to)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="14"
                step="1"
                aria-label="Deposit freeze end hour"
                value={freezeParams.hour_to}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateFreezeParams({
                    hour_to: val,
                    hour_from: Math.min(val, freezeParams.hour_from),
                  });
                }}
                className="w-full accent-cyan-400 cursor-pointer"
                id="param-slider-freeze-to"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>17:00 (H0)</span>
                <span>07:00 (H14)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Target Night, Strategy & Informed Advance-Warning Switch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
        {/* Left: Single Night Deep-Dive Controls */}
        <div className="border border-border rounded-lg p-4 space-y-4 bg-card/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              Single-Night Deep Dive
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setNightDate("2026-10-03")}
                className="text-[10px] px-2 py-0.5 border border-border rounded bg-muted/40 hover:bg-muted font-medium"
              >
                Saturday (10-03)
              </button>
              <button
                type="button"
                onClick={() => setNightDate("2026-08-15")}
                className="text-[10px] px-2 py-0.5 border border-border rounded bg-muted/40 hover:bg-muted font-medium"
              >
                Payday (08-15)
              </button>
              <button
                type="button"
                onClick={() => setNightDate("2026-07-03")}
                className="text-[10px] px-2 py-0.5 border border-border rounded bg-muted/40 hover:bg-muted font-medium"
              >
                Shock (07-03)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="stress-date-picker" className="text-[11px] font-medium text-muted-foreground block mb-1">
                Night Date
              </label>
              <input
                type="date"
                id="stress-date-picker"
                aria-label="Night date for single-night stress testing"
                value={nightDate}
                onChange={(e) => setNightDate(e.target.value)}
                min="2026-02-26"
                max="2026-12-30"
                className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="stress-strategy-select" className="text-[11px] font-medium text-muted-foreground block mb-1">
                Evaluation Strategy
              </label>
              <select
                id="stress-strategy-select"
                aria-label="Evaluation strategy for stress testing"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CONTRACT_STRATEGY_IDS.map((k) => (
                  <option key={k} value={k}>
                    {STRATEGY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="stress-sleeve-select" className="text-[11px] font-medium text-muted-foreground block mb-1">
              Strategic Sleeve Allocation
            </label>
            <select
              id="stress-sleeve-select"
              aria-label="Strategic sleeve allocation for stress testing"
              value={sleevePreset}
              onChange={(e) => setSleevePreset(e.target.value)}
              className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Object.entries(SLEEVE_PRESET_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>

            {sleevePreset === "custom" && (
              <div className="p-3 bg-muted/30 rounded border border-border/70 space-y-2 mt-2">
                <div className="text-[11px] font-semibold text-foreground flex justify-between">
                  <span>Custom Sleeve Weights</span>
                  <span className="font-mono text-muted-foreground text-[10px]">Min 20% repo floor</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-muted-foreground">Repo:</span>
                      <span className="font-mono font-bold text-foreground">
                        {((sleeveWeights?.repo ?? 0.2) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={sleeveWeights?.repo ?? 0.2}
                      onChange={(e) => {
                        const repoVal = parseFloat(e.target.value);
                        const rem = 1 - repoVal;
                        setSleeveWeights({
                          repo: repoVal,
                          bonds: rem * 0.5,
                          equity: rem * 0.5,
                        });
                      }}
                      className="w-full h-1 bg-border rounded cursor-pointer accent-primary"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-muted-foreground">Bonds:</span>
                      <span className="font-mono font-bold text-foreground">
                        {((sleeveWeights?.bonds ?? 0.4) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max={1 - (sleeveWeights?.repo ?? 0.2)}
                      step="0.05"
                      value={sleeveWeights?.bonds ?? 0.4}
                      onChange={(e) => {
                        const bondVal = parseFloat(e.target.value);
                        const repoVal = sleeveWeights?.repo ?? 0.2;
                        const eqVal = Math.max(0, 1 - repoVal - bondVal);
                        setSleeveWeights({
                          repo: repoVal,
                          bonds: bondVal,
                          equity: eqVal,
                        });
                      }}
                      className="w-full h-1 bg-border rounded cursor-pointer accent-amber-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-muted-foreground">Equity:</span>
                      <span className="font-mono font-bold text-foreground">
                        {((sleeveWeights?.equity ?? 0.4) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max={1 - (sleeveWeights?.repo ?? 0.2)}
                      step="0.05"
                      value={sleeveWeights?.equity ?? 0.4}
                      onChange={(e) => {
                        const eqVal = parseFloat(e.target.value);
                        const repoVal = sleeveWeights?.repo ?? 0.2;
                        const bondVal = Math.max(0, 1 - repoVal - eqVal);
                        setSleeveWeights({
                          repo: repoVal,
                          bonds: bondVal,
                          equity: eqVal,
                        });
                      }}
                      className="w-full h-1 bg-border rounded cursor-pointer accent-indigo-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Mode:</span>
              <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("zero_overdraft")}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                    mode === "zero_overdraft"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Zero Overdraft
                </button>
                <button
                  type="button"
                  onClick={() => setMode("cost_optimal")}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                    mode === "cost_optimal"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Cost Optimal
                </button>
              </div>
            </div>

            {/* Informed toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={informed}
                onChange={(e) => setInformed(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                id="toggle-informed"
              />
              <span className="text-xs font-medium text-foreground">
                informed{" "}
                <span className="text-[10px] text-muted-foreground">
                  (what-if: assumes advance warning)
                </span>
              </span>
            </label>
          </div>

          {nightError && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-2">
              {nightError}
            </div>
          )}

          <button
            id="stress-run-night"
            onClick={runNightSimulation}
            disabled={isNightLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
          >
            {isNightLoading ? (
              <span className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Simulating Night...
              </span>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Run Night Stress Simulation
              </>
            )}
          </button>
        </div>

        {/* Right: Batch Multi-Strategy Backtest Controls */}
        <div className="border border-border rounded-lg p-4 space-y-4 bg-card/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-primary" />
                Multi-Strategy Batch Comparison
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Executes the selected scenario across evaluation nights simultaneously for all strategies (S1 to S6).
            </p>

            <div>
              <label htmlFor="stress-batch-filter-select" className="text-[11px] font-medium text-muted-foreground block mb-1">
                Night Filter Subset
              </label>
              <select
                id="stress-batch-filter-select"
                aria-label="Night filter subset for batch stress testing"
                value={nightFilter}
                onChange={(e) => setNightFilter(e.target.value as BatchNightFilter)}
                className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Evaluation Nights (308 nights)</option>
                <option value="fri_sat">Friday & Saturday Nights (88 weekend nights)</option>
                <option value="payday">Payday Nights (1st & 15th: 20 nights)</option>
              </select>
            </div>

            <div className="mt-3 p-2.5 rounded bg-muted/40 border border-border/70 text-[11px] text-muted-foreground">
              {informed ? (
                <span>
                  <strong className="text-foreground">Informed Mode ON:</strong> Forecast-based strategies (S3, S4, S5) increase buffer by deterministic extra outflow trough. Heuristics (S1, S2) remain unadjusted.
                </span>
              ) : (
                <span>
                  <strong className="text-foreground">Informed Mode OFF:</strong> Decisions are locked to historical forecasts. The stress shock arrives as an overnight surprise.
                </span>
              )}
            </div>
          </div>

          <div>
            {batchError && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded p-2 mb-3">
                {batchError}
              </div>
            )}

            <button
              id="stress-run-batch"
              onClick={runBatchSimulation}
              disabled={isBatchLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-foreground text-background dark:bg-primary dark:text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            >
              {isBatchLoading ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Running Batch Test...
                </span>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  Run Multi-Strategy Batch Test
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
