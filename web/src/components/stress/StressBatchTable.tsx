/**
 * StressBatchTable.tsx: Multi-strategy batch comparison table and bar chart for Stress Lab.
 * Shows Net P&L, break fees, overdraft costs, break nights, and worst shortfall for S1-S6
 * alongside deltas vs unstressed backtest for the same nights.
 * Mandatory disclaimer and plain-language summary line derived strictly from returned numbers.
 */

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { Table, BarChart3, Info } from "lucide-react";
import { useStressStore } from "../../store/useStressStore";
import {
  formatCurrency,
  formatDeltaCurrency,
  formatDeltaNumber,
  formatMillions,
} from "../../utils/formatters";
import { getStrategyLabel } from "../../utils/labels";

export const StressBatchTable: React.FC = () => {
  const { batchResult } = useStressStore();

  if (!batchResult) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center flex flex-col items-center justify-center min-h-[360px]">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30 mb-3 animate-pulse" />
        <h3 className="text-sm font-semibold text-foreground">
          Multi-Strategy Batch Comparison Ready
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Select a night subset and click{" "}
          <strong className="text-foreground">Run Multi-Strategy Batch Test</strong> to evaluate
          strategies S1 through S6 across historical evaluation nights under stress.
        </p>
      </div>
    );
  }

  const { scenario, night_filter, nights_count, summary_text, results } = batchResult;

  // Prepare bar chart data
  const chartData = results.map((r) => ({
    strategy: r.strategy.split("_")[0], // S1, S2, ...
    fullName: r.strategy,
    stressedPnl: r.net_pnl,
    baselinePnl: r.baseline_net_pnl,
  }));

  const getStrategyColor = (strat: string) => {
    if (strat.startsWith("S4")) return "#10b981"; // Emerald
    if (strat.startsWith("S5")) return "#3b82f6"; // Blue
    if (strat.startsWith("S6")) return "#8b5cf6"; // Purple (Oracle)
    return "#94a3b8"; // Slate for baselines
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">
      {/* Header & Mandatory Disclaimer Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Batch Performance Across Strategies: {scenario} ({night_filter}, {nights_count} nights)
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compares stressed outcomes against unstressed historical backtest for the identical nights.
          </p>
        </div>

        <div>
          <span
            id="disclaimer-badge-batch"
            className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[11px] font-semibold rounded-full"
          >
            Synthetic scenario applied to real flows. Not part of the dataset.
          </span>
        </div>
      </div>

      {/* Plain-Language Summary Callout Box (Strictly computed facts) */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-foreground font-medium leading-relaxed">
          <strong>Key Finding: </strong>
          {summary_text || "—"}
        </div>
      </div>

      {/* Stressed Net P&L Bar Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">
            Stressed Cumulative Net P&L by Strategy ($ USD)
          </span>
          <span className="text-[11px] text-muted-foreground">
            S4 (Zero Overdraft) vs S5 (Cost Optimal) vs S6 (Oracle)
          </span>
        </div>

        <div className="h-[220px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <XAxis dataKey="strategy" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => `$${(val / 1_000_000).toFixed(1)}M`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border shadow-md rounded-lg p-3 text-xs space-y-1">
                      <div className="font-bold text-foreground">{data.fullName}</div>
                      <div className="text-primary">
                        Stressed Net P&L: {formatCurrency(data.stressedPnl)}
                      </div>
                      <div className="text-muted-foreground">
                        Baseline Net P&L: {formatCurrency(data.baselinePnl)}
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} />
              <Bar dataKey="stressedPnl" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.fullName} fill={getStrategyColor(entry.fullName)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-muted-foreground">
              <th className="py-2.5 px-3 font-semibold">Strategy</th>
              <th className="py-2.5 px-3 font-semibold text-right">Stressed Net P&L (Δ)</th>
              <th className="py-2.5 px-3 font-semibold text-right">Break Fees (Δ)</th>
              <th className="py-2.5 px-3 font-semibold text-right">Overdraft Cost (Δ)</th>
              <th className="py-2.5 px-3 font-semibold text-right">Repo Break Nights (Δ)</th>
              <th className="py-2.5 px-3 font-semibold text-right">Overdraft Nights (Δ)</th>
              <th className="py-2.5 px-3 font-semibold text-right">Worst Shortfall (Δ)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {results.map((row) => {
              const isS4 = row.strategy.startsWith("S4");
              const isS5 = row.strategy.startsWith("S5");
              const isOracle = row.strategy.startsWith("S6");

              return (
                <tr
                  key={row.strategy}
                  className={`hover:bg-muted/20 transition-colors ${
                    isS4 ? "bg-primary/5 font-semibold" : ""
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono flex items-center gap-1.5">
                    {isS4 && <span className="w-2 h-2 rounded-full bg-success" />}
                    {isS5 && <span className="w-2 h-2 rounded-full bg-primary" />}
                    {isOracle && <span className="w-2 h-2 rounded-full bg-purple-500" />}
                    <span className="text-foreground">{getStrategyLabel(row.strategy)}</span>
                  </td>

                  {/* Stressed Net P&L with Delta */}
                  <td className="py-2.5 px-3 text-right font-mono">
                    <span className="text-foreground">{formatCurrency(row.net_pnl)}</span>
                    <span
                      className={`text-[10px] ml-1.5 ${
                        row.delta_net_pnl >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      ({formatDeltaCurrency(row.delta_net_pnl)})
                    </span>
                  </td>

                  {/* Break Fees with Delta */}
                  <td className="py-2.5 px-3 text-right font-mono">
                    <span className="text-foreground">{formatCurrency(row.break_fee)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      ({formatDeltaCurrency(row.delta_break_fee)})
                    </span>
                  </td>

                  {/* Overdraft Cost with Delta */}
                  <td className="py-2.5 px-3 text-right font-mono">
                    <span className="text-foreground">{formatCurrency(row.overdraft_cost)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      ({formatDeltaCurrency(row.delta_overdraft_cost)})
                    </span>
                  </td>

                  {/* Repo Break Nights with Delta */}
                  <td className="py-2.5 px-3 text-right font-mono">
                    <span className="text-foreground">{row.repo_break_nights}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      ({formatDeltaNumber(row.delta_repo_break_nights)})
                    </span>
                  </td>

                  {/* Overdraft Nights with Delta */}
                  <td className="py-2.5 px-3 text-right font-mono">
                    <span className={row.overdraft_nights > 0 ? "text-danger font-bold" : "text-foreground"}>
                      {row.overdraft_nights}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      ({formatDeltaNumber(row.delta_overdraft_nights)})
                    </span>
                  </td>

                  {/* Worst Shortfall with Delta */}
                  <td className="py-2.5 px-3 text-right font-mono">
                    <span className="text-foreground">{formatMillions(row.worst_shortfall)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      ({formatDeltaCurrency(row.delta_worst_shortfall)})
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
