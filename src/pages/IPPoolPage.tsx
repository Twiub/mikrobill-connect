/**
 * src/pages/IPPoolPage.tsx — Supabase version
 * IP Pool Utilisation Monitor using ip_pool_stats table.
 */

import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Server, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useIpPools } from "@/hooks/useMissingFeatures";
import { useRouters } from "@/hooks/useDatabase";
import { useQueryClient } from "@tanstack/react-query";

function poolColor(pct: number) {
  if (pct >= 90) return "text-destructive";
  if (pct >= 80) return "text-orange-500";
  if (pct >= 60) return "text-yellow-500";
  return "text-green-500";
}

function progressColor(pct: number) {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 80) return "bg-orange-500";
  if (pct >= 60) return "bg-yellow-500";
  return "bg-green-500";
}

const IPPoolPage = () => {
  const { data: pools = [], isLoading, error } = useIpPools();
  const { data: routers = [] } = useRouters();
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ip_pool_stats"] });
    setLastRefresh(new Date());
  };

  const routerMap: Record<string, string> = {};
  (routers as any[]).forEach(r => { routerMap[r.id] = r.name; });

  const byRouter = (pools as any[]).reduce<Record<string, { name: string; pools: any[] }>>((acc, p) => {
    const rid = p.router_id ?? "unknown";
    if (!acc[rid]) acc[rid] = { name: routerMap[rid] ?? "Unknown Router", pools: [] };
    acc[rid].pools.push(p);
    return acc;
  }, {});

  const alertCount = (pools as any[]).filter((p: any) => (p.pct_used ?? 0) > 80).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">IP Pool Utilisation</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Polled every 5 minutes · Alert at 80%
            </p>
          </div>
          <div className="flex items-center gap-3">
            {alertCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {alertCount} pool{alertCount > 1 ? "s" : ""} near capacity
              </Badge>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={refresh} disabled={isLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {lastRefresh && (
          <p className="text-xs text-muted-foreground">Last updated: {lastRefresh.toLocaleTimeString()}</p>
        )}

        {error && (
          <div className="glass-card p-4 border-destructive/30 text-destructive text-sm">
            Failed to load pool data: {(error as Error).message}
          </div>
        )}

        {Object.entries(byRouter).map(([routerId, group]) => (
          <div key={routerId} className="glass-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{group.name}</h3>
                <p className="text-[10px] text-muted-foreground">
                  {group.pools.length} pool{group.pools.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.pools.map((pool: any) => (
                <PoolCard key={`${pool.router_id}:${pool.pool_name}`} pool={pool} />
              ))}
            </div>
          </div>
        ))}

        {!isLoading && (pools as any[]).length === 0 && !error && (
          <div className="glass-card p-8 text-center text-muted-foreground text-sm">
            No pool data yet. The IP pool monitor runs every 5 minutes.<br />
            Ensure MikroTik routers are online and data is being collected.
          </div>
        )}

        <div className="glass-card p-5">
          <h3 className="text-sm font-bold mb-3">Pool Capacity Reference</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            {[
              { name: "pool-hotspot-a", subnet: "10.10.0.0/20",  ips: "4,094" },
              { name: "pool-hotspot-b", subnet: "10.10.16.0/20", ips: "4,094" },
              { name: "pool-pppoe-a",   subnet: "10.20.0.0/20",  ips: "4,094" },
              { name: "pool-pppoe-b",   subnet: "10.20.16.0/20", ips: "4,094" },
              { name: "pool-expired",   subnet: "10.30.0.0/22",  ips: "1,022" },
            ].map(p => (
              <div key={p.name} className="rounded-lg bg-muted/30 border border-border/50 p-3">
                <p className="font-mono font-semibold text-[10px]">{p.name}</p>
                <p className="text-muted-foreground text-[10px]">{p.subnet}</p>
                <p className="font-bold mt-1">{p.ips} IPs</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

function PoolCard({ pool }: { pool: any }) {
  const pct = Math.min(pool.pct_used ?? 0, 100);
  const isHigh = pct >= 80;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${isHigh ? "border-orange-500/40 bg-orange-500/5" : "border-border/50"}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono font-semibold">{pool.pool_name}</p>
        {isHigh ? <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
      </div>
      <div>
        <div className="flex justify-between mb-1.5">
          <span className={`text-lg font-bold ${poolColor(pct)}`}>{pct.toFixed(1)}%</span>
          <span className="text-xs text-muted-foreground">{(pool.used_ips ?? 0).toLocaleString()} / {(pool.total_ips ?? 0).toLocaleString()}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{((pool.total_ips ?? 0) - (pool.used_ips ?? 0)).toLocaleString()} IPs available</p>
      {isHigh && <p className="text-[10px] text-orange-500 font-medium">⚠️ Consider adding next-pool or expanding subnet</p>}
    </div>
  );
}

export default IPPoolPage;
