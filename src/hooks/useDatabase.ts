import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useSubscribers = (search?: string) =>
  useQuery({
    queryKey: ["subscribers", search],
    queryFn: async () => {
      let q = supabase.from("subscribers").select("*, packages(name)").order("created_at", { ascending: false });
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
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("*").order("price");
      if (error) throw error;
      return data;
    },
  });

export const useTransactions = () =>
  useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
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
    queryFn: async () => {
      const { data, error } = await supabase.from("routers").select("*, router_interfaces(*)").order("name");
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
      const { data, error } = await supabase.from("error_logs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useExpenditures = () =>
  useQuery({
    queryKey: ["expenditures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenditures").select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useBandwidthSchedules = () =>
  useQuery({
    queryKey: ["bandwidth_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bandwidth_schedules").select("*, packages(name)").order("created_at");
      if (error) throw error;
      return data;
    },
  });

export const useNotifications = () =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("sent_at", { ascending: false });
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
      const { data, error } = await supabase.from("user_roles").select("*, profiles(full_name, email)").order("created_at");
      if (error) throw error;
      return data;
    },
  });

export const useConnectedDevices = (subscriberId?: string) =>
  useQuery({
    queryKey: ["connected_devices", subscriberId],
    queryFn: async () => {
      let q = supabase.from("connected_devices").select("*").order("last_seen", { ascending: false });
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
      const { data, error } = await supabase.from("ai_health_reports").select("*").order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
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
