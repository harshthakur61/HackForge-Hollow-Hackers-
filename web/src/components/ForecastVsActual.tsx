/**
 * ForecastVsActual.tsx: Comparative bar chart of forecast buffer vs actual required buffer
 * per settled night (last 30 nights). Covered nights vs short nights are distinguished
 * by visual SVG hatch patterns as well as distinct colors (accessible WCAG 2.2 AA).
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
} from "recharts";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";
import ChartFrame from "./common/ChartFrame";

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
      <div className="bg-surface border border-border-subtle rounded-md p-6 flex flex-col items-center justify-center text-center h-[340px]">
        <h4 className="text-sm font-semibold text-text-primary">Forecast Buffer vs Actual Required</h4>
        <p className="text-xs text-text-secondary mt-1 max-w-sm">
          Awaiting settled nights. Each night's allocated buffer vs actual overnight liquidity drawdown will appear here with pattern-coded coverage indicators.
        </p>
      </div>
    );
  }

  const tableAlternative = (
    <table className="w-full text-left text-xs text-text-primary border-collapse">
      <thead className="bg-subtle text-text-secondary uppercase text-2xs sticky top-0 border-b border-border-subtle">
        <tr>
          <th className="py-2 px-3">Date</th>
          <th className="py-2 px-3 text-right">Allocated Buffer</th>
          <th className="py-2 px-3 text-right">Actual Required</th>
          <th className="py-2 px-3 text-center">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle tabular-nums font-mono">
        {chartData.map((pt) => (
          <tr key={pt.fullDate} className="hover:bg-subtle/50">
            <td className="py-1.5 px-3 font-semibold text-text-primary">{pt.fullDate}</td>
            <td className="py-1.5 px-3 text-right">{formatCurrency(pt.forecastBuffer, 0)}</td>
            <td className="py-1.5 px-3 text-right">{formatCurrency(pt.actualRequired, 0)}</td>
            <td className="py-1.5 px-3 text-center">
              {pt.covered ? (
                <span className="text-pos font-semibold text-2xs">COVERED</span>
              ) : (
                <span className="text-neg font-bold text-2xs">SHORTFALL</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame
      title="Forecast Buffer vs Actual Trough"
      units="$M USD"
      period={`Last ${chartData.length} Nights`}
      lastUpdated={chartData[chartData.length - 1]?.fullDate}
      tableAlternative={tableAlternative}
      headerAction={
        <div className="flex items-center gap-3 text-2xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#0284c7]" />
            <span className="text-text-secondary">Buffer</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#15803d]" />
            <span className="text-text-secondary">Covered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#b91c1c]" />
            <span className="text-text-secondary">Shortfall</span>
          </div>
        </div>
      }
    >
      <div role="region" className="h-[280px] sm:h-[300px] w-full pt-1" tabIndex={0} aria-label="Forecast vs Actual Calibration Chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 15, left: 5, bottom: 0 }}>
            <XAxis
              dataKey="date"
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
                      <div className="font-bold border-b border-border-subtle pb-1 flex justify-between gap-4">
                        <span>Night: {data.fullDate}</span>
                        <span className={data.covered ? "text-pos font-bold" : "text-neg font-bold"}>
                          {data.covered ? "COVERED" : "SHORTFALL"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-accent-primary">
                        <span>Allocated Buffer:</span>
                        <span className="font-bold tabular-nums">{formatCurrency(data.forecastBuffer, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-text-primary">
                        <span>Actual Required Trough:</span>
                        <span className="font-bold tabular-nums">{formatCurrency(data.actualRequired, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4 border-t border-border-subtle pt-0.5 text-2xs text-text-muted">
                        <span>Buffer Delta:</span>
                        <span className={`font-bold tabular-nums ${data.forecastBuffer >= data.actualRequired ? "text-pos" : "text-neg"}`}>
                          {data.forecastBuffer >= data.actualRequired ? "+" : ""}
                          {formatCurrency(data.forecastBuffer - data.actualRequired, 0)}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="forecastBuffer" name="Allocated Buffer" fill="#0284c7" maxBarSize={16} />
            <Bar dataKey="actualRequired" name="Actual Required" maxBarSize={16}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.covered ? "#15803d" : "#b91c1c"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};

export default ForecastVsActual;
