/**
 * AdminSidebar.tsx — v4.0.0
 * Adapted for Supabase backend.
 */

import { Link, useLocation } from "react-router-dom";
import { useBranding } from "@/hooks/useBranding";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, Package, Receipt, Activity, TicketCheck, Router, Wifi,
  Shield, BarChart3, AlertTriangle, Brain, FileText, DollarSign, Bell, Clock,
  Link2, ShieldAlert, UserCog, Settings, MapPin, Monitor, LogOut, Map, Database, Gauge, Terminal,
  Radio, Globe, BarChart2, Zap, Home, Grid3x3,
} from "lucide-react";

const ALL_NAV_ITEMS = [
  { path: "/",               slug: "dashboard",        icon: LayoutDashboard, label: "Dashboard" },
  { path: "/users",          slug: "users",             icon: Users,           label: "Subscribers" },
  { path: "/packages",       slug: "packages",          icon: Package,         label: "Packages" },
  { path: "/transactions",   slug: "transactions",      icon: Receipt,         label: "Transactions" },
  { path: "/sessions",       slug: "sessions",          icon: Activity,        label: "Active Sessions" },
  { path: "/tickets",        slug: "tickets",           icon: TicketCheck,     label: "Tickets" },
  { path: "/ticket-map",     slug: "ticket-map",        icon: MapPin,          label: "Ticket Map" },
  { path: "/coverage-map",   slug: "coverage-map",      icon: Map,             label: "Coverage Map" },
  { path: "/routers",        slug: "routers",           icon: Router,          label: "MikroTik Routers" },
  { path: "/meshdesk",       slug: "meshdesk",          icon: Radio,           label: "MESHdesk" },
  { path: "/mesh-planner",   slug: "mesh-planner",      icon: Grid3x3,         label: "Mesh Node Planner" },
  { path: "/apdesk",         slug: "apdesk",            icon: Wifi,            label: "APdesk" },
  { path: "/network-hierarchy", slug: "network-hierarchy", icon: Globe,        label: "Networks & Clouds" },
  { path: "/network",        slug: "network",           icon: Monitor,         label: "Network Monitor" },
  { path: "/ip-pools",       slug: "ip-pools",          icon: Database,        label: "IP Pools" },
  { path: "/qos",            slug: "qos",               icon: Gauge,           label: "QoS / CAKE" },
  { path: "/autorate",       slug: "autorate",          icon: Activity,        label: "AutoRate Monitor" },
  { path: "/libreqos",       slug: "libreqos",          icon: BarChart2,       label: "LibreQoS" },
  { path: "/mikrotik-scripts", slug: "mikrotik-scripts",icon: Terminal,        label: "MikroTik Scripts" },
  { path: "/analytics",      slug: "analytics",         icon: BarChart3,       label: "Analytics" },
  { path: "/ai-health",           slug: "ai-health",           icon: Brain,   label: "AI Health" },
  { path: "/ai-settings",         slug: "ai-settings",         icon: Zap,     label: "AI Settings" },
  { path: "/proximity-campaigns", slug: "proximity-campaigns", icon: MapPin,  label: "Proximity Campaigns" },
  { path: "/pppoe-accounts",      slug: "pppoe-accounts",      icon: Home,    label: "PPPoE Portal Mgmt" },
  { path: "/error-logs",     slug: "error-logs",        icon: AlertTriangle,   label: "Error Logs" },
  { path: "/expenditure",    slug: "expenditure",       icon: DollarSign,      label: "Expenditure" },
  { path: "/bandwidth",      slug: "bandwidth",         icon: Clock,           label: "Bandwidth Schedules" },
  { path: "/ip-binding",     slug: "ip-binding",        icon: Link2,           label: "IP/MAC Binding" },
  { path: "/sharing",        slug: "sharing",           icon: ShieldAlert,     label: "Anti-Sharing" },
  { path: "/kyc",            slug: "kyc",               icon: FileText,        label: "KYC Compliance" },
  { path: "/notifications",  slug: "notifications",     icon: Bell,            label: "Notifications" },
  { path: "/vouchers",       slug: "vouchers",          icon: Receipt,         label: "Vouchers" },
  { path: "/hardware-models", slug: "hardware-models",  icon: Router,          label: "Hardware Models" },
  { path: "/admin-roles",    slug: "admin-roles",       icon: UserCog,         label: "Admin Roles" },
  { path: "/settings",       slug: "settings",          icon: Settings,        label: "Settings" },
];

interface AdminSidebarProps {
  onNavClick?: () => void;
}

const AdminSidebar = ({ onNavClick }: AdminSidebarProps) => {
  const location = useLocation();
  const { user, userRole, signOut } = useAuth();
  const { branding } = useBranding();
  const roleLabel = userRole?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? "Admin";

  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    const fetchPerms = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role, permissions")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (roleData?.role === "super_admin") {
          setPermissions(Object.fromEntries(ALL_NAV_ITEMS.map(i => [i.slug, true])));
        } else if (roleData?.permissions && Array.isArray(roleData.permissions)) {
          const perms: Record<string, boolean> = {};
          ALL_NAV_ITEMS.forEach(i => {
            perms[i.slug] = (roleData.permissions as string[]).includes(i.slug);
          });
          setPermissions(perms);
        } else {
          setPermissions(Object.fromEntries(ALL_NAV_ITEMS.map(i => [i.slug, true])));
        }
      } catch {
        setPermissions(Object.fromEntries(ALL_NAV_ITEMS.map(i => [i.slug, true])));
      }
    };
    fetchPerms();
  }, [userRole]);

  const canSee = (slug: string): boolean => {
    if (userRole === "super_admin") return true;
    if (permissions === null) return false;
    return permissions[slug] !== false;
  };

  const visibleNav = ALL_NAV_ITEMS.filter(item => canSee(item.slug));

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
        {visibleNav.map(item => {
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
        <Link to="/hotspot" onClick={onNavClick} className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
          <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>Captive Portal</span>
        </Link>
        <Link to="/portal" onClick={onNavClick} className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>User Portal</span>
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
          <button onClick={signOut} aria-label={`Sign out (${user?.email})`} title="Sign out" className="p-1.5 rounded-md text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive transition-colors">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
