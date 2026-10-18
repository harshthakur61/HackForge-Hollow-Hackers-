import React, { useState, useId } from "react";
import { HelpCircle } from "lucide-react";

export interface TooltipProps {
  content: React.ReactNode;
  children?: React.ReactNode;
  title?: string;
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  title,
  placement = "top",
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  const getPositionClasses = () => {
    switch (placement) {
      case "bottom":
        return "top-full left-1/2 -translate-x-1/2 mt-1.5";
      case "left":
        return "right-full top-1/2 -translate-y-1/2 mr-1.5";
      case "right":
        return "left-full top-1/2 -translate-y-1/2 ml-1.5";
      case "top":
      default:
        return "bottom-full left-1/2 -translate-x-1/2 mb-1.5";
    }
  };

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children ? (
        <span
          aria-describedby={isVisible ? tooltipId : undefined}
          tabIndex={0}
          className="inline-flex items-center cursor-help focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary rounded-xs"
        >
          {children}
        </span>
      ) : (
        <button
          type="button"
          aria-label={title || "Explanation tooltip"}
          aria-describedby={isVisible ? tooltipId : undefined}
          className="inline-flex items-center justify-center text-text-muted hover:text-text-secondary focus:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary rounded-xs p-0.5 ml-1 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {isVisible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-xs font-normal text-text-primary bg-surface border border-border-strong rounded-sm shadow-md max-w-xs pointer-events-none whitespace-normal leading-relaxed text-left ${getPositionClasses()}`}
        >
          {title && <span className="block font-semibold mb-0.5">{title}</span>}
          {content}
        </span>
      )}
    </span>
  );
};

export default Tooltip;
