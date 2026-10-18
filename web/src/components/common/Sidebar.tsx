import React from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Layers,
  BarChart3,
  Sliders,
  FileText,
  BookOpen,
  Shield,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "nav-live",
    label: "Live Treasury",
    path: "/",
    icon: Activity,
  },
  {
    id: "nav-sleeve",
    label: "Strategic Sleeve",
    path: "/sleeve",
    icon: Layers,
  },
  {
    id: "nav-strategies",
    label: "Strategy Performance",
    path: "/strategies",
    icon: BarChart3,
  },
  {
    id: "nav-stress",
    label: "Stress Lab",
    path: "/stress",
    icon: Sliders,
  },
  {
    id: "nav-decisions",
    label: "Decision Log",
    path: "/decisions",
    icon: FileText,
  },
  {
    id: "nav-methodology",
    label: "Methodology",
    path: "/methodology",
    icon: BookOpen,
  },
];

export interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onNavigate,
  className = "",
}) => {
  return (
    <aside
      aria-label="Primary Navigation"
      className={`w-64 bg-surface border-r border-border-subtle flex flex-col h-full ${className}`}
    >
      {/* Brand Header */}
      <div className="h-14 px-5 border-b border-border-subtle flex items-center gap-3">
        <div className="w-7 h-7 rounded-xs bg-accent-subtle border border-accent-primary/30 flex items-center justify-center text-accent-primary">
          <Shield className="w-4 h-4" aria-hidden="true" />
        </div>
        <div>
          <span className="text-sm font-bold tracking-tight text-text-primary block leading-none">
            Reserve Juggler
          </span>
          <span className="text-2xs text-text-muted mt-0.5 block leading-none">
            Institutional Treasury Console
          </span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-2 pb-2 text-2xs font-semibold uppercase tracking-wider text-text-muted">
          Operations
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              id={item.id}
              to={item.path}
              end={item.path === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-sm text-xs font-medium transition-colors duration-100 ${
                  isActive
                    ? "bg-accent-subtle text-accent-primary font-semibold border-l-2 border-accent-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-subtle"
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="px-1.5 py-0.2 rounded-xs text-2xs bg-subtle text-text-muted border border-border-subtle font-mono">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Institutional Metadata Footer */}
      <div className="p-4 border-t border-border-subtle bg-subtle/30 text-2xs text-text-muted space-y-1">
        <div className="flex items-center justify-between">
          <span>Tier 0 & Tier 1 Repo</span>
          <span className="font-mono text-text-secondary">v1.0.0</span>
        </div>
        <div>Replay Engine: Active</div>
      </div>
    </aside>
  );
};

export default Sidebar;
