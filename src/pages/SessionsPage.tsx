import AdminLayout from "@/components/AdminLayout";
import StatusBadge from "@/components/StatusBadge";
import { activeSessions, formatBytes } from "@/lib/mockData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

const SessionsPage = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Active Sessions</h1>
            <p className="text-sm text-muted-foreground mt-1">Live hotspot & PPPoE connections</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
            <span className="text-sm text-success font-medium">{activeSessions.length} active</span>
          </div>
        </div>

        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Username</TableHead>
                <TableHead className="text-xs">IP Address</TableHead>
                <TableHead className="text-xs">MAC Address</TableHead>
                <TableHead className="text-xs">Router</TableHead>
                <TableHead className="text-xs">Package</TableHead>
                <TableHead className="text-xs">Uptime</TableHead>
                <TableHead className="text-xs">Download</TableHead>
                <TableHead className="text-xs">Upload</TableHead>
                <TableHead className="text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeSessions.map((s) => (
                <TableRow key={s.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{s.username}</TableCell>
                  <TableCell className="text-xs font-mono text-primary">{s.ip_address}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{s.mac_address}</TableCell>
                  <TableCell className="text-xs">{s.mikrotik_name}</TableCell>
                  <TableCell className="text-xs capitalize font-medium">{s.package_tier}</TableCell>
                  <TableCell className="text-xs font-mono">{s.uptime}</TableCell>
                  <TableCell className="text-xs font-mono text-success">{formatBytes(s.bytes_in)}</TableCell>
                  <TableCell className="text-xs font-mono text-info">{formatBytes(s.bytes_out)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
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

export default SessionsPage;
