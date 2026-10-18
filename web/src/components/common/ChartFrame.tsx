import React, { useState } from "react";
import { Table, LineChart as ChartIcon } from "lucide-react";

export interface ChartFrameProps {
  title: string;
  subtitle?: string;
  units?: string;
  period?: string;
  lastUpdated?: string;
  children: React.ReactNode;
  tableAlternative?: React.ReactNode;
  headerAction?: React.ReactNode;
  className?: string;
}

export const ChartFrame: React.FC<ChartFrameProps> = ({
  title,
  subtitle,
  units,
  period,
  lastUpdated,
  children,
  tableAlternative,
  headerAction,
  className = "",
}) => {
  const [showTable, setShowTable] = useState(false);

  return (
    <section
      className={`bg-surface border border-border-subtle rounded-md overflow-hidden flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 sm:px-5 border-b border-border-subtle flex items-center justify-between gap-3 bg-surface/50">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary tracking-tight truncate">
              {title}
            </h3>
            {units && (
              <span className="text-2xs font-medium px-1.5 py-0.5 rounded-xs bg-subtle text-text-muted border border-border-subtle">
                {units}
              </span>
            )}
            {period && (
              <span className="text-2xs font-medium px-1.5 py-0.5 rounded-xs bg-subtle text-text-secondary border border-border-subtle">
                {period}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {headerAction}

          {tableAlternative && (
            <button
              type="button"
              onClick={() => setShowTable((prev) => !prev)}
              aria-label={showTable ? "Switch to chart view" : "Switch to data table view"}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm border border-border-subtle bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              {showTable ? (
                <>
                  <ChartIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Chart view</span>
                </>
              ) : (
                <>
                  <Table className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">View as table</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 p-4 sm:p-5">
        {tableAlternative && (
          <div className={showTable ? "block overflow-x-auto max-h-80 focus:outline-none" : "hidden"}>
            {tableAlternative}
          </div>
        )}
        <div className={showTable ? "hidden" : "block"}>
          {children}
        </div>
      </div>

      {/* Footer Info */}
      {lastUpdated && (
        <div className="px-4 py-2 sm:px-5 border-t border-border-subtle bg-subtle/30 text-2xs text-text-muted flex items-center justify-between">
          <span>Simulation window: 17:00 – 08:00</span>
          <span>Last released: {lastUpdated}</span>
        </div>
      )}
    </section>
  );
};

export default ChartFrame;
