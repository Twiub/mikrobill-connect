/**
 * AdminSidebar.tsx — WiFi Billing Edition (Stripped)
 */

import { Link, useLocation } from "react-router-dom";
import { useBranding } from "@/hooks/useBranding";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, Package, Receipt, Activity, TicketCheck, Router, Wifi,
  Shield, BarChart3, AlertTriangle, Brain, DollarSign, Bell, Clock,
  Link2, ShieldAlert, UserCog, Settings, Monitor, LogOut, Database, Gauge, Terminal,
  Globe, BarChart2, Zap, Home,
} from "lucide-react";

const ALL_NAV_ITEMS = [
  { path: "/",               icon: LayoutDashboard, label: "Dashboard" },
  { path: "/users",          icon: Users,           label: "Subscribers" },
  { path: "/packages",       icon: Package,         label: "Packages" },
  { path: "/transactions",   icon: Receipt,         label: "Transactions" },
  { path: "/sessions",       icon: Activity,        label: "Active Sessions" },
  { path: "/tickets",        icon: TicketCheck,     label: "Tickets" },
  { path: "/routers",        icon: Router,          label: "MikroTik Routers" },
  { path: "/network",        icon: Monitor,         label: "Network Monitor" },
  { path: "/ip-pools",       icon: Database,        label: "IP Pools" },
  { path: "/qos",            icon: Gauge,           label: "QoS / CAKE" },
  { path: "/autorate",       icon: Activity,        label: "AutoRate Monitor" },
  { path: "/mikrotik-scripts", icon: Terminal,       label: "MikroTik Scripts" },
  { path: "/network-hierarchy", icon: Globe,        label: "Networks & Clouds" },
  { path: "/analytics",      icon: BarChart3,       label: "Analytics" },
  { path: "/ai-health",      icon: Brain,           label: "AI Health" },
  { path: "/ai-settings",    icon: Zap,             label: "AI Settings" },
  { path: "/pppoe-accounts", icon: Home,            label: "PPPoE Portal Mgmt" },
  { path: "/error-logs",     icon: AlertTriangle,   label: "Error Logs" },
  { path: "/expenditure",    icon: DollarSign,      label: "Expenditure" },
  { path: "/bandwidth",      icon: Clock,           label: "Bandwidth Schedules" },
  { path: "/ip-binding",     icon: Link2,           label: "IP/MAC Binding" },
  { path: "/sharing",        icon: ShieldAlert,     label: "Anti-Sharing" },
  { path: "/kyc",            icon: BarChart2,        label: "KYC Compliance" },
  { path: "/notifications",  icon: Bell,            label: "Notifications" },
  { path: "/admin-roles",    icon: UserCog,         label: "Admin Roles" },
  { path: "/settings",       icon: Settings,        label: "Settings" },
  { path: "/vouchers",       icon: BarChart2,       label: "Vouchers" },
];

interface AdminSidebarProps {
  onNavClick?: () => void;
}

const AdminSidebar = ({ onNavClick }: AdminSidebarProps) => {
  const location = useLocation();
  const { user, userRole, signOut } = useAuth();
  const { branding } = useBranding();
  const roleLabel = userRole?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? "Admin";

  return (
    <aside className="h-full w-full bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border shrink-0">
        <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Wifi className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight truncate">
            {branding.company_name}
          </h1>
          <p className="text-[10px] text-sidebar-foreground font-mono truncate">
            {branding.company_tagline} {branding.company_version}
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
        {ALL_NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavClick}
              aria-current={isActive ? "page" : undefined}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all duration-150",
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              ].join(" ")}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border space-y-1 shrink-0">
        <Link
          to="/hotspot"
          onClick={onNavClick}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Captive Portal</span>
        </Link>
        <Link
          to="/portal"
          onClick={onNavClick}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>User Portal</span>
        </Link>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-sidebar-accent-foreground">{roleLabel}</p>
              <p className="text-[10px] text-sidebar-foreground truncate max-w-[120px]">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            aria-label={`Sign out (${user?.email})`}
            title="Sign out"
            className="p-1.5 rounded-md text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
