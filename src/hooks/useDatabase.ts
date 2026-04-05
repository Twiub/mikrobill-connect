import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/authClient";

const API = () => (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "");
const authFetch = (path: string, opts?: RequestInit) =>
  fetch(`${API()}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${authClient.getToken()}`, ...(opts?.headers ?? {}) },
  }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

// LOW-03 FIX v3.19.0: Added .limit(500) and server-side search to useSubscribers.
// At 1,000+ subscribers the admin Users page fetched all rows (no limit) and filtered
// client-side — at 5,000 users this becomes a 1MB+ payload crashing the browser tab.
// Now: server-side search via backend filter, limited to 500 rows.
// The search string passed from UsersPage is applied server-side for efficiency.
export const useSubscribers = (search?: string) =>
  useQuery({
    queryKey: ["subscribers", search],
    queryFn: async () =>
      authFetch(`/api/admin/data/subscribers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

export const usePackages = () =>
  useQuery({
    queryKey: ["packages"],
    staleTime: 5 * 60_000,   // packages change rarely — 5min cache
    queryFn: async () => authFetch("/api/admin/data/packages"),
  });

// MED-01 FIX v3.19.0: Added .limit(200) to all unbounded queries.
// Previously useTransactions() fetched ALL rows with no limit. After 30 days
// with 1,000 users (15,000+ transaction rows), the admin TransactionsPage would
// freeze the browser rendering thousands of table rows, sometimes crashing the tab.
// Same issue affected useSubscribers (1,000+ rows), useErrorLogs (unbounded).
// Default limit 200 rows — operators can paginate using the date-range controls.
export const useTransactions = (limit = 200) =>
  useQuery({
    queryKey: ["transactions", limit],
    queryFn: async () => authFetch(`/api/admin/data/transactions?limit=${limit}`),
  });

// CRIT-04 FIX v3.19.0: useActiveSessions previously queried 'active_sessions'
// which is a legacy Supabase-era table never written by the Node.js backend.
// RADIUS accounting (radius.js:366) writes to 'hotspot_active_sessions'.
// With the old hook, the Sessions admin page always showed 0 sessions even
// with 1,000 users connected — admins were completely blind to live traffic.
// Fix: backend endpoint queries hotspot_active_sessions joined with subscribers for display names.
export const useActiveSessions = () =>
  useQuery({
    queryKey: ["active_sessions"],
    queryFn: async () => authFetch("/api/admin/data/active-sessions"),
    // Refresh every 30 seconds for live monitoring
    refetchInterval: 30_000,
  });

export const useTickets = () =>
  useQuery({
    queryKey: ["tickets"],
    queryFn: async () => authFetch("/api/admin/data/tickets"),
  });

export const useRouters = () =>
  useQuery({
    queryKey: ["routers"],
    staleTime: 2 * 60_000,   // router list changes infrequently — 2min cache
    queryFn: async () => authFetch("/api/admin/data/routers"),
  });

export const useKycRecords = () =>
  useQuery({
    queryKey: ["kyc_records"],
    queryFn: async () => authFetch("/api/admin/data/kyc-records"),
  });

export const useErrorLogs = () =>
  useQuery({
    queryKey: ["error_logs"],
    // LOW-03 FIX v3.19.0: limit(200) — error_logs can grow very large on busy deployments
    queryFn: async () => authFetch("/api/admin/data/error-logs?limit=200"),
  });

export const useExpenditures = () =>
  useQuery({
    queryKey: ["expenditures"],
    queryFn: async () => authFetch("/api/admin/data/expenditures"),
  });

export const useBandwidthSchedules = () =>
  useQuery({
    queryKey: ["bandwidth_schedules"],
    queryFn: async () => authFetch("/api/admin/data/bandwidth-schedules"),
  });

export const useNotifications = () =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: async () => authFetch("/api/admin/data/notifications"),
  });

export const useSharingViolations = () =>
  useQuery({
    queryKey: ["sharing_violations"],
    queryFn: async () => authFetch("/api/admin/data/sharing-violations"),
  });

export const useIpBindings = () =>
  useQuery({
    queryKey: ["ip_bindings"],
    queryFn: async () => authFetch("/api/admin/data/ip-bindings"),
  });

export const useUserRoles = () =>
  useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => authFetch("/api/admin/data/user-roles"),
  });

export const useConnectedDevices = (subscriberId?: string) =>
  useQuery({
    queryKey: ["connected_devices", subscriberId],
    queryFn: async () =>
      authFetch(`/api/admin/data/connected-devices${subscriberId ? `?subscriberId=${subscriberId}` : ""}`),
  });

export const useAiHealthReports = () =>
  useQuery({
    queryKey: ["ai_health_reports"],
    queryFn: async () => authFetch("/api/admin/data/ai-health"),
  });

// Helper
export function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString()}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ── Mutations ────────────────────────────────────────────────────────────────

export const useAddSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      authFetch("/api/admin/data/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscribers"] }),
  });
};

export const useUpdateSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      authFetch(`/api/admin/data/subscribers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscribers"] }),
  });
};

export const useAddPackage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      authFetch("/api/admin/data/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["packages"] }),
  });
};

export const useUpdatePackage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      authFetch(`/api/admin/data/packages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["packages"] }),
  });
};

export const useAddRouter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      authFetch("/api/admin/data/routers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routers"] }),
  });
};

export const useStaff = () =>
  useQuery({
    queryKey: ["staff"],
    queryFn: async () => authFetch("/api/admin/data/staff"),
  });

export const useExpenditureCategories = () =>
  useQuery({
    queryKey: ["expenditure_categories"],
    queryFn: async () => authFetch("/api/admin/data/expenditure-categories"),
  });

export const useNotificationTemplates = () =>
  useQuery({
    queryKey: ["notification_templates"],
    queryFn: async () => authFetch("/api/admin/data/notification-templates"),
  });

export const useMpesaConfig = () =>
  useQuery({
    queryKey: ["mpesa_config"],
    queryFn: async () => authFetch("/api/admin/data/mpesa-config"),
  });
