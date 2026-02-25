import AdminLayout from "@/components/AdminLayout";
import { adminRoles } from "@/lib/mockData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlus, Shield, Key } from "lucide-react";

const roleStyles: Record<string, string> = {
  super_admin: "bg-destructive/15 text-destructive border-destructive/30",
  network_admin: "bg-info/15 text-info border-info/30",
  billing_admin: "bg-success/15 text-success border-success/30",
  support_agent: "bg-warning/15 text-warning border-warning/30",
  field_tech: "bg-primary/15 text-primary border-primary/30",
  read_only: "bg-muted text-muted-foreground border-border",
};

const roleDescriptions: Record<string, string> = {
  super_admin: "Full access: all settings, routers, financial reports, admin management",
  network_admin: "MikroTik management, sessions, bandwidth, IP binding — no financial data",
  billing_admin: "Payments, invoices, packages, revenue reports — no network config",
  support_agent: "View/respond tickets, view user accounts — cannot modify billing",
  field_tech: "View assigned tickets on map, update status, view outage reports",
  read_only: "View dashboards and reports only — no modifications",
};

const AdminRolesPage = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Roles & Permissions</h1>
            <p className="text-sm text-muted-foreground mt-1">Role-based access control for multi-admin management</p>
          </div>
          <Button size="sm" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Admin
          </Button>
        </div>

        {/* Role Descriptions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(roleDescriptions).map(([role, desc]) => (
            <div key={role} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-primary" />
                <Badge variant="outline" className={`${roleStyles[role]} text-[10px] capitalize`}>
                  {role.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>

        {/* Admins Table */}
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Permissions</TableHead>
                <TableHead className="text-xs">Last Active</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminRoles.map((admin) => (
                <TableRow key={admin.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{admin.name}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{admin.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${roleStyles[admin.role]} text-[10px] capitalize`}>
                      {admin.role.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    <div className="flex gap-1 flex-wrap">
                      {admin.permissions.slice(0, 3).map((p) => (
                        <span key={p} className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          <Key className="h-2.5 w-2.5" />
                          {p}
                        </span>
                      ))}
                      {admin.permissions.length > 3 && (
                        <span className="text-[10px] text-primary">+{admin.permissions.length - 3} more</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(admin.last_active).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary">Edit</Button>
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

export default AdminRolesPage;
