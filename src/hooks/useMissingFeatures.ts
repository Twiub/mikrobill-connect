/**
 * src/hooks/useMissingFeatures.ts
 *
 * React Query hooks for the missing features:
 *   - useCoverageMapData()
 *   - useIpPools()
 *   - useQosStats()
 *   - useRadiusdeskAPs()
 *
 * Drop this file alongside the existing useDatabase.ts.
 * Uses the same supabase client pattern as the existing codebase.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IpPoolStat {
  router_id:   number;
  router_name: string;
  pool_name:   string;
  used:        number;
  total:       number;
  pct_used:    number;
  recorded_at: string;
}

export interface QosStat {
  router_id:   number;
  router_name: string;
  queue_name:  string;
  bytes:       number;
  packets:     number;
  dropped:     number;
  queued:      number;
  drop_rate:   number;
  recorded_at: string;
}

export interface RadiusdeskAP {
  mac:            string;
  name:           string;
  lat:            number | null;
  lng:            number | null;
  online:         boolean;
  active_clients: number;
  last_contact:   string | null;
  model:          string | null;
  firmware:       string | null;
  synced_at:      string;
}

export interface UserLocation {
  lat:         number;
  lng:         number;
  weight:      number;  // aggregated count
}

export interface SharingViolation {
  id:             number;
  subscriber_id:  number;
  router_id:      number | null;
  tethered_ip:    string | null;
  ttl_value:      number | null;
  detected_at:    string;
  resolved:       boolean;
  resolved_at:    string | null;
}

// ── IP Pool Stats ─────────────────────────────────────────────────────────────

/** Latest IP pool utilisation snapshot per router × pool */
export const useIpPools = () =>
  useQuery({
    queryKey: ["ip_pool_stats"],
    queryFn: async () => {
      // Uses the v_ip_pool_latest view (DISTINCT ON latest per pool)
      const { data, error } = await supabase
        .from("v_ip_pool_latest" as never)
        .select("*, routers(name)")
        .order("pct_used", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown> & { routers?: { name?: string }; router_id?: unknown }) => ({
        ...r,
        router_name: r.routers?.name ?? `Router ${r.router_id}`,
      })) as IpPoolStat[];
    },
    refetchInterval: 5 * 60 * 1000, // match poll interval
  });

/** Historical pool stats for sparkline (last 2 hours, 5-min buckets) */
export const useIpPoolHistory = (routerId: number, poolName: string) =>
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
        .order("recorded_at", { ascending: true })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!routerId && !!poolName,
  });

// ── QoS Stats ─────────────────────────────────────────────────────────────────

/** Latest QoS stats snapshot per router × queue */
export const useQosStats = () =>
  useQuery({
    queryKey: ["qos_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_qos_latest" as never)
        .select("*, routers(name)")
        .order("drop_rate", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown> & { routers?: { name?: string }; router_id?: unknown }) => ({
        ...r,
        router_name: r.routers?.name ?? `Router ${r.router_id}`,
      })) as QosStat[];
    },
    refetchInterval: 30_000, // match 30s poll
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
      return (data ?? []) as RadiusdeskAP[];
    },
    refetchInterval: 2 * 60 * 1000,
  });

// ── Coverage Map Data ─────────────────────────────────────────────────────────

/** Aggregated location heatmap data (last N hours) */
export const useCoverageHeatmap = (hours: number = 24) =>
  useQuery({
    queryKey: ["coverage_heatmap", hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("user_locations")
        .select("lat, lng")
        .gte("recorded_at", since)
        .limit(10_000);
      if (error) throw error;

      // Aggregate to ~50m grid client-side
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

// ── Sharing Violations (extended) ─────────────────────────────────────────────

export const useSharingViolations = (onlyActive = true) =>
  useQuery({
    queryKey: ["sharing_violations", onlyActive],
    queryFn: async () => {
      let q = supabase
        .from("sharing_violations")
        .select("*, subscribers(username, phone), routers(name)")
        .order("detected_at", { ascending: false })
        .limit(200);
      if (onlyActive) q = q.eq("resolved", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
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
        .select("*, routers(name, status)")
        .order("shortname");
      if (error) throw error;
      return data ?? [];
    },
  });
