import AdminLayout from "@/components/AdminLayout";
import { useErrorLogs } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle, AlertTriangle, XCircle, Info, Download } from "lucide-react";
import { useState } from "react";

const levelIcons: Record<string, React.ReactNode> = {
  error: <XCircle className="h-4 w-4 text-destructive" />,
  warn: <AlertTriangle className="h-4 w-4 text-warning" />,
  info: <Info className="h-4 w-4 text-info" />,
};

const levelStyles: Record<string, string> = {
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  info: "bg-info/15 text-info border-info/30",
};

const serviceStyles: Record<string, string> = {
  api: "bg-primary/15 text-primary border-primary/30",
  radius: "bg-chart-2/15 text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2))]/30",
  mikrotik: "bg-chart-3/15 text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3))]/30",
  mpesa: "bg-chart-4/15 text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4))]/30",
  sms: "bg-muted text-muted-foreground border-border",
};

const ErrorLogsPage = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "error" | "warn" | "info">("all");
  const { data: errorLogs = [], isLoading } = useErrorLogs();
  
  const filtered = errorLogs.filter((e: any) => {
    const matchesSearch = e.message.toLowerCase().includes(search.toLowerCase()) || e.service.includes(search.toLowerCase());
    const matchesFilter = filter === "all" || e.level === filter;
    return matchesSearch && matchesFilter;
  });

  const errorCount = errorLogs.filter((e: any) => e.level === "error").length;
  const warnCount = errorLogs.filter((e: any) => e.level === "warn").length;
  const unresolvedCount = errorLogs.filter((e: any) => !e.resolved).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Error Logs & Bug History</h1>
            <p className="text-sm text-muted-foreground mt-1">System-wide error tracking with resolution workflow</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{errorCount}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-warning">{warnCount}</p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-info">{unresolvedCount}</p>
            <p className="text-xs text-muted-foreground">Unresolved</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-success">{errorLogs.length - unresolvedCount}</p>
            <p className="text-xs text-muted-foreground">Resolved</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
          </div>
          <div className="flex gap-1">
            {(["all", "error", "warn", "info"] as const).map((level) => (
              <Button key={level} variant={filter === level ? "default" : "outline"} size="sm" onClick={() => setFilter(level)} className="text-xs capitalize">
                {level}
              </Button>
            ))}
          </div>
        </div>

        {/* Logs Table */}
        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs w-16">Level</TableHead>
                <TableHead className="text-xs w-20">Service</TableHead>
                <TableHead className="text-xs">Message</TableHead>
                <TableHead className="text-xs w-20">Status</TableHead>
                <TableHead className="text-xs w-36">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => (
                <TableRow key={log.id} className="border-border/30">
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {levelIcons[log.level]}
                      <Badge variant="outline" className={`${levelStyles[log.level]} text-[10px]`}>{log.level}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${serviceStyles[log.service] || ""} text-[10px] capitalize`}>{log.service}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{log.message}</TableCell>
                  <TableCell>
                    {log.resolved ? (
                      <div className="flex items-center gap-1 text-success">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="text-[10px]">Fixed</span>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary hover:text-primary">
                        Resolve
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{new Date(log.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Retention Notice */}
        <p className="text-[10px] text-muted-foreground text-center">Error logs retained for 90 days · Info logs retained for 30 days · Auto-purged by scheduled job</p>
      </div>
    </AdminLayout>
  );
};

export default ErrorLogsPage;
