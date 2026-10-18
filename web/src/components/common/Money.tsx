import React from "react";
import { formatCurrency, formatMillions } from "../../utils/formatters";

export interface MoneyProps {
  value: number | null | undefined;
  decimals?: number;
  compact?: boolean;
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  value,
  decimals,
  compact = false,
  className = "",
}) => {
  if (value === null || value === undefined || isNaN(value)) {
    return <span className={`tabular-nums text-text-muted ${className}`}>—</span>;
  }

  const formatted = compact
    ? formatMillions(value, decimals ?? 1)
    : formatCurrency(value, decimals ?? 2);

  return (
    <span className={`tabular-nums ${className}`}>
      {formatted}
    </span>
  );
};

export default Money;
