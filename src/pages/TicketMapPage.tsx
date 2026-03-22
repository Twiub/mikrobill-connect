// @ts-nocheck
import AdminLayout from "@/components/AdminLayout";
import { useTickets } from "@/hooks/useDatabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, AlertTriangle, CheckCircle, Clock, User } from "lucide-react";
import PriorityBadge from "@/components/PriorityBadge";
import StatusBadge from "@/components/StatusBadge";

const TicketMapPage = () => {
  const { data: tickets = [] } = useTickets();
  const openTickets = tickets.filter((t: any) => t.status === "open" || t.status === "in_progress");
  const gpsTickets = tickets.filter((t: any) => t.lat && t.lng);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ticket Map View</h1>
            <p className="text-sm text-muted-foreground mt-1">GPS-enabled ticket visualization for field technician dispatch</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">{openTickets.length} open</Badge>
            <Badge variant="outline" className="bg-info/15 text-info border-info/30">{gpsTickets.length} with GPS</Badge>
          </div>
        </div>

        {/* Map Placeholder with ticket locations */}
        <div className="glass-card p-1 overflow-hidden">
          <div className="relative bg-muted/50 rounded-lg" style={{ height: "400px" }}>
            {/* Simulated map background */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Interactive Map (Leaflet.js + OpenStreetMap)</p>
                <p className="text-[10px] text-muted-foreground mt-1">Nairobi, Kenya · Center: -1.2921, 36.8219</p>
              </div>
            </div>

            {/* Simulated ticket pins */}
            {gpsTickets.map((ticket, i) => {
              const left = 15 + (i * 18);
              const top = 20 + (i * 12);
              const pinColor = ticket.priority === "critical" ? "bg-destructive" : ticket.priority === "high" ? "bg-warning" : ticket.status === "in_progress" ? "bg-success" : "bg-info";
              return (
                <div
                  key={ticket.id}
                  className="absolute group cursor-pointer"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <div className={`h-6 w-6 rounded-full ${pinColor} flex items-center justify-center shadow-lg ring-2 ring-background`}>
                    <MapPin className="h-3.5 w-3.5 text-background" />
                  </div>
                  {/* Tooltip */}
                  <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg p-3 shadow-xl z-10 min-w-[200px]">
                    <p className="text-xs font-bold">{ticket.title}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{ticket.user_name}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <PriorityBadge priority={ticket.priority} />
                      <StatusBadge status={ticket.status} />
                    </div>
                    <Button size="sm" className="w-full mt-2 h-6 text-[10px]">Assign to Me</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Map Legend */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-destructive" />
            Critical / High Priority
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-warning" />
            Normal Priority
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-success" />
            In Progress
          </span>
          <span className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-info" />
            Open
          </span>
        </div>

        {/* Ticket List with GPS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {gpsTickets.map((ticket) => (
            <div key={ticket.id} className="glass-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold">{ticket.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ticket.user_name}</p>
                </div>
                <PriorityBadge priority={ticket.priority} />
              </div>
              {ticket.description && (
                <p className="text-xs text-muted-foreground mb-3">{ticket.description}</p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{ticket.lat?.toFixed(4)}, {ticket.lng?.toFixed(4)}</span>
                  {ticket.gps_accuracy && <span className="text-primary">±{ticket.gps_accuracy}m</span>}
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={ticket.status} />
                  {ticket.assigned_to && (
                    <span className="text-[10px] text-muted-foreground">{ticket.assigned_to}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default TicketMapPage;
