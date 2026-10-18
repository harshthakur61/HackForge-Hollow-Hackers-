import React from "react";
import { formatPercent, formatBps } from "../../utils/formatters";

export interface PercentProps {
  value: number | null | undefined;
  decimals?: number;
  isFraction?: boolean;
  isBps?: boolean;
  showSign?: boolean;
  className?: string;
}

export const Percent: React.FC<PercentProps> = ({
  value,
  decimals = 1,
  isFraction = false,
  isBps = false,
  showSign = false,
  className = "",
}) => {
  if (value === null || value === undefined || isNaN(value)) {
    return <span className={`tabular-nums text-text-muted ${className}`}>—</span>;
  }

  if (isBps) {
    return (
      <span className={`tabular-nums ${className}`}>
        {formatBps(value, decimals)}
      </span>
    );
  }

  const sign = showSign && value > 0 ? "+" : "";
  const formatted = formatPercent(value, decimals, isFraction);

  return (
    <span className={`tabular-nums ${className}`}>
      {sign}
      {formatted}
    </span>
  );
};

export default Percent;
