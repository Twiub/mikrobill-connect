import AdminLayout from "@/components/AdminLayout";
import StatusBadge from "@/components/StatusBadge";
import { routers } from "@/lib/mockData";
import { Wifi, AlertTriangle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const RoutersPage = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">MikroTik Routers</h1>
            <p className="text-sm text-muted-foreground mt-1">Network device management & monitoring</p>
          </div>
          <Button size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Add Router
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {routers.map((r) => (
            <div key={r.id} className={`glass-card p-6 ${r.status === "offline" ? "border-destructive/30" : "border-border/50"}`}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${r.status === "online" ? "bg-success/10" : "bg-destructive/10"}`}>
                    <Wifi className={`h-5 w-5 ${r.status === "online" ? "text-success" : "text-destructive"}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">{r.name}</h3>
                    <p className="text-xs font-mono text-muted-foreground">{r.ip_address}</p>
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>

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
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 text-destructive">
                  <AlertTriangle className="h-8 w-8" />
                  <p className="text-sm font-medium">Router Unreachable</p>
                  <Button variant="outline" size="sm" className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                    Retry Connection
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default RoutersPage;
