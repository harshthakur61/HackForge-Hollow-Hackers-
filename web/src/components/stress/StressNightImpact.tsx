/**
 * StressNightImpact.tsx: Displays financial impact cards and overnight liquidity trace chart
 * comparing Baseline vs Stressed outcomes for a specific evaluated night.
 * Includes waterfall events (bond sale, equity sale) with amounts and fees in trace and cards,
 * and a plain-language line built strictly from returned numbers.
 */

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertOctagon,
  Percent,
  Activity,
  ShieldAlert,
  Landmark,
  LineChart,
  Info,
} from "lucide-react";
import { useStressStore } from "../../store/useStressStore";
import {
  formatCurrency,
  formatDeltaCurrency,
  formatMillions,
} from "../../utils/formatters";

export const StressNightImpact: React.FC = () => {
  const { nightResult, mode } = useStressStore();

  if (!nightResult) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center flex flex-col items-center justify-center min-h-[360px]">
        <Activity className="w-12 h-12 text-muted-foreground/30 mb-3 animate-pulse" />
        <h3 className="text-sm font-semibold text-foreground">
          Single-Night Stress Impact Ready
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Configure a stress scenario above and click{" "}
          <strong className="text-foreground">Run Night Stress Simulation</strong> to compare
          hour-by-hour cash balance, repo liquidation, and penalty fees against unstressed flows.
        </p>
      </div>
    );
  }

  const {
    night_date,
    scenario,
    strategy,
    informed,
    stressed_decision,
    baseline_result,
    stressed_result,
    deltas,
    baseline_trace,
    stressed_trace,
    waterfall_events = [],
  } = nightResult;

  // Calculate waterfall amounts and fees
  const bondSales = waterfall_events.filter((e) => e.type === "bond_sale");
  const totalBondSold = bondSales.reduce((acc, e) => acc + e.amount, 0);
  const totalBondFee = bondSales.reduce((acc, e) => acc + e.fee, 0);

  const equitySales = waterfall_events.filter((e) => e.type === "equity_sale");
  const totalEquitySold = equitySales.reduce((acc, e) => acc + e.amount, 0);
  const totalEquityFee = equitySales.reduce((acc, e) => acc + e.fee, 0);

  // Plain-language line built ONLY from returned numbers
  const modeName = mode === "zero_overdraft" ? "Zero-overdraft" : "Cost-optimal";
  let plainSummaryLine = "";
  if (totalBondSold > 0 && totalEquitySold > 0) {
    plainSummaryLine = `${modeName} mode sold $${totalBondSold.toLocaleString()} of bonds (fee $${totalBondFee.toLocaleString()}) and $${totalEquitySold.toLocaleString()} of equities (fee $${totalEquityFee.toLocaleString()}).`;
  } else if (totalBondSold > 0) {
    plainSummaryLine = `${modeName} mode sold $${totalBondSold.toLocaleString()} of bonds (fee $${totalBondFee.toLocaleString()}).`;
  } else if (totalEquitySold > 0) {
    plainSummaryLine = `${modeName} mode sold $${totalEquitySold.toLocaleString()} of equities (fee $${totalEquityFee.toLocaleString()}).`;
  } else if (stressed_result.break_fee > 0 || stressed_result.overdraft_cost > 0) {
    plainSummaryLine = `${modeName} mode incurred $${stressed_result.break_fee.toLocaleString()} in repo break fees and $${stressed_result.overdraft_cost.toLocaleString()} in overdraft costs without liquidating sleeve assets.`;
  } else {
    plainSummaryLine = `${modeName} mode absorbed the shock with $0 in bond sales, $0 in equity sales, and $0 in penalty fees.`;
  }

  // Build combined chart timeline
  const chartData = baseline_trace.map((b, idx) => {
    const s = stressed_trace[idx] || b;
    const timeLabel = b.ts.includes("T") ? b.ts.split("T")[1].slice(0, 5) : b.ts;
    return {
      ts: b.ts,
      time: timeLabel,
      baseCash: b.cash,
      stressedCash: s.cash,
      baseRepo: b.repo,
      stressedRepo: s.repo,
      baseFlow: b.net_flow,
      stressedFlow: s.net_flow,
      event: s.event || b.event,
      eventAmount: s.event_amount ?? b.event_amount ?? 0,
      eventFee: s.event_fee ?? b.event_fee ?? 0,
    };
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">
      {/* Top Banner & Mandatory Disclaimer Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-warning" />
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Single-Night Stress Impact: {night_date}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Strategy: {strategy} | Scenario: {scenario} | Mode: {informed ? "Informed (Advance Warning)" : "Surprise Shock"}
          </p>
        </div>

        <div>
          <span
            id="disclaimer-badge-night"
            className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[11px] font-semibold rounded-full"
          >
            Synthetic scenario applied to real flows. Not part of the dataset.
          </span>
        </div>
      </div>

      {/* Plain-Language Line Built ONLY from Returned Numbers */}
      <div
        id="stress-plain-language-summary"
        className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-xs font-semibold text-foreground flex items-center gap-2"
      >
        <Info className="w-4 h-4 text-primary shrink-0" />
        <span>{plainSummaryLine}</span>
      </div>

      {/* KPI Cards: Baseline vs Stressed with Deltas + Waterfall Sales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Net P&L Card */}
        <div className="p-3.5 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Net P&L</span>
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">
            {formatCurrency(stressed_result.net_pnl)}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
            <span className="text-muted-foreground">Base: {formatCurrency(baseline_result.net_pnl)}</span>
            <span
              className={`font-mono font-semibold flex items-center gap-0.5 ${
                deltas.net_pnl >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {deltas.net_pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {formatDeltaCurrency(deltas.net_pnl)}
            </span>
          </div>
        </div>

        {/* Break Fee Card */}
        <div className="p-3.5 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Repo Break Fees</span>
            <AlertOctagon className="w-3.5 h-3.5 text-danger" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">
            {formatCurrency(stressed_result.break_fee)}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
            <span className="text-muted-foreground">Base: {formatCurrency(baseline_result.break_fee)}</span>
            <span
              className={`font-mono font-semibold ${
                deltas.break_fee > 0 ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {formatDeltaCurrency(deltas.break_fee)}
            </span>
          </div>
        </div>

        {/* Overdraft Cost Card */}
        <div className="p-3.5 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Overdraft Cost</span>
            <Percent className="w-3.5 h-3.5 text-danger" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">
            {formatCurrency(stressed_result.overdraft_cost)}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
            <span className="text-muted-foreground">Base: {formatCurrency(baseline_result.overdraft_cost)}</span>
            <span
              className={`font-mono font-semibold ${
                deltas.overdraft_cost > 0 ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {formatDeltaCurrency(deltas.overdraft_cost)}
            </span>
          </div>
        </div>

        {/* Broken Principal Card */}
        <div className="p-3.5 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Broken Repo Principal</span>
            <Activity className="w-3.5 h-3.5 text-warning" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">
            {formatCurrency(stressed_result.broken_amount)}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
            <span className="text-muted-foreground">
              Buffer: {formatMillions(stressed_decision.buffer_usd)}
            </span>
            <span className="font-mono text-muted-foreground text-[11px]">
              Peak: {formatMillions(stressed_result.shortfall_peak)}
            </span>
          </div>
        </div>

        {/* Tier 2 Bond Liquidation Card */}
        <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between text-xs text-amber-500 mb-1">
            <span className="font-semibold">Bond Liquidations</span>
            <Landmark className="w-3.5 h-3.5" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">
            {formatCurrency(totalBondSold)}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
            <span className="text-muted-foreground">Fee (2%):</span>
            <span className="font-mono font-semibold text-danger">
              {formatCurrency(totalBondFee)}
            </span>
          </div>
        </div>

        {/* Tier 3 Equity Liquidation Card */}
        <div className="p-3.5 rounded-lg border border-indigo-500/30 bg-indigo-500/5">
          <div className="flex items-center justify-between text-xs text-indigo-400 mb-1">
            <span className="font-semibold">Equity Liquidations</span>
            <LineChart className="w-3.5 h-3.5" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground">
            {formatCurrency(totalEquitySold)}
          </div>
          <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
            <span className="text-muted-foreground">Fee (15%):</span>
            <span className="font-mono font-semibold text-danger">
              {formatCurrency(totalEquityFee)}
            </span>
          </div>
        </div>
      </div>

      {/* Waterfall Events Table (if any occurred) */}
      {waterfall_events.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
              Waterfall Liquidation Sequence Audit ({waterfall_events.length} events)
            </h4>
            <span className="text-2xs font-mono text-muted-foreground">
              Execution order: Repo (0.5%) → Bonds (2%) → Equities (15%)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums border-collapse">
              <thead className="bg-muted text-muted-foreground uppercase text-[10px] border-b border-border">
                <tr>
                  <th className="py-2 px-3">Hour (EST)</th>
                  <th className="py-2 px-3">Liquidation Event</th>
                  <th className="py-2 px-3 text-right">Amount Liquidated</th>
                  <th className="py-2 px-3 text-right">Haircut Fee</th>
                  <th className="py-2 px-3 text-right">Net Liquidity Proceeds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono text-2xs">
                {waterfall_events.map((ev, i) => (
                  <tr key={`${ev.ts}-${ev.type}-${i}`} className="hover:bg-muted/40">
                    <td className="py-1.5 px-3 font-semibold text-foreground">
                      {ev.ts.slice(11, 16)}
                    </td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded-xs font-semibold ${
                          ev.type === "bond_sale"
                            ? "bg-amber-500/10 text-amber-500"
                            : ev.type === "equity_sale"
                            ? "bg-indigo-500/10 text-indigo-400"
                            : "bg-danger/10 text-danger"
                        }`}
                      >
                        {ev.type.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold text-foreground">
                      {formatCurrency(ev.amount)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-danger font-semibold">
                      {formatCurrency(ev.fee)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">
                      {formatCurrency(ev.amount - ev.fee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overnight Progression Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">
            Overnight Progression: Baseline vs Stressed Liquidity (17:00 – 08:00)
          </span>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#10b981]" /> Baseline Cash
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#ef4444]" /> Stressed Cash
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#3b82f6] border-dashed" /> Buffer Line
            </span>
          </div>
        </div>

        <div className="h-[280px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => `$${(val / 1_000_000).toFixed(0)}M`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border shadow-md rounded-lg p-3 text-xs space-y-1 z-50">
                      <div className="font-bold text-foreground">{label}</div>
                      <div className="text-[#10b981]">
                        Baseline Cash: {formatCurrency(data.baseCash)}
                      </div>
                      <div className="text-[#ef4444]">
                        Stressed Cash: {formatCurrency(data.stressedCash)}
                      </div>
                      <div className="text-[#3b82f6]">
                        Stressed Repo: {formatCurrency(data.stressedRepo)}
                      </div>
                      {data.event && (
                        <div className="text-warning font-semibold pt-1 border-t border-border/50">
                          Event: {data.event} ({formatCurrency(data.eventAmount)}, fee: {formatCurrency(data.eventFee)})
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {/* Buffer Reference Line */}
              <ReferenceLine
                y={stressed_decision.buffer_usd}
                stroke="#3b82f6"
                strokeDasharray="4 4"
                label={{
                  value: `Buffer: $${(stressed_decision.buffer_usd / 1_000_000).toFixed(1)}M`,
                  fill: "#3b82f6",
                  fontSize: 10,
                  position: "insideTopLeft",
                }}
              />
              {/* Baseline Cash Line */}
              <Line
                type="monotone"
                dataKey="baseCash"
                name="Baseline Cash"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
              {/* Stressed Cash Line */}
              <Line
                type="monotone"
                dataKey="stressedCash"
                name="Stressed Cash"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={{ r: 2 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default StressNightImpact;
