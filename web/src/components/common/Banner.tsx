import React from "react";
import { Info } from "lucide-react";

export interface BannerProps {
  message?: string;
  className?: string;
}

export const Banner: React.FC<BannerProps> = ({
  message = "Backtest replay of the provided dataset. Daytime hours are not simulated; the pool is replenished externally.",
  className = "",
}) => {
  return (
    <div
      role="region"
      aria-label="Simulation Scope Disclaimer"
      className={`w-full bg-subtle border-b border-border-subtle px-4 py-2 text-xs text-text-secondary flex items-center justify-center gap-2 ${className}`}
    >
      <Info className="w-3.5 h-3.5 text-text-muted flex-shrink-0" aria-hidden="true" />
      <span className="text-center font-normal tracking-wide">
        {message}
      </span>
    </div>
  );
};

export default Banner;
