import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePackages } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Clock, Zap, Loader2, Save, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const useBandwidthSchedules = () => useQuery({
  queryKey: ["bandwidth_schedules"],
  queryFn: async () => {
    const { data, error } = await supabase.from("bandwidth_schedules").select("*, packages(name)").order("created_at");
    if (error) throw error;
    return data ?? [];
  },
});

const EMPTY_SCHED = {
  package_id: "", label: "", start_time: "00:00", end_time: "08:00",
  rate_down: "5M", rate_up: "2M", day_of_week: [] as number[],
  is_active: true, priority: 10,
};

const BandwidthPage = () => {
  const { data: schedules = [] } = useBandwidthSchedules();
  const { data: packages = [] } = usePackages();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_SCHED });

  const set = (k: keyof typeof EMPTY_SCHED) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_SCHED }); setOpen(true); };
  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      package_id: s.package_id ?? "", label: s.label ?? "", start_time: s.start_time ?? "00:00",
      end_time: s.end_time ?? "08:00", rate_down: s.rate_down ?? "5M", rate_up: s.rate_up ?? "2M",
      day_of_week: s.day_of_week ?? [], is_active: s.is_active ?? true, priority: s.priority ?? 10,
    });
    setOpen(true);
  };

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      day_of_week: f.day_of_week.includes(d) ? f.day_of_week.filter((x) => x !== d) : [...f.day_of_week, d].sort(),
    }));
  };

  const handleSave = async () => {
    if (!form.package_id || !form.label.trim() || !form.rate_down || !form.rate_up) {
      toast({ title: "Validation Error", description: "Package, label, and speeds are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        package_id: form.package_id, label: form.label.trim(), start_time: form.start_time,
        end_time: form.end_time, rate_down: form.rate_down, rate_up: form.rate_up,
        day_of_week: form.day_of_week.length ? form.day_of_week : null,
        is_active: form.is_active, priority: Number(form.priority),
      };
      if (editId) {
        const { error } = await supabase.from("bandwidth_schedules").update(payload).eq("id", editId);
        if (error) throw error;
        toast({ title: "Schedule Updated" });
      } else {
        const { error } = await supabase.from("bandwidth_schedules").insert(payload);
        if (error) throw error;
        toast({ title: "Schedule Created" });
      }
      queryClient.invalidateQueries({ queryKey: ["bandwidth_schedules"] });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    await supabase.from("bandwidth_schedules").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["bandwidth_schedules"] });
    toast({ title: "Schedule Deleted" });
  };

  const toggleActive = async (s: any) => {
    await supabase.from("bandwidth_schedules").update({ is_active: !s.is_active }).eq("id", s.id);
    queryClient.invalidateQueries({ queryKey: ["bandwidth_schedules"] });
  };

  // Group by package for visual display
  const pkgGroups: Record<string, { name: string; schedules: any[] }> = {};
  (packages as any[]).forEach((p) => { pkgGroups[p.id] = { name: p.name, schedules: [] }; });
  (schedules as any[]).forEach((s) => {
    if (s.package_id && pkgGroups[s.package_id]) pkgGroups[s.package_id].schedules.push(s);
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Bandwidth Schedules</h1>
            <p className="text-sm text-muted-foreground mt-1">Time-based bandwidth policies applied to MikroTik queue trees</p>
          </div>
          <Button size="sm" className="gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" />Add Schedule
          </Button>
        </div>

        {/* Visual Package Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(pkgGroups).map(([pkgId, grp]) => grp.schedules.length > 0 ? (
            <div key={pkgId} className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold">{grp.name}</h3>
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                {grp.schedules.map((s: any) => (
                  <div key={s.id} className={`flex items-center justify-between p-3 rounded-lg border ${s.is_active ? "bg-muted/30 border-border/50" : "bg-muted/10 border-border/20 opacity-60"}`}>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-semibold">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground">{s.start_time} — {s.end_time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono font-semibold text-primary">↓{s.rate_down} / ↑{s.rate_up}</p>
                      <p className="text-[10px] text-muted-foreground">{s.day_of_week?.length ? s.day_of_week.map((d: number) => dayNames[d]).join(", ") : "All days"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null)}
        </div>

        {/* Full Table */}
        <div className="glass-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs whitespace-nowrap">Package</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Label</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Time Range</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Days</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Download</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Upload</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Priority</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Active</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(schedules as any[]).map((s) => (
                <TableRow key={s.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{(s as any).packages?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{s.label}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{s.start_time} — {s.end_time}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.day_of_week?.length ? s.day_of_week.map((d: number) => dayNames[d]).join(", ") : "All"}</TableCell>
                  <TableCell className="text-xs font-mono font-semibold text-success">{s.rate_down}</TableCell>
                  <TableCell className="text-xs font-mono font-semibold text-info">{s.rate_up}</TableCell>
                  <TableCell className="text-xs text-center">{s.priority ?? 10}</TableCell>
                  <TableCell>
                    <Switch checked={s.is_active !== false} onCheckedChange={() => toggleActive(s)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => openEdit(s)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(schedules as any[]).length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No schedules configured. Add one to enable time-based bandwidth control.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Schedule" : "Add Bandwidth Schedule"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Package *</Label>
              <Select value={form.package_id} onValueChange={set("package_id")}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>
                  {(packages as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input placeholder="e.g. Off-Peak Night, Peak Hours" value={form.label} onChange={(e) => set("label")(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => set("start_time")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={form.end_time} onChange={(e) => set("end_time")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Download Speed *</Label>
                <Input placeholder="5M" value={form.rate_down} onChange={(e) => set("rate_down")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Upload Speed *</Label>
                <Input placeholder="2M" value={form.rate_up} onChange={(e) => set("rate_up")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Priority (1–32)</Label>
                <Input type="number" min="1" max="32" value={form.priority} onChange={(e) => set("priority")(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">lower = higher priority in queue</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Days of Week (blank = all days)</Label>
              <div className="flex flex-wrap gap-2">
                {dayNames.map((day, i) => (
                  <button key={i} type="button" onClick={() => toggleDay(i)} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.day_of_week.includes(i) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={set("is_active")} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? "Save Changes" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default BandwidthPage;
