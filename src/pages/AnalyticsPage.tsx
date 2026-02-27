import AdminLayout from "@/components/AdminLayout";
import StatCard from "@/components/StatCard";
import { revenueData, packageDistribution, revenueByRouter, monthlyRevenue, customerSegments } from "@/lib/mockData";
import { formatKES } from "@/hooks/useDatabase";
import { TrendingUp, Users, DollarSign, BarChart3, Target, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, PieChart, Pie } from "recharts";

const AnalyticsPage = () => {
  const totalRevenue = 134900;
  const totalUsers = 265;
  const arpu = Math.round(totalRevenue / totalUsers);
  const collectionRate = 87;
  const churnRate = 11;
  const ltv = 4200;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics & Revenue</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time revenue metrics, customer segmentation & KPIs</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="Monthly Revenue" value={formatKES(totalRevenue)} change="+18.2% MoM" changeType="positive" icon={DollarSign} />
          <StatCard title="ARPU" value={formatKES(arpu)} change="avg per user" changeType="neutral" icon={TrendingUp} />
          <StatCard title="Collection Rate" value={`${collectionRate}%`} change="of active renewed" changeType="positive" icon={Target} />
          <StatCard title="Churn Rate" value={`${churnRate}%`} change="last 30 days" changeType="negative" icon={AlertTriangle} />
          <StatCard title="Customer LTV" value={formatKES(ltv)} change="AI estimated" changeType="neutral" icon={Users} />
          <StatCard title="Total Users" value="265" change="180 active" changeType="positive" icon={BarChart3} />
        </div>

        {/* Revenue Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue vs Expenses */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Revenue vs Expenses (6 months)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} formatter={(value: number) => [formatKES(value)]} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.6} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by Router */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Revenue by Router Location</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueByRouter} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <YAxis dataKey="router" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={60} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} formatter={(value: number) => [formatKES(value)]} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  <Cell fill="hsl(var(--chart-1))" />
                  <Cell fill="hsl(var(--chart-2))" />
                  <Cell fill="hsl(var(--chart-5))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Customer Segmentation & Package Revenue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Customer Segments */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Customer Segmentation</h3>
            <div className="space-y-4">
              {customerSegments.map((seg) => (
                <div key={seg.segment}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">{seg.segment}</span>
                    <span className="text-xs text-muted-foreground">{seg.count} users ({seg.percentage}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${seg.percentage}%`, backgroundColor: seg.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-warning">⚠ AI Insight:</span> 35 lapsed users haven't renewed in 7 days. Send re-engagement SMS campaign to recover ~KES 8,750 in potential revenue.
              </p>
            </div>
          </div>

          {/* Package Revenue Breakdown */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Revenue by Package</h3>
            <div className="space-y-3">
              {packageDistribution.map((pkg) => {
                const totalRev = packageDistribution.reduce((s, p) => s + p.revenue, 0);
                const pct = Math.round((pkg.revenue / totalRev) * 100);
                return (
                  <div key={pkg.name} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pkg.fill }} />
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
          </div>
        </div>

        {/* Performance KPIs */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Performance Monitoring KPIs</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "RADIUS Auth Rate", value: "99.2%", target: "> 99%", ok: true },
              { label: "API p95 Response", value: "145ms", target: "< 200ms", ok: true },
              { label: "STK Success Rate", value: "92%", target: "> 95%", ok: false },
              { label: "Avg Router CPU", value: "54%", target: "< 70%", ok: true },
              { label: "DB Pool Usage", value: "45%", target: "< 80%", ok: true },
              { label: "SMS Delivery", value: "98%", target: "> 95%", ok: true },
            ].map((kpi) => (
              <div key={kpi.label} className={`p-3 rounded-lg border ${kpi.ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                <p className="text-lg font-bold">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{kpi.label}</p>
                <p className={`text-[10px] mt-0.5 ${kpi.ok ? "text-success" : "text-destructive"}`}>Target: {kpi.target}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AnalyticsPage;
