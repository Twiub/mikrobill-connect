/**
 * IPBindingPage.tsx
 *
 * BUG-P3-CRIT-07 FIX: "Bind MAC" and "Assign IP" buttons previously had no onClick
 * handlers — completely dead. Added prompt-based handlers that call:
 *   PATCH /api/admin/subscribers/:id/mac-binding  (mac_binding field)
 *   PATCH /api/admin/subscribers/:id/static-ip    (static_ip field)
 */

import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useSubscribers } from "@/hooks/useDatabase";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Link2, Globe, Shield } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
const IPBindingPage = () => {
  const { data: subsResult = null } = useSubscribers();
  const users = (subsResult as any)?.data ?? (Array.isArray(subsResult) ? subsResult : []);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const boundUsers   = users.filter((u: any) => u.mac_binding || u.static_ip);
  const unboundUsers = users.filter((u: any) => !u.mac_binding && !u.static_ip);

  


  // BUG-P3-CRIT-07 FIX: Bind / Unbind MAC
  const handleMacBinding = async (u: any) => {
    if (u.mac_binding) {
      // Unbind — confirm then clear
      if (!confirm(`Unbind MAC ${u.mac_binding} from ${u.username}?`)) return;
    } else {
      const mac = prompt(`Enter MAC address for ${u.username} (XX:XX:XX:XX:XX:XX):`);
      if (!mac) return;
      if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac.trim())) {
        toast({ title: "Invalid MAC", description: "Format must be XX:XX:XX:XX:XX:XX", variant: "destructive" });
        return;
      }
      setLoading(`mac-${u.id}`);
      try {
        const res = await fetch(`/admin/subscribers/${u.id}/mac-binding`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac_binding: mac.trim().toUpperCase() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast({ title: "MAC bound", description: `${mac.trim().toUpperCase()} bound to ${u.username}` });
        queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally { setLoading(null); }
      return;
    }
    setLoading(`mac-${u.id}`);
    try {
      const res = await fetch(`/admin/subscribers/${u.id}/mac-binding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mac_binding: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "MAC unbound", description: `MAC removed from ${u.username}` });
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(null); }
  };

  // BUG-P3-CRIT-07 FIX: Assign / Release static IP
  const handleStaticIp = async (u: any) => {
    if (u.static_ip) {
      if (!confirm(`Release static IP ${u.static_ip} from ${u.username}?`)) return;
      setLoading(`ip-${u.id}`);
      try {
        const res = await fetch(`/admin/subscribers/${u.id}/static-ip`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ static_ip: null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast({ title: "IP released", description: `Static IP removed from ${u.username}` });
        queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally { setLoading(null); }
    } else {
      const ip = prompt(`Enter static IP address for ${u.username}:`);
      if (!ip) return;
      setLoading(`ip-${u.id}`);
      try {
        const res = await fetch(`/admin/subscribers/${u.id}/static-ip`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ static_ip: ip.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        toast({ title: "IP assigned", description: `Static IP ${ip.trim()} assigned to ${u.username}` });
        queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally { setLoading(null); }
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">IP Lock &amp; MAC Binding</h1>
          <p className="text-sm text-muted-foreground mt-1">Static IP assignment &amp; MAC address binding for PPPoE &amp; premium users</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
              <Lock className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-lg font-bold">{boundUsers.length}</p>
              <p className="text-[10px] text-muted-foreground">Bound Users</p>
            </div>
          </div>
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <Unlock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold">{unboundUsers.length}</p>
              <p className="text-[10px] text-muted-foreground">Unbound Users</p>
            </div>
          </div>
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{users.filter((u: any) => u.static_ip).length}</p>
              <p className="text-[10px] text-muted-foreground">Static IPs</p>
            </div>
          </div>
        </div>

        {/* RADIUS Binding Info */}
        <div className="glass-card p-4 border-l-4 border-l-info">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-info mt-0.5 shrink-0" />
            <div>
              <h3 className="text-xs font-semibold mb-1">RADIUS Integration</h3>
              <p className="text-xs text-muted-foreground">MAC binding uses <code className="text-primary">Calling-Station-Id</code> RADIUS attribute. Static IPs use <code className="text-primary">Framed-IP-Address</code>. Changes sync to FreeRADIUS immediately.</p>
            </div>
          </div>
        </div>

        {/* Bindings Table */}
        <div className="glass-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs whitespace-nowrap">User</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Username</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Type</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                <TableHead className="text-xs whitespace-nowrap">MAC Binding</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Static IP</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u: any) => (
                <TableRow key={u.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{u.full_name}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{u.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">{u.type}</Badge>
                  </TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell>
                    {u.mac_binding ? (
                      <div className="flex items-center gap-1">
                        <Link2 className="h-3 w-3 text-success" />
                        <span className="text-xs font-mono text-success">{u.mac_binding}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not bound</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.static_ip ? (
                      <span className="text-xs font-mono text-primary">{u.static_ip}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Dynamic</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        disabled={loading === `mac-${u.id}`}
                        onClick={() => handleMacBinding(u)}
                        aria-label={u.mac_binding ? `Unbind MAC from ${u.username}` : `Bind MAC to ${u.username}`}
                      >
                        {u.mac_binding ? "Unbind MAC" : "Bind MAC"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        disabled={loading === `ip-${u.id}`}
                        onClick={() => handleStaticIp(u)}
                        aria-label={u.static_ip ? `Release IP from ${u.username}` : `Assign IP to ${u.username}`}
                      >
                        {u.static_ip ? "Release IP" : "Assign IP"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default IPBindingPage;
