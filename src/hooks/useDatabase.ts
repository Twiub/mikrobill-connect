import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Queries ──────────────────────────────────────────────────────────────────

export const useSubscribers = (search?: string) =>
  useQuery({
    queryKey: ["subscribers", search],
    queryFn: async () => {
      let q = supabase.from("subscribers").select("*, packages(name)").order("created_at", { ascending: false }).limit(500);
      if (search) {
        q = q.or(`full_name.ilike.%${search}%,username.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

export const usePackages = () =>
  useQuery({
    queryKey: ["packages"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useTransactions = (limit = 200) =>
  useQuery({
    queryKey: ["transactions", limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  });

export const useActiveSessions = () =>
  useQuery({
    queryKey: ["active_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("active_sessions").select("*").order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

export const useTickets = () =>
  useQuery({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tickets").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useRouters = () =>
  useQuery({
    queryKey: ["routers"],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("routers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useKycRecords = () =>
  useQuery({
    queryKey: ["kyc_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kyc_records").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useErrorLogs = () =>
  useQuery({
    queryKey: ["error_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

export const useExpenditures = () =>
  useQuery({
    queryKey: ["expenditures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenditures").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useBandwidthSchedules = () =>
  useQuery({
    queryKey: ["bandwidth_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bandwidth_schedules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useNotifications = () =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useSharingViolations = () =>
  useQuery({
    queryKey: ["sharing_violations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sharing_violations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useIpBindings = () =>
  useQuery({
    queryKey: ["ip_bindings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ip_bindings").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useUserRoles = () =>
  useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useConnectedDevices = (subscriberId?: string) =>
  useQuery({
    queryKey: ["connected_devices", subscriberId],
    queryFn: async () => {
      let q = supabase.from("connected_devices").select("*");
      if (subscriberId) q = q.eq("subscriber_id", subscriberId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

export const useAiHealthReports = () =>
  useQuery({
    queryKey: ["ai_health_reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_health_reports").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useStaff = () =>
  useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useExpenditureCategories = () =>
  useQuery({
    queryKey: ["expenditure_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenditure_categories").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useNotificationTemplates = () =>
  useQuery({
    queryKey: ["notification_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useMpesaConfig = () =>
  useQuery({
    queryKey: ["mpesa_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mpesa_config").select("*");
      if (error) throw error;
      return data;
    },
  });

export const useVouchers = () =>
  useQuery({
    queryKey: ["vouchers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vouchers").select("*, voucher_batches(batch_label, packages(name))").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });

export const useVoucherBatches = () =>
  useQuery({
    queryKey: ["voucher_batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("voucher_batches").select("*, packages(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result, error } = await supabase.from("subscribers").insert(data as any).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscribers"] }),
  });
};

export const useUpdateSubscriber = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const { data: result, error } = await supabase.from("subscribers").update(data as any).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscribers"] }),
  });
};

export const useAddPackage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result, error } = await supabase.from("packages").insert(data as any).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["packages"] }),
  });
};

export const useUpdatePackage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const { data: result, error } = await supabase.from("packages").update(data as any).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["packages"] }),
  });
};

export const useAddRouter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result, error } = await supabase.from("routers").insert(data as any).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routers"] }),
  });
};
