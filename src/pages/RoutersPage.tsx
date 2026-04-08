import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { PanelErrorBoundary } from "@/components/ErrorBoundary";
import StatusBadge from "@/components/StatusBadge";
import { useRouters } from "@/hooks/useDatabase";
import {
  Wifi, AlertTriangle, Settings, Plus, Loader2, Save, Eye, EyeOff,
  Download, Trash2, CheckCircle2, ChevronRight, ChevronLeft, Terminal,
  Network, Key, Link, Radio, Tv2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ─── Types ────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  // Step 1 — Basic
  name: "",
  ip_address: "",
  dynamic_ip: false,        // true = LTE/Starlink/dynamic line; IP set by heartbeat
  cgnat_mode: false,        // true = router is behind CGNAT; no direct API access possible
  location: "",
  secret_radius: "",
  // API creds (collapsible)
  api_port: 8728,
  api_username: "admin",
  api_password: "",
  api_ssl: false,
  nas_ip: "",
  // Step 2 — Topology
  wan_interface: "ether1",
  lan_interface: "bridge",
  hotspot_interface: "bridge",
  hotspot_address: "",
  portal_server_ip: "",
  wan_bandwidth_mbps: 100,
  wan_speed_dynamic: false,  // true = LTE/Starlink; send wan_bandwidth_mbps=null (no global WAN queue)
  default_conn_limit: 300 as number | null,
  dhcp_pool: "192.168.88.10-192.168.88.254",
  dhcp_prefix_length: 24,
  targeted_users: 0,        // 0 = manual entry; >0 = auto-computed pool
};

// ─── User Capacity → Auto Pool Computation (v3.19.2) ─────────────────────────
// The wizard no longer computes a fixed pool — it tells the backend how many
// users this router needs to handle. The backend auto-assigns the next free
// ip_slot and derives the exact IP plan from it.
//
// What the wizard shows: the SHAPE of the plan (prefix size) so the operator
// understands what they're getting. The actual IPs come back from the server
// after the router is saved (they depend on which slot was free).
//
// For multi-router scale (>2000 users at one site): the wizard explains that
// 10K users = 5 routers of /21 each, not one giant subnet.
const USER_PRESETS = [
  { label: "50 users",    users: 50 },
  { label: "100 users",   users: 100 },
  { label: "250 users",   users: 250 },
  { label: "500 users",   users: 500 },
  { label: "1,000 users", users: 1000 },
  { label: "2,000 users", users: 2000 },
  { label: "5,000 users", users: 5000 },
  { label: "10,000 users",users: 10000 },
];

interface PoolPreview {
  prefix: number;
  max_clients: number;
  subnet_note: string;
  multi_router?: boolean;
  routers_needed?: number;
}

// Returns a preview of what the IP plan will look like for this capacity.
// Actual IPs are assigned by the backend based on the next free ip_slot.
function previewPoolForUsers(users: number): PoolPreview {
  if (users <= 50)   return { prefix: 26, max_clients: 62,    subnet_note: "/26 — up to 62 clients (auto-assigned from 10.10.x.0/26)" };
  if (users <= 100)  return { prefix: 25, max_clients: 126,   subnet_note: "/25 — up to 126 clients (auto-assigned from 10.10.x.0/25)" };
  if (users <= 250)  return { prefix: 24, max_clients: 254,   subnet_note: "/24 — up to 254 clients (auto-assigned from 10.10.x.0/24)" };
  if (users <= 500)  return { prefix: 23, max_clients: 510,   subnet_note: "/23 — up to 510 clients (auto-assigned from 10.10.x.0/23)" };
  if (users <= 1000) return { prefix: 22, max_clients: 1022,  subnet_note: "/22 — up to 1,022 clients (auto-assigned from 10.10.x.0/22)" };
  if (users <= 2000) return { prefix: 21, max_clients: 2037,  subnet_note: "/21 — up to 2,037 clients (auto-assigned from 10.10.x.0/21)" };
  // Above 2000: recommend multiple /21 routers instead of one huge subnet
  if (users <= 5000) {
    const n = Math.ceil(users / 2037);
    return { prefix: 21, max_clients: 2037, multi_router: true, routers_needed: n,
      subnet_note: `/21 per router — ${n} routers × 2,037 = ${(n * 2037).toLocaleString()} capacity` };
  }
  {
    const n = Math.ceil(users / 2037);
    return { prefix: 21, max_clients: 2037, multi_router: true, routers_needed: n,
      subnet_note: `/21 per router — ${n} routers × 2,037 = ${(n * 2037).toLocaleString()} capacity` };
  }
}

// Legacy: still needed for manual fallback display and edit form.
// Keeps backward compatibility — used when targeted_users === 0.
function computePoolFromUsers(users: number): {
  dhcp_pool: string;
  hotspot_address: string;
  dhcp_prefix_length: number;
  subnet_note: string;
} {
  // All slot-based routers now get 10.10.x.x — the exact block comes from the backend.
  // This function is only shown in the manual-entry fallback UI.
  if (users <= 50) {
    return { hotspot_address: "192.168.88.1", dhcp_pool: "192.168.88.10-192.168.88.62",  dhcp_prefix_length: 26, subnet_note: "192.168.88.0/26 — up to 62 clients" };
  } else if (users <= 100) {
    return { hotspot_address: "192.168.88.1", dhcp_pool: "192.168.88.10-192.168.88.126", dhcp_prefix_length: 25, subnet_note: "192.168.88.0/25 — up to 126 clients" };
  } else if (users <= 250) {
    return { hotspot_address: "192.168.88.1", dhcp_pool: "192.168.88.10-192.168.88.254", dhcp_prefix_length: 24, subnet_note: "192.168.88.0/24 — up to 254 clients" };
  } else if (users <= 500) {
    return { hotspot_address: "10.10.0.1", dhcp_pool: "10.10.0.10-10.10.1.254",   dhcp_prefix_length: 23, subnet_note: "10.10.x.0/23 — up to 510 clients (slot auto-assigned)" };
  } else if (users <= 1000) {
    return { hotspot_address: "10.10.0.1", dhcp_pool: "10.10.0.10-10.10.3.254",   dhcp_prefix_length: 22, subnet_note: "10.10.x.0/22 — up to 1,022 clients (slot auto-assigned)" };
  } else {
    return { hotspot_address: "10.10.0.1", dhcp_pool: "10.10.0.10-10.10.7.254",   dhcp_prefix_length: 21, subnet_note: "10.10.x.0/21 — up to 2,037 clients (slot auto-assigned)" };
  }
}

// ─── Step Dots ────────────────────────────────────────────────────────────────

const StepDots = ({ step, total }: { step: number; total: number }) => (
  <div className="flex items-center justify-center gap-2 mb-6">
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        className={`rounded-full transition-all ${
          i < step
            ? "h-2 w-2 bg-primary"
            : i === step
            ? "h-2.5 w-2.5 bg-primary"
            : "h-2 w-2 bg-muted-foreground/30"
        }`}
      />
    ))}
  </div>
);

// ─── Winbox Steps ─────────────────────────────────────────────────────────────

const WinboxSteps = ({ routerName }: { routerName: string }) => {
  const steps = [
    { icon: "📥", label: "Download the script above", detail: "Click the green button to save the .rsc file" },
    { icon: "🖥️", label: "Open Winbox", detail: `Connect to ${routerName || "your router"}` },
    { icon: "📂", label: "Drag & drop the .rsc file", detail: "Drag the file directly onto the Winbox window" },
    { icon: "⚙️", label: "Run /import", detail: "Type: /import file-name=setup.rsc" },
    { icon: "✅", label: "Wait for phone-home", detail: "Status will turn Online within 30 seconds" },
  ];

  return (
    <div className="mt-4 space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40">
          <span className="text-base leading-none mt-0.5">{s.icon}</span>
          <div>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const RoutersPage = () => {
  const { data: routers, isLoading } = useRouters();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0); // 0=Basic, 1=Topology, 2=Download
  const [saving, setSaving] = useState(false);
  const [newRouterId, setNewRouterId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showApiCreds, setShowApiCreds] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);

  const set = (k: keyof typeof EMPTY_FORM) => (v: any) => setForm((f) => ({ ...f, [k]: v }));
  const setEdit = (k: keyof typeof EMPTY_FORM) => (v: any) => setEditForm((f) => ({ ...f, [k]: v }));

  // ── Wizard Step 1 → 2 ──────────────────────────────────────────────────────

  const handleWizardStep1 = () => {
    if (!form.name.trim()) {
      toast({ title: "Required", description: "Router name is required.", variant: "destructive" });
      return;
    }
    if (!form.dynamic_ip) {
      // Static IP required only for non-dynamic routers
      if (!form.ip_address.trim()) {
        toast({ title: "Required", description: "IP address is required for static-IP routers.", variant: "destructive" });
        return;
      }
      const ipRe = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRe.test(form.ip_address.trim())) {
        toast({ title: "Invalid IP", description: "Please enter a valid IPv4 address.", variant: "destructive" });
        return;
      }
    }
    setWizardStep(1);
  };

  // ── Wizard Step 2 → Save → 3 ───────────────────────────────────────────────

  const handleWizardStep2 = async () => {
    setSaving(true);
    try {
      // v3.19.2: Route through backend POST /api/admin/routers so the server
      // can auto-assign ip_slot, run cross-router overlap checks, derive the
      // IP plan, and register the NAS entry — all in one atomic transaction.
      // Previously this went direct to Supabase, bypassing all IP validation.
      const payload: any = {
        name:               form.name.trim(),
        ip:                 form.dynamic_ip ? null : (form.ip_address.trim() || null),
        dynamic_ip:         form.dynamic_ip,
        cgnat_mode:         form.cgnat_mode,
        api_port:           Number(form.api_port),
        api_username:       form.api_username,
        api_password:       form.api_password,
        api_ssl:            form.api_ssl,
        location:           form.location || null,
        nas_ip:             form.dynamic_ip ? null : (form.nas_ip || form.ip_address.trim() || null),
        secret:             form.secret_radius || "changeme",   // backend field name is "secret"
        wan_interface:      form.wan_interface,
        lan_interface:      form.lan_interface,
        hotspot_interface:  form.hotspot_interface,
        hotspot_address:    form.targeted_users > 0 ? null : (form.hotspot_address || null),  // let backend derive from slot
        portal_server_ip:   form.portal_server_ip || null,
        wan_bandwidth_mbps: form.wan_speed_dynamic ? null : (Number(form.wan_bandwidth_mbps) || null),
        default_conn_limit: form.default_conn_limit != null ? Number(form.default_conn_limit) : null,
        // v3.19.2: If user selected a preset, send dhcp_pool=null so the backend
        // auto-derives it from the assigned ip_slot. If manual entry, send as-is.
        dhcp_pool:          form.targeted_users > 0 ? null : (form.dhcp_pool || null),
        dhcp_prefix_length: form.targeted_users > 0 ? null : (form.dhcp_prefix_length || 24),
        targeted_users:     form.targeted_users || null,
      };

      const res = await fetch("/api/admin/routers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.errors?.[0]?.msg || "Failed to add router");
      }

      setNewRouterId(json.router.id);
      queryClient.invalidateQueries({ queryKey: ["routers"] });
      setWizardStep(2);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Download onboard script ────────────────────────────────────────────────

  const downloadScript = async (routerId: string, routerName: string) => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/mikrotik/onboard-script/${routerId}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `setup-${routerName.toLowerCase().replace(/\s+/g, "-")}.rsc`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download Failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const openWizard = () => {
    setForm({ ...EMPTY_FORM });
    setWizardStep(0);
    setNewRouterId(null);
    setShowApiCreds(false);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    if (wizardStep === 2) queryClient.invalidateQueries({ queryKey: ["routers"] });
  };

  // ── Edit ───────────────────────────────────────────────────────────────────

  const openEdit = (r: any) => {
    setEditId(r.id);
    setEditForm({
      name: r.name ?? "", ip_address: r.ip_address ?? "",
      dynamic_ip: r.dynamic_ip ?? false,
      cgnat_mode: r.cgnat_mode ?? false,
      api_port: r.api_port ?? 8728, api_username: r.api_username ?? "admin",
      api_password: r.api_password ?? "", api_ssl: r.api_ssl ?? false,
      location: r.location ?? "", nas_ip: r.nas_ip ?? "",
      secret_radius: r.secret_radius ?? "",
      wan_interface: r.wan_interface ?? "ether1",
      lan_interface: r.lan_interface ?? "bridge",
      hotspot_interface: r.hotspot_interface ?? "bridge",
      hotspot_address: r.hotspot_address ?? "",
      portal_server_ip: r.portal_server_ip ?? "",
      wan_bandwidth_mbps: r.wan_bandwidth_mbps ?? 100,
      wan_speed_dynamic: r.wan_bandwidth_mbps == null,
      default_conn_limit: r.default_conn_limit ?? 300,
      dhcp_pool: r.dhcp_pool ?? "",
      dhcp_prefix_length: r.dhcp_prefix_length ?? 24,
      targeted_users: 0,
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editForm.name.trim() || (!editForm.dynamic_ip && !editForm.ip_address.trim())) {
      toast({ title: "Required", description: editForm.dynamic_ip ? "Name is required." : "Name and IP address are required.", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      const payload: any = {
        name: editForm.name.trim(),
        ip_address: editForm.dynamic_ip ? null : editForm.ip_address.trim(),
        dynamic_ip: editForm.dynamic_ip,
        cgnat_mode: editForm.cgnat_mode,
        api_port: Number(editForm.api_port),
        api_username: editForm.api_username,
        api_password: editForm.api_password,
        api_ssl: editForm.api_ssl,
        location: editForm.location || null,
        nas_ip: editForm.nas_ip || null,
        secret_radius: editForm.secret_radius || null,
        wan_interface: editForm.wan_interface,
        lan_interface: editForm.lan_interface,
        hotspot_interface: editForm.hotspot_interface,
        hotspot_address: editForm.hotspot_address || null,
        portal_server_ip: editForm.portal_server_ip || null,
        wan_bandwidth_mbps: editForm.wan_speed_dynamic ? null : (Number(editForm.wan_bandwidth_mbps) || null),
        default_conn_limit: editForm.default_conn_limit != null ? Number(editForm.default_conn_limit) : null,
        dhcp_pool: editForm.dhcp_pool || null,
        dhcp_prefix_length: editForm.dhcp_prefix_length || 24,
        // BUG-DLNA-01 FIX: per-router DLNA settings
        // Empty string → null (use global setting); explicit value overrides global
        dlna_server_ip: (editForm as any).dlna_server_ip?.trim() || null,
        dlna_port: (editForm as any).dlna_port ? Number((editForm as any).dlna_port) : null,
        dlna_enabled: (editForm as any).dlna_enabled,  // null = inherit global
      };
      const res = await fetch(`/api/admin/routers/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.errors?.[0]?.msg || "Update failed");
      toast({ title: "Router Updated", description: `${editForm.name} saved.` });
      queryClient.invalidateQueries({ queryKey: ["routers"] });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteDeleting(true);
    try {
      const res = await fetch(`/api/admin/routers/${deleteId}`, {
        method: "DELETE",
        });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Delete failed");
      toast({ title: "Router Removed" });
      queryClient.invalidateQueries({ queryKey: ["routers"] });
      setDeleteId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleteDeleting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">MikroTik Routers</h1>
            <p className="text-sm text-muted-foreground mt-1">Network device management &amp; monitoring</p>
          </div>
          <Button size="sm" className="gap-2" onClick={openWizard}>
            <Plus className="h-4 w-4" />Add Router
          </Button>
        </div>

        {/* Router grid */}
        <PanelErrorBoundary title="Router Management">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading routers...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routers?.map((r: any) => (
              <div key={r.id} className={`glass-card p-6 ${
                r.status === "online"
                  ? "border-border/50"
                  : r.cgnat_mode
                  ? "border-orange-500/30"
                  : "border-destructive/30"
              }`}>
                {/* Card header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${r.status === "online" ? "bg-success/10" : "bg-destructive/10"}`}>
                      <Wifi className={`h-5 w-5 ${r.status === "online" ? "text-success" : "text-destructive"}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{r.name}</h3>
                      <p className="text-xs font-mono text-muted-foreground">
                        {r.dynamic_ip && !r.ip_address
                          ? <span className="text-blue-400">Awaiting first heartbeat…</span>
                          : <>{r.ip_address}{r.cgnat_mode ? "" : `:${r.api_port ?? 8728}`}</>}
                        {r.dynamic_ip && r.ip_address && (
                          <span className="ml-1.5 text-[10px] bg-blue-500/15 text-blue-400 rounded px-1">dynamic</span>
                        )}
                        {r.cgnat_mode && (
                          <span className="ml-1.5 text-[10px] bg-orange-500/15 text-orange-400 rounded px-1">CGNAT</span>
                        )}
                        {r.ip_conflict && (
                          <span className="ml-1.5 text-[10px] bg-destructive/15 text-destructive rounded px-1 flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />IP CONFLICT
                          </span>
                        )}
                      </p>
                      {r.location && <p className="text-[10px] text-muted-foreground">{r.location}</p>}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                {/* Card body */}
                {r.status === "online" ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">CPU Load</span>
                        <span className={`font-semibold ${r.cpu_load > 80 ? "text-destructive" : r.cpu_load > 60 ? "text-warning" : "text-success"}`}>{r.cpu_load}%</span>
                      </div>
                      <Progress value={r.cpu_load} className="h-1.5" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Memory</span>
                        <span className={`font-semibold ${r.memory_used > 80 ? "text-destructive" : r.memory_used > 60 ? "text-warning" : "text-success"}`}>{r.memory_used}%</span>
                      </div>
                      <Progress value={r.memory_used} className="h-1.5" />
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-border/50">
                      <span className="text-muted-foreground">Active Users</span>
                      <span className="font-bold text-primary">{r.active_users}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Uptime</span>
                      <span className="font-mono text-xs">{r.uptime}</span>
                    </div>
                    {r.model && <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Model</span>
                      <span className="text-xs">{r.model}</span>
                    </div>}
                    {r.identity && <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Identity</span>
                      <span className="text-xs font-mono">{r.identity}</span>
                    </div>}
                    {r.ip_slot != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">IP Slot</span>
                        <span className="text-xs font-mono text-primary">
                          #{r.ip_slot} — 10.10.{r.ip_slot * 8}.0/21
                        </span>
                      </div>
                    )}
                    {r.dhcp_pool && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pool</span>
                        <span className="text-xs font-mono text-muted-foreground">{r.dhcp_pool}</span>
                      </div>
                    )}
                    {/* Linked networks */}
                    {(r.linked_mesh_count > 0 || r.ip_conflict) && (
                      <div className="pt-2 border-t border-border/30">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1"><Radio className="h-3 w-3" />Linked Meshes</span>
                          <span className="font-bold text-primary">{r.linked_mesh_count || 0}</span>
                        </div>
                        {r.linked_mesh_names?.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{r.linked_mesh_names.join(", ")}</p>
                        )}
                        {r.ip_conflict && (
                          <div className="mt-1.5 rounded bg-destructive/10 border border-destructive/20 px-2 py-1.5 text-[10px] text-destructive flex items-start gap-1.5">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>
                              <strong>IP conflict</strong>
                              {r.ip_conflict_meshes?.length > 0 && (
                                <> — backbone subnet overlaps client pool on mesh: <em>{r.ip_conflict_meshes.join(", ")}</em>. Edit the mesh CIDR.</>
                              )}
                              {r.ip_conflict_routers?.length > 0 && (
                                <> — DHCP pool overlaps with router: <em>{r.ip_conflict_routers.join(", ")}</em>. Edit one router's pool range.</>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4">
                    {r.cgnat_mode ? (
                      <>
                        <Network className="h-8 w-8 text-orange-400" />
                        <p className="text-sm font-medium text-orange-400">Behind CGNAT</p>
                        <p className="text-[10px] text-muted-foreground text-center">
                          {r.ip_address
                            ? "Router is connected via heartbeat. Direct API not available."
                            : "Waiting for router to run setup script and phone home."}
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                        <p className="text-sm font-medium text-destructive">Router Unreachable</p>
                        <p className="text-[10px] text-muted-foreground text-center">Run setup script and wait for phone-home</p>
                      </>
                    )}
                  </div>
                )}

                {/* Card footer */}
                <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 h-7 text-success border-success/30 hover:bg-success/10"
                    onClick={() => downloadScript(r.id, r.name)}
                    disabled={downloading}
                  >
                    {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    Script
                  </Button>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="text-xs text-primary h-7" onClick={() => openEdit(r)}>
                      <Settings className="h-3 w-3 mr-1" />Configure
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-destructive h-7" onClick={() => setDeleteId(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {routers?.length === 0 && (
              <div className="col-span-3 glass-card p-12 text-center text-muted-foreground">
                <Wifi className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No routers added yet</p>
                <p className="text-sm mt-1">Click "Add Router" to onboard your first MikroTik device.</p>
              </div>
            )}
          </div>
        )}
        </PanelErrorBoundary>
      </div>

      {/* ── Add Router Wizard ─────────────────────────────────────────────────── */}
      <Dialog open={wizardOpen} onOpenChange={closeWizard}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {wizardStep === 0 && "Add Router — Basic Info"}
              {wizardStep === 1 && "Add Router — Network Topology"}
              {wizardStep === 2 && "Router Added — Download Script"}
            </DialogTitle>
          </DialogHeader>

          <StepDots step={wizardStep} total={3} />

          {/* Step 0: Basic */}
          {wizardStep === 0 && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Router Name *</Label>
                  <Input placeholder="e.g. Main Office" value={form.name} onChange={(e) => set("name")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>{form.dynamic_ip ? "IP Address" : "IP Address *"}</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Dynamic IP</span>
                      <Switch
                        checked={form.dynamic_ip}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, dynamic_ip: v, ip_address: v ? "" : f.ip_address }))}
                      />
                    </div>
                  </div>
                  {form.dynamic_ip ? (
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-400">
                      ✓ IP will be set automatically when router sends its first heartbeat (within 60 s of running the setup script)
                    </div>
                  ) : (
                    <Input placeholder="192.168.88.1" value={form.ip_address} onChange={(e) => set("ip_address")(e.target.value)} />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Location / Site</Label>
                  <Input placeholder="e.g. Westlands" value={form.location} onChange={(e) => set("location")(e.target.value)} />
                </div>

                {/* CGNAT Mode */}
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Network className="h-4 w-4 text-orange-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Behind CGNAT</p>
                        <p className="text-[10px] text-muted-foreground">Enable if your ISP gives you a shared public IP (most Kenyan LTE/fibre connections)</p>
                      </div>
                    </div>
                    <Switch
                      checked={form.cgnat_mode}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, cgnat_mode: v, dynamic_ip: v ? true : f.dynamic_ip }))}
                    />
                  </div>
                  {form.cgnat_mode && (
                    <div className="rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2.5 space-y-1.5">
                      <p className="text-xs font-semibold text-orange-400">⚠️ CGNAT mode — what this means for you</p>
                      <ul className="text-[11px] text-muted-foreground space-y-1 list-none">
                        <li>✓ <strong>Setup script still works</strong> — router calls MikroBill, not the other way</li>
                        <li>✓ <strong>Payments &amp; renewals work</strong> — M-Pesa triggers subscriber sessions normally</li>
                        <li>✓ <strong>Hotspot &amp; PPPoE work</strong> — RADIUS runs on your server, not through the public IP</li>
                        <li>⚠️ <strong>Live session kick</strong> (disconnect button) uses RADIUS CoA — works as long as router can reach your server</li>
                        <li>⚠️ <strong>Direct API commands</strong> (e.g. live bandwidth graphs, remote reboot) are <em>not</em> possible until you set up a tunnel (ask your team)</li>
                      </ul>
                      <p className="text-[10px] text-orange-300/70 mt-1">IP Address is set automatically by heartbeat — no need to enter it.</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>RADIUS Secret</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      placeholder="Shared secret"
                      value={form.secret_radius}
                      onChange={(e) => set("secret_radius")(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Collapsible open={showApiCreds} onOpenChange={setShowApiCreds}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full py-1">
                    <Key className="h-3 w-3" />
                    API Credentials (optional — needed for live session management)
                    <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${showApiCreds ? "rotate-90" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">API Port</Label>
                      <Input type="number" placeholder="8728" value={form.api_port} onChange={(e) => set("api_port")(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">API Username</Label>
                      <Input placeholder="admin" value={form.api_username} onChange={(e) => set("api_username")(e.target.value)} />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">API Password</Label>
                      <div className="relative">
                        <Input
                          type={showPass ? "text" : "password"}
                          placeholder="Router API password"
                          value={form.api_password}
                          onChange={(e) => set("api_password")(e.target.value)}
                        />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">NAS IP</Label>
                      <Input placeholder="Same as router IP" value={form.nas_ip} onChange={(e) => set("nas_ip")(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Switch checked={form.api_ssl} onCheckedChange={set("api_ssl")} />
                      <Label className="text-xs">Use API-SSL</Label>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <DialogFooter>
                <Button variant="outline" onClick={closeWizard}>Cancel</Button>
                <Button onClick={handleWizardStep1} className="gap-2">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 1: Topology */}
          {wizardStep === 1 && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground flex gap-2">
                <Network className="h-4 w-4 shrink-0 mt-0.5" />
                These settings are embedded into the setup script so they're pre-configured automatically.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>WAN Interface</Label>
                  <Input placeholder="ether1" value={form.wan_interface} onChange={(e) => set("wan_interface")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>LAN Interface</Label>
                  <Input placeholder="bridge" value={form.lan_interface} onChange={(e) => set("lan_interface")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hotspot Interface</Label>
                  <Input placeholder="bridge" value={form.hotspot_interface} onChange={(e) => set("hotspot_interface")(e.target.value)} />
                </div>
                <div className="col-span-2 rounded-md border border-info/20 bg-info/5 px-3 py-2 text-xs text-info">
                  ℹ️ Portal Server IP is auto-detected from your MikroBill server URL — no need to enter it manually.
                </div>
                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>WAN Bandwidth</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Dynamic (LTE / Starlink)</span>
                      <Switch
                        checked={form.wan_speed_dynamic}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, wan_speed_dynamic: v }))}
                      />
                    </div>
                  </div>
                  {form.wan_speed_dynamic ? (
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-400">
                      ✓ Variable speed — no global WAN parent queue will be set in the MikroTik script. Per-user queues still apply. Ideal for LTE, Starlink, or WiMAX.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input type="number" placeholder="100" value={form.wan_bandwidth_mbps} onChange={(e) => set("wan_bandwidth_mbps")(e.target.value)} className="w-36" />
                      <span className="text-sm text-muted-foreground">Mbps — sets WAN queue parent in RouterOS</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Default Conn Limit / User</Label>
                  <Input type="number" placeholder="300" value={form.default_conn_limit ?? ""} onChange={(e) => set("default_conn_limit")(e.target.value === "" ? null : Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">Max simultaneous connections per IP (anti-torrent). blank = disabled</p>
                </div>
                <div className="col-span-2 space-y-3">
                  <div className="space-y-1.5">
                    <Label>How many users will this router handle?</Label>
                    <p className="text-[10px] text-muted-foreground">
                      MikroBill auto-assigns a non-overlapping IP block from the
                      <span className="font-mono"> 10.10.0.0/16</span> client zone.
                      Each router gets its own dedicated <span className="font-mono">/21</span> (2,037 IPs).
                      No two routers will ever share the same IP space.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {USER_PRESETS.map((p) => (
                      <button
                        key={p.users}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, targeted_users: p.users }));
                        }}
                        className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${
                          form.targeted_users === p.users
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, targeted_users: 0 }))}
                      className={`col-span-4 rounded-lg border py-2 text-xs transition-all ${
                        form.targeted_users === 0
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/30 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      ✏️ Enter manually (advanced)
                    </button>
                  </div>

                  {/* Show plan preview */}
                  {form.targeted_users > 0 && (() => {
                    const preview = previewPoolForUsers(form.targeted_users);
                    return preview.multi_router ? (
                      <div className="rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2.5 space-y-1.5">
                        <p className="text-xs font-semibold text-orange-400">
                          📡 {form.targeted_users.toLocaleString()} users — Multi-Router Deployment
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          At this scale, use <strong>{preview.routers_needed} separate MikroTik routers</strong> each
                          handling their own <span className="font-mono">/21</span> block (~2,037 users).
                          Add each router separately — MikroBill will auto-assign non-overlapping IP blocks.
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>Routers needed:</span>   <span className="font-mono text-orange-300">{preview.routers_needed}× MikroTik</span>
                          <span>IPs per router:</span>   <span className="font-mono text-foreground">2,037 (/21)</span>
                          <span>Total capacity:</span>   <span className="font-mono text-foreground">{(preview.routers_needed! * 2037).toLocaleString()} users</span>
                          <span>Zone:</span>             <span className="font-mono text-foreground">10.10.0.0/16 (auto-sliced)</span>
                        </div>
                        <p className="text-[10px] text-orange-300/70">This router will be auto-assigned its own /21 slot. Add the remaining {preview.routers_needed! - 1} routers the same way.</p>
                      </div>
                    ) : (
                      <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2.5 space-y-1">
                        <p className="text-xs font-semibold text-success">✓ Auto-configured for {form.targeted_users.toLocaleString()} users</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>Subnet:</span>       <span className="font-mono text-foreground">{preview.subnet_note}</span>
                          <span>Prefix:</span>       <span className="font-mono text-foreground">/{preview.prefix}</span>
                          <span>Max clients:</span>  <span className="font-mono text-foreground">{preview.max_clients.toLocaleString()}</span>
                          <span>Assignment:</span>   <span className="font-mono text-foreground">Auto (next free slot)</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          Exact gateway and pool IPs are assigned by MikroBill after saving, based on the next available slot in <span className="font-mono">10.10.0.0/16</span>. No two routers will overlap.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Manual entry fallback */}
                  {form.targeted_users === 0 && (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Hotspot IP</Label>
                          <Input placeholder="192.168.88.1" value={form.hotspot_address} onChange={(e) => set("hotspot_address")(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Subnet Prefix Length</Label>
                          <Input type="number" placeholder="24" value={form.dhcp_prefix_length} onChange={(e) => set("dhcp_prefix_length")(Number(e.target.value))} />
                          <p className="text-[10px] text-muted-foreground">/24=254 IPs, /23=510, /22=1022</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">DHCP Pool Range</Label>
                        <Input placeholder="192.168.88.10-192.168.88.254" value={form.dhcp_pool} onChange={(e) => set("dhcp_pool")(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setWizardStep(0)} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={handleWizardStep2} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save & Continue
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2: Download */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
                <CheckCircle2 className="h-6 w-6 text-success shrink-0" />
                <div>
                  <p className="font-semibold text-success text-sm">{form.name} added successfully!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Status will turn Online after you run the script below.</p>
                </div>
              </div>

              {form.cgnat_mode && (
                <div className="rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2.5">
                  <p className="text-xs font-semibold text-orange-400 mb-1">📡 CGNAT router — what happens next</p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5">
                    <li>1. Run the script on the router (steps below)</li>
                    <li>2. Router will phone home within 30 seconds</li>
                    <li>3. Card will show its IP and mark it connected</li>
                    <li>4. M-Pesa payments &amp; RADIUS sessions work immediately</li>
                  </ul>
                </div>
              )}

              <Button
                size="lg"
                className="w-full gap-2 bg-success hover:bg-success/90 text-white"
                onClick={() => newRouterId && downloadScript(newRouterId, form.name)}
                disabled={downloading}
              >
                {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                Download Setup Script (.rsc)
              </Button>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Terminal className="h-3 w-3" /> How to apply in Winbox
                </p>
                <WinboxSteps routerName={form.name} />
              </div>

              <DialogFooter>
                <Button onClick={closeWizard} className="w-full" variant="outline">Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Router Dialog ────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Router — {editForm.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
          <Tabs defaultValue="connection">
            <TabsList className="mb-4">
              <TabsTrigger value="connection">Connection</TabsTrigger>
              <TabsTrigger value="topology">Topology</TabsTrigger>
              <TabsTrigger value="radius">RADIUS / NAS</TabsTrigger>
              <TabsTrigger value="dlna" className="gap-1.5"><Tv2 className="h-3.5 w-3.5" />DLNA</TabsTrigger>
            </TabsList>

            <TabsContent value="connection" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Router Name *</Label>
                  <Input value={editForm.name} onChange={(e) => setEdit("name")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>{editForm.dynamic_ip ? "IP Address" : "IP Address *"}</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Dynamic</span>
                      <Switch checked={editForm.dynamic_ip ?? false} onCheckedChange={(v) => setEdit("dynamic_ip")(v)} />
                    </div>
                  </div>
                  {editForm.dynamic_ip ? (
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-400">
                      IP set automatically by heartbeat
                    </div>
                  ) : (
                    <Input value={editForm.ip_address} onChange={(e) => setEdit("ip_address")(e.target.value)} />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>API Port</Label>
                  <Input type="number" value={editForm.api_port} onChange={(e) => setEdit("api_port")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>API Username</Label>
                  <Input value={editForm.api_username} onChange={(e) => setEdit("api_username")(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>API Password</Label>
                  <Input type="password" value={editForm.api_password} onChange={(e) => setEdit("api_password")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input value={editForm.location} onChange={(e) => setEdit("location")(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={editForm.api_ssl} onCheckedChange={setEdit("api_ssl")} />
                  <Label>Use API-SSL</Label>
                </div>
              </div>
              {/* CGNAT toggle in edit */}
              <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Network className="h-4 w-4 text-orange-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Behind CGNAT</p>
                    <p className="text-[10px] text-muted-foreground">Router is behind carrier-grade NAT — direct API not reachable</p>
                  </div>
                </div>
                <Switch
                  checked={editForm.cgnat_mode ?? false}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, cgnat_mode: v, dynamic_ip: v ? true : f.dynamic_ip }))}
                />
              </div>
            </TabsContent>

            <TabsContent value="topology" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>WAN Interface</Label>
                  <Input value={editForm.wan_interface} onChange={(e) => setEdit("wan_interface")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>LAN Interface</Label>
                  <Input value={editForm.lan_interface} onChange={(e) => setEdit("lan_interface")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hotspot Interface</Label>
                  <Input value={editForm.hotspot_interface} onChange={(e) => setEdit("hotspot_interface")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Hotspot IP</Label>
                  <Input value={editForm.hotspot_address} onChange={(e) => setEdit("hotspot_address")(e.target.value)} />
                </div>
                <div className="col-span-2 rounded-md border border-info/20 bg-info/5 px-3 py-2 text-xs text-info">
                  ℹ️ Portal Server IP is auto-detected from your MikroBill server URL — no need to enter it manually.
                </div>
                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>WAN Bandwidth</Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Dynamic (LTE / Starlink)</span>
                      <Switch
                        checked={editForm.wan_speed_dynamic ?? false}
                        onCheckedChange={(v) => setEditForm((f) => ({ ...f, wan_speed_dynamic: v }))}
                      />
                    </div>
                  </div>
                  {editForm.wan_speed_dynamic ? (
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-400">
                      ✓ Variable speed — no global WAN parent queue. Per-user queues still apply.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input type="number" value={editForm.wan_bandwidth_mbps} onChange={(e) => setEdit("wan_bandwidth_mbps")(e.target.value)} className="w-36" />
                      <span className="text-sm text-muted-foreground">Mbps</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Default Conn Limit / User</Label>
                  <Input type="number" placeholder="300" value={editForm.default_conn_limit ?? ""} onChange={(e) => setEdit("default_conn_limit")(e.target.value === "" ? null : Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">Per-IP conntrack cap in RouterOS script (null = disabled)</p>
                </div>
                <div className="col-span-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
                    <span>🔒</span><span>System-Managed IP Addressing</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground font-mono mt-1">
                    <span>DHCP Pool:</span><span className="text-foreground">{editForm.dhcp_pool || "—"}</span>
                    <span>Prefix Length:</span><span className="text-foreground">/{editForm.dhcp_prefix_length || 24}</span>
                    <span>Hotspot IP:</span><span className="text-foreground">{editForm.hotspot_address || "—"}</span>
                  </div>
                  <p className="text-[10px] text-amber-600/80 mt-1">Auto-assigned at onboarding to prevent IP conflicts. Contact support to change the subnet.</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="radius" className="space-y-4">
              <div className="space-y-1.5">
                <Label>NAS IP Address</Label>
                <Input value={editForm.nas_ip} onChange={(e) => setEdit("nas_ip")(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>RADIUS Secret</Label>
                <Input type="password" value={editForm.secret_radius} onChange={(e) => setEdit("secret_radius")(e.target.value)} />
              </div>
            </TabsContent>

            {/* ── DLNA tab (BUG-DLNA-01 FIX: per-router UMS IP) ──────────── */}
            <TabsContent value="dlna" className="space-y-4">
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-blue-400 space-y-1">
                <p className="font-medium flex items-center gap-1.5"><Tv2 className="h-3.5 w-3.5" /> Per-router DLNA / Universal Media Server</p>
                <p className="text-blue-400/80">
                  Set a UMS IP here if this router's LAN is on a different subnet from your global DLNA setting.
                  Leave blank to inherit the global value from <span className="font-mono">Settings → DLNA</span>.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>UMS Server IP (this router's LAN)</Label>
                <Input
                  className="font-mono"
                  placeholder={"Inherit global (e.g. " + ((editForm as any).dlna_server_ip || "192.168.88.200") + ")"}
                  value={(editForm as any).dlna_server_ip ?? ""}
                  onChange={(e) => setEditForm((f: any) => ({ ...f, dlna_server_ip: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground">Static LAN IP of the UMS PC reachable from this router. Empty = use global setting.</p>
              </div>
              <div className="space-y-1.5">
                <Label>UMS Streaming Port</Label>
                <Input
                  type="number"
                  placeholder="8200"
                  value={(editForm as any).dlna_port ?? ""}
                  onChange={(e) => setEditForm((f: any) => ({ ...f, dlna_port: e.target.value === "" ? null : Number(e.target.value) }))}
                />
                <p className="text-[10px] text-muted-foreground">Default 8200. Empty = use global setting.</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">DLNA on this router</p>
                  <p className="text-[10px] text-muted-foreground">Override enable/disable for this router only. Toggle off = no dlna-allowed list managed here.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {(editForm as any).dlna_enabled === null ? "Global" : (editForm as any).dlna_enabled ? "On" : "Off"}
                  </span>
                  <select
                    className="text-xs rounded border border-border bg-background px-2 py-1"
                    value={(editForm as any).dlna_enabled === null ? "global" : (editForm as any).dlna_enabled ? "true" : "false"}
                    onChange={(e) => setEditForm((f: any) => ({
                      ...f,
                      dlna_enabled: e.target.value === "global" ? null : e.target.value === "true",
                    }))}
                  >
                    <option value="global">Use global setting</option>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t border-border/50">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Router?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the router and all associated configuration. Active sessions will not be disconnected automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteDeleting} className="bg-destructive hover:bg-destructive/90">
              {deleteDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove Router
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default RoutersPage;
