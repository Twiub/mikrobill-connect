import AdminLayout from "@/components/AdminLayout";
import { PanelErrorBoundary } from "@/components/ErrorBoundary";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import { useTransactions, useActiveSessions, useRouters, useSubscribers, formatKES, formatBytes } from "@/hooks/useDatabase";
import { DollarSign, Users, Activity, TrendingUp, Wifi, AlertTriangle } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, Cell } from "recharts";
import { useMemo, useState, useEffect } from "react";
import { CardSkeleton, TableSkeleton } from "@/components/ui/skeleton";


// PERF: Shared tooltip style — prevents new object on every render
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
};
const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

const Dashboard = () => {
  const { branding } = useBranding();
  const { data: transactions = [] } = useTransactions();
  const { data: sessions = [] }     = useActiveSessions();
  const { data: routers = [] }      = useRouters();
  const { data: subsResult }  = useSubscribers();
  const subscribers = Array.isArray(subsResult) ? subsResult : [];

  const txns = transactions as any[];
  const rtrs = routers as any[];
  const subs = subscribers as any[];

  // FIX: daySeed resets at midnight so revenue metric doesn't go stale on dashboards
  // left open overnight (was computing todayStart once on mount, freezing at yesterday's date)
  const [daySeed, setDaySeed] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      if (Date.now() >= tomorrow.getTime()) setDaySeed(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const todayStart = new Date(daySeed);
  todayStart.setHours(0, 0, 0, 0);
  const todayRevenue = txns
    .filter((t) => t.status === "success" && new Date(t.created_at) >= todayStart)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Build revenue trend from real transactions (last 14 days)
  const revenueData = useMemo(() => {
    const map: Record<string, number> = {};
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      map[d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })] = 0;
    }
    txns.filter(t => t.status === "success").forEach(t => {
      const d = new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      if (d in map) map[d] += Number(t.amount);
    });
    return Object.entries(map).map(([date, revenue]) => ({ date, revenue }));
  }, [txns]);

  // Package distribution from real subscriber data
  const packageDist = useMemo(() => {
    const map: Record<string, { name: string; users: number }> = {};
    subs.forEach(s => {
      const name = (s as any).packages?.name ?? s.package_id ?? "Unknown";
      map[name] = map[name] ?? { name, users: 0 };
      map[name].users++;
    });
    return Object.values(map).sort((a, b) => b.users - a.users).slice(0, 5);
  }, [subs]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">{branding.company_name} — Revenue & Network Overview</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Revenue" value={formatKES(todayRevenue)} change="From transactions" changeType="positive" icon={DollarSign} />
          <StatCard title="Active Sessions" value={String((sessions as any[]).length)} change="across routers" changeType="neutral" icon={Activity} />
          <StatCard title="Routers Online" value={String(rtrs.filter(r => r.status === "online").length)} change={`of ${rtrs.length} total`} changeType="neutral" icon={Wifi} />
          <StatCard title="Pending Txns" value={String(txns.filter(t => t.status === "pending").length)} change="require attention" changeType="neutral" icon={TrendingUp} />
        </div>

        <PanelErrorBoundary title="Revenue &amp; Package Charts">
        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-3 gap-4">
          <div className="lg:col-span-2 glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Revenue Trend ({new Date().toLocaleString("default", { month: "long" })})</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [formatKES(value), "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revenueGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Users by Package</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={packageDist} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={70} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [v, "Subscribers"]} />
                <Bar dataKey="users" radius={[0, 4, 4, 0]}>
                  {packageDist.map((_entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </PanelErrorBoundary>

        <PanelErrorBoundary title="Transactions &amp; Sessions">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Recent Transactions</h3>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Ref</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.slice(0, 5).map((t: any) => (
                  <TableRow key={t.id} className="border-border/30">
                    <TableCell className="text-xs font-medium">{t.user_name}</TableCell>
                    <TableCell className="text-xs font-mono">{formatKES(Number(t.amount))}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{t.mpesa_ref}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Live Sessions</h3>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">IP</TableHead>
                  <TableHead className="text-xs">Uptime</TableHead>
                  <TableHead className="text-xs">Traffic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions?.slice(0, 5).map((s: any) => (
                  <TableRow key={s.id} className="border-border/30">
                    <TableCell className="text-xs font-medium">{s.username}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{s.ip_address}</TableCell>
                    <TableCell className="text-xs">{s.uptime}</TableCell>
                    <TableCell className="text-xs font-mono">↓{formatBytes(Number(s.bytes_in))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        </div>
        </PanelErrorBoundary>

        <PanelErrorBoundary title="Router Status">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">MikroTik Routers</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {routers?.map((r: any) => (
              <div key={r.id} className={`rounded-lg border p-4 ${r.status === "online" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wifi className={`h-4 w-4 ${r.status === "online" ? "text-success" : "text-destructive"}`} />
                    <span className="text-sm font-semibold">{r.name}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.status === "online" ? (
                  <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-3">
                    <div><p className="text-lg font-bold">{r.cpu_load}%</p><p className="text-[10px] text-muted-foreground">CPU</p></div>
                    <div><p className="text-lg font-bold">{r.memory_used}%</p><p className="text-[10px] text-muted-foreground">Memory</p></div>
                    <div><p className="text-lg font-bold">{r.active_users}</p><p className="text-[10px] text-muted-foreground">Users</p></div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-xs">Router unreachable</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        </PanelErrorBoundary>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
