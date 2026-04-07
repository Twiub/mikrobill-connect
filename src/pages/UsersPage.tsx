import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import AdminLayout from "@/components/AdminLayout";
import StatusBadge from "@/components/StatusBadge";
import { useSubscribers, usePackages, formatKES } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, UserPlus, Loader2, Save, Wifi } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function genPassword(len = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function genUsername(full_name: string, phone: string) {
  const base = full_name.trim().split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  const suffix = phone.slice(-4);
  return base + suffix;
}

const EMPTY_SUB = {
  full_name: "", phone: "", username: "", type: "hotspot" as string,
  package_id: "", status: "active" as string,
  mac_binding: "", static_ip: "", kyc_verified: false,
};

const UsersPage = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [typeFilter, setTypeFilter] = useState("all");
  const { data: subscribers = [], isLoading } = useSubscribers(debouncedSearch || undefined);
  const { data: packages = [] } = usePackages();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_SUB });

  const filtered = useMemo(() => {
    const list = subscribers as any[];
    if (typeFilter === "all") return list;
    return list.filter((u: any) => u.type === typeFilter || u.type === "both");
  }, [subscribers, typeFilter]);

  const set = (k: keyof typeof EMPTY_SUB) => (v: any) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_SUB }); setOpen(true); };
  const openEdit = (u: any) => {
    setEditId(u.id);
    setForm({
      full_name: u.full_name ?? "", phone: u.phone ?? "", username: u.username ?? "",
      type: u.type ?? "hotspot", package_id: u.package_id ?? "", status: u.status ?? "active",
      mac_binding: u.mac_binding ?? "", static_ip: u.static_ip ?? "", kyc_verified: u.kyc_verified ?? false,
    });
    setOpen(true);
  };

  const autoFill = () => {
    if (form.full_name && form.phone) {
      setForm(f => ({ ...f, username: f.username || genUsername(f.full_name, f.phone) }));
    }
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone.trim() || !form.username.trim()) {
      toast({ title: "Validation Error", description: "Full name, phone and username are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(), phone: form.phone.trim(), username: form.username.trim(),
        type: form.type as any, package_id: form.package_id || null, status: form.status as any,
        mac_binding: form.mac_binding || null, static_ip: form.static_ip || null,
        kyc_verified: form.kyc_verified,
      };
      if (editId) {
        const { error } = await supabase.from("subscribers").update(payload).eq("id", editId);
        if (error) throw error;
        toast({ title: "Subscriber Updated", description: `${form.full_name} saved.` });
      } else {
        const { error } = await supabase.from("subscribers").insert(payload);
        if (error) throw error;
        toast({ title: "Subscriber Added", description: `${form.full_name} created.` });
      }
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const pkgMap: Record<string, string> = {};
  (packages as any[]).forEach(p => { pkgMap[p.id] = p.name; });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Subscribers</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage hotspot & PPPoE users</p>
          </div>
          <Button size="sm" className="gap-2" onClick={openAdd}><UserPlus className="h-4 w-4" />Add User</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, username or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
          </div>
          <div className="flex gap-2">
            {["all", "hotspot", "pppoe"].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                {t === "all" ? "All" : t === "hotspot" ? "Hotspot" : "PPPoE"}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" /><p className="text-xs">Loading…</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Username</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Package</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u: any) => (
                  <TableRow key={u.id} className="border-border/30 cursor-pointer hover:bg-muted/30" onClick={() => openEdit(u)}>
                    <TableCell className="text-sm font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-xs font-mono">{u.username}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{u.phone}</TableCell>
                    <TableCell className="text-xs hidden md:table-cell">{u.packages?.name || pkgMap[u.package_id] || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{u.type}</Badge></TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <Wifi className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No subscribers found</p>
            </div>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Edit Subscriber" : "Add Subscriber"}</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
              <div><Label className="text-xs">Full Name</Label><Input value={form.full_name} onChange={e => set("full_name")(e.target.value)} onBlur={autoFill} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => set("phone")(e.target.value)} onBlur={autoFill} className="mt-1" /></div>
                <div><Label className="text-xs">Username</Label><Input value={form.username} onChange={e => set("username")(e.target.value)} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <Label className="text-xs">Package</Label>
                  <Select value={form.package_id} onValueChange={v => set("package_id")(v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {(packages as any[]).filter(p => p.type === form.type || p.type === "both").map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — {formatKES(p.price)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => set("status")(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.kyc_verified} onCheckedChange={v => set("kyc_verified")(v)} />
                <Label className="text-xs">KYC Verified</Label>
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

export default UsersPage;
