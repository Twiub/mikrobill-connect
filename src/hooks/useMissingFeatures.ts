/**
 * src/hooks/useMissingFeatures.ts — v2.0.0 (Supabase)
 * All queries use Supabase client directly.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IpPoolStat {
  id:          string;
  router_id:   string | null;
  pool_name:   string;
  used_ips:    number;
  total_ips:   number;
  pct_used:    number | null;
  recorded_at: string;
}

export interface QosStat {
  id:          string;
  router_id:   string | null;
  queue_name:  string;
  bytes_in:    number;
  bytes_out:   number;
  drop_rate:   number;
  rate_limit:  string | null;
  recorded_at: string;
}

export interface RadiusdeskAP {
  id:              string;
  mac:             string;
  name:            string;
  lat:             number | null;
  lng:             number | null;
  status:          string;
  connected_users: number;
  tx_bytes:        number;
  rx_bytes:        number;
  last_contact:    string | null;
}

export interface UserLocation {
  lat:    number;
  lng:    number;
  weight: number;
}

// ── IP Pool Stats ─────────────────────────────────────────────────────────────

export const useIpPools = () =>
  useQuery({
    queryKey: ["ip_pool_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_pool_stats")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5 * 60 * 1000,
  });

export const useIpPoolHistory = (routerId: string, poolName: string) =>
  useQuery({
    queryKey: ["ip_pool_history", routerId, poolName],
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ip_pool_stats")
        .select("pct_used, recorded_at")
        .eq("router_id", routerId)
        .eq("pool_name", poolName)
        .gte("recorded_at", since)
        .order("recorded_at")
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!routerId && !!poolName,
  });

// ── QoS Stats ─────────────────────────────────────────────────────────────────

export const useQosStats = () =>
  useQuery({
    queryKey: ["qos_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_qos_latest")
        .select("*");
      if (error) throw error;
      return (data ?? []) as QosStat[];
    },
    refetchInterval: 30_000,
  });

// ── RadiusDesk APs ────────────────────────────────────────────────────────────

export const useRadiusdeskAPs = () =>
  useQuery({
    queryKey: ["radiusdesk_aps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radiusdesk_aps")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 2 * 60 * 1000,
  });

// ── Coverage Map Data ─────────────────────────────────────────────────────────

export const useCoverageHeatmap = (hours: number = 24) =>
  useQuery({
    queryKey: ["coverage_heatmap", hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("user_locations")
        .select("lat, lng")
        .gte("recorded_at", since)
        .limit(10000);
      if (error) throw error;
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
    },
    refetchInterval: 5 * 60 * 1000,
  });

// ── NAS Records ───────────────────────────────────────────────────────────────

export const useNasRecords = () =>
  useQuery({
    queryKey: ["nas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nas")
        .select("*")
        .order("shortname");
      if (error) throw error;
      return data ?? [];
    },
  });
