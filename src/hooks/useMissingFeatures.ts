// @ts-nocheck
/**
 * src/hooks/useMissingFeatures.ts
 * Stub hooks for tables that may not exist yet.
 * Returns safe defaults when tables don't exist.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IPPoolStats {
  id: string;
  pool_name: string;
  total_ips: number;
  used_ips: number;
  router_id: string | null;
  pct_used?: number;
  recorded_at?: string;
}

export interface RadiusdeskAP {
  id: string;
  mac: string;
  name: string;
  lat: number | null;
  lng: number | null;
  status: string;
  connected_users: number;
  tx_bytes: number;
  rx_bytes: number;
  last_contact: string | null;
}

export interface UserLocation {
  lat: number;
  lng: number;
  weight: number;
}

export interface QosStat {
  router_id: number;
  router_name: string;
  queue_name: string;
  rate_limit: string;
  bytes_in: number;
  bytes_out: number;
  drop_rate: number;
}

// All hooks below gracefully handle missing tables by catching errors

export const useIpPoolStats = (routerId?: number) =>
  useQuery<IPPoolStats[]>({
    queryKey: ["ip_pool_stats", routerId],
    queryFn: async () => {
      try {
        let q = supabase.from("ip_pool_stats" as never).select("*") as any;
        if (routerId) q = q.eq("router_id", routerId);
        const { data, error } = await q;
        if (error) return [];
        return (data ?? []) as IPPoolStats[];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

export const useIpPoolHistory = (routerId: number, poolName: string) =>
  useQuery({
    queryKey: ["ip_pool_history", routerId, poolName],
    queryFn: async () => {
      try {
        const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data, error } = await (supabase.from("ip_pool_stats" as never).select("pct_used, recorded_at") as any)
          .eq("router_id", routerId)
          .eq("pool_name", poolName)
          .gte("recorded_at", since)
          .order("recorded_at", { ascending: true })
          .limit(24);
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!routerId && !!poolName,
  });

export const useQosStats = () =>
  useQuery<QosStat[]>({
    queryKey: ["qos_stats"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase.from("v_qos_latest" as never).select("*, routers(name)") as any)
          .order("drop_rate", { ascending: false });
        if (error) return [];
        return (data ?? []).map((r: any) => ({
          ...r,
          router_name: r.routers?.name ?? `Router ${r.router_id}`,
        })) as QosStat[];
      } catch {
        return [];
      }
    },
    refetchInterval: 30_000,
  });

export const useRadiusdeskAPs = () =>
  useQuery<RadiusdeskAP[]>({
    queryKey: ["radiusdesk_aps"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase.from("radiusdesk_aps" as never).select("*") as any)
          .order("name");
        if (error) return [];
        return (data ?? []) as RadiusdeskAP[];
      } catch {
        return [];
      }
    },
    refetchInterval: 2 * 60 * 1000,
  });

export const useCoverageHeatmap = (hours: number = 24) =>
  useQuery<UserLocation[]>({
    queryKey: ["coverage_heatmap", hours],
    queryFn: async () => {
      try {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const { data, error } = await (supabase.from("user_locations" as never).select("lat, lng") as any)
          .gte("recorded_at", since)
          .limit(10_000);
        if (error) return [];
        const grid: Record<string, UserLocation> = {};
        for (const row of data ?? []) {
          const key = `${Number(row.lat).toFixed(4)},${Number(row.lng).toFixed(4)}`;
          if (grid[key]) {
            grid[key].weight++;
          } else {
            grid[key] = { lat: Number(row.lat), lng: Number(row.lng), weight: 1 };
          }
        }
        return Object.values(grid);
      } catch {
        return [];
      }
    },
    refetchInterval: 5 * 60 * 1000,
  });

export const useNasRecords = () =>
  useQuery({
    queryKey: ["nas"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase.from("nas" as never).select("*, routers(name, status)") as any)
          .order("shortname");
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
  });
