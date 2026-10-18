import React from "react";

export interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  padding?: "none" | "compact" | "normal" | "spacious";
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  id?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  badge,
  action,
  children,
  footer,
  padding = "normal",
  className = "",
  headerClassName = "",
  bodyClassName = "",
  id,
}) => {
  const paddingMap = {
    none: "",
    compact: "p-3",
    normal: "p-4 sm:p-5",
    spacious: "p-6",
  };

  const hasHeader = Boolean(title || subtitle || badge || action);

  return (
    <section
      id={id}
      className={`bg-surface border border-border-subtle rounded-md overflow-hidden flex flex-col ${className}`}
    >
      {hasHeader && (
        <div
          className={`px-4 py-3 sm:px-5 border-b border-border-subtle flex items-center justify-between gap-3 bg-surface/50 ${headerClassName}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {typeof title === "string" ? (
                <h3 className="text-sm font-semibold text-text-primary tracking-tight truncate">
                  {title}
                </h3>
              ) : (
                title
              )}
              {badge}
            </div>
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
        </div>
      )}

      <div className={`flex-1 ${paddingMap[padding]} ${bodyClassName}`}>
        {children}
      </div>

      {footer && (
        <div className="px-4 py-2.5 sm:px-5 border-t border-border-subtle bg-subtle/40 text-xs text-text-secondary">
          {footer}
        </div>
      )}
    </section>
  );
};

export default Card;
