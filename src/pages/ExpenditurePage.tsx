import AdminLayout from "@/components/AdminLayout";
import StatCard from "@/components/StatCard";
import { useExpenditures, formatKES } from "@/hooks/useDatabase";
import { monthlyRevenue } from "@/lib/mockData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Receipt, TrendingDown, Calculator, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const categoryStyles: Record<string, string> = {
  bandwidth: "bg-primary/15 text-primary border-primary/30",
  equipment: "bg-info/15 text-info border-info/30",
  salary: "bg-chart-3/15 text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3))]/30",
  power: "bg-warning/15 text-warning border-warning/30",
  office: "bg-muted text-muted-foreground border-border",
  other: "bg-destructive/15 text-destructive border-destructive/30",
};

const ExpenditurePage = () => {
  const { data: expenditures = [] } = useExpenditures();
  const totalExpenses = expenditures.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const grossRevenue = 134900;
  const taxRate = 16; // VAT
  const taxableIncome = grossRevenue - totalExpenses;
  const taxDue = Math.round(taxableIncome * taxRate / 100);
  const netProfit = taxableIncome - taxDue;

  const categoryBreakdown = expenditures.reduce((acc: Record<string, number>, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {} as Record<string, number>);

  const categoryData = Object.entries(categoryBreakdown).map(([cat, amount]) => ({ category: cat, amount }));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Expenditure & Tax</h1>
            <p className="text-sm text-muted-foreground mt-1">Track ISP expenses, calculate tax liability & P/L</p>
          </div>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Gross Revenue" value={formatKES(grossRevenue)} change="February 2026" changeType="positive" icon={Wallet} />
          <StatCard title="Total Expenses" value={formatKES(totalExpenses)} change={`${expenditures.length} entries`} changeType="negative" icon={TrendingDown} />
          <StatCard title="Tax Due (VAT 16%)" value={formatKES(taxDue)} change={`on ${formatKES(taxableIncome)} taxable`} changeType="neutral" icon={Calculator} />
          <StatCard title="Net Profit" value={formatKES(netProfit)} change={netProfit > 0 ? "profitable" : "loss"} changeType={netProfit > 0 ? "positive" : "negative"} icon={Receipt} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Category Breakdown Chart */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Expenses by Category</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} formatter={(v: number) => [formatKES(v)]} />
                <Bar dataKey="amount" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tax Summary */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Tax Calculator — February 2026</h3>
            <div className="space-y-3">
              {[
                { label: "Gross Revenue", value: grossRevenue, positive: true },
                { label: "Total Expenses", value: -totalExpenses, positive: false },
                { label: "Taxable Income", value: taxableIncome, positive: taxableIncome > 0 },
                { label: `VAT (${taxRate}%)`, value: -taxDue, positive: false },
                { label: "Net Profit", value: netProfit, positive: netProfit > 0 },
              ].map((item) => (
                <div key={item.label} className={`flex justify-between items-center p-3 rounded-lg ${item.label === "Net Profit" ? "bg-primary/10 border border-primary/30" : "bg-muted/30"}`}>
                  <span className={`text-sm ${item.label === "Net Profit" ? "font-bold" : "text-muted-foreground"}`}>{item.label}</span>
                  <span className={`text-sm font-bold ${item.positive ? "text-success" : "text-destructive"}`}>
                    {item.value < 0 ? "- " : ""}
                    {formatKES(Math.abs(item.value))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Expense Table */}
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs">Amount</TableHead>
                <TableHead className="text-xs">Added By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenditures.map((exp: any) => (
                <TableRow key={exp.id} className="border-border/30">
                  <TableCell className="text-xs font-mono text-muted-foreground">{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${categoryStyles[exp.category]} text-[10px] capitalize`}>{exp.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{exp.description}</TableCell>
                  <TableCell className="text-sm font-mono font-semibold text-destructive">{formatKES(Number(exp.amount))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{exp.added_by}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default ExpenditurePage;
