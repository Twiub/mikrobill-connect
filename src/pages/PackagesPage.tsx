import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { usePackages, formatKES } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { Zap, Plus, Pencil, Save, Loader2, Wifi, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const EMPTY_PKG = {
  name: "", price: 0, duration_days: 30, speed_down: "10M", speed_up: "5M",
  max_devices: 2, type: "hotspot" as string, tier: "basic" as string, active: true,
};

const tierColors: Record<string, string> = {
  basic: "bg-muted text-muted-foreground border-border",
  standard: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  premium: "bg-primary/15 text-primary border-primary/30",
  unlimited: "bg-green-500/15 text-green-400 border-green-500/30",
};

const PackagesPage = () => {
  const { data: packages, isLoading } = usePackages();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_PKG });

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_PKG }); setOpen(true); };
  const openEdit = (pkg: any) => {
    setEditId(pkg.id);
    setForm({
      name: pkg.name ?? "", price: pkg.price ?? 0, duration_days: pkg.duration_days ?? 30,
      speed_down: pkg.speed_down ?? "10M", speed_up: pkg.speed_up ?? "5M",
      max_devices: pkg.max_devices ?? 2, type: pkg.type ?? "hotspot", tier: pkg.tier ?? "basic",
      active: pkg.active ?? true,
    });
    setOpen(true);
  };

  const set = (k: keyof typeof EMPTY_PKG) => (v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.speed_down || !form.speed_up) {
      toast({ title: "Validation Error", description: "Name, download and upload speeds are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), price: Number(form.price), duration_days: Number(form.duration_days),
        speed_down: form.speed_down, speed_up: form.speed_up, max_devices: Number(form.max_devices),
        type: form.type as any, tier: form.tier as any, active: form.active,
      };
      if (editId) {
        const { error } = await supabase.from("packages").update(payload).eq("id", editId);
        if (error) throw error;
        toast({ title: "Package Updated", description: `${form.name} saved.` });
      } else {
        const { error } = await supabase.from("packages").insert(payload);
        if (error) throw error;
        toast({ title: "Package Created", description: `${form.name} created.` });
      }
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (pkg: any) => {
    try {
      const { error } = await supabase.from("packages").update({ active: !pkg.active }).eq("id", pkg.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: pkg.active ? "Package Disabled" : "Package Enabled" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Packages</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage hotspot & PPPoE packages</p>
          </div>
          <Button size="sm" className="gap-2" onClick={openAdd}><Plus className="h-4 w-4" />New Package</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card p-5 animate-pulse space-y-3">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-6 w-16 bg-muted rounded" />
                <div className="h-3 w-full bg-muted rounded" />
              </div>
            ))
          ) : (
            (packages as any[])?.map((pkg: any) => (
              <div key={pkg.id} className={`glass-card p-5 space-y-3 ${!pkg.active ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-[10px] ${tierColors[pkg.tier] || tierColors.basic}`}>
                    {pkg.tier}
                  </Badge>
                  <Switch checked={pkg.active} onCheckedChange={() => toggleActive(pkg)} aria-label={`Toggle ${pkg.name}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">{pkg.name}</h3>
                  <p className="text-xl font-bold text-primary mt-1">{formatKES(pkg.price)}</p>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>Speed</span><span className="font-mono">{pkg.speed_down}/{pkg.speed_up}</span></div>
                  <div className="flex justify-between"><span>Duration</span><span>{pkg.duration_days} days</span></div>
                  <div className="flex justify-between"><span>Max Devices</span><span>{pkg.max_devices}</span></div>
                  <div className="flex justify-between"><span>Type</span><span className="capitalize">{pkg.type}</span></div>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-1 text-xs" onClick={() => openEdit(pkg)}>
                  <Pencil className="h-3 w-3" />Edit
                </Button>
              </div>
            ))
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Edit Package" : "New Package"}</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
              <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={e => set("name")(e.target.value)} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Price (KES)</Label><Input type="number" value={form.price} onChange={e => set("price")(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">Duration (days)</Label><Input type="number" value={form.duration_days} onChange={e => set("duration_days")(e.target.value)} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Download Speed</Label><Input value={form.speed_down} onChange={e => set("speed_down")(e.target.value)} className="mt-1" placeholder="e.g. 10M" /></div>
                <div><Label className="text-xs">Upload Speed</Label><Input value={form.speed_up} onChange={e => set("speed_up")(e.target.value)} className="mt-1" placeholder="e.g. 5M" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Max Devices</Label><Input type="number" value={form.max_devices} onChange={e => set("max_devices")(e.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={form.type} onValueChange={v => set("type")(v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotspot">Hotspot</SelectItem>
                      <SelectItem value="pppoe">PPPoE</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Tier</Label>
                <Select value={form.tier} onValueChange={v => set("tier")(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={v => set("active")(v)} />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default PackagesPage;
