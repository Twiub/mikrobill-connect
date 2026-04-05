/**
 * AdminLayout.tsx — v4.0.0
 *
 * FIXES:
 *  - MOBILE-01: Hard-coded ml-64 replaced with responsive layout.
 *    On mobile (< lg) the sidebar is hidden; a hamburger button in a top bar
 *    opens it as an overlay drawer with smooth slide-in animation.
 *  - MOBILE-02: Added top bar for mobile with branding + hamburger toggle.
 *  - MOBILE-03: Clicking a nav link on mobile auto-closes the sidebar.
 *  - MOBILE-04: Overlay backdrop dims content when sidebar is open on mobile.
 *  - PERF-01: Content area uses CSS transition for instant perceived response.
 */

import { ReactNode, useState, useCallback, useEffect } from "react";
import AdminSidebar from "./AdminSidebar";
import { AdminErrorBoundary, PanelErrorBoundary } from "./ErrorBoundary";
import { Menu, X, Wifi } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { useLocation } from "react-router-dom";

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { branding } = useBranding();
  const location = useLocation();

  // Close sidebar on route change (mobile nav tap)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), []);

  return (
    <AdminErrorBoundary>
      <div className="min-h-screen bg-background">

        {/* Mobile top bar (hidden on lg+) */}
        <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 gap-3">
          <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
            className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Wifi className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold text-sidebar-accent-foreground truncate">
              {branding.company_name}
            </span>
          </div>
        </header>

        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar — desktop: always visible; mobile: slide-in drawer */}
        <div
          className={[
            "fixed top-0 left-0 z-50 h-screen w-72 lg:w-64",
            "transition-transform duration-200 ease-out",
            "lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <AdminSidebar onNavClick={closeSidebar} />
        </div>

        {/* Main content — pt-14 on mobile clears fixed top bar */}
        <main className="lg:ml-64 pt-[4.5rem] lg:pt-6 px-4 pb-4 sm:px-5 sm:pb-5 lg:px-6 lg:pb-6 min-h-screen">
          <PanelErrorBoundary title="Page">
            {children}
          </PanelErrorBoundary>
        </main>

      </div>
    </AdminErrorBoundary>
  );
};

export default AdminLayout;
