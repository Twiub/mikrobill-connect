import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import StatCard from "@/components/StatCard";
import { authClient } from "@/lib/authClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Receipt, TrendingDown, Calculator, Wallet, Loader2, Save, Pencil, Tag, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { formatKES, useTransactions } from "@/hooks/useDatabase";

const useExpenditures = () => useQuery({
  queryKey: ["expenditures"],
  queryFn: async () => {
    const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "");
    const res = await fetch(`${API}/api/admin/data/expenditures`, {
      headers: { Authorization: `Bearer ${authClient.getToken()}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});

const useCategories = () => useQuery({
  queryKey: ["expenditure_categories"],
  queryFn: async () => {
    const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "");
    const res = await fetch(`${API}/api/admin/data/expenditure-categories`, {
      headers: { Authorization: `Bearer ${authClient.getToken()}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});

const useStaff = () => useQuery({
  queryKey: ["staff"],
  queryFn: async () => {
    const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "");
    const res = await fetch(`${API}/api/admin/data/staff`, {
      headers: { Authorization: `Bearer ${authClient.getToken()}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});

const EMPTY_EXP = { description: "", amount: "", category_id: "", staff_id: "", expense_date: new Date().toISOString().slice(0, 10), is_recurring: false, notes: "" };
const EMPTY_CAT = { name: "", color: "#6366f1", is_recurring: false };
const EMPTY_STAFF = { full_name: "", email: "", phone: "", role: "technician", department: "", salary: "", recurring_day: 1, hire_date: "", is_active: true };

const ExpenditurePage = () => {
  const { data: expenditures = [] } = useExpenditures();
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: staff = [] } = useStaff();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expOpen, setExpOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editExpId, setEditExpId] = useState<string | null>(null);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editStaffId, setEditStaffId] = useState<string | null>(null);
  const [expForm, setExpForm] = useState({ ...EMPTY_EXP });
  const [catForm, setCatForm] = useState({ ...EMPTY_CAT });
  const [staffForm, setStaffForm] = useState({ ...EMPTY_STAFF });

  const totalExpenses = (expenditures as any[]).reduce((s, e) => s + Number(e.amount), 0);
  const grossRevenue = (transactions as any[])
    ?.filter((t: any) => t.status === "success")
    ?.reduce((s: number, t: any) => s + Number(t.amount), 0) ?? 0;
  const taxRate = 16;
  const taxableIncome = grossRevenue - totalExpenses;
  const taxDue = Math.round(taxableIncome * taxRate / 100);
  const netProfit = taxableIncome - taxDue;

  const catMap: Record<string, { name: string; color: string }> = {};
  (categories as any[]).forEach((c) => { catMap[c.id] = { name: c.name, color: c.color }; });

  const categoryData = (categories as any[]).map((cat) => ({
    category: cat.name,
    amount: (expenditures as any[]).filter((e) => e.category_id === cat.id).reduce((s, e) => s + Number(e.amount), 0),
  })).filter((d) => d.amount > 0);

  const sExp = (k: keyof typeof EMPTY_EXP) => (v: any) => setExpForm((f) => ({ ...f, [k]: v }));
  const sCat = (k: keyof typeof EMPTY_CAT) => (v: any) => setCatForm((f) => ({ ...f, [k]: v }));
  const sStaff = (k: keyof typeof EMPTY_STAFF) => (v: any) => setStaffForm((f) => ({ ...f, [k]: v }));

  const openAddExp = () => { setEditExpId(null); setExpForm({ ...EMPTY_EXP }); setExpOpen(true); };
  const openEditExp = (e: any) => {
    setEditExpId(e.id);
    setExpForm({ description: e.description ?? "", amount: e.amount ?? "", category_id: e.category_id ?? "", staff_id: e.staff_id ?? "", expense_date: e.expense_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), is_recurring: e.is_recurring ?? false, notes: e.notes ?? "" });
    setExpOpen(true);
  };

  const saveExp = async () => {
    if (!expForm.description.trim() || !expForm.amount) {
      toast({ title: "Validation Error", description: "Description and amount are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        description: expForm.description.trim(), amount: Number(expForm.amount),
        category_id: expForm.category_id || null, staff_id: expForm.staff_id || null,
        expense_date: expForm.expense_date, is_recurring: expForm.is_recurring,
        notes: expForm.notes || null, added_by: "admin",
        // legacy category field - use first category name if possible
        category: expForm.category_id ? (catMap[expForm.category_id]?.name?.toLowerCase() ?? "other") : "other",
      };
      const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "");
      const token = authClient.getToken();
      if (editExpId) {
        const res = await fetch(`${API}/api/admin/data/expenditures/${editExpId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast({ title: "Expense Updated" });
      } else {
        const res = await fetch(`${API}/api/admin/data/expenditures`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast({ title: "Expense Added" });
      }
      queryClient.invalidateQueries({ queryKey: ["expenditures"] });
      setExpOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "");
      const token = authClient.getToken();
      if (editCatId) {
        const res = await fetch(`${API}/api/admin/data/expenditure-categories/${editCatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: catForm.name, color: catForm.color, is_recurring: catForm.is_recurring }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast({ title: "Category Updated" });
      } else {
        const res = await fetch(`${API}/api/admin/data/expenditure-categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: catForm.name, color: catForm.color, is_recurring: catForm.is_recurring }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast({ title: "Category Created" });
      }
      queryClient.invalidateQueries({ queryKey: ["expenditure_categories"] });
      setCatOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveStaff = async () => {
    if (!staffForm.full_name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: any = { full_name: staffForm.full_name, email: staffForm.email || null, phone: staffForm.phone || null, role: staffForm.role, department: staffForm.department || null, salary: staffForm.salary ? Number(staffForm.salary) : 0, recurring_day: Number(staffForm.recurring_day), hire_date: staffForm.hire_date || null, is_active: staffForm.is_active };
      const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "");
      const token = authClient.getToken();
      if (editStaffId) {
        const res = await fetch(`${API}/api/admin/data/staff/${editStaffId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast({ title: "Staff Updated" });
      } else {
        const res = await fetch(`${API}/api/admin/data/staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast({ title: "Staff Added" });
      }
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      setStaffOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const totalSalaries = (staff as any[]).reduce((s, m) => s + Number(m.salary), 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Expenditure &amp; Tax</h1>
            <p className="text-sm text-muted-foreground mt-1">Track ISP expenses, staff salaries, and calculate tax liability</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { setEditCatId(null); setCatForm({ ...EMPTY_CAT }); setCatOpen(true); }}>
              <Tag className="h-4 w-4" />Categories
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { setEditStaffId(null); setStaffForm({ ...EMPTY_STAFF }); setStaffOpen(true); }}>
              <Users className="h-4 w-4" />Add Staff
            </Button>
            <Button size="sm" className="gap-2" onClick={openAddExp}>
              <Plus className="h-4 w-4" />Add Expense
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Gross Revenue" value={formatKES(grossRevenue)} change="February 2026" changeType="positive" icon={Wallet} />
          <StatCard title="Total Expenses" value={formatKES(totalExpenses)} change={`${(expenditures as any[]).length} entries`} changeType="negative" icon={TrendingDown} />
          <StatCard title="Tax Due (VAT 16%)" value={formatKES(taxDue)} change={`on ${formatKES(taxableIncome)} taxable`} changeType="neutral" icon={Calculator} />
          <StatCard title="Net Profit" value={formatKES(netProfit)} change={netProfit > 0 ? "profitable" : "loss"} changeType={netProfit > 0 ? "positive" : "negative"} icon={Receipt} />
        </div>

        <Tabs defaultValue="expenses">
          <TabsList>
            <TabsTrigger value="expenses">Expenses ({(expenditures as any[]).length})</TabsTrigger>
            <TabsTrigger value="staff">Staff ({(staff as any[]).length})</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses" className="space-y-4 mt-4">
            <div className="glass-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Recurring</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenditures as any[]).map((exp) => (
                    <TableRow key={exp.id} className="border-border/30">
                      <TableCell className="text-xs font-mono text-muted-foreground">{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {exp.expenditure_categories ? (
                          <Badge variant="outline" style={{ borderColor: exp.expenditure_categories.color + "55", color: exp.expenditure_categories.color, backgroundColor: exp.expenditure_categories.color + "22" }} className="text-[10px]">
                            {exp.expenditure_categories.name}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground capitalize">{exp.category}</span>}
                      </TableCell>
                      <TableCell className="text-sm">{exp.description}</TableCell>
                      <TableCell className="text-sm font-mono font-semibold text-destructive">{formatKES(Number(exp.amount))}</TableCell>
                      <TableCell className="text-xs">{exp.is_recurring ? <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Recurring</Badge> : "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => openEditExp(exp)}>
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Monthly salary budget: <span className="font-semibold text-foreground">{formatKES(totalSalaries)}</span></p>
            </div>
            <div className="glass-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Role</TableHead>
                    <TableHead className="text-xs">Department</TableHead>
                    <TableHead className="text-xs">Salary</TableHead>
                    <TableHead className="text-xs">Pay Day</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(staff as any[]).map((s) => (
                    <TableRow key={s.id} className="border-border/30">
                      <TableCell className="text-sm font-medium">{s.full_name}</TableCell>
                      <TableCell className="text-xs capitalize">{s.role}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.department ?? "—"}</TableCell>
                      <TableCell className="text-sm font-mono font-semibold">{formatKES(Number(s.salary))}</TableCell>
                      <TableCell className="text-xs">Day {s.recurring_day}</TableCell>
                      <TableCell><Badge variant="outline" className={s.is_active ? "bg-success/10 text-success border-success/30 text-[10px]" : "text-[10px]"}>{s.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => {
                          setEditStaffId(s.id);
                          setStaffForm({ full_name: s.full_name, email: s.email ?? "", phone: s.phone ?? "", role: s.role, department: s.department ?? "", salary: s.salary ?? "", recurring_day: s.recurring_day ?? 1, hire_date: s.hire_date ?? "", is_active: s.is_active });
                          setStaffOpen(true);
                        }}>
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(staff as any[]).length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No staff added yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-4">Expenses by Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(v: number) => [formatKES(v)]} />
                    <Bar dataKey="amount" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
                      <span className={`text-sm font-bold ${item.positive ? "text-success" : "text-destructive"}`}>{item.value < 0 ? "- " : ""}{formatKES(Math.abs(item.value))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit Expense */}
      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editExpId ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input placeholder="e.g. Monthly ISP link payment" value={expForm.description} onChange={(e) => sExp("description")(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Amount (KES) *</Label>
                <Input type="number" placeholder="5000" value={expForm.amount} onChange={(e) => sExp("amount")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={expForm.expense_date} onChange={(e) => sExp("expense_date")(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={expForm.category_id} onValueChange={sExp("category_id")}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(categories as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Staff Member (if salary/staff cost)</Label>
              <Select value={expForm.staff_id} onValueChange={sExp("staff_id")}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {(staff as any[]).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={expForm.notes} onChange={(e) => sExp("notes")(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={expForm.is_recurring} onCheckedChange={sExp("is_recurring")} />
              <Label>Recurring monthly expense</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpOpen(false)}>Cancel</Button>
            <Button onClick={saveExp} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editExpId ? "Save" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editCatId ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category Name *</Label>
              <Input placeholder="e.g. Internet Lease" value={catForm.name} onChange={(e) => sCat("name")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={catForm.color} onChange={(e) => sCat("color")(e.target.value)} className="h-9 w-16 rounded border border-border cursor-pointer" />
                <Input value={catForm.color} onChange={(e) => sCat("color")(e.target.value)} className="flex-1 font-mono" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={catForm.is_recurring} onCheckedChange={sCat("is_recurring")} />
              <Label>Typically recurring</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>Cancel</Button>
            <Button onClick={saveCat} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff Dialog */}
      <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editStaffId ? "Edit Staff" : "Add Staff Member"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Full Name *</Label>
                <Input placeholder="Jane Wambua" value={staffForm.full_name} onChange={(e) => sStaff("full_name")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="0712345678" value={staffForm.phone} onChange={(e) => sStaff("phone")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input placeholder="jane@example.com" value={staffForm.email} onChange={(e) => sStaff("email")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={staffForm.role} onValueChange={sStaff("role")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["technician", "accountant", "manager", "support", "director", "other"].map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="Technical" value={staffForm.department} onChange={(e) => sStaff("department")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly Salary (KES)</Label>
                <Input type="number" placeholder="25000" value={staffForm.salary} onChange={(e) => sStaff("salary")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Pay Day (day of month)</Label>
                <Input type="number" min="1" max="28" placeholder="1" value={staffForm.recurring_day} onChange={(e) => sStaff("recurring_day")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hire Date</Label>
                <Input type="date" value={staffForm.hire_date} onChange={(e) => sStaff("hire_date")(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={staffForm.is_active} onCheckedChange={sStaff("is_active")} />
              <Label>Active employee</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffOpen(false)}>Cancel</Button>
            <Button onClick={saveStaff} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editStaffId ? "Save" : "Add Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default ExpenditurePage;
