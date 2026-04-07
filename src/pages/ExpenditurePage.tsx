import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
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
import { formatKES, useTransactions, useExpenditures, useExpenditureCategories, useStaff } from "@/hooks/useDatabase";

const EMPTY_EXP = { description: "", amount: "", category: "other" as string, expense_date: new Date().toISOString().slice(0, 10), is_recurring: false, notes: "" };
const EMPTY_CAT = { name: "", color: "#6366f1", is_recurring: false };
const EMPTY_STAFF = { full_name: "", email: "", phone: "", role: "technician", department: "", salary: "", recurring_day: 1, hire_date: "", is_active: true };

const ExpenditurePage = () => {
  const { data: expenditures = [] } = useExpenditures();
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useExpenditureCategories();
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
  const grossRevenue = (transactions as any[])?.filter((t: any) => t.status === "success")?.reduce((s: number, t: any) => s + Number(t.amount), 0) ?? 0;
  const taxRate = 16;
  const taxableIncome = Math.max(0, grossRevenue - totalExpenses);
  const taxDue = Math.round(taxableIncome * taxRate / 100);
  const netProfit = grossRevenue - totalExpenses - taxDue;

  const sExp = (k: keyof typeof EMPTY_EXP) => (v: any) => setExpForm(f => ({ ...f, [k]: v }));
  const sCat = (k: keyof typeof EMPTY_CAT) => (v: any) => setCatForm(f => ({ ...f, [k]: v }));
  const sStaff = (k: keyof typeof EMPTY_STAFF) => (v: any) => setStaffForm(f => ({ ...f, [k]: v }));

  const openAddExp = () => { setEditExpId(null); setExpForm({ ...EMPTY_EXP }); setExpOpen(true); };
  const openEditExp = (e: any) => {
    setEditExpId(e.id);
    setExpForm({ description: e.description ?? "", amount: e.amount ?? "", category: e.category ?? "other", expense_date: e.expense_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), is_recurring: e.is_recurring ?? false, notes: e.notes ?? "" });
    setExpOpen(true);
  };

  const saveExp = async () => {
    if (!expForm.description.trim() || !expForm.amount) { toast({ title: "Description and amount required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        description: expForm.description.trim(), amount: Number(expForm.amount),
        category: expForm.category as any, expense_date: expForm.expense_date,
        is_recurring: expForm.is_recurring, notes: expForm.notes || null, added_by: "admin",
      };
      if (editExpId) {
        const { error } = await supabase.from("expenditures").update(payload).eq("id", editExpId);
        if (error) throw error;
        toast({ title: "Expense Updated" });
      } else {
        const { error } = await supabase.from("expenditures").insert(payload);
        if (error) throw error;
        toast({ title: "Expense Added" });
      }
      queryClient.invalidateQueries({ queryKey: ["expenditures"] });
      setExpOpen(false);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { name: catForm.name, color: catForm.color, is_recurring: catForm.is_recurring };
      if (editCatId) {
        const { error } = await supabase.from("expenditure_categories").update(payload).eq("id", editCatId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenditure_categories").insert(payload);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["expenditure_categories"] });
      setCatOpen(false);
      toast({ title: editCatId ? "Category Updated" : "Category Created" });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const saveStaff = async () => {
    if (!staffForm.full_name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { full_name: staffForm.full_name, email: staffForm.email || null, phone: staffForm.phone || null, role: staffForm.role, department: staffForm.department || null, salary: staffForm.salary ? Number(staffForm.salary) : 0, recurring_day: Number(staffForm.recurring_day), hire_date: staffForm.hire_date || null, is_active: staffForm.is_active };
      if (editStaffId) {
        const { error } = await supabase.from("staff").update(payload).eq("id", editStaffId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff").insert(payload);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      setStaffOpen(false);
      toast({ title: editStaffId ? "Staff Updated" : "Staff Added" });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Expenditure & P&L</h1>
            <p className="text-sm text-muted-foreground mt-1">Track expenses, staff salaries, and profit</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Gross Revenue" value={formatKES(grossRevenue)} change="From transactions" changeType="positive" icon={Wallet} />
          <StatCard title="Total Expenses" value={formatKES(totalExpenses)} change={`${(expenditures as any[]).length} entries`} changeType="negative" icon={TrendingDown} />
          <StatCard title="Tax Due (16%)" value={formatKES(taxDue)} change="On taxable income" changeType="neutral" icon={Calculator} />
          <StatCard title="Net Profit" value={formatKES(netProfit)} change={netProfit >= 0 ? "Profitable" : "Loss"} changeType={netProfit >= 0 ? "positive" : "negative"} icon={Receipt} />
        </div>

        <Tabs defaultValue="expenses">
          <TabsList>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" className="gap-2" onClick={openAddExp}><Plus className="h-4 w-4" />Add Expense</Button>
            </div>
            <div className="glass-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Date</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenditures as any[]).map((e: any) => (
                    <TableRow key={e.id} className="border-border/30">
                      <TableCell className="text-sm">{e.description}</TableCell>
                      <TableCell className="text-sm font-mono">{formatKES(Number(e.amount))}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{e.category}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{e.expense_date}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEditExp(e)}>
                          <Pencil className="h-3 w-3" />Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(expenditures as any[]).length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No expenses recorded</p>
                  <p className="text-xs mt-1">Click "Add Expense" to get started</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" className="gap-2" onClick={() => { setEditCatId(null); setCatForm({ ...EMPTY_CAT }); setCatOpen(true); }}>
                <Plus className="h-4 w-4" />Add Category
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(categories as any[]).map((c: any) => (
                <div key={c.id} className="glass-card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditCatId(c.id); setCatForm({ name: c.name, color: c.color, is_recurring: c.is_recurring }); setCatOpen(true); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="staff" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" className="gap-2" onClick={() => { setEditStaffId(null); setStaffForm({ ...EMPTY_STAFF }); setStaffOpen(true); }}>
                <Plus className="h-4 w-4" />Add Staff
              </Button>
            </div>
            <div className="glass-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Role</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Salary</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(staff as any[]).map((s: any) => (
                    <TableRow key={s.id} className="border-border/30">
                      <TableCell className="text-sm font-medium">{s.full_name}</TableCell>
                      <TableCell className="text-xs capitalize">{s.role}</TableCell>
                      <TableCell className="text-xs font-mono hidden sm:table-cell">{formatKES(Number(s.salary))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{s.email || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                          setEditStaffId(s.id);
                          setStaffForm({ full_name: s.full_name, email: s.email || "", phone: s.phone || "", role: s.role, department: s.department || "", salary: s.salary?.toString() || "", recurring_day: s.recurring_day, hire_date: s.hire_date || "", is_active: s.is_active });
                          setStaffOpen(true);
                        }}>
                          <Pencil className="h-3 w-3" />Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        {/* Expense Dialog */}
        <Dialog open={expOpen} onOpenChange={setExpOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editExpId ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><Label className="text-xs">Description</Label><Input value={expForm.description} onChange={e => sExp("description")(e.target.value)} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Amount (KES)</Label><Input type="number" value={expForm.amount} onChange={e => sExp("amount")(e.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={expForm.category} onValueChange={v => sExp("category")(v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bandwidth">Bandwidth</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="power">Power</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Date</Label><Input type="date" value={expForm.expense_date} onChange={e => sExp("expense_date")(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Notes</Label><Textarea value={expForm.notes} onChange={e => sExp("notes")(e.target.value)} className="mt-1" rows={2} /></div>
              <div className="flex items-center gap-2"><Switch checked={expForm.is_recurring} onCheckedChange={v => sExp("is_recurring")(v)} /><Label className="text-xs">Recurring</Label></div>
            </div>
            <DialogFooter>
              <Button onClick={saveExp} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editExpId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Category Dialog */}
        <Dialog open={catOpen} onOpenChange={setCatOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editCatId ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><Label className="text-xs">Name</Label><Input value={catForm.name} onChange={e => sCat("name")(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Color</Label><Input type="color" value={catForm.color} onChange={e => sCat("color")(e.target.value)} className="mt-1 h-10" /></div>
              <div className="flex items-center gap-2"><Switch checked={catForm.is_recurring} onCheckedChange={v => sCat("is_recurring")(v)} /><Label className="text-xs">Recurring</Label></div>
            </div>
            <DialogFooter>
              <Button onClick={saveCat} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Staff Dialog */}
        <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editStaffId ? "Edit Staff" : "Add Staff"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div><Label className="text-xs">Full Name</Label><Input value={staffForm.full_name} onChange={e => sStaff("full_name")(e.target.value)} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Email</Label><Input value={staffForm.email} onChange={e => sStaff("email")(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">Phone</Label><Input value={staffForm.phone} onChange={e => sStaff("phone")(e.target.value)} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Role</Label><Input value={staffForm.role} onChange={e => sStaff("role")(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">Salary (KES)</Label><Input type="number" value={staffForm.salary} onChange={e => sStaff("salary")(e.target.value)} className="mt-1" /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={staffForm.is_active} onCheckedChange={v => sStaff("is_active")(v)} /><Label className="text-xs">Active</Label></div>
            </div>
            <DialogFooter>
              <Button onClick={saveStaff} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default ExpenditurePage;
