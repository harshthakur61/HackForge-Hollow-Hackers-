/**
 * StrategyPerformancePage.tsx: Institutional strategy benchmark & performance leaderboard.
 * - Sortable table of all strategies from /api/kpis with a "through <date>" header
 * - Capture ratio against the Oracle benchmark (upper bound, not deployable)
 * - Comparative bar chart across all evaluated policies
 * - Plain treasury language descriptions and definitions
 */

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { useKpisQuery } from "../hooks/useQueries";
import { StrategyKpi } from "../contract";
import { formatCurrency, formatMillions, formatPercent, formatBps } from "../utils/formatters";
import TooltipComponent from "../components/common/Tooltip";
import SignedMoney from "../components/common/SignedMoney";
import ChartFrame from "../components/common/ChartFrame";

import {
  STRATEGY_LABELS,
  STRATEGY_DESCRIPTIONS,
} from "../utils/labels";

const STRATEGY_METADATA: Record<string, { title: string; desc: string }> = {
  S0_all_cash: {
    title: STRATEGY_LABELS.S0_all_cash,
    desc: STRATEGY_DESCRIPTIONS.S0_all_cash,
  },
  S1_fixed_10: {
    title: STRATEGY_LABELS.S1_fixed_10,
    desc: STRATEGY_DESCRIPTIONS.S1_fixed_10,
  },
  S2_fixed_20: {
    title: STRATEGY_LABELS.S2_fixed_20,
    desc: STRATEGY_DESCRIPTIONS.S2_fixed_20,
  },
  S3_static: {
    title: STRATEGY_LABELS.S3_static,
    desc: STRATEGY_DESCRIPTIONS.S3_static,
  },
  S4_policy_zero_overdraft: {
    title: STRATEGY_LABELS.S4_policy_zero_overdraft,
    desc: STRATEGY_DESCRIPTIONS.S4_policy_zero_overdraft,
  },
  S5_policy_cost_optimal: {
    title: STRATEGY_LABELS.S5_policy_cost_optimal,
    desc: STRATEGY_DESCRIPTIONS.S5_policy_cost_optimal,
  },
  S6_oracle: {
    title: STRATEGY_LABELS.S6_oracle,
    desc: STRATEGY_DESCRIPTIONS.S6_oracle,
  },
};

type SortField =
  | "strategy"
  | "net_pnl"
  | "net_yield_bps"
  | "capture_ratio"
  | "interest"
  | "break_fees"
  | "overdraft_cost"
  | "overdraft_nights"
  | "repo_break_nights"
  | "mean_buffer"
  | "payout_success_rate";

export const StrategyPerformancePage: React.FC = () => {
  const { data: kpiData, isLoading } = useKpisQuery();

  const [sortField, setSortField] = useState<SortField>("net_pnl");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const strategies = kpiData?.strategies || [];
  const throughDate = kpiData?.through || "Latest Settlement";

  // Find Oracle for capture ratio denominator
  const oracleKpi = strategies.find((s) => s.strategy === "S6_oracle");
  const oracleNetPnl = oracleKpi?.net_pnl && oracleKpi.net_pnl > 0 ? oracleKpi.net_pnl : null;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const getCaptureRatio = (item: StrategyKpi) => {
    if (!oracleNetPnl) return null;
    return (item.net_pnl / oracleNetPnl) * 100;
  };

  const sortedStrategies = [...strategies].sort((a, b) => {
    let aVal: number = 0;
    let bVal: number = 0;

    switch (sortField) {
      case "net_pnl":
        aVal = a.net_pnl;
        bVal = b.net_pnl;
        break;
      case "net_yield_bps":
        aVal = a.net_yield_bps;
        bVal = b.net_yield_bps;
        break;
      case "capture_ratio":
        aVal = getCaptureRatio(a) ?? -Infinity;
        bVal = getCaptureRatio(b) ?? -Infinity;
        break;
      case "interest":
        aVal = a.interest;
        bVal = b.interest;
        break;
      case "break_fees":
        aVal = a.break_fees;
        bVal = b.break_fees;
        break;
      case "overdraft_cost":
        aVal = a.overdraft_cost;
        bVal = b.overdraft_cost;
        break;
      case "overdraft_nights":
        aVal = a.overdraft_nights;
        bVal = b.overdraft_nights;
        break;
      case "repo_break_nights":
        aVal = a.repo_break_nights;
        bVal = b.repo_break_nights;
        break;
      case "mean_buffer":
        aVal = a.mean_buffer;
        bVal = b.mean_buffer;
        break;
      case "payout_success_rate":
        aVal = a.payout_success_rate;
        bVal = b.payout_success_rate;
        break;
      case "strategy":
        return sortOrder === "asc"
          ? a.strategy.localeCompare(b.strategy)
          : b.strategy.localeCompare(a.strategy);
      default:
        aVal = a.net_pnl;
        bVal = b.net_pnl;
    }

    return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
  });

  const chartData = strategies.map((s) => ({
    strategy: s.strategy.split("_")[0],
    fullName: s.strategy,
    netPnl: s.net_pnl,
    netPnlM: s.net_pnl / 1_000_000,
    isOracle: s.strategy === "S6_oracle",
    isS4: s.strategy === "S4_policy_zero_overdraft",
    isS5: s.strategy === "S5_policy_cost_optimal",
  }));

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-text-muted ml-1" aria-hidden="true" />;
    }
    return sortOrder === "asc" ? (
      <ChevronUp className="w-3 h-3 text-accent-primary ml-1" aria-hidden="true" />
    ) : (
      <ChevronDown className="w-3 h-3 text-accent-primary ml-1" aria-hidden="true" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Through Date Basis */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border-subtle">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary">
            Strategy Performance Leaderboard
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Comparative evaluation of cash buffer allocation policies evaluated on identical 15-hour overnight flows.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-wider text-text-secondary">
            Basis:
          </span>
          <span className="px-2.5 py-1 text-xs font-mono font-medium rounded-sm bg-subtle border border-border-subtle text-text-primary">
            through {throughDate}
          </span>
        </div>
      </div>

      {/* Comparative Net P&L Bar Chart */}
      <ChartFrame
        title="Comparative Cumulative Net P&L by Strategy"
        units="$M USD"
        period={`through ${throughDate}`}
      >
        <div role="region" className="h-[240px] sm:h-[280px] w-full pt-1" tabIndex={0} aria-label="Strategy Performance Bar Chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 15, left: 5, bottom: 0 }}>
              <XAxis
                dataKey="strategy"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
              />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={11}
                tickFormatter={(val) => `$${val.toFixed(1)}M`}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div
                        role="tooltip"
                        tabIndex={0}
                        className="bg-surface border border-border-strong p-2.5 rounded-sm shadow-md text-xs font-mono space-y-1 text-text-primary"
                      >
                        <div className="font-bold border-b border-border-subtle pb-1">
                          {data.fullName}
                          {data.isOracle && " (upper bound, not deployable)"}
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-text-muted">Net P&L:</span>
                          <span className="font-bold tabular-nums">{formatCurrency(data.netPnl, 2)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="netPnlM" name="Net P&L ($M)" maxBarSize={36}>
                {chartData.map((entry) => {
                  let fillColor = "#64748b";
                  if (entry.isOracle) fillColor = "#7c3aed";
                  else if (entry.isS5) fillColor = "#15803d";
                  else if (entry.isS4) fillColor = "#0284c7";
                  else if (entry.strategy === "S3") fillColor = "#b45309";
                  return <Cell key={entry.strategy} fill={fillColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>

      {/* Sortable Performance Data Table */}
      <div className="bg-surface border border-border-subtle rounded-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Policy Accounting & Metrics Table
          </h3>
          <span className="text-2xs text-text-muted font-mono">
            {strategies.length} strategies evaluated
          </span>
        </div>

        <div className="overflow-x-auto focus:outline-none" tabIndex={0}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-subtle text-text-secondary uppercase text-2xs tracking-wider sticky top-0 border-b border-border-subtle">
              <tr>
                <th
                  scope="col"
                  onClick={() => handleSort("strategy")}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center">
                    Strategy Name
                    {renderSortIndicator("strategy")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("net_pnl")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Net P&L (USD)
                    {renderSortIndicator("net_pnl")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("capture_ratio")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Oracle Capture
                    <TooltipComponent content="Net P&L as a percentage of the theoretical maximum earned by the S6 Oracle benchmark." />
                    {renderSortIndicator("capture_ratio")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("net_yield_bps")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Yield (bps)
                    {renderSortIndicator("net_yield_bps")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("interest")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Repo Interest
                    {renderSortIndicator("interest")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("break_fees")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Break Fees
                    {renderSortIndicator("break_fees")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("overdraft_cost")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Overdraft Fees
                    {renderSortIndicator("overdraft_cost")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("overdraft_nights")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    OD Nights
                    {renderSortIndicator("overdraft_nights")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("repo_break_nights")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Break Nights
                    {renderSortIndicator("repo_break_nights")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("mean_buffer")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Mean Buffer
                    {renderSortIndicator("mean_buffer")}
                  </span>
                </th>
                <th
                  scope="col"
                  onClick={() => handleSort("payout_success_rate")}
                  className="py-3 px-4 text-right font-semibold cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  <span className="inline-flex items-center justify-end w-full">
                    Payout SLA
                    {renderSortIndicator("payout_success_rate")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle tabular-nums font-mono text-2xs">
              {isLoading ? (
                Array.from({ length: 7 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={11} className="py-3 px-4">
                      <div className="h-5 bg-subtle rounded-xs animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : (
                sortedStrategies.map((row) => {
                  const meta = STRATEGY_METADATA[row.strategy] || {
                    title: row.strategy,
                    desc: "Treasury liquidity allocation strategy.",
                  };
                  const capture = getCaptureRatio(row);
                  const isOracle = row.strategy === "S6_oracle";
                  const isS4 = row.strategy === "S4_policy_zero_overdraft";
                  const isS5 = row.strategy === "S5_policy_cost_optimal";

                  return (
                    <tr
                      key={row.strategy}
                      className={`hover:bg-subtle/50 transition-colors ${
                        isS4
                          ? "bg-accent-subtle/10"
                          : isS5
                          ? "bg-pos-bg/10"
                          : isOracle
                          ? "bg-purple-500/5"
                          : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-sans text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary font-mono">
                            {row.strategy}
                          </span>
                          {isOracle && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 font-medium">
                              Upper Bound
                            </span>
                          )}
                          {isS4 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-accent-subtle text-accent-primary font-medium">
                              Default Policy
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-text-muted mt-0.5">
                          {meta.title} — {meta.desc}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-xs">
                        <SignedMoney value={row.net_pnl} decimals={2} />
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isOracle ? (
                          <span className="text-purple-600 font-bold">100.0% (Max)</span>
                        ) : capture !== null ? (
                          <span className="text-text-primary font-semibold">
                            {capture.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="py-3 px-4 text-right text-text-primary">
                        {formatBps(row.net_yield_bps, 1)}
                      </td>

                      <td className="py-3 px-4 text-right text-text-primary">
                        {formatCurrency(row.interest, 0)}
                      </td>

                      <td className="py-3 px-4 text-right text-text-primary">
                        {row.break_fees > 0 ? (
                          <span className="text-neg">{formatCurrency(row.break_fees, 0)}</span>
                        ) : (
                          "$0"
                        )}
                      </td>

                      <td className="py-3 px-4 text-right text-text-primary">
                        {row.overdraft_cost > 0 ? (
                          <span className="text-neg">{formatCurrency(row.overdraft_cost, 0)}</span>
                        ) : (
                          "$0"
                        )}
                      </td>

                      {/* Overdraft Nights: Plain figure, NEVER green decoration */}
                      <td className="py-3 px-4 text-right text-text-primary font-medium">
                        {row.overdraft_nights}
                      </td>

                      {/* Break Nights: Plain figure */}
                      <td className="py-3 px-4 text-right text-text-primary font-medium">
                        {row.repo_break_nights}
                      </td>

                      <td className="py-3 px-4 text-right text-text-muted">
                        {formatMillions(row.mean_buffer, 1)}
                      </td>

                      {/* Payout Success: Plain figure, NEVER green decoration */}
                      <td className="py-3 px-4 text-right text-text-primary font-medium">
                        {formatPercent(row.payout_success_rate, 1)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StrategyPerformancePage;
