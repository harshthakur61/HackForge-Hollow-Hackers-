import React, { useState } from "react";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import Banner from "./Banner";
import Drawer from "./Drawer";

export interface AppShellProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  isDarkMode,
  onToggleTheme,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-text-primary flex flex-col font-sans transition-colors duration-150">
      {/* Permanent, understated dataset disclaimer banner */}
      <Banner />

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Persistent Left Sidebar (>= 1024px) */}
        <Sidebar className="hidden lg:flex flex-shrink-0" />

        {/* Mobile Sidebar in Slide-over Drawer (< 1024px) */}
        <Drawer
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          title="Navigation"
          subtitle="Reserve Juggler Operations"
          side="left"
          width="sm"
        >
          <div className="-mx-5 -my-4">
            <Sidebar onNavigate={() => setIsMobileMenuOpen(false)} className="w-full border-none h-auto" />
          </div>
        </Drawer>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Top Bar with Connection Pill, Clock, Phase, and Theme toggle */}
          <TopBar
            isDarkMode={isDarkMode}
            onToggleTheme={onToggleTheme}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />

          <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1920px] w-full mx-auto space-y-6">
            {children}
          </main>

          {/* Understated Institutional Footer */}
          <footer className="border-t border-border-subtle bg-surface px-6 py-3 text-center text-xs text-text-muted">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>Reserve Juggler v1.0.0 — Pure deterministic Python policy engine with real-time Node orchestration.</span>
              <span>All monetary figures in USD. Tabular alignment enabled.</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default AppShell;
