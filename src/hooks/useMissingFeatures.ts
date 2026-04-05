/**
 * src/hooks/useMissingFeatures.ts — v2.0.0 (Supabase-free)
 *
 * PHASE8-FIX: All supabase.from() calls replaced with fetch() to backend REST API.
 * - useIpPools()         → GET /api/admin/ip-pools
 * - useIpPoolHistory()   → GET /api/admin/data/ip-pool-history
 * - useQosStats()        → GET /api/admin/qos
 * - useRadiusdeskAPs()   → GET /api/admin/data/radiusdesk-aps
 * - useCoverageHeatmap() → GET /api/admin/data/coverage-heatmap
 * - useSharingViolations() → GET /api/admin/data/sharing-violations
 * - useNasRecords()      → GET /api/admin/data/nas-records
 */

import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/authClient";

const API = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

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
  lat:    number;
  lng:    number;
  weight: number;  // aggregated count
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

/** Latest IP pool utilisation snapshot per router × pool.
 *  /api/admin/ip-pools returns { pools: IpPoolStat[], trend: [...] }
 */
export const useIpPools = () =>
  useQuery({
    queryKey: ["ip_pool_stats"],
    queryFn: async () => {
      const data = await apiFetch<{ pools: IpPoolStat[] }>("/api/admin/ip-pools");
      return data.pools ?? [];
    },
    refetchInterval: 5 * 60 * 1000,
  });

/** Historical pool stats for sparkline (last 2 hours, 5-min buckets) */
export const useIpPoolHistory = (routerId: number, poolName: string) =>
  useQuery({
    queryKey: ["ip_pool_history", routerId, poolName],
    queryFn: async () => {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      return apiFetch<{ pct_used: number; recorded_at: string }[]>(
        `/api/admin/data/ip-pool-history?router_id=${routerId}&pool_name=${encodeURIComponent(poolName)}&since=${encodeURIComponent(since)}&limit=24`
      );
    },
    enabled: !!routerId && !!poolName,
  });

// ── QoS Stats ─────────────────────────────────────────────────────────────────

/** Latest QoS stats snapshot per router × queue.
 *  /api/admin/qos returns { queues: [...], trend: [...] }
 *  drop_rate is derived client-side as dropped / max(packets, 1).
 */
export const useQosStats = () =>
  useQuery({
    queryKey: ["qos_stats"],
    queryFn: async () => {
      const data = await apiFetch<{ queues: Omit<QosStat, "drop_rate">[] }>("/api/admin/qos");
      return (data.queues ?? []).map(q => ({
        ...q,
        drop_rate: q.packets > 0 ? q.dropped / q.packets : 0,
      })) as QosStat[];
    },
    refetchInterval: 30_000,
  });

// ── RadiusDesk APs ────────────────────────────────────────────────────────────

export const useRadiusdeskAPs = () =>
  useQuery({
    queryKey: ["radiusdesk_aps"],
    queryFn: async () => {
      return apiFetch<RadiusdeskAP[]>("/api/admin/data/radiusdesk-aps");
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
      const rows = await apiFetch<{ lat: number; lng: number }[]>(
        `/api/admin/data/coverage-heatmap?since=${encodeURIComponent(since)}&limit=10000`
      );
      // Aggregate to ~50m grid client-side
      const grid: Record<string, UserLocation> = {};
      for (const row of rows ?? []) {
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

// ── Sharing Violations ────────────────────────────────────────────────────────

export const useSharingViolations = (onlyActive = true) =>
  useQuery({
    queryKey: ["sharing_violations", onlyActive],
    queryFn: async () => {
      const qs = onlyActive ? "?resolved=false" : "";
      return apiFetch<SharingViolation[]>(`/api/admin/data/sharing-violations${qs}`);
    },
    refetchInterval: 5 * 60 * 1000,
  });

// ── NAS Records ───────────────────────────────────────────────────────────────

export const useNasRecords = () =>
  useQuery({
    queryKey: ["nas"],
    queryFn: async () => {
      return apiFetch<unknown[]>("/api/admin/data/nas-records");
    },
  });
