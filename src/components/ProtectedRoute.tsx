/**
 * ProtectedRoute.tsx — v3.5.0
 *
 * FIXES:
 *   - Previously only checked `user` exists (any logged-in user could visit any page)
 *   - Now checks role permissions fetched from /api/admin/my-permissions
 *   - Redirects to "/" with an error toast if user lacks access to the requested page
 *   - super_admin always gets access regardless
 *   - While permissions are loading, shows a loading spinner (no flash of blocked content)
 */

import { useAuth } from "@/hooks/useAuth";
import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/authClient";

// Path → slug map (must match AdminSidebar's ALL_NAV_ITEMS)
const PATH_TO_SLUG: Record<string, string> = {
  "/":                "/dashboard",
  "/users":           "users",
  "/packages":        "packages",
  "/transactions":    "transactions",
  "/sessions":        "sessions",
  "/tickets":         "tickets",
  "/ticket-map":      "ticket-map",
  "/coverage-map":    "coverage-map",
  "/routers":         "routers",
  "/network":         "network",
  "/ip-pools":        "ip-pools",
  "/qos":             "qos",
  "/mikrotik-scripts": "mikrotik-scripts",
  "/analytics":       "analytics",
  "/ai-health":       "ai-health",
  "/error-logs":      "error-logs",
  "/expenditure":     "expenditure",
  "/bandwidth":       "bandwidth",
  "/ip-binding":      "ip-binding",
  "/sharing":         "sharing",
  "/kyc":             "kyc",
  "/notifications":   "notifications",
  "/admin-roles":     "admin-roles",
  "/settings":        "settings",
};

// Cache permissions per session to avoid re-fetching on every navigation
let permCache: Record<string, boolean> | null = null;
let permCacheRole: string | null = null;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userRole, loading } = useAuth();
  const location = useLocation();
  const [perms, setPerms]         = useState<Record<string, boolean> | null>(
    permCacheRole === userRole ? permCache : null
  );
  const [permsLoading, setPermsLoading] = useState(perms === null);

  useEffect(() => {
    if (!user || !userRole) return;
    if (userRole === "super_admin") { setPerms(null); setPermsLoading(false); return; }
    if (permCacheRole === userRole && permCache) { setPerms(permCache); setPermsLoading(false); return; }

    const load = async () => {
      try {
        const token = getToken();
        if (!token) return;
        const apiBase = (window as Window & { __MIKROBILL_API__?: string }).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");
        const res = await fetch(`${apiBase}/admin/my-permissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success && data.permissions) {
          permCache = data.permissions;
          permCacheRole = userRole;
          setPerms(data.permissions);
        }
      } catch {
        // On error, allow access (fail open — network issues shouldn't lock out staff)
        setPerms({});
      } finally {
        setPermsLoading(false);
      }
    };
    load();
  }, [user, userRole]);

  if (loading || permsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // super_admin always has access
  if (userRole === "super_admin") return <>{children}</>;

  // Check page permission
  const slug = PATH_TO_SLUG[location.pathname] ?? location.pathname.slice(1);
  if (perms && slug in perms && perms[slug] === false) {
    return <Navigate to="/" replace state={{ blocked: slug }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
