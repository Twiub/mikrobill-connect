import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import AdminLayout from "@/components/AdminLayout";
import StatusBadge from "@/components/StatusBadge";
import { useSubscribers, usePackages, useRouters, formatKES } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, UserPlus, Loader2, Save, Wifi, Network, Eye, EyeOff, RefreshCw, ChevronDown, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function genPassword(len = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function genUsername(full_name: string, phone: string) {
  const base = full_name.trim().split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  const suffix = phone.slice(-4);
  return `${base}${suffix}`;
}

const EMPTY_SUB = {
  full_name: "", phone: "", username: "", type: "hotspot" as "hotspot" | "pppoe",
  package_id: "", router_id: "", status: "active",
  pppoe_username: "", pppoe_password: "",
  hotspot_enabled: false, hotspot_package_ids: [] as string[],
  mac_binding: "", static_ip: "", kyc_verified: false,
};

const PackageFilterBtn = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
  >
    {label}
  </button>
);

const UsersPage = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data: subscribers, isLoading } = useSubscribers(search || undefined);
  const { data: packages = [] } = usePackages();
  const { data: routers = [] } = useRouters();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_SUB });
  const [showPwd, setShowPwd] = useState(false);
  const [hotspotAddonOpen, setHotspotAddonOpen] = useState(false);

  const filtered = subscribers?.filter((u: any) => {
    if (typeFilter === "all") return true;
    if (typeFilter === "pppoe") return u.type === "pppoe" || u.type === "both";
    if (typeFilter === "hotspot") return u.type === "hotspot" || u.type === "both";
    return true;
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_SUB });
    setHotspotAddonOpen(false);
    setOpen(true);
  };

  const openEdit = (u: any) => {
    setEditId(u.id);
    const type = u.type === "both" ? "pppoe" : (u.type ?? "hotspot");
    setForm({
      full_name: u.full_name ?? "", phone: u.phone ?? "", username: u.username ?? "",
      type, package_id: u.package_id ?? "", router_id: u.router_id ?? "",
      status: u.status ?? "active", pppoe_username: u.pppoe_username ?? "",
      pppoe_password: "", hotspot_enabled: u.hotspot_enabled ?? false,
      hotspot_package_ids: u.hotspot_package_ids ?? [],
      mac_binding: u.mac_binding ?? "", static_ip: u.static_ip ?? "",
      kyc_verified: u.kyc_verified ?? false,
    });
    setHotspotAddonOpen(u.hotspot_enabled ?? false);
    setOpen(true);
  };

  const set = (k: keyof typeof EMPTY_SUB) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  // When type changes, clear incompatible package
  const changeType = (newType: "hotspot" | "pppoe") => {
    const pkg = (packages as any[]).find((p) => p.id === form.package_id);
    const compatible = pkg && (pkg.type === newType || pkg.type === "both");
    setForm((f) => ({ ...f, type: newType, package_id: compatible ? f.package_id : "", router_id: newType === "hotspot" ? "" : f.router_id }));
  };

  const autoFill = () => {
    if (form.full_name && form.phone) {
      const uname = genUsername(form.full_name, form.phone);
      const pwd = genPassword();
      setForm((f) => ({ ...f, username: f.username || uname, pppoe_password: f.pppoe_password || pwd, pppoe_username: f.pppoe_username || uname }));
    }
  };

  // Packages filtered to this connection type
  const filteredPackages = useMemo(() =>
    (packages as any[]).filter((p) => p.type === form.type || p.type === "both"),
    [packages, form.type]
  );

  // Hotspot packages for the addon section (PPPoE users who also get hotspot)
  const hotspotPkgs = (packages as any[]).filter((p) => p.type === "hotspot" || p.type === "both");

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone.trim() || !form.username.trim()) {
      toast({ title: "Validation Error", description: "Full name, phone and username are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // HIGH-01 FIX v3.19.0: Route through backend API instead of writing directly
      // to Supabase. Direct Supabase writes stored pppoe_password as PLAINTEXT and
      // never generated portal_password_hash or nt_password — PPPoE subscribers
      // created via the admin UI could not authenticate via RADIUS (MSCHAPv2).
      const token = getToken();
      const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");

      const payload: any = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        username: form.username.trim(),
        type: form.type,
        package_id: form.package_id || null,
        // Router only relevant for PPPoE (push secret to specific router)
        router_id: form.type === "pppoe" ? (form.router_id && form.router_id !== "__all__" ? form.router_id : null) : null,
        status: form.status,
        pppoe_username: form.type === "pppoe" ? (form.pppoe_username || null) : null,
        hotspot_enabled: form.type === "pppoe" ? form.hotspot_enabled : false,
        hotspot_package_ids: (form.type === "pppoe" && form.hotspot_enabled && form.hotspot_package_ids.length)
          ? form.hotspot_package_ids : null,
        mac_binding: form.type === "hotspot" ? (form.mac_binding || null) : null,
        static_ip: form.static_ip || null,
        kyc_verified: form.kyc_verified,
      };
      // Only send PPPoE password if it was entered (backend ignores absent field on update)
      if (form.pppoe_password && form.type === "pppoe") payload.pppoe_password = form.pppoe_password;

      const url    = editId ? `${API}/admin/subscribers/${editId}` : `${API}/admin/subscribers`;
      const method = editId ? "PATCH" : "POST";

      const res  = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? data.errors?.[0]?.msg ?? "Save failed");
      }

      toast({
        title: editId ? "Subscriber Updated" : "Subscriber Added",
        description: `${form.full_name} ${editId ? "saved" : "created"} successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Subscribers</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage hotspot &amp; PPPoE users</p>
          </div>
          <Button size="sm" className="gap-2" onClick={openAdd}>
            <UserPlus className="h-4 w-4" />Add User
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, username or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
          </div>
          <div className="flex gap-2">
            {["all", "hotspot", "pppoe"].map((t) => (
              <PackageFilterBtn key={t} label={t === "all" ? "All" : t === "hotspot" ? "Hotspot" : "PPPoE"} active={typeFilter === t} onClick={() => setTypeFilter(t)} />
            ))}
          </div>
        </div>

        <div className="glass-card overflow-x-auto">
          {isLoading ? (
            <Table><TableBody><TableSkeleton rows={8} cols={10} /></TableBody></Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs whitespace-nowrap">Name</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Username</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Phone</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Type</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Package</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Devices</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Data Used</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Expires</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.map((u: any) => (
                  <TableRow key={u.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell className="text-sm font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{u.username}</TableCell>
                    <TableCell className="text-xs font-mono">{u.phone}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(u.type === "hotspot" || u.type === "both") && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]"><Wifi className="h-2.5 w-2.5 mr-1" />HS</Badge>}
                        {(u.type === "pppoe" || u.type === "both") && <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-[10px]"><Network className="h-2.5 w-2.5 mr-1" />PPP</Badge>}
                        {u.hotspot_enabled && (u.type === "pppoe" || u.type === "both") && <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">+HS</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{u.packages?.name ?? "—"}</TableCell>
                    <TableCell>
                      {/* MED-08 FIX v3.19.0: Compute effective status client-side.
                          expiryEnforcer may lag up to 2 minutes after expiry — during that
                          window subscribers have status='active' in DB but no internet.
                          Show 'expired' immediately if expires_at is in the past, without
                          waiting for the background job to catch up. Only affects display;
                          DB is authoritative for all backend checks. */}
                      <StatusBadge status={
                        u.status === "active" && u.expires_at && new Date(u.expires_at) < new Date()
                          ? "expired"
                          : u.status
                      } />
                    </TableCell>
                    <TableCell className="text-xs text-center">{u.devices_count}</TableCell>
                    <TableCell className="text-xs font-mono">{u.data_used_gb} GB</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.expires_at ? new Date(u.expires_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => openEdit(u)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered?.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No subscribers found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* max-h + flex-col keeps header/footer fixed and scrolls only the body */}
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editId ? "Edit Subscriber" : "Add New Subscriber"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <Tabs defaultValue="basic">
              <TabsList className="mb-4 sticky top-0 z-10 bg-card">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="connection">
                  {form.type === "hotspot" ? (
                    <span className="flex items-center gap-1"><Wifi className="h-3 w-3" />Hotspot</span>
                  ) : (
                    <span className="flex items-center gap-1"><Network className="h-3 w-3" />PPPoE</span>
                  )}
                </TabsTrigger>
                {form.type === "pppoe" && <TabsTrigger value="pppoe_creds">Credentials</TabsTrigger>}
              </TabsList>

              {/* ── Tab 1: Basic Info ─────────────────────────────────────────── */}
              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Full Name *</Label>
                    <Input placeholder="John Doe" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} onBlur={autoFill} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone Number *</Label>
                    <Input placeholder="0712345678" value={form.phone} onChange={(e) => set("phone")(e.target.value)} onBlur={autoFill} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Username *</Label>
                    <div className="flex gap-2">
                      <Input placeholder="johnd1234" value={form.username} onChange={(e) => set("username")(e.target.value)} />
                      <Button type="button" variant="outline" size="sm" onClick={autoFill} title="Auto-generate"><RefreshCw className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={set("status")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Connection type — here so it affects what the next tab shows */}
                <div className="rounded-lg border border-border/50 p-4 space-y-3">
                  <Label className="text-sm font-semibold">Connection Type</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => changeType("hotspot")}
                      className={`rounded-lg border-2 p-3 text-left transition-all ${form.type === "hotspot" ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/40"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Wifi className={`h-4 w-4 ${form.type === "hotspot" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-sm">Hotspot</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Captive portal login. Subscriber connects to any router — router is auto-detected via RADIUS.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => changeType("pppoe")}
                      className={`rounded-lg border-2 p-3 text-left transition-all ${form.type === "pppoe" ? "border-info bg-info/5" : "border-border/50 hover:border-info/40"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Network className={`h-4 w-4 ${form.type === "pppoe" ? "text-info" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-sm">PPPoE</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Dial-up auth with username/password. Subscriber PPPoE secret is pushed to their router.</p>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={form.kyc_verified} onCheckedChange={set("kyc_verified")} />
                  <Label>KYC Verified</Label>
                </div>
              </TabsContent>

              {/* ── Tab 2: Connection details (type-aware) ──────────────────── */}
              <TabsContent value="connection" className="space-y-4">
                {form.type === "hotspot" ? (
                  <>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Hotspot subscribers authenticate via RADIUS. The router is <strong>auto-detected</strong> when they connect — no pre-assignment needed.</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <Label>Package</Label>
                        <Select value={form.package_id} onValueChange={set("package_id")}>
                          <SelectTrigger><SelectValue placeholder="Select hotspot package" /></SelectTrigger>
                          <SelectContent>
                            {filteredPackages.length === 0 && (
                              <SelectItem value="__no_pkgs__" disabled>No hotspot packages found — add one in Packages</SelectItem>
                            )}
                            {filteredPackages.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — {formatKES(p.price)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">Only showing Hotspot packages. Create PPPoE packages in the Packages page.</p>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label>MAC Binding <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input placeholder="AA:BB:CC:DD:EE:FF" value={form.mac_binding} onChange={(e) => set("mac_binding")(e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">Lock this subscription to a specific device MAC address.</p>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label>Static IP <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input placeholder="10.10.0.100" value={form.static_ip} onChange={(e) => set("static_ip")(e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">Must be within the router's DHCP pool range.</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-info/5 border border-info/20 text-xs text-muted-foreground">
                      <Info className="h-4 w-4 shrink-0 mt-0.5 text-info" />
                      <span>PPPoE credentials are pushed to the MikroTik router via <code>/ppp secret</code>. The subscriber dials in using their username and password.</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <Label>Package</Label>
                        <Select value={form.package_id} onValueChange={set("package_id")}>
                          <SelectTrigger><SelectValue placeholder="Select PPPoE package" /></SelectTrigger>
                          <SelectContent>
                            {filteredPackages.length === 0 && (
                              <SelectItem value="__no_pkgs__" disabled>No PPPoE packages found — add one in Packages</SelectItem>
                            )}
                            {filteredPackages.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — {formatKES(p.price)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">Only showing PPPoE packages.</p>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label>Push to Router <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Select value={form.router_id} onValueChange={set("router_id")}>
                          <SelectTrigger><SelectValue placeholder="All routers (push to all)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All routers</SelectItem>
                            {(routers as any[]).map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.name} — {r.ip_address || "dynamic"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">Select the router this subscriber dials into. Leave blank to push the PPPoE secret to all routers.</p>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label>Static IP <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input placeholder="10.10.0.100" value={form.static_ip} onChange={(e) => set("static_ip")(e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">Assigned to the PPPoE interface on connection (framed-ip-address via RADIUS).</p>
                      </div>
                    </div>

                    {/* Hotspot addon for PPPoE subscribers */}
                    <Collapsible open={hotspotAddonOpen} onOpenChange={setHotspotAddonOpen}>
                      <CollapsibleTrigger asChild>
                        <button type="button" className="flex w-full items-center justify-between rounded-lg border border-border/50 px-4 py-3 text-sm hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <Wifi className="h-4 w-4 text-success" />
                            <div className="text-left">
                              <p className="font-medium text-sm">Hotspot Add-on</p>
                              <p className="text-[10px] text-muted-foreground">Give this PPPoE subscriber additional hotspot access</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {form.hotspot_enabled && <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">Enabled</Badge>}
                            <ChevronDown className={`h-4 w-4 transition-transform text-muted-foreground ${hotspotAddonOpen ? "rotate-180" : ""}`} />
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 py-3 border border-t-0 border-border/50 rounded-b-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={form.hotspot_enabled} onCheckedChange={set("hotspot_enabled")} />
                          <Label>Enable Hotspot Access for this PPPoE subscriber</Label>
                        </div>
                        {form.hotspot_enabled && (
                          <div className="space-y-2">
                            <Label className="text-xs">Allowed Hotspot Packages</Label>
                            <p className="text-[10px] text-muted-foreground">If none selected, subscriber can use any hotspot package.</p>
                            <div className="grid grid-cols-2 gap-2">
                              {hotspotPkgs.map((p: any) => (
                                <label key={p.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-xs ${form.hotspot_package_ids.includes(p.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                                  <input
                                    type="checkbox"
                                    checked={form.hotspot_package_ids.includes(p.id)}
                                    onChange={(e) => {
                                      const ids = e.target.checked
                                        ? [...form.hotspot_package_ids, p.id]
                                        : form.hotspot_package_ids.filter((id) => id !== p.id);
                                      set("hotspot_package_ids")(ids);
                                    }}
                                    className="rounded"
                                  />
                                  <div>
                                    <p className="font-medium">{p.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{formatKES(p.price)}</p>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}
              </TabsContent>

              {/* ── Tab 3: PPPoE Credentials (only for pppoe type) ──────────── */}
              {form.type === "pppoe" && (
                <TabsContent value="pppoe_creds" className="space-y-4">
                  <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
                    These credentials are pushed to MikroTik via <code>/ppp secret</code> and are also used for RADIUS MSCHAPv2 authentication.
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>PPPoE Username</Label>
                      <Input placeholder="Same as username" value={form.pppoe_username} onChange={(e) => set("pppoe_username")(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>PPPoE Password</Label>
                      <div className="relative">
                        <Input
                          type={showPwd ? "text" : "password"}
                          placeholder={editId ? "Leave blank to keep current" : "Auto-generated"}
                          value={form.pppoe_password}
                          onChange={(e) => set("pppoe_password")(e.target.value)}
                        />
                        <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => set("pppoe_password")(genPassword())} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />Generate Password
                  </Button>
                </TabsContent>
              )}
            </Tabs>
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t border-border/50">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? "Save Changes" : "Add Subscriber"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default UsersPage;
