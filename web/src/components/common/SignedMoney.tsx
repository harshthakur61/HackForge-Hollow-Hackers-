import React from "react";
import { formatCurrency, formatMillions } from "../../utils/formatters";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export interface SignedMoneyProps {
  value: number | null | undefined;
  decimals?: number;
  compact?: boolean;
  showIcon?: boolean;
  className?: string;
}

export const SignedMoney: React.FC<SignedMoneyProps> = ({
  value,
  decimals,
  compact = false,
  showIcon = true,
  className = "",
}) => {
  if (value === null || value === undefined || isNaN(value)) {
    return <span className={`tabular-nums text-text-muted ${className}`}>—</span>;
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  const isZero = value === 0;

  const absVal = Math.abs(value);
  const formattedVal = compact
    ? formatMillions(absVal, decimals ?? 1)
    : formatCurrency(absVal, decimals ?? 2);

  let colorClass = "text-text-primary";
  let sign = "";
  let Icon = Minus;

  if (isPositive) {
    colorClass = "text-pos";
    sign = "+";
    Icon = ArrowUpRight;
  } else if (isNegative) {
    colorClass = "text-neg";
    sign = "-";
    Icon = ArrowDownRight;
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums font-medium ${colorClass} ${className}`}
    >
      {showIcon && !isZero && (
        <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      )}
      <span>
        {sign}
        {formattedVal}
      </span>
    </span>
  );
};

export default SignedMoney;
