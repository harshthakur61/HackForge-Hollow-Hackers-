import React from "react";

export type BadgeVariant =
  | "default"
  | "neutral"
  | "pos"
  | "neg"
  | "warn"
  | "info"
  | "accent";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  size = "md",
  className = "",
  title,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "pos":
        return "bg-pos-bg text-pos border-pos/30";
      case "neg":
        return "bg-neg-bg text-neg border-neg/30";
      case "warn":
        return "bg-warn-bg text-warn border-warn/30";
      case "info":
        return "bg-info-bg text-info border-info/30";
      case "accent":
        return "bg-accent-subtle text-accent-primary border-accent-primary/30";
      case "neutral":
      case "default":
      default:
        return "bg-subtle text-text-secondary border-border-subtle";
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return "px-1.5 py-0.5 text-2xs";
      case "md":
      default:
        return "px-2 py-0.5 text-xs";
    }
  };

  return (
    <span
      title={title}
      className={`inline-flex items-center font-medium border rounded-xs whitespace-nowrap leading-none tabular-nums ${getVariantStyles()} ${getSizeStyles()} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
