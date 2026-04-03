// @ts-nocheck
import AdminLayout from "@/components/AdminLayout";
import StatCard from "@/components/StatCard";
import { useTransactions, useSubscribers, usePackages, formatKES } from "@/hooks/useDatabase";
import { TrendingUp, Users, DollarSign, BarChart3, Target, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useMemo } from "react";

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

const AnalyticsPage = () => {
  const { data: transactions = [] } = useTransactions();
  const { data: subscribers = [] }  = useSubscribers();
  const { data: packages = [] }     = usePackages();

  const txns = transactions as Record<string, unknown>[];
  const subs = subscribers as Record<string, unknown>[];
  const pkgs = packages as Record<string, unknown>[];

  const totalRevenue = txns.filter(t => t.status === "success").reduce((s, t) => s + Number(t.amount), 0);
  const totalUsers   = subs.length;
  const activeUsers  = subs.filter(s => s.status === "active").length;
  const arpu         = totalUsers > 0 ? Math.round(totalRevenue / Math.max(totalUsers, 1)) : 0;

  // Revenue by day (last 30 days)
  const revenueByDay = useMemo(() => {
    const map: Record<string, number> = {};
    txns.filter(t => t.status === "success").forEach(t => {
      const d = new Date(t.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      map[d] = (map[d] ?? 0) + Number(t.amount);
    });
    return Object.entries(map).slice(-14).map(([date, revenue]) => ({ date, revenue }));
  }, [txns]);

  // Revenue by package
  const revenueByPackage = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; users: number }> = {};
    pkgs.forEach(p => { map[p.id] = { name: p.name, revenue: 0, users: 0 }; });
    txns.filter(t => t.status === "success" && t.package_id && map[t.package_id]).forEach(t => {
      map[t.package_id].revenue += Number(t.amount);
    });
    subs.forEach(s => { if (s.package_id && map[s.package_id]) map[s.package_id].users++; });
    return Object.values(map).filter(p => p.revenue > 0 || p.users > 0).sort((a, b) => b.revenue - a.revenue);
  }, [txns, subs, pkgs]);

  // Subscriber status breakdown
  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    subs.forEach(s => { map[s.status] = (map[s.status] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
      percentage: Math.round((count / Math.max(subs.length, 1)) * 100),
    }));
  }, [subs]);

  const collectionRate = txns.length > 0
    ? Math.round((txns.filter(t => t.status === "success").length / txns.length) * 100)
    : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Analytics & Revenue</h1>
          <p className="text-sm text-muted-foreground mt-1">Live revenue metrics, customer segmentation & KPIs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard title="Total Revenue" value={formatKES(totalRevenue)} change="All successful transactions" changeType="positive" icon={DollarSign} />
          <StatCard title="ARPU" value={formatKES(arpu)} change="avg per subscriber" changeType="neutral" icon={TrendingUp} />
          <StatCard title="Collection Rate" value={`${collectionRate}%`} change="transactions succeeded" changeType={collectionRate >= 90 ? "positive" : "negative"} icon={Target} />
          <StatCard title="Active Subscribers" value={String(activeUsers)} change={`of ${totalUsers} total`} changeType="positive" icon={Users} />
          <StatCard title="Packages" value={String(pkgs.length)} change="configured" changeType="neutral" icon={BarChart3} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Daily Revenue (last 14 days)</h3>
            {revenueByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [formatKES(v), "Revenue"]} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">No transaction data yet.</p>
            )}
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Revenue by Package</h3>
            {revenueByPackage.length > 0 ? (
              <div className="space-y-3">
                {revenueByPackage.map((pkg, i) => {
                  const totalPkgRev = revenueByPackage.reduce((s, p) => s + p.revenue, 0);
                  const pct = totalPkgRev > 0 ? Math.round((pkg.revenue / totalPkgRev) * 100) : 0;
                  return (
                    <div key={pkg.name} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold">{pkg.name}</span>
                          <span className="text-sm font-bold text-primary">{formatKES(pkg.revenue)}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-muted-foreground">{pkg.users} subscribers</span>
                          <span className="text-xs text-muted-foreground">{pct}% of revenue</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">No package data yet.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Subscriber Status Breakdown</h3>
          <div className="space-y-3">
            {statusBreakdown.map((seg) => (
              <div key={seg.status}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{seg.status}</span>
                  <span className="text-xs text-muted-foreground">{seg.count} users ({seg.percentage}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500 bg-primary" style={{ width: `${seg.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AnalyticsPage;
