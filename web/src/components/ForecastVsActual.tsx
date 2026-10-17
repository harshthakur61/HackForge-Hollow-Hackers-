/**
 * ForecastVsActual.tsx: Comparative bar chart of forecast buffer vs actual required buffer
 * per settled night (last 30 nights). Covered nights vs short nights are distinguished
 * by visual SVG hatch patterns as well as distinct colors (accessible).
 */

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";

export const ForecastVsActual: React.FC = () => {
  const settledHistory = useReplayStore((s) => s.settledHistory);

  // Take the last 30 settled nights
  const recentHistory = settledHistory.slice(-30);

  const chartData = recentHistory.map((h) => ({
    date: h.night_date.slice(5), // MM-DD
    fullDate: h.night_date,
    forecastBuffer: h.forecast_buffer_usd,
    actualRequired: h.actual_required_usd,
    covered: h.covered,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center h-[340px]">
        <BarChart3 className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <h3 className="text-sm font-semibold text-foreground">Forecast Buffer vs Actual Required</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Awaiting settled nights. Each night's allocated buffer vs actual overnight liquidity drawdown will appear here with pattern-coded coverage indicators.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
      {/* SVG Pattern Definitions for Accessible Non-Color Coding */}
      <svg className="h-0 w-0 absolute">
        <defs>
          <pattern
            id="shortPattern"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="2.5" />
          </pattern>
        </defs>
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Forecast Buffer vs Actual Required ({chartData.length} Nights)
          </h3>
        </div>

        {/* Pattern Legend Indicator */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-primary/80" />
            <span className="text-muted-foreground text-[11px]">Allocated Buffer</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-500/80" />
            <span className="text-muted-foreground text-[11px]">Covered Drawdown</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-xs border border-red-500"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #ef4444, #ef4444 1.5px, transparent 1.5px, transparent 4px)",
              }}
            />
            <span className="text-danger font-medium text-[11px]">Shortfall (Patterned)</span>
          </div>
        </div>
      </div>

      <div className="h-[280px] sm:h-[320px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickFormatter={(val) => formatMillions(val, 1)}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-card border border-border p-3 rounded-lg shadow-lg text-xs font-mono space-y-1">
                      <div className="font-bold text-foreground border-b border-border pb-1">
                        Night: {data.fullDate}
                      </div>
                      <div className="text-primary flex justify-between gap-4">
                        <span>Forecast Buffer:</span>
                        <span className="font-bold">{formatCurrency(data.forecastBuffer)}</span>
                      </div>
                      <div className="text-foreground flex justify-between gap-4">
                        <span>Actual Required:</span>
                        <span className="font-bold">{formatCurrency(data.actualRequired)}</span>
                      </div>
                      <div className="flex justify-between gap-4 pt-1 border-t border-border">
                        <span>Status:</span>
                        <span
                          className={`font-bold ${
                            data.covered ? "text-success" : "text-danger"
                          }`}
                        >
                          {data.covered ? "Covered" : "Shortfall Incurred"}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend verticalAlign="bottom" height={24} />

            {/* Forecast Buffer Bar */}
            <Bar
              dataKey="forecastBuffer"
              name="Forecast Buffer"
              fill="rgba(37, 99, 235, 0.7)"
              radius={[3, 3, 0, 0]}
            />

            {/* Actual Required Bar (Striped for shortfall, solid for covered) */}
            <Bar
              dataKey="actualRequired"
              name="Actual Required Drawdown"
              radius={[3, 3, 0, 0]}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.covered ? "rgba(16, 185, 129, 0.75)" : "url(#shortPattern)"}
                  stroke={entry.covered ? "#10b981" : "#ef4444"}
                  strokeWidth={entry.covered ? 1 : 1.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
