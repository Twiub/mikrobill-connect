import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Package,
  Receipt,
  Activity,
  TicketCheck,
  Router,
  Wifi,
  Settings,
  Shield,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/users", icon: Users, label: "Subscribers" },
  { path: "/packages", icon: Package, label: "Packages" },
  { path: "/transactions", icon: Receipt, label: "Transactions" },
  { path: "/sessions", icon: Activity, label: "Active Sessions" },
  { path: "/tickets", icon: TicketCheck, label: "Tickets" },
  { path: "/routers", icon: Router, label: "MikroTik Routers" },
];

const AdminSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center">
          <Wifi className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">WiFi Billing</h1>
          <p className="text-[10px] text-sidebar-foreground font-mono">MikroTik ISP v2.0</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {item.label === "Tickets" && (
                <span className="ml-auto text-[10px] bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full font-semibold">3</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        <Link
          to="/hotspot"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Wifi className="h-4 w-4" />
          Captive Portal
        </Link>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium text-sidebar-accent-foreground">Super Admin</p>
            <p className="text-[10px] text-sidebar-foreground">admin@isp.co.ke</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
