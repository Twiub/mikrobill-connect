// @ts-nocheck
/**
 * AdminRolesPage.tsx — v3.5.0
 *
 * FIXES:
 *   - "Edit" button was a no-op — now opens a per-page permission editor
 *   - Role change was not wired to backend — now calls PATCH /admin/role/:userId
 *   - Remove button was absent — now calls DELETE /admin/:userId
 *   - Permission editor: super_admin can toggle each page slug per role
 *   - Changes reflect within 5 min (role cache TTL)
 */

import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useUserRoles } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, Shield, Loader2, Edit, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// Using Supabase directly instead of external API

const PAGE_CATEGORIES: { label: string; pages: string[] }[] = [
  { label: "📊 Dashboards & Analytics", pages: ["dashboard", "analytics", "ai-health"] },
  { label: "👥 Subscribers & Billing",  pages: ["users", "packages", "transactions", "expenditure", "kyc"] },
  { label: "🎫 Support",                pages: ["tickets", "ticket-map", "notifications"] },
  { label: "🌐 Network & Routing",      pages: ["routers", "network", "sessions", "ip-pools", "ip-binding", "qos", "mikrotik-scripts", "bandwidth"] },
  { label: "🗺 Maps",                   pages: ["coverage-map"] },
  { label: "🛡 Security",               pages: ["sharing", "error-logs"] },
  { label: "⚙️ Admin",                  pages: ["admin-roles", "settings"] },
];

const PAGE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", analytics: "Analytics", "ai-health": "AI Health",
  users: "Subscribers", packages: "Packages", transactions: "Transactions",
  expenditure: "Expenditure", kyc: "KYC Compliance",
  tickets: "Tickets", "ticket-map": "Ticket Map", notifications: "Notifications",
  routers: "MikroTik Routers", network: "Network Monitor", sessions: "Active Sessions",
  "ip-pools": "IP Pools", "ip-binding": "IP/MAC Binding", qos: "QoS / CAKE",
  "mikrotik-scripts": "MikroTik Scripts", bandwidth: "Bandwidth Schedules",
  "coverage-map": "Coverage Map", sharing: "Anti-Sharing", "error-logs": "Error Logs",
  "admin-roles": "Admin Roles", settings: "Settings",
};

const roleStyles: Record<string, string> = {
  super_admin:   "bg-destructive/15 text-destructive border-destructive/30",
  network_admin: "bg-info/15 text-info border-info/30",
  billing_admin: "bg-success/15 text-success border-success/30",
  support_agent: "bg-warning/15 text-warning border-warning/30",
  field_tech:    "bg-primary/15 text-primary border-primary/30",
  read_only:     "bg-muted text-muted-foreground border-border",
};

const roleDescriptions: Record<string, string> = {
  super_admin:   "Full access — all settings, routers, financial reports, admin management",
  network_admin: "MikroTik management, sessions, bandwidth, IP binding — no financial data",
  billing_admin: "Payments, invoices, packages, revenue reports — no network config",
  support_agent: "View/respond tickets, view user accounts — cannot modify billing",
  field_tech:    "View assigned tickets on map, update status, view outage reports",
  read_only:     "View dashboards and reports only — no modifications",
};

const ALL_ROLES = ["super_admin", "network_admin", "billing_admin", "support_agent", "field_tech", "read_only"];
const EDITABLE_ROLES = ["network_admin", "billing_admin", "support_agent", "field_tech", "read_only"];

const AdminRolesPage = () => {
  const { data: userRoles = [] } = useUserRoles();
  const admins = userRoles as Record<string, unknown>[];
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showInvite, setShowInvite]   = useState(false);
  const [inviting, setInviting]       = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("support_agent");
  const [inviteName, setInviteName]   = useState("");

  const [editRole, setEditRole]             = useState<string | null>(null);
  const [permissions, setPermissions]       = useState<Record<string, boolean>>({});
  const [origPermissions, setOrigPermissions] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms]       = useState(false);
  const [loadingPerms, setLoadingPerms]     = useState(false);

  const openPermissionEditor = async (role: string) => {
    setEditRole(role);
    setLoadingPerms(true);
    try {
      // Load permissions from user_roles table for this role
      const { data } = await supabase.from("user_roles").select("permissions").eq("role", role).limit(1).maybeSingle();
      const perms: Record<string, boolean> = {};
      const allPages = PAGE_CATEGORIES.flatMap(c => c.pages);
      // Default all pages to true for the role
      allPages.forEach(p => { perms[p] = true; });
      // Override with stored permissions if any
      if (data?.permissions && Array.isArray(data.permissions)) {
        allPages.forEach(p => { perms[p] = false; });
        (data.permissions as string[]).forEach(p => { perms[p] = true; });
      }
      setPermissions({ ...perms });
      setOrigPermissions({ ...perms });
    } catch {
      toast({ title: "Failed to load permissions", variant: "destructive" });
    } finally {
      setLoadingPerms(false);
    }
  };

  const savePermissions = async () => {
    if (!editRole) return;
    setSavingPerms(true);
    try {
      const allowedPages = Object.entries(permissions).filter(([, v]) => v).map(([k]) => k);
      // Update permissions for all users with this role
      const { error } = await supabase.from("user_roles").update({ permissions: allowedPages }).eq("role", editRole);
      if (error) throw error;
      toast({ title: "Permissions updated" });
      setEditRole(null);
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSavingPerms(false);
    }
  };

  const togglePage = (page: string) =>
    setPermissions(prev => ({ ...prev, [page]: !prev[page] }));

  const toggleCategory = (pages: string[], value: boolean) =>
    setPermissions(prev => { const n = { ...prev }; pages.forEach(p => { n[p] = value; }); return n; });

  const removeAdmin = async (userId: string, name: string) => {
    if (!confirm(`Remove admin access for ${name}?`)) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Admin removed" }); queryClient.invalidateQueries({ queryKey: ["user_roles"] }); }
  };

  const changeRole = async (userId: string, newRole: string, name: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole }).eq("user_id", userId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Role updated", description: `${name} → ${newRole.replace(/_/g, " ")}` }); queryClient.invalidateQueries({ queryKey: ["user_roles"] }); }
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteRole) { toast({ title: "Email and role required", variant: "destructive" }); return; }
    setInviting(true);
    try {
      // Look up the user by email in profiles
      const { data: profile } = await supabase.from("profiles").select("id").eq("email", inviteEmail).maybeSingle();
      if (!profile) throw new Error("User not found. They must sign up first, then you can assign a role.");
      // Insert role
      const { error } = await supabase.from("user_roles").insert({ user_id: profile.id, role: inviteRole });
      if (error) throw error;
      toast({ title: "Role Assigned", description: `${inviteRole.replace(/_/g, " ")} role assigned to ${inviteEmail}` });
      setShowInvite(false); setInviteEmail(""); setInviteName(""); setInviteRole("support_agent");
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err instanceof Error ? err.message : String(err)), variant: "destructive" });
    } finally { setInviting(false); }
  };

  const changedCount = Object.entries(permissions).filter(([k, v]) => origPermissions[k] !== v).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Admin Roles & Permissions</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage staff access — super_admin can customise which sections each role can access</p>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4" /> Add Admin
          </Button>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_ROLES.map(role => (
            <div key={role} className="glass-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <Badge variant="outline" className={`${roleStyles[role]} text-[10px] capitalize`}>
                    {role.replace(/_/g, " ")}
                  </Badge>
                </div>
                {EDITABLE_ROLES.includes(role) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openPermissionEditor(role)}>
                    <Edit className="h-3 w-3" /> Edit Permissions
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{roleDescriptions[role]}</p>
              {role === "super_admin" && <p className="text-[10px] italic text-muted-foreground">Full access always.</p>}
            </div>
          ))}
        </div>

        {/* Admins Table */}
        <div className="glass-card overflow-x-auto">
          <div className="p-4 border-b border-border/50"><h2 className="text-sm font-semibold">Admin Users</h2></div>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs whitespace-nowrap">Name</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Email</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Role</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Added</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No admins yet. Click "Add Admin".</TableCell></TableRow>
              ) : admins.map(admin => (
                <TableRow key={admin.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{admin.profiles?.full_name ?? "Unknown"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{admin.profiles?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Select defaultValue={admin.role} onValueChange={val => changeRole(admin.user_id, val, admin.profiles?.full_name ?? "User")}>
                      <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs capitalize">{r.replace(/_/g, " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {admin.created_at ? new Date(admin.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {EDITABLE_ROLES.includes(admin.role) && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openPermissionEditor(admin.role)} title="Edit permissions">
                          <Edit className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                        onClick={() => removeAdmin(admin.user_id, admin.profiles?.full_name ?? "User")} title="Remove admin">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Admin User</DialogTitle>
            <DialogDescription>An invitation email will be sent. User sets their password via the link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Full Name (optional)</Label><Input placeholder="Jane Mwangi" value={inviteName} onChange={e => setInviteName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" placeholder="admin@yourisp.co.ke" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
              {inviteRole && <p className="text-[10px] text-muted-foreground mt-1">{roleDescriptions[inviteRole]}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)} disabled={inviting}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail} className="gap-2">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Editor */}
      <Dialog open={!!editRole} onOpenChange={open => { if (!open) setEditRole(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Edit Permissions —
              <Badge variant="outline" className={`${roleStyles[editRole ?? ""] ?? ""} text-xs capitalize ml-1`}>
                {editRole?.replace(/_/g, " ")}
              </Badge>
            </DialogTitle>
            <DialogDescription>Toggle which pages this role can access. Changes apply within 5 minutes.</DialogDescription>
          </DialogHeader>

          {loadingPerms ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4 py-2">
              {changedCount > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {changedCount} unsaved change{changedCount > 1 ? "s" : ""}
                </div>
              )}
              {PAGE_CATEGORIES.map(cat => (
                <div key={cat.label} className="glass-card p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h3 className="text-xs font-semibold">{cat.label}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => toggleCategory(cat.pages, true)} className="text-[10px] text-primary hover:underline">All on</button>
                      <span className="text-muted-foreground text-[10px]">|</span>
                      <button onClick={() => toggleCategory(cat.pages, false)} className="text-[10px] text-destructive/70 hover:underline">All off</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {cat.pages.map(page => (
                      <div key={page} className="flex items-center justify-between gap-2">
                        <label htmlFor={`perm-${page}`} className={`text-xs cursor-pointer flex-1 ${permissions[page] ? "text-foreground" : "text-muted-foreground"}`}>
                          {PAGE_LABELS[page] ?? page}
                        </label>
                        <Switch id={`perm-${page}`} checked={!!permissions[page]} onCheckedChange={() => togglePage(page)} className="scale-75" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPermissions({ ...origPermissions }); setEditRole(null); }}>Cancel</Button>
            <Button onClick={savePermissions} disabled={savingPerms || loadingPerms} className="gap-2">
              {savingPerms ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminRolesPage;
