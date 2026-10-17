/**
 * NightChart.tsx: Real-time Recharts overnight liquidity chart (17:00 to 08:00).
 * Renders Cash line, Repo area, Overdraft line, Horizontal Buffer reference line,
 * and vertical markers for repo_break / overdraft events.
 * Never renders points that have not been received yet.
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
  Legend,
  ReferenceLine,
} from "recharts";
import { LineChart as ChartIcon } from "lucide-react";
import { useReplayStore, selectNightChartData } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";

export const NightChart: React.FC = () => {
  const currentNight = useReplayStore((s) => s.currentNight);
  const chartData = selectNightChartData(currentNight);
  const decision = currentNight.decision?.decision;
  const bufferUsd = decision?.buffer_usd ?? 0;
  const events = currentNight.events;

  // Filter repo break and overdraft events for vertical markers
  const breakEvents = events.filter((e) => e.type === "repo_break");
  const overdraftEvents = events.filter((e) => e.type === "overdraft");

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center h-[340px]">
        <ChartIcon className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <h3 className="text-sm font-semibold text-foreground">Live Overnight Liquidity Trace</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Awaiting simulation ticks. Cash balance, repo sweep, and overdraft drawdowns will stream here hour-by-hour (17:00 to 08:00).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChartIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Live Overnight Liquidity Progression (17:00 – 08:00)
          </h3>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {chartData.length} of 16 hours received
          </span>
        </div>

        {/* Legend notes */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-muted-foreground text-[11px]">Tier 0 Cash</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="text-muted-foreground text-[11px]">Tier 1 Repo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-muted-foreground text-[11px]">Overdraft</span>
          </div>
        </div>
      </div>

      <div className="h-[280px] sm:h-[320px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickFormatter={(val) => formatMillions(val, 0)}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-card border border-border p-2.5 rounded-lg shadow-lg text-xs font-mono space-y-1">
                      <div className="font-bold text-foreground border-b border-border pb-1">
                        Hour: {label} ({data.phase === "night" ? "Night" : "Day"})
                      </div>
                      <div className="text-primary flex justify-between gap-4">
                        <span>Cash:</span>
                        <span className="font-bold">{formatCurrency(data.cash)}</span>
                      </div>
                      <div className="text-sky-400 flex justify-between gap-4">
                        <span>Repo:</span>
                        <span className="font-bold">{formatCurrency(data.repo)}</span>
                      </div>
                      {data.overdraft > 0 && (
                        <div className="text-danger flex justify-between gap-4">
                          <span>Overdraft:</span>
                          <span className="font-bold">{formatCurrency(data.overdraft)}</span>
                        </div>
                      )}
                      <div className="text-muted-foreground flex justify-between gap-4 pt-1 border-t border-border">
                        <span>Buffer:</span>
                        <span>{formatCurrency(data.buffer)}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend verticalAlign="bottom" height={24} />

            {/* Horizontal Buffer Reference Line */}
            {bufferUsd > 0 && (
              <ReferenceLine
                y={bufferUsd}
                stroke="#3b82f6"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Buffer: ${formatMillions(bufferUsd, 1)}`,
                  fill: "#3b82f6",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
            )}

            {/* Vertical Event Markers */}
            {breakEvents.map((e, idx) => {
              const time = e.ts.slice(11, 16);
              return (
                <ReferenceLine
                  key={`break-${idx}`}
                  x={time}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  label={{
                    value: "Repo Break",
                    fill: "#ef4444",
                    fontSize: 9,
                    position: "insideTopLeft",
                  }}
                />
              );
            })}

            {overdraftEvents.map((e, idx) => {
              const time = e.ts.slice(11, 16);
              return (
                <ReferenceLine
                  key={`od-${idx}`}
                  x={time}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="2 2"
                  label={{
                    value: "Overdraft",
                    fill: "#dc2626",
                    fontSize: 9,
                    position: "insideTopRight",
                  }}
                />
              );
            })}

            {/* Repo Area */}
            <Area
              type="monotone"
              dataKey="repo"
              name="Tier 1 Repo"
              fill="rgba(56, 189, 248, 0.2)"
              stroke="#38bdf8"
              strokeWidth={2}
            />

            {/* Cash Line */}
            <Line
              type="monotone"
              dataKey="cash"
              name="Tier 0 Cash"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#2563eb" }}
              activeDot={{ r: 5 }}
            />

            {/* Overdraft Line */}
            <Line
              type="monotone"
              dataKey="overdraft"
              name="Emergency Overdraft"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3, fill: "#ef4444" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
