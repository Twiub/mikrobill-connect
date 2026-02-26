import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, Package, Receipt, Activity, TicketCheck, Router, Wifi,
  Shield, BarChart3, AlertTriangle, Brain, FileText, DollarSign, Bell, Clock,
  Link2, ShieldAlert, UserCog, Settings, MapPin, Monitor, LogOut,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/users", icon: Users, label: "Subscribers" },
  { path: "/packages", icon: Package, label: "Packages" },
  { path: "/transactions", icon: Receipt, label: "Transactions" },
  { path: "/sessions", icon: Activity, label: "Active Sessions" },
  { path: "/tickets", icon: TicketCheck, label: "Tickets" },
  { path: "/ticket-map", icon: MapPin, label: "Ticket Map" },
  { path: "/routers", icon: Router, label: "MikroTik Routers" },
  { path: "/network", icon: Monitor, label: "Network Monitor" },
  { path: "/analytics", icon: BarChart3, label: "Analytics" },
  { path: "/ai-health", icon: Brain, label: "AI Health" },
  { path: "/error-logs", icon: AlertTriangle, label: "Error Logs" },
  { path: "/expenditure", icon: DollarSign, label: "Expenditure" },
  { path: "/bandwidth", icon: Clock, label: "Bandwidth Schedules" },
  { path: "/ip-binding", icon: Link2, label: "IP/MAC Binding" },
  { path: "/sharing", icon: ShieldAlert, label: "Anti-Sharing" },
  { path: "/kyc", icon: FileText, label: "KYC Compliance" },
  { path: "/notifications", icon: Bell, label: "Notifications" },
  { path: "/admin-roles", icon: UserCog, label: "Admin Roles" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

const AdminSidebar = () => {
  const location = useLocation();
  const { user, userRole, signOut } = useAuth();

  const roleLabel = userRole?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Admin";

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center">
          <Wifi className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">WiFi Billing</h1>
          <p className="text-[10px] text-sidebar-foreground font-mono">MikroTik ISP v2.0</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 ${
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        <Link
          to="/hotspot"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Wifi className="h-3.5 w-3.5" />
          Captive Portal
        </Link>
        <Link
          to="/portal"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Users className="h-3.5 w-3.5" />
          User Portal
        </Link>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-sidebar-accent-foreground">{roleLabel}</p>
              <p className="text-[10px] text-sidebar-foreground truncate max-w-[120px]">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="p-1.5 rounded-md text-sidebar-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
