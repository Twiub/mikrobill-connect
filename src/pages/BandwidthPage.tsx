import AdminLayout from "@/components/AdminLayout";
import { useBandwidthSchedules } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Zap } from "lucide-react";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BandwidthPage = () => {
  const { data: bandwidthSchedules = [] } = useBandwidthSchedules();
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bandwidth Schedules</h1>
            <p className="text-sm text-muted-foreground mt-1">Time-based bandwidth policies with peak/off-peak speeds</p>
          </div>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Schedule
          </Button>
        </div>

        {/* Active Schedules Visual */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {["Basic", "Standard", "Premium", "Unlimited"].map((pkg) => {
            const schedules = bandwidthSchedules.filter((s: any) => s.packages?.name === pkg);
            return (
              <div key={pkg} className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold">{pkg}</h3>
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  {schedules.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-semibold">{s.label}</p>
                          <p className="text-[10px] text-muted-foreground">{s.start_time} - {s.end_time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono font-semibold text-primary">↓{s.rate_down} / ↑{s.rate_up}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.day_of_week ? s.day_of_week.map(d => dayNames[d]).join(", ") : "All days"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {schedules.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No schedules configured</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Schedule Table */}
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Package</TableHead>
                <TableHead className="text-xs">Label</TableHead>
                <TableHead className="text-xs">Time Range</TableHead>
                <TableHead className="text-xs">Days</TableHead>
                <TableHead className="text-xs">Download</TableHead>
                <TableHead className="text-xs">Upload</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bandwidthSchedules.map((s) => (
                <TableRow key={s.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{(s as any).packages?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{s.label}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{s.start_time} — {s.end_time}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.day_of_week ? s.day_of_week.map(d => dayNames[d]).join(", ") : "All"}
                  </TableCell>
                  <TableCell className="text-xs font-mono font-semibold text-success">{s.rate_down}</TableCell>
                  <TableCell className="text-xs font-mono font-semibold text-info">{s.rate_up}</TableCell>
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

export default BandwidthPage;
