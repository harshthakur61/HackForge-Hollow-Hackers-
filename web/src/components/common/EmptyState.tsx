import React from "react";
import { Inbox } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center border border-dashed border-border-subtle rounded-md bg-subtle/30 ${className}`}
    >
      <div className="p-2.5 rounded-full bg-subtle text-text-muted mb-3">
        {icon || <Inbox className="w-5 h-5" aria-hidden="true" />}
      </div>
      <h4 className="text-sm font-semibold text-text-primary mb-1">
        {title}
      </h4>
      <p className="text-xs text-text-secondary max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};

export default EmptyState;
