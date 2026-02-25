import AdminLayout from "@/components/AdminLayout";
import StatusBadge from "@/components/StatusBadge";
import { users, formatKES } from "@/lib/mockData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const UsersPage = () => {
  const [search, setSearch] = useState("");
  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.phone.includes(search)
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Subscribers</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage hotspot & PPPoE users</p>
          </div>
          <Button size="sm" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add User
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, username or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Username</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Package</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Devices</TableHead>
                <TableHead className="text-xs">Data Used</TableHead>
                <TableHead className="text-xs">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id} className="border-border/30 cursor-pointer hover:bg-muted/30">
                  <TableCell className="text-sm font-medium">{u.full_name}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{u.username}</TableCell>
                  <TableCell className="text-xs font-mono">{u.phone}</TableCell>
                  <TableCell><StatusBadge status={u.type === "hotspot" ? "active" : "online"} /></TableCell>
                  <TableCell className="text-xs font-medium">{u.package_name}</TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell className="text-xs text-center">{u.devices_count}</TableCell>
                  <TableCell className="text-xs font-mono">{u.data_used_gb} GB</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(u.expires_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default UsersPage;
