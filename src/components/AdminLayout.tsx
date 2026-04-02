/**
 * AdminLayout.tsx — v4.0.0
 * Responsive sidebar with mobile drawer.
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

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), []);

  return (
    <AdminErrorBoundary>
      <div className="min-h-screen bg-background">
        <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 gap-3">
          <button onClick={toggleSidebar} aria-label={sidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen} className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0"><Wifi className="h-4 w-4 text-primary" /></div>
            <span className="text-sm font-bold text-sidebar-accent-foreground truncate">{branding.company_name}</span>
          </div>
        </header>
        {sidebarOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={closeSidebar} aria-hidden="true" />}
        <div className={["fixed top-0 left-0 z-50 h-screen w-72 lg:w-64", "transition-transform duration-200 ease-out", "lg:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full"].join(" ")}>
          <AdminSidebar onNavClick={closeSidebar} />
        </div>
        <main className="lg:ml-64 pt-14 lg:pt-0 p-4 sm:p-5 lg:p-6 min-h-screen">
          <PanelErrorBoundary title="Page">{children}</PanelErrorBoundary>
        </main>
      </div>
    </AdminErrorBoundary>
  );
};

export default AdminLayout;
