import React from "react";
import Tooltip from "./Tooltip";

export interface StatProps {
  label: string;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
  tooltip?: string;
  isPrimary?: boolean;
  className?: string;
  badge?: React.ReactNode;
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  subvalue,
  tooltip,
  isPrimary = false,
  className = "",
  badge,
}) => {
  return (
    <div
      className={`flex flex-col justify-between ${
        isPrimary
          ? "p-3 sm:p-4 rounded-md border border-accent-primary/30 bg-accent-subtle/20"
          : "p-2.5 sm:p-3 rounded-sm border border-border-subtle bg-surface"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span className="text-2xs sm:text-xs font-medium text-text-secondary uppercase tracking-wider truncate flex items-center gap-1">
          {label}
          {tooltip && <Tooltip content={tooltip} title={label} />}
        </span>
        {badge}
      </div>

      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div
          className={`tabular-nums font-bold tracking-tight text-text-primary ${
            isPrimary ? "text-xl sm:text-2xl" : "text-base sm:text-lg"
          }`}
        >
          {value}
        </div>
        {subvalue && (
          <div className="text-xs text-text-muted tabular-nums whitespace-nowrap">
            {subvalue}
          </div>
        )}
      </div>
    </div>
  );
};

export default Stat;
