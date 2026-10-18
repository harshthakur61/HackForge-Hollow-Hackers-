/**
 * NightChart.tsx: Real-time Recharts overnight liquidity chart (17:00 to 08:00).
 * Renders Cash line, Repo area, Overdraft line, Horizontal Buffer reference line,
 * and vertical markers for repo_break / overdraft events.
 * Includes accessible "View as table" toggle and keyboard-reachable tooltips.
 */

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { LineChart as ChartIcon } from "lucide-react";
import { useReplayStore, selectNightChartData } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";
import ChartFrame from "./common/ChartFrame";

export const NightChart: React.FC = () => {
  const currentNight = useReplayStore((s) => s.currentNight);
  const chartData = selectNightChartData(currentNight);
  const decision = currentNight.decision?.decision;
  const bufferUsd = decision?.buffer_usd ?? 0;
  const events = currentNight.events;

  // Filter repo break and overdraft events for vertical markers
  const breakEvents = events.filter((e) => e.type === "repo_break");
  const overdraftEvents = events.filter((e) => e.type === "overdraft");

  // Accessible Table Alternative for Screen Readers & Keyboard Users
  const tableAlternative = (
    <table className="w-full text-left text-xs text-text-primary border-collapse">
      <thead className="bg-subtle text-text-secondary uppercase text-2xs sticky top-0 border-b border-border-subtle">
        <tr>
          <th className="py-2 px-3">Hour (EST)</th>
          <th className="py-2 px-3 text-right">Cash Balance</th>
          <th className="py-2 px-3 text-right">Repo Balance</th>
          <th className="py-2 px-3 text-right">Overdraft</th>
          <th className="py-2 px-3 text-right">Buffer Line</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle tabular-nums font-mono">
        {chartData.map((pt) => (
          <tr key={pt.ts} className="hover:bg-subtle/50">
            <td className="py-1.5 px-3 font-semibold text-text-primary">{pt.time}</td>
            <td className="py-1.5 px-3 text-right">{formatCurrency(pt.cash, 0)}</td>
            <td className="py-1.5 px-3 text-right">{formatCurrency(pt.repo, 0)}</td>
            <td className={`py-1.5 px-3 text-right ${pt.overdraft > 0 ? "text-neg font-bold" : ""}`}>
              {formatCurrency(pt.overdraft, 0)}
            </td>
            <td className="py-1.5 px-3 text-right text-text-muted">{formatCurrency(pt.buffer, 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const lastTickTime = chartData[chartData.length - 1]?.time;
  const hourCaption =
    chartData.length === 0
      ? "Hour 0 of 16, awaiting 17:00 decision"
      : `Hour ${chartData.length} of 16, last tick ${lastTickTime}`;

  return (
    <ChartFrame
      title="Overnight Liquidity Progression"
      units="$M USD"
      period="17:00 – 08:00 (15h)"
      lastUpdated={lastTickTime}
      tableAlternative={chartData.length > 0 ? tableAlternative : undefined}
      headerAction={
        <div className="flex items-center gap-3 text-2xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#0284c7]" />
            <span className="text-text-secondary">Tier 0 Cash</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#38bdf8]" />
            <span className="text-text-secondary">Tier 1 Repo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#b91c1c]" />
            <span className="text-text-secondary">Overdraft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-[#b45309]" />
            <span className="text-text-secondary">Buffer</span>
          </div>
        </div>
      }
    >
      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center h-[280px] sm:h-[320px] bg-subtle/30 rounded-sm border border-dashed border-border-subtle p-6">
          <ChartIcon className="w-8 h-8 text-text-muted mb-3" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-text-primary">Live Overnight Liquidity Progression</h4>
          <p className="text-xs text-text-secondary mt-1 max-w-sm">
            Awaiting simulation ticks. Cash balance, repo sweep, and overdraft drawdowns will stream here hour-by-hour (17:00 to 08:00).
          </p>
        </div>
      ) : (
        <div role="region" className="h-[280px] sm:h-[320px] w-full pt-1" tabIndex={0} aria-label="Overnight Liquidity Chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 5, bottom: 0 }}>
            <XAxis
              dataKey="time"
              stroke="var(--text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={11}
              tickFormatter={(val) => formatMillions(val, 0)}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              domain={[0, "auto"]}
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
                      <div className="font-bold border-b border-border-subtle pb-1 text-text-primary flex justify-between gap-4">
                        <span>Time: {data.time}</span>
                        <span className="text-text-muted capitalize">{data.phase}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-accent-primary">
                        <span>Tier 0 Cash:</span>
                        <span className="font-bold tabular-nums">{formatCurrency(data.cash, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-sky-500">
                        <span>Tier 1 Repo:</span>
                        <span className="font-bold tabular-nums">{formatCurrency(data.repo, 0)}</span>
                      </div>
                      {data.overdraft > 0 && (
                        <div className="flex justify-between gap-4 text-neg font-bold">
                          <span>Overdraft Drawn:</span>
                          <span className="tabular-nums">{formatCurrency(data.overdraft, 0)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4 text-warn border-t border-border-subtle pt-0.5 text-2xs">
                        <span>Allocated Buffer:</span>
                        <span className="tabular-nums">{formatCurrency(data.buffer, 0)}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Horizontal Buffer Target Line */}
            {bufferUsd > 0 && (
              <ReferenceLine
                y={bufferUsd}
                stroke="#b45309"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Buffer: ${formatMillions(bufferUsd, 1)}`,
                  fill: "var(--text-muted)",
                  fontSize: 10,
                  position: "top",
                }}
              />
            )}

            {/* Vertical repo break markers */}
            {breakEvents.map((ev, i) => {
              const timeStr = ev.ts.slice(11, 16);
              return (
                <ReferenceLine
                  key={`break-${i}`}
                  x={timeStr}
                  stroke="#b45309"
                  strokeWidth={2}
                  strokeDasharray="2 2"
                  label={{
                    value: "Repo Break",
                    fill: "#b45309",
                    fontSize: 9,
                    position: "insideTopLeft",
                  }}
                />
              );
            })}

            {/* Vertical overdraft markers */}
            {overdraftEvents.map((ev, i) => {
              const timeStr = ev.ts.slice(11, 16);
              return (
                <ReferenceLine
                  key={`od-${i}`}
                  x={timeStr}
                  stroke="#b91c1c"
                  strokeWidth={2}
                  label={{
                    value: "Overdraft",
                    fill: "#b91c1c",
                    fontSize: 9,
                    position: "insideTopRight",
                  }}
                />
              );
            })}

            {/* Flat repo area (no gradient) */}
            <Area
              type="monotone"
              dataKey="repo"
              stroke="#0284c7"
              strokeWidth={1.5}
              fill="#38bdf8"
              fillOpacity={0.15}
              isAnimationActive={false}
            />

            {/* Cash progression line */}
            <Line
              type="monotone"
              dataKey="cash"
              stroke="#0284c7"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: "#0284c7" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="overdraft"
              stroke="#b91c1c"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Small caption under the chart derived only from received ticks */}
      <div className="mt-2 pt-2 border-t border-border-subtle flex items-center justify-between text-2xs text-text-muted font-mono">
        <span className="font-semibold text-text-secondary">
          {hourCaption}
        </span>
        <span className="hidden sm:inline">15-hour overnight simulation (17:00 – 08:00)</span>
      </div>
    </ChartFrame>
  );
};

export default NightChart;
