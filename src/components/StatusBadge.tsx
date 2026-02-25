import { Badge } from "@/components/ui/badge";

type StatusType = "active" | "expired" | "suspended" | "online" | "offline" | "success" | "failed" | "pending" | "open" | "in_progress" | "resolved" | "closed";

const statusStyles: Record<StatusType, string> = {
  active: "bg-success/15 text-success border-success/30",
  expired: "bg-warning/15 text-warning border-warning/30",
  suspended: "bg-destructive/15 text-destructive border-destructive/30",
  online: "bg-success/15 text-success border-success/30",
  offline: "bg-destructive/15 text-destructive border-destructive/30",
  success: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  open: "bg-info/15 text-info border-info/30",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  resolved: "bg-success/15 text-success border-success/30",
  closed: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
};

const StatusBadge = ({ status }: { status: string }) => {
  const style = statusStyles[status as StatusType] || statusStyles.closed;
  return (
    <Badge variant="outline" className={`${style} text-[11px] font-medium capitalize`}>
      {status.replace("_", " ")}
    </Badge>
  );
};

export default StatusBadge;
