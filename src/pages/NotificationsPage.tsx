import AdminLayout from "@/components/AdminLayout";
import { useNotifications } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Send, MessageSquare, Smartphone } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

const typeStyles: Record<string, string> = {
  expiry: "bg-warning/15 text-warning border-warning/30",
  payment: "bg-success/15 text-success border-success/30",
  outage: "bg-destructive/15 text-destructive border-destructive/30",
  ticket: "bg-info/15 text-info border-info/30",
  broadcast: "bg-primary/15 text-primary border-primary/30",
  system: "bg-muted text-muted-foreground border-border",
};

const channelIcons: Record<string, React.ReactNode> = {
  sms: <MessageSquare className="h-3.5 w-3.5" />,
  push: <Smartphone className="h-3.5 w-3.5" />,
  both: <Bell className="h-3.5 w-3.5" />,
};

const NotificationsPage = () => {
  const { data: notifications = [] } = useNotifications();
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Push Notifications</h1>
            <p className="text-sm text-muted-foreground mt-1">SMS + FCM push notification management</p>
          </div>
          <Button size="sm" className="gap-2">
            <Send className="h-4 w-4" />
            Send Broadcast
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Sent", value: notifications.filter(n => n.status === "sent").length, icon: Send },
            { label: "Pending", value: notifications.filter(n => n.status === "pending").length, icon: Bell },
            { label: "SMS Channel", value: notifications.filter(n => n.channel === "sms" || n.channel === "both").length, icon: MessageSquare },
            { label: "Push Channel", value: notifications.filter(n => n.channel === "push" || n.channel === "both").length, icon: Smartphone },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Notification Triggers */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">Auto-Trigger Events</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { event: "Package Expiry (24h)", channel: "SMS + Push" },
              { event: "Package Expiry (1h)", channel: "SMS + Push" },
              { event: "Payment Received", channel: "SMS + Push" },
              { event: "Account Suspended", channel: "SMS + Push" },
              { event: "Network Outage", channel: "SMS + Push" },
              { event: "Outage Resolved", channel: "SMS + Push" },
              { event: "Ticket Updated", channel: "Push only" },
              { event: "Admin Broadcast", channel: "SMS + Push" },
            ].map((t) => (
              <div key={t.event} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs font-medium">{t.event}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{t.channel}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Notification History */}
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Title</TableHead>
                <TableHead className="text-xs">Message</TableHead>
                <TableHead className="text-xs">Channel</TableHead>
                <TableHead className="text-xs">Target</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => (
                <TableRow key={n.id} className="border-border/30">
                  <TableCell>
                    <Badge variant="outline" className={`${typeStyles[n.type]} text-[10px] capitalize`}>{n.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{n.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{n.message}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {channelIcons[n.channel]}
                      <span className="capitalize">{n.channel}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{n.target_name || n.target}</TableCell>
                  <TableCell><StatusBadge status={n.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{new Date(n.sent_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default NotificationsPage;
