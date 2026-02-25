import AdminLayout from "@/components/AdminLayout";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import { revenueData, packageDistribution, transactions, activeSessions, formatKES, formatBytes } from "@/lib/mockData";
import { DollarSign, Users, Activity, TrendingUp, Wifi, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Dashboard = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">WiFi Billing System — Revenue & Network Overview</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Revenue" value={formatKES(21300)} change="+12.5% from yesterday" changeType="positive" icon={DollarSign} />
          <StatCard title="Active Subscribers" value="265" change="+8 new today" changeType="positive" icon={Users} />
          <StatCard title="Active Sessions" value="77" change="across 2 routers" changeType="neutral" icon={Activity} />
          <StatCard title="Monthly Revenue" value={formatKES(134900)} change="+18.2% MoM" changeType="positive" icon={TrendingUp} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue Chart */}
          <div className="lg:col-span-2 glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Revenue Trend (February)</h3>
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
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }}
                  formatter={(value: number) => [formatKES(value), "Revenue"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revenueGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Package Distribution */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Users by Package</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={packageDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={70} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="users" radius={[0, 4, 4, 0]}>
                  {packageDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Transactions */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Recent Transactions</h3>
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
                {transactions.slice(0, 5).map((t) => (
                  <TableRow key={t.id} className="border-border/30">
                    <TableCell className="text-xs font-medium">{t.user_name}</TableCell>
                    <TableCell className="text-xs font-mono">{formatKES(t.amount)}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{t.mpesa_ref}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Active Sessions */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Live Sessions</h3>
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
                {activeSessions.slice(0, 5).map((s) => (
                  <TableRow key={s.id} className="border-border/30">
                    <TableCell className="text-xs font-medium">{s.username}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{s.ip_address}</TableCell>
                    <TableCell className="text-xs">{s.uptime}</TableCell>
                    <TableCell className="text-xs font-mono">↓{formatBytes(s.bytes_in)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Router Status */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">MikroTik Routers</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: "Router-Site1", status: "online", cpu: 42, mem: 58, users: 45, uptime: "15d 8h" },
              { name: "Router-Site2", status: "online", cpu: 67, mem: 72, users: 32, uptime: "8d 12h" },
              { name: "Router-Site3", status: "offline", cpu: 0, mem: 0, users: 0, uptime: "-" },
            ].map((r) => (
              <div key={r.name} className={`rounded-lg border p-4 ${r.status === "online" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wifi className={`h-4 w-4 ${r.status === "online" ? "text-success" : "text-destructive"}`} />
                    <span className="text-sm font-semibold">{r.name}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.status === "online" ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{r.cpu}%</p>
                      <p className="text-[10px] text-muted-foreground">CPU</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{r.mem}%</p>
                      <p className="text-[10px] text-muted-foreground">Memory</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{r.users}</p>
                      <p className="text-[10px] text-muted-foreground">Users</p>
                    </div>
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
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
