import AdminLayout from "@/components/AdminLayout";
import { users } from "@/lib/mockData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Link2, Globe, Shield } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

const IPBindingPage = () => {
  const boundUsers = users.filter(u => u.mac_binding || u.static_ip);
  const unboundUsers = users.filter(u => !u.mac_binding && !u.static_ip);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">IP Lock & MAC Binding</h1>
          <p className="text-sm text-muted-foreground mt-1">Static IP assignment & MAC address binding for PPPoE & premium users</p>
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
              <p className="text-lg font-bold">{users.filter(u => u.static_ip).length}</p>
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
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Username</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">MAC Binding</TableHead>
                <TableHead className="text-xs">Static IP</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
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
                      <Button variant="ghost" size="sm" className="h-7 text-[10px]">
                        {u.mac_binding ? "Unbind MAC" : "Bind MAC"}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-[10px]">
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
