import AdminLayout from "@/components/AdminLayout";
import { useSharingViolations } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Users, Wifi } from "lucide-react";

const methodStyles: Record<string, string> = {
  device_count: "bg-warning/15 text-warning border-warning/30",
  ttl_analysis: "bg-destructive/15 text-destructive border-destructive/30",
  user_agent: "bg-info/15 text-info border-info/30",
  traffic_pattern: "bg-primary/15 text-primary border-primary/30",
};

const actionStyles: Record<string, string> = {
  throttled: "bg-destructive/15 text-destructive border-destructive/30",
  disconnected: "bg-destructive/15 text-destructive border-destructive/30",
  warned: "bg-warning/15 text-warning border-warning/30",
};

const SharingEnforcementPage = () => {
  const { data: sharingViolations = [] } = useSharingViolations();
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Anti-Sharing Enforcement</h1>
          <p className="text-sm text-muted-foreground mt-1">Detect & prevent hotspot sharing — device limits, TTL analysis & traffic patterns</p>
        </div>

        {/* Detection Methods */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { method: "Device Count", desc: "Count unique MACs per session", accuracy: "High", icon: Users },
            { method: "TTL Analysis", desc: "Detect forwarded packets (TTL=63/127)", accuracy: "Very High", icon: ShieldAlert },
            { method: "User-Agent Diversity", desc: "Multiple different user agents on one IP", accuracy: "Medium", icon: Wifi },
            { method: "Traffic Pattern", desc: "Burst patterns from virtual IPs", accuracy: "Medium", icon: ShieldAlert },
          ].map((m) => (
            <div key={m.method} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-semibold">{m.method}</h3>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{m.desc}</p>
              <Badge variant="outline" className="text-[10px]">Accuracy: {m.accuracy}</Badge>
            </div>
          ))}
        </div>

        {/* Violations Table */}
        <div className="glass-card overflow-x-auto">
          <div className="p-4 border-b border-border/50">
            <h3 className="text-sm font-semibold">Recent Violations</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs whitespace-nowrap">Username</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Detection Method</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Devices Found</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Max Allowed</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Action Taken</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sharingViolations as any[]).map((v) => (
                <TableRow key={v.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{v.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${methodStyles[v.detection_method]} text-[10px]`}>
                      {v.detection_method.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-bold text-destructive">{v.device_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.max_devices}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${actionStyles[v.action_taken]} text-[10px] capitalize`}>{v.action_taken}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{new Date(v.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* MikroTik Script Info */}
        <div className="glass-card p-4 border-l-4 border-l-warning">
          <h3 className="text-xs font-semibold mb-2">MikroTik TTL Detection Script</h3>
          <pre className="text-[10px] text-muted-foreground font-mono bg-muted/50 p-3 rounded overflow-x-auto">
{`/ip firewall mangle
add chain=prerouting protocol=tcp ttl=63 action=mark-packet new-packet-mark=sharing-detected
add chain=prerouting protocol=tcp ttl=127 action=mark-packet new-packet-mark=sharing-detected

/ip firewall filter
add chain=forward packet-mark=sharing-detected action=add-src-to-address-list
    address-list=suspected-sharing address-list-timeout=5m log=yes log-prefix="SHARING:"`}
          </pre>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SharingEnforcementPage;
