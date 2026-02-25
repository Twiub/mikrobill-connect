import { Badge } from "@/components/ui/badge";

const priorityStyles: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-info/15 text-info border-info/30",
  high: "bg-warning/15 text-warning border-warning/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

const PriorityBadge = ({ priority }: { priority: string }) => {
  return (
    <Badge variant="outline" className={`${priorityStyles[priority] || priorityStyles.normal} text-[11px] font-medium capitalize`}>
      {priority}
    </Badge>
  );
};

export default PriorityBadge;
