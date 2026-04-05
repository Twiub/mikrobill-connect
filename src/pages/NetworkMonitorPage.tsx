import AdminLayout from "@/components/AdminLayout";
import { useRouters, useActiveSessions, formatBytes } from "@/hooks/useDatabase";
import StatusBadge from "@/components/StatusBadge";
import { Wifi, Activity, ArrowDown, ArrowUp, Globe } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CHART_TOOLTIP_STYLE = { backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" };

const NetworkMonitorPage = () => {
  const { data: routers = [] } = useRouters();
  const { data: activeSessions = [] } = useActiveSessions();
  const sessionsByRouter = routers.map((r: any) => ({
    name: r.name.replace("Router-", ""),
    sessions: activeSessions.filter((s: any) => s.mikrotik_name === r.name).length,
    total_down: activeSessions.filter((s: any) => s.mikrotik_name === r.name).reduce((acc: number, s: any) => acc + Number(s.bytes_in), 0),
    total_up: activeSessions.filter((s: any) => s.mikrotik_name === r.name).reduce((acc: number, s: any) => acc + Number(s.bytes_out), 0),
  }));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Network Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">Live user tracking, interface stats & bandwidth utilization</p>
        </div>

        {/* Router Interface Stats */}
        <div className="space-y-4">
          {routers.filter(r => r.status === "online").map((router) => (
            <div key={router.id} className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                    <Wifi className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{router.name}</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">{router.ip_address} · {router.model} · {router.firmware}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="font-bold text-primary">{router.active_users}</p>
                    <p className="text-[10px] text-muted-foreground">Users</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">{router.cpu_load}%</p>
                    <p className="text-[10px] text-muted-foreground">CPU</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">{router.memory_used}%</p>
                    <p className="text-[10px] text-muted-foreground">RAM</p>
                  </div>
                </div>
              </div>

              {/* Interfaces */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 sm:grid-cols-4 gap-3">
                {(router as any).router_interfaces?.map((iface: any) => (
                  <div key={iface.name} className={`rounded-lg border p-3 ${iface.status === "up" ? "border-border/50" : "border-destructive/30 bg-destructive/5"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">{iface.name}</span>
                      <StatusBadge status={iface.status === "up" ? "online" : "offline"} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <ArrowDown className="h-3 w-3 text-success" />
                        <span className="text-[10px] text-muted-foreground">RX:</span>
                        <span className="text-[10px] font-mono font-semibold">{formatBytes(iface.rx_rate)}/s</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ArrowUp className="h-3 w-3 text-info" />
                        <span className="text-[10px] text-muted-foreground">TX:</span>
                        <span className="text-[10px] font-mono font-semibold">{formatBytes(iface.tx_rate)}/s</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Traffic by Router */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Traffic by Router</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sessionsByRouter}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => formatBytes(v)} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [formatBytes(v)]} />
              <Bar dataKey="total_down" name="Download" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total_up" name="Upload" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Polling Info */}
        <div className="glass-card p-4 border-l-4 border-l-primary">
          <div className="flex items-start gap-3">
            <Activity className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="text-xs font-semibold mb-1">Monitoring Configuration</h3>
              <div className="grid grid-cols-3 gap-4 text-[10px] text-muted-foreground">
                <div>• Session poll: every 30s via RouterOS API</div>
                <div>• Router ping: every 60s — alert if no response &gt; 3 min</div>
                <div>• Interface stats: polled per port for bandwidth utilization</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default NetworkMonitorPage;
