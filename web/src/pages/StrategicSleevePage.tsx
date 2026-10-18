/**
 * StrategicSleevePage.tsx: Dedicated Tier 2 & Tier 3 Strategic Sleeve workstation.
 * Features:
 * 1. Allocation Selector (Risk Budget default, 4 presets, custom sliders with 20% repo floor)
 *    - Disabled while replay runs with mandatory label: "Reset the replay to change the allocation"
 * 2. Risk-Budget Working Table (ex-ante 50/50 risk budget calculation)
 * 3. Summary Performance Metrics from /sleeve/path
 * 4. Break-Even Holding Period per Tier (ex-ante & ex-post with haircut explanation tooltip)
 * 5. Liquidation-Adjusted Salvage Value with definition tooltip
 * 6. Sortable Preset Comparison Table from /sleeve/compare
 * 7. Mandatory Honesty Disclosures
 */

import React, { useState } from "react";
import {
  Layers,
  ShieldAlert,
  ArrowUpDown,
  Lock,
  Info,
  Scale,
  Calendar,
} from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import {
  useSleeveConfigQuery,
  useSleevePathQuery,
  useSleeveCompareQuery,
} from "../hooks/useQueries";
import {
  formatCurrency,
  formatPercent,
  formatMillions,
} from "../utils/formatters";
import {
  SLEEVE_PRESET_LABELS,
  SLEEVE_PRESET_DESCRIPTIONS,
  HONESTY_DISCLOSURES,
} from "../utils/labels";
import Tooltip from "../components/common/Tooltip";
import SignedMoney from "../components/common/SignedMoney";
import { SleeveWeights } from "../contract";

type SortField =
  | "name"
  | "repo"
  | "bonds"
  | "equity"
  | "pnl"
  | "excess"
  | "return"
  | "drawdown"
  | "liquidation";

export const StrategicSleevePage: React.FC = () => {
  const replayStatus = useReplayStore((s) => s.replayStatus);
  const sleeveConfig = useReplayStore((s) => s.sleeveConfig);
  const setSleeveConfig = useReplayStore((s) => s.setSleeveConfig);

  const isReplayActive = replayStatus.state !== "idle";
  const throughDate = isReplayActive ? replayStatus.nightDate : undefined;

  // Selected preset and custom weights state
  const [selectedPreset, setSelectedPreset] = useState<string>(
    sleeveConfig.preset || "risk_budget"
  );
  const [customWeights, setCustomWeights] = useState<SleeveWeights>({
    repo: 0.2,
    bonds: 0.4,
    equity: 0.4,
  });

  // Table sorting state
  const [sortField, setSortField] = useState<SortField>("pnl");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Queries
  const { data: configData } = useSleeveConfigQuery();
  const { data: pathData } = useSleevePathQuery(
    selectedPreset === "custom" ? undefined : selectedPreset,
    selectedPreset === "custom" ? customWeights : undefined
  );
  const { data: compareData, isLoading: compareLoading } = useSleeveCompareQuery(throughDate);

  const presets = configData?.presets || {};
  const working = configData?.risk_budget_working;
  const summary = pathData?.summary;

  const handlePresetSelect = (presetKey: string) => {
    if (isReplayActive) return;
    setSelectedPreset(presetKey);
    if (presetKey !== "custom" && presets[presetKey]) {
      setSleeveConfig({
        preset: presetKey,
        weights: presets[presetKey],
      });
    } else {
      setSleeveConfig({
        preset: "custom",
        weights: customWeights,
      });
    }
  };

  const handleCustomSliderChange = (tier: "repo" | "bonds" | "equity", value: number) => {
    if (isReplayActive) return;
    const clampedVal = Math.max(0, Math.min(1, value));

    if (tier === "repo") {
      // Enforce 20% repo floor
      const repoVal = Math.max(0.2, clampedVal);
      const remainder = 1 - repoVal;
      const currentOtherSum = customWeights.bonds + customWeights.equity;
      const bondShare = currentOtherSum > 0 ? customWeights.bonds / currentOtherSum : 0.5;
      const newBonds = Number((remainder * bondShare).toFixed(4));
      const newEquity = Number((remainder * (1 - bondShare)).toFixed(4));
      const nextWeights = { repo: repoVal, bonds: newBonds, equity: newEquity };
      setCustomWeights(nextWeights);
      setSleeveConfig({ preset: "custom", weights: nextWeights });
    } else if (tier === "bonds") {
      const maxBonds = 1 - Math.max(0.2, customWeights.repo);
      const bondVal = Math.min(maxBonds, clampedVal);
      const newEquity = Number((1 - customWeights.repo - bondVal).toFixed(4));
      const nextWeights = { repo: customWeights.repo, bonds: bondVal, equity: newEquity };
      setCustomWeights(nextWeights);
      setSleeveConfig({ preset: "custom", weights: nextWeights });
    } else {
      const maxEquity = 1 - Math.max(0.2, customWeights.repo);
      const eqVal = Math.min(maxEquity, clampedVal);
      const newBonds = Number((1 - customWeights.repo - eqVal).toFixed(4));
      const nextWeights = { repo: customWeights.repo, bonds: newBonds, equity: eqVal };
      setCustomWeights(nextWeights);
      setSleeveConfig({ preset: "custom", weights: nextWeights });
    }
  };

  // Compare results sorting
  const compareEntries = Object.entries(compareData?.results || {});
  const sortedCompareRows = [...compareEntries].sort((a, b) => {
    const [keyA, valA] = a;
    const [keyB, valB] = b;
    let diff = 0;
    switch (sortField) {
      case "name":
        diff = keyA.localeCompare(keyB);
        break;
      case "repo":
        diff = valA.weights.repo - valB.weights.repo;
        break;
      case "bonds":
        diff = valA.weights.bonds - valB.weights.bonds;
        break;
      case "equity":
        diff = valA.weights.equity - valB.weights.equity;
        break;
      case "pnl":
        diff = valA.summary.pnl - valB.summary.pnl;
        break;
      case "excess":
        diff = valA.summary.excess_pnl_vs_repo - valB.summary.excess_pnl_vs_repo;
        break;
      case "return":
        diff = valA.summary.annualised_return - valB.summary.annualised_return;
        break;
      case "drawdown":
        diff = valA.summary.max_drawdown_pct - valB.summary.max_drawdown_pct;
        break;
      case "liquidation":
        diff = valA.summary.liquidation_adjusted_end - valB.summary.liquidation_adjusted_end;
        break;
    }
    return sortAsc ? diff : -diff;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header with Through Date Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              Strategic Sleeve Allocation & Diagnostics
            </h1>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Separate capital pool ($50,000,000) invested across Tier 1 Repo, Tier 2 Bonds (2Y), and Tier 3 Equity Index.
          </p>
        </div>

        <div className="flex items-center gap-2 text-2xs font-mono px-3 py-1.5 rounded-sm bg-subtle border border-border-subtle self-start sm:self-auto">
          <Calendar className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
          <span className="text-text-muted">Observation window:</span>
          <span className="text-accent-primary font-bold">
            {throughDate ? `through ${throughDate}` : "Full replay dataset (1 Year)"}
          </span>
        </div>
      </div>

      {/* 1. Allocation Selector & Replay Lock Banner */}
      <section className="bg-surface border border-border-subtle rounded-md p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              Portfolio Allocation Preset
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Select an institutional illustration or define custom weights (minimum 20% repo floor strictly enforced).
            </p>
          </div>

          {isReplayActive && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset the replay to change the allocation</span>
            </div>
          )}
        </div>

        {/* Preset Selector Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {Object.keys(SLEEVE_PRESET_LABELS).map((presetKey) => {
            const isSelected = selectedPreset === presetKey;
            return (
              <button
                key={presetKey}
                type="button"
                disabled={isReplayActive}
                onClick={() => handlePresetSelect(presetKey)}
                className={`p-3 rounded-sm border text-left transition-all ${
                  isSelected
                    ? "border-accent-primary bg-accent-subtle/40 ring-1 ring-accent-primary"
                    : "border-border-subtle bg-surface hover:bg-subtle"
                } ${isReplayActive ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary block truncate">
                    {SLEEVE_PRESET_LABELS[presetKey]}
                  </span>
                  {presetKey === "risk_budget" && (
                    <span className="text-[9px] px-1 py-0.2 rounded-xs bg-accent-primary text-surface font-bold uppercase">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-2xs text-text-muted mt-1 line-clamp-2">
                  {SLEEVE_PRESET_DESCRIPTIONS[presetKey]}
                </p>
              </button>
            );
          })}
        </div>

        {/* Custom Weight Sliders (Enabled only when preset === 'custom') */}
        {selectedPreset === "custom" && (
          <div className="p-4 bg-subtle/50 rounded-sm border border-border-subtle space-y-3 mt-3">
            <div className="flex items-center justify-between text-xs font-semibold text-text-primary">
              <span className="flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-accent-primary" aria-hidden="true" />
                Custom Weight Calibration
              </span>
              <span className="font-mono text-2xs text-text-muted">
                Repo Floor: 20.0% enforced
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-secondary">Tier 1 Repo:</span>
                  <span className="font-mono font-bold text-text-primary">
                    {(customWeights.repo * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="1.00"
                  step="0.05"
                  disabled={isReplayActive}
                  value={customWeights.repo}
                  onChange={(e) => handleCustomSliderChange("repo", parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-secondary">Tier 2 Bonds (2Y):</span>
                  <span className="font-mono font-bold text-text-primary">
                    {(customWeights.bonds * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="0.80"
                  step="0.05"
                  disabled={isReplayActive}
                  value={customWeights.bonds}
                  onChange={(e) => handleCustomSliderChange("bonds", parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-secondary">Tier 3 Equities:</span>
                  <span className="font-mono font-bold text-text-primary">
                    {(customWeights.equity * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="0.80"
                  step="0.05"
                  disabled={isReplayActive}
                  value={customWeights.equity}
                  onChange={(e) => handleCustomSliderChange("equity", parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. Top Summary KPI Cards from /sleeve/path */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Net P&L */}
        <div className="bg-surface border border-border-subtle rounded-md p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Sleeve Net P&L</span>
            <Tooltip content="Total cumulative dollar profit or loss realized by the sleeve over the observation period." />
          </div>
          <div className="text-xl font-extrabold tabular-nums tracking-tight">
            <SignedMoney value={summary?.pnl} compact decimals={2} />
          </div>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {summary ? formatCurrency(summary.pnl, 0) : "—"}
          </span>
        </div>

        {/* Excess vs Repo */}
        <div className="bg-surface border border-border-subtle rounded-md p-3.5">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Excess vs Repo</span>
            <Tooltip content="Net P&L generated above the 100% overnight repo benchmark." />
          </div>
          <div className="text-xl font-bold tabular-nums tracking-tight">
            <SignedMoney value={summary?.excess_pnl_vs_repo} compact decimals={2} />
          </div>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {summary ? formatCurrency(summary.excess_pnl_vs_repo, 0) : "—"}
          </span>
        </div>

        {/* Annualised Return */}
        <div className="bg-surface border border-border-subtle rounded-md p-3.5">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Annualised Return</span>
            <Tooltip content="Compounded annual growth rate based on actual holding period (realised, not forecast)." />
          </div>
          <div className="text-xl font-bold text-text-primary tabular-nums tracking-tight">
            {summary ? formatPercent(summary.annualised_return * 100, 2) : "—"}
          </div>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {summary ? `Total: ${formatPercent(summary.total_return * 100, 2)}` : "—"}
          </span>
        </div>

        {/* Annualised Volatility */}
        <div className="bg-surface border border-border-subtle rounded-md p-3.5">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Daily Volatility</span>
            <Tooltip content="Annualised standard deviation of daily portfolio valuation changes." />
          </div>
          <div className="text-xl font-bold text-text-primary tabular-nums tracking-tight font-mono">
            {summary ? formatPercent(summary.annualised_volatility_daily * 100, 2) : "—"}
          </div>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            Annualised σ
          </span>
        </div>

        {/* Max Drawdown */}
        <div className="bg-surface border border-border-subtle rounded-md p-3.5">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Max Drawdown</span>
            <Tooltip content="Peak-to-trough decline in total sleeve portfolio market value." />
          </div>
          <div className="text-xl font-bold text-neg tabular-nums tracking-tight font-mono">
            {summary ? formatPercent(summary.max_drawdown_pct * 100, 2) : "—"}
          </div>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            {summary ? formatCurrency(summary.max_drawdown_amount, 0) : "—"}
          </span>
        </div>

        {/* Liquidation-Adjusted Salvage */}
        <div className="bg-surface border border-border-subtle rounded-md p-3.5">
          <div className="flex items-center justify-between text-2xs uppercase font-bold text-text-secondary tracking-wider mb-1">
            <span>Liquidation Value</span>
            <Tooltip
              title="Liquidation-Adjusted Value"
              content={HONESTY_DISCLOSURES.LIQUIDATION_ADJUSTED_DEF}
            />
          </div>
          <div className="text-xl font-bold text-text-primary tabular-nums tracking-tight font-mono">
            {summary ? formatMillions(summary.liquidation_adjusted_end, 2) : "—"}
          </div>
          <span className="text-2xs text-text-muted font-mono block truncate tabular-nums mt-0.5">
            Worst: {summary ? formatMillions(summary.liquidation_adjusted_worst, 2) : "—"}
          </span>
        </div>
      </section>

      {/* 3. Middle Section: Risk-Budget Working & Break-Even Holding Periods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Risk-Budget Working Table */}
        <div className="bg-surface border border-border-subtle rounded-md p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-accent-primary" aria-hidden="true" />
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                Risk-Budget Model Working
              </h3>
            </div>
            <Tooltip content="Ex-ante mathematical formulation: equal risk contribution between Bonds and Equities under 99% VaR stress." />
          </div>

          <p className="text-xs text-text-secondary">
            Parametric derivation of the default allocation under an ex-ante 5.0% maximum stressed loss budget:
          </p>

          {working ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums border-collapse">
                <thead className="bg-subtle text-text-secondary uppercase text-2xs border-b border-border-subtle">
                  <tr>
                    <th className="py-2 px-3">Parameter</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3 text-right">Value</th>
                    <th className="py-2 px-3">Role in Derivation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-mono text-2xs">
                  <tr className="hover:bg-subtle/50">
                    <td className="py-1.5 px-3 font-semibold font-sans text-text-primary">Total Risk Budget</td>
                    <td className="py-1.5 px-3 text-text-muted">T</td>
                    <td className="py-1.5 px-3 text-right font-bold text-text-primary">{formatPercent(working.T * 100, 1)}</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">Max permitted 5-day stressed portfolio loss</td>
                  </tr>
                  <tr className="hover:bg-subtle/50">
                    <td className="py-1.5 px-3 font-semibold font-sans text-text-primary">Normal Quantile</td>
                    <td className="py-1.5 px-3 text-text-muted">z_0.99</td>
                    <td className="py-1.5 px-3 text-right font-bold text-text-primary">{working.z99.toFixed(4)}</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">99% one-tailed Gaussian confidence interval</td>
                  </tr>
                  <tr className="hover:bg-subtle/50">
                    <td className="py-1.5 px-3 font-semibold font-sans text-text-primary">Equity Annual Volatility</td>
                    <td className="py-1.5 px-3 text-text-muted">σ_e</td>
                    <td className="py-1.5 px-3 text-right font-bold text-text-primary">{formatPercent(working.sigma * 100, 1)}</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">Baseline annual volatility assumption</td>
                  </tr>
                  <tr className="hover:bg-subtle/50">
                    <td className="py-1.5 px-3 font-semibold font-sans text-text-primary">Equity Stressed Loss</td>
                    <td className="py-1.5 px-3 text-text-muted">L_e</td>
                    <td className="py-1.5 px-3 text-right font-bold text-amber-500">{formatPercent(working.L_e * 100, 2)}</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">max(99% 5-day VaR, 15% liquidation haircut)</td>
                  </tr>
                  <tr className="hover:bg-subtle/50">
                    <td className="py-1.5 px-3 font-semibold font-sans text-text-primary">Bond Modified Duration</td>
                    <td className="py-1.5 px-3 text-text-muted">D_mod</td>
                    <td className="py-1.5 px-3 text-right font-bold text-text-primary">{working.D_mod.toFixed(2)} yrs</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">Interest rate sensitivity of 2Y government bond</td>
                  </tr>
                  <tr className="hover:bg-subtle/50">
                    <td className="py-1.5 px-3 font-semibold font-sans text-text-primary">Yield Shock</td>
                    <td className="py-1.5 px-3 text-text-muted">Δy</td>
                    <td className="py-1.5 px-3 text-right font-bold text-text-primary">{working.yield_shock_bp} bp</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">Adverse parallel yield curve shift</td>
                  </tr>
                  <tr className="hover:bg-subtle/50">
                    <td className="py-1.5 px-3 font-semibold font-sans text-text-primary">Bond Stressed Loss</td>
                    <td className="py-1.5 px-3 text-text-muted">L_b</td>
                    <td className="py-1.5 px-3 text-right font-bold text-amber-500">{formatPercent(working.L_b * 100, 2)}</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">max(D_mod × Δy, 2% liquidation haircut)</td>
                  </tr>
                  <tr className="hover:bg-subtle/50 bg-subtle/30">
                    <td className="py-1.5 px-3 font-semibold font-sans text-accent-primary">Enforced Repo Floor</td>
                    <td className="py-1.5 px-3 text-text-muted">w_repo_min</td>
                    <td className="py-1.5 px-3 text-right font-bold text-accent-primary">{formatPercent(working.repo_floor * 100, 1)}</td>
                    <td className="py-1.5 px-3 text-text-muted font-sans">Mandatory floor for immediate emergency liquidity</td>
                  </tr>
                  <tr className="hover:bg-subtle/50 font-bold bg-accent-subtle/30">
                    <td className="py-1.5 px-3 text-text-primary">Resulting Weights</td>
                    <td className="py-1.5 px-3 text-text-muted">w*</td>
                    <td className="py-1.5 px-3 text-right text-accent-primary" colSpan={2}>
                      Repo: {(working.weights.repo * 100).toFixed(1)}% | Bonds: {(working.weights.bonds * 100).toFixed(1)}% | Equity: {(working.weights.equity * 100).toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-text-muted">Loading risk-budget parameters...</div>
          )}
        </div>

        {/* Break-Even Holding Period & Haircut Diagnostics */}
        <div className="bg-surface border border-border-subtle rounded-md p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
                Break-Even Holding Period & Haircuts
              </h3>
            </div>
            <Tooltip
              title="Liquidation Haircuts & Break-Even"
              content="Haircut break-even holding period: time required for expected yield or excess return to recover the liquidation haircut (2.0% for 2Y bonds, 15.0% for equities) incurred during emergency liquidations."
            />
          </div>

          <p className="text-xs text-text-secondary">
            Emergency liquidation imposes statutory haircuts. The table below evaluates ex-ante vs ex-post break-even holding horizons:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Bonds Card */}
            <div className="p-3.5 bg-subtle/40 rounded-sm border border-border-subtle space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-500">Tier 2 Bonds (2Y)</span>
                <span className="text-2xs font-mono px-1.5 py-0.5 rounded-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  2.0% Haircut
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ex-Ante Break-Even:</span>
                  <span className="font-mono font-bold text-text-primary">
                    {summary?.break_even_ex_ante_years.bonds !== undefined && summary?.break_even_ex_ante_years.bonds !== null
                      ? `${summary.break_even_ex_ante_years.bonds.toFixed(2)} years`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ex-Post Break-Even:</span>
                  <span className="font-mono font-bold text-text-primary">
                    {summary?.break_even_ex_post_years.bonds !== undefined && summary?.break_even_ex_post_years.bonds !== null
                      ? `${summary.break_even_ex_post_years.bonds.toFixed(2)} years`
                      : "—"}
                  </span>
                </div>
              </div>
              <p className="text-2xs text-text-muted border-t border-border-subtle pt-1.5">
                Evaluates time for 2Y bond yield to overcome the 200 bp liquidation haircut.
              </p>
            </div>

            {/* Equities Card */}
            <div className="p-3.5 bg-subtle/40 rounded-sm border border-border-subtle space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400">Tier 3 Equities</span>
                <span className="text-2xs font-mono px-1.5 py-0.5 rounded-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  15.0% Haircut
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ex-Ante Break-Even:</span>
                  <span className="font-mono font-bold text-text-primary">
                    {summary?.break_even_ex_ante_years.equity !== undefined && summary?.break_even_ex_ante_years.equity !== null
                      ? `${summary.break_even_ex_ante_years.equity.toFixed(2)} years`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ex-Post Break-Even:</span>
                  <span className="font-mono font-bold text-text-primary">
                    {summary?.break_even_ex_post_years.equity !== undefined && summary?.break_even_ex_post_years.equity !== null
                      ? `${summary.break_even_ex_post_years.equity.toFixed(2)} years`
                      : "—"}
                  </span>
                </div>
              </div>
              <p className="text-2xs text-text-muted border-t border-border-subtle pt-1.5">
                Evaluates time for equity risk premium to recover the 1,500 bp distress haircut.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Preset Comparison Table from /sleeve/compare */}
      <section className="bg-surface border border-border-subtle rounded-md p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wide">
              Preset Comparative Performance Analysis
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Side-by-side performance across institutional presets through {throughDate || "dataset end"}. Click column headers to sort.
            </p>
          </div>
          <span className="text-2xs text-text-muted font-mono self-start sm:self-auto">
            {sortedCompareRows.length} models evaluated
          </span>
        </div>

        {compareLoading ? (
          <div className="py-8 text-center text-xs text-text-muted">Loading comparative analytics...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums border-collapse">
              <thead className="bg-subtle text-text-secondary uppercase text-2xs sticky top-0 border-b border-border-subtle">
                <tr>
                  <th className="py-2.5 px-3 cursor-pointer hover:text-text-primary" onClick={() => toggleSort("name")}>
                    <div className="flex items-center gap-1">
                      <span>Preset</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("repo")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Repo %</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("bonds")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Bonds %</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("equity")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Equity %</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("pnl")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Net P&L ($)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("excess")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Excess vs Repo ($)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("return")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Ann. Return</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("drawdown")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Max Drawdown</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right cursor-pointer hover:text-text-primary" onClick={() => toggleSort("liquidation")}>
                    <div className="flex items-center justify-end gap-1">
                      <span>Liquidation Val</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-mono text-xs">
                {sortedCompareRows.map(([key, item]) => {
                  const isCurrent = selectedPreset === key;
                  return (
                    <tr
                      key={key}
                      className={`hover:bg-subtle/50 ${isCurrent ? "bg-accent-subtle/20 font-semibold" : ""}`}
                    >
                      <td className="py-2 px-3 font-sans text-text-primary whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{SLEEVE_PRESET_LABELS[key] || key}</span>
                          {isCurrent && (
                            <span className="text-[9px] px-1 py-0.2 rounded-xs bg-accent-primary text-surface font-bold uppercase">
                              Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">{(item.weights.repo * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-right">{(item.weights.bonds * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-right">{(item.weights.equity * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-right">
                        <SignedMoney value={item.summary.pnl} decimals={0} />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <SignedMoney value={item.summary.excess_pnl_vs_repo} decimals={0} />
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatPercent(item.summary.annualised_return * 100, 2)}
                      </td>
                      <td className="py-2 px-3 text-right text-neg">
                        {formatPercent(item.summary.max_drawdown_pct * 100, 2)}
                      </td>
                      <td className="py-2 px-3 text-right text-text-secondary">
                        {formatMillions(item.summary.liquidation_adjusted_end, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Mandatory Honesty Disclosures Banner */}
      <section className="bg-subtle/50 border border-border-subtle rounded-md p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
          <Info className="w-4 h-4 text-accent-primary" aria-hidden="true" />
          <span>Mandatory Fiduciary Disclosures & Methodological Honesty</span>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-text-secondary list-disc list-inside">
          <li>{HONESTY_DISCLOSURES.NOT_A_FORECAST}</li>
          <li>{HONESTY_DISCLOSURES.EQUITY_EXPECTED_RETURN}</li>
          <li>{HONESTY_DISCLOSURES.PRESETS_IN_SAMPLE}</li>
          <li>{HONESTY_DISCLOSURES.SEPARATE_CAPITAL}</li>
        </ul>
      </section>
    </div>
  );
};

export default StrategicSleevePage;
