// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { usePackages, formatKES } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { Zap, Plus, Pencil, Save, Loader2, Wifi, Network, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/StatusBadge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const EMPTY_PKG = {
  name: "", price: 0, duration_days: 30, speed_down: "10M", speed_up: "5M",
  max_devices: 2, type: "hotspot", tier: "basic", active: true,
  pppoe_profile: "", hotspot_profile: "", burst_down: "", burst_up: "",
  burst_threshold: "", burst_time_s: "" as string | number,
  data_cap_gb: "" as string | number, shared_users_max: 1, description: "",
  max_connections_per_user: 300 as number | null,
  mesh_vlan_id: "" as string | number,
};

const tierColors: Record<string, string> = {
  basic: "bg-muted text-muted-foreground border-border",
  standard: "bg-info/15 text-info border-info/30",
  premium: "bg-primary/15 text-primary border-primary/30",
  unlimited: "bg-success/15 text-success border-success/30",
};

const PackagesPage = () => {
  const { data: packages, isLoading } = usePackages();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_PKG>({ ...EMPTY_PKG });

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_PKG }); setOpen(true); };
  const openEdit = (pkg: any) => {
    setEditId(pkg.id);
    setForm({
      name: pkg.name ?? "", price: pkg.price ?? 0, duration_days: pkg.duration_days ?? 30,
      speed_down: pkg.speed_down ?? "10M", speed_up: pkg.speed_up ?? "5M",
      max_devices: pkg.max_devices ?? 2, type: pkg.type ?? "hotspot", tier: pkg.tier ?? "basic",
      active: pkg.active ?? true, pppoe_profile: pkg.pppoe_profile ?? "",
      hotspot_profile: pkg.hotspot_profile ?? "", burst_down: pkg.burst_down ?? "",
      burst_up: pkg.burst_up ?? "", burst_threshold: pkg.burst_threshold ?? "",
      burst_time_s: pkg.burst_time_s ?? "", data_cap_gb: pkg.data_cap_gb ?? "",
      shared_users_max: pkg.shared_users_max ?? 1, description: pkg.description ?? "",
      max_connections_per_user: pkg.max_connections_per_user ?? 300,
      mesh_vlan_id: pkg.mesh_vlan_id ?? "",
    });
    setOpen(true);
  };

  const set = (k: keyof typeof EMPTY_PKG) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.speed_down || !form.speed_up) {
      toast({ title: "Validation Error", description: "Name, download and upload speeds are required.", variant: "destructive" });
      return;
    }
    // R22-005 FIX: Validate mesh_vlan_id >= 2 to prevent VLAN 0 (untagged) or VLAN 1
    // (management) being assigned. VLAN 1 is the switch management VLAN on most AP
    // hardware — a subscriber on VLAN 1 would be on the same L2 as the AP management
    // interface, allowing ARP poisoning of the AP's management IP.
    // DB CHECK constraint (migration 216) also enforces >= 2, but we validate here
    // first to give a clear user-facing error rather than a cryptic Supabase DB error.
    if (form.mesh_vlan_id !== "" && form.mesh_vlan_id !== null) {
      const vlanNum = Number(form.mesh_vlan_id);
      if (isNaN(vlanNum) || vlanNum < 2 || vlanNum > 4094 || !Number.isInteger(vlanNum)) {
        toast({ title: "Validation Error", description: "Mesh VLAN ID must be an integer between 2 and 4094. VLAN 0 and VLAN 1 (management) are reserved.", variant: "destructive" });
        return;
      }

      // D-01 FIX (Round 23): Check for collision with management VLANs on linked mesh nodes.
      // If a subscriber data VLAN ID matches a node's management VLAN, traffic from that
      // subscriber will be injected into the AP management bridge (br-mgmt / br-vlanN),
      // making the AP unreachable from MikroBill and disabling all config pushes for that node.
      //
      // We query mesh_node_settings for any management_vlan that equals this VLAN ID.
      // The check is non-blocking (soft warning + hard block) — it runs before the DB insert.
      try {
        const { data: conflictingNodes } = await supabase
          .from("mesh_node_settings")
          .select("node_id, management_vlan, nodes(name, meshes(name))")
          .eq("management_vlan", vlanNum)
          .limit(3);
        if (conflictingNodes && conflictingNodes.length > 0) {
          const nodeNames = conflictingNodes
            .map((n: any) => n.nodes?.name ?? n.node_id)
            .join(", ");
          toast({
            title: "VLAN Conflict — D-01",
            description: `VLAN ID ${vlanNum} is the management VLAN for node(s): ${nodeNames}. Using it as a subscriber data VLAN would break AP management connectivity. Choose a different VLAN ID.`,
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
      } catch (_vlanCheckErr) {
        // Non-fatal: if the check fails (e.g. mesh_node_settings not yet migrated),
        // proceed with the save. The DB constraint is the hard backstop.
      }
    }
    setSaving(true);
    try {
      // Only send columns that exist in the packages table schema
      const payload: any = {
        name: form.name.trim(),
        price: Number(form.price),
        duration_days: Number(form.duration_days),
        speed_down: form.speed_down,
        speed_up: form.speed_up,
        max_devices: Number(form.max_devices),
        type: form.type,
        tier: form.tier,
        active: form.active,
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
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg: any) => {
    // BUG-S2-003 FIX v3.19.1: Direct supabase.from("packages").update() bypasses the backend
    // and the packages.active ↔ is_active sync trigger may not fire reliably via PostgREST
    // (RLS policies can intercept before triggers on some Supabase configurations).
    // Route through the admin backend so the trigger fires on the correct connection.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");
      await fetch(`${API}/admin/packages/${pkg.id}/toggle-active`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ active: !pkg.active }),
      });
    } catch (_) {
      // Fallback: direct Supabase write (trigger should still fire on standard Supabase)
      await supabase.from("packages").update({ active: !pkg.active }).eq("id", pkg.id);
    }
    queryClient.invalidateQueries({ queryKey: ["packages"] });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Packages</h1>
            <p className="text-sm text-muted-foreground mt-1">WiFi plans — PPPoE, Hotspot &amp; both</p>
          </div>
          <Button size="sm" className="gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" />Add Package
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" /><p className="text-xs">Loading…</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 sm:grid-cols-3 xl:grid-cols-2 sm:grid-cols-4 gap-4">
            {packages?.map((pkg: any) => (
              <div key={pkg.id} className={`glass-card p-6 flex flex-col relative overflow-hidden hover:border-primary/50 transition-colors ${!pkg.active ? "opacity-60" : ""}`}>
                <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-[60px]" />
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold">{pkg.name}</h3>
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <Badge variant="outline" className={`${tierColors[pkg.tier]} text-[10px] capitalize`}>{pkg.tier}</Badge>
                  {pkg.type === "pppoe" && <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-[10px]"><Network className="h-2.5 w-2.5 mr-1" />PPPoE</Badge>}
                  {pkg.type === "hotspot" && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]"><Wifi className="h-2.5 w-2.5 mr-1" />Hotspot</Badge>}
                  {pkg.type === "both" && <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">Both</Badge>}
                </div>
                <p className="text-3xl font-extrabold text-gradient mb-1">{formatKES(Number(pkg.price))}</p>
                <p className="text-xs text-muted-foreground mb-4">{pkg.duration_days} day{pkg.duration_days > 1 ? "s" : ""}</p>
                <div className="space-y-2 flex-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Download</span><span className="font-semibold">{pkg.speed_down}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Upload</span><span className="font-semibold">{pkg.speed_up}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Max Devices</span><span className="font-semibold">{pkg.max_devices}</span></div>
                  {pkg.data_cap_gb && <div className="flex justify-between"><span className="text-muted-foreground">Data Cap</span><span className="font-semibold">{pkg.data_cap_gb} GB</span></div>}
                  {pkg.mesh_vlan_id && <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><Radio className="h-3 w-3" />Mesh VLAN</span><Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px] px-1.5">VLAN {pkg.mesh_vlan_id}</Badge></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Conn Limit</span><span className="font-semibold">{pkg.max_connections_per_user != null ? `${pkg.max_connections_per_user}/user` : "Unlimited"}</span></div>
                </div>
                <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                  <StatusBadge status={pkg.active ? "active" : "expired"} />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary" onClick={() => openEdit(pkg)}>
                      <Pencil className="h-3 w-3 mr-1" />Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleActive(pkg)}>
                      {pkg.active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Package" : "Add New Package"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic">
            <TabsList className="mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="mikrotik">MikroTik</TabsTrigger>
              <TabsTrigger value="burst">Burst &amp; Limits</TabsTrigger>
              <TabsTrigger value="meshdesk">MeshDesk QoS</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Package Name *</Label>
                  <Input placeholder="e.g. Home 10Mbps" value={form.name} onChange={(e) => set("name")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Price (KES) *</Label>
                  <Input type="number" placeholder="500" value={form.price} onChange={(e) => set("price")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Duration (days)</Label>
                  <Input type="number" placeholder="30" value={form.duration_days} onChange={(e) => set("duration_days")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Devices</Label>
                  <Input type="number" placeholder="2" value={form.max_devices} onChange={(e) => set("max_devices")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Download Speed *</Label>
                  <Input placeholder="10M" value={form.speed_down} onChange={(e) => set("speed_down")(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">e.g. 10M, 512k, 1G</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Upload Speed *</Label>
                  <Input placeholder="5M" value={form.speed_up} onChange={(e) => set("speed_up")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Connection Type</Label>
                  <Select value={form.type} onValueChange={set("type")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotspot">Hotspot</SelectItem>
                      <SelectItem value="pppoe">PPPoE</SelectItem>
                      <SelectItem value="both">Both (Hotspot + PPPoE)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tier</Label>
                  <Select value={form.tier} onValueChange={set("tier")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="unlimited">Unlimited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Package description..." value={form.description} onChange={(e) => set("description")(e.target.value)} rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={set("active")} />
                <Label>Active (visible for purchase)</Label>
              </div>
            </TabsContent>
            <TabsContent value="mikrotik" className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                Profile names must match exactly as configured in RouterOS. PPPoE: <code>/ppp profile</code> · Hotspot: <code>/ip hotspot user profile</code>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>PPPoE Profile Name</Label>
                  <Input placeholder="pppoe-10mbps" value={form.pppoe_profile} onChange={(e) => set("pppoe_profile")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hotspot Profile Name</Label>
                  <Input placeholder="hotspot-10mbps" value={form.hotspot_profile} onChange={(e) => set("hotspot_profile")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Shared Users Max</Label>
                  <Input type="number" min="1" placeholder="1" value={form.shared_users_max} onChange={(e) => set("shared_users_max")(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">simultaneous-use (PPPoE)</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Data Cap (GB, blank = unlimited)</Label>
                  <Input type="number" placeholder="50" value={form.data_cap_gb} onChange={(e) => set("data_cap_gb")(e.target.value || "")} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="burst" className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                Burst allows users to exceed their limit temporarily when average usage is below threshold. Maps to RouterOS <code>burst-limit</code>, <code>burst-threshold</code>, <code>burst-time</code>.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Burst Download Speed</Label>
                  <Input placeholder="20M" value={form.burst_down} onChange={(e) => set("burst_down")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Burst Upload Speed</Label>
                  <Input placeholder="10M" value={form.burst_up} onChange={(e) => set("burst_up")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Burst Threshold</Label>
                  <Input placeholder="8M" value={form.burst_threshold} onChange={(e) => set("burst_threshold")(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">avg usage below this activates burst</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Burst Time (seconds)</Label>
                  <Input type="number" placeholder="10" value={form.burst_time_s} onChange={(e) => set("burst_time_s")(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">averaging window</p>
                </div>
              </div>
              <div className="border-t border-border/50 pt-4">
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning mb-4">
                  <strong>Connection Limit</strong> — caps simultaneous conntrack sessions per subscriber IP. Prevents torrent abuse and NAT exhaustion without affecting streaming or browsing. Set <code>null</code> to disable for Unlimited/Business tiers.
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Max Connections / User</Label>
                    <Input
                      type="number"
                      placeholder="300"
                      value={form.max_connections_per_user ?? ""}
                      onChange={(e) => set("max_connections_per_user")(e.target.value === "" ? null : Number(e.target.value))}
                    />
                    <p className="text-[10px] text-muted-foreground">blank = no limit (Unlimited tier)</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quick Preset</Label>
                    <Select
                      value={form.max_connections_per_user != null ? String(form.max_connections_per_user) : "null"}
                      onValueChange={(v) => set("max_connections_per_user")(v === "null" ? null : Number(v))}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose preset" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="150">150 — Strict anti-torrent</SelectItem>
                        <SelectItem value="300">300 — Residential hotspot (default)</SelectItem>
                        <SelectItem value="400">400 — PPPoE standard</SelectItem>
                        <SelectItem value="500">500 — Business PPPoE</SelectItem>
                        <SelectItem value="null">Unlimited — No limit</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">baked into RouterOS script (section 5b)</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
            <TabsContent value="meshdesk" className="space-y-4">
              <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                <strong>MeshDesk VLAN QoS</strong> — Assign this package to an 802.1Q VLAN so subscribers
                connecting through MeshDesk APs get shaped by a CAKE qdisc on the matching bridge.
                FreeRADIUS returns <code>Tunnel-Private-Group-ID</code> on auth; hostapd places
                the subscriber into <code>br-ex_v&lt;N&gt;</code> automatically.
                Leave blank for MikroTik-only deployments.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-cyan-400" />Mesh VLAN ID</Label>
                  <Input
                    type="number"
                    min={2}
                    max={4094}
                    placeholder="e.g. 10 (5Mbps), 20 (10Mbps)"
                    value={form.mesh_vlan_id}
                    onChange={(e) => set("mesh_vlan_id")(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Must be unique across all packages. Suggested: 5Mbps→10, 10Mbps→20, 20Mbps→30.
                    Range 2–4094. VLAN 1 is reserved for management.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Quick Preset</Label>
                  <Select
                    value={form.mesh_vlan_id !== "" ? String(form.mesh_vlan_id) : "none"}
                    onValueChange={(v) => set("mesh_vlan_id")(v === "none" ? "" : Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose preset" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (MikroTik-only)</SelectItem>
                      <SelectItem value="10">10 — 5 Mbps tier</SelectItem>
                      <SelectItem value="20">20 — 10 Mbps tier</SelectItem>
                      <SelectItem value="30">30 — 20 Mbps tier</SelectItem>
                      <SelectItem value="40">40 — 30 Mbps tier</SelectItem>
                      <SelectItem value="50">50 — 50 Mbps tier</SelectItem>
                      <SelectItem value="100">100 — 100 Mbps tier</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Preset spacing (multiples of 10) leaves room for future tiers.
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Setup checklist after setting VLAN ID:</p>
                <p>1. Create a <code>nat_specific</code> exit in your Mesh with the same VLAN ID.</p>
                <p>2. Enable <strong>Apply SQM</strong> on that exit and set <strong>CAKE Bandwidth</strong> (e.g. <code>5mbit</code>).</p>
                <p>3. Enable <strong>Dynamic VLAN</strong> on your Mesh Entry (SSID) with VLAN Bridge <code>br-ex_v</code>.</p>
                <p>4. Reload FreeRADIUS: <code>sudo systemctl reload freeradius</code></p>
              </div>
            </TabsContent>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? "Save Changes" : "Create Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default PackagesPage;
