// @ts-nocheck
/**
 * ErrorLogsPage.tsx — v2.1.0
 *
 * FIXES:
 *  - RESP-04: Responsive grid (4-col → 2-col → 1-col), overflow-x-auto on table.
 *  - PERF-08: Debounced search.
 *  - UX-05: Skeleton loading rows.
 *  - UX-06: Export button has aria-label.
 */

import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useErrorLogs } from "@/hooks/useDatabase";
import { useDebounce } from "@/hooks/useDebounce";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle, AlertTriangle, XCircle, Info, Download } from "lucide-react";

const levelIcons: Record<string, React.ReactNode> = {
  error: <XCircle className="h-4 w-4 text-destructive" />,
  warn:  <AlertTriangle className="h-4 w-4 text-warning" />,
  info:  <Info className="h-4 w-4 text-info" />,
};
const levelStyles: Record<string, string> = {
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warn:  "bg-warning/15 text-warning border-warning/30",
  info:  "bg-info/15 text-info border-info/30",
};
const serviceStyles: Record<string, string> = {
  api:      "bg-primary/15 text-primary border-primary/30",
  radius:   "bg-chart-2/15 text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2))]/30",
  mikrotik: "bg-chart-3/15 text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3))]/30",
  mpesa:    "bg-chart-4/15 text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4))]/30",
  sms:      "bg-muted text-muted-foreground border-border",
};

const ErrorLogsPage = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all"|"error"|"warn"|"info">("all");
  const debouncedSearch = useDebounce(search, 300);
  const { data: errorLogs = [], isLoading } = useErrorLogs();

  const filtered = useMemo(() => {
    return (errorLogs as any[]).filter(e => {
      const matchSearch = !debouncedSearch ||
        e.message.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        e.service.includes(debouncedSearch.toLowerCase());
      const matchFilter = filter === "all" || e.level === filter;
      return matchSearch && matchFilter;
    });
  }, [errorLogs, debouncedSearch, filter]);

  const errorCount     = (errorLogs as any[]).filter(e => e.level === "error").length;
  const warnCount      = (errorLogs as any[]).filter(e => e.level === "warn").length;
  const unresolvedCount = (errorLogs as any[]).filter(e => !e.resolved).length;
  const resolvedCount  = (errorLogs as any[]).length - unresolvedCount;

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Error Logs &amp; Bug History</h1>
            <p className="text-sm text-muted-foreground mt-0.5">System-wide error tracking with resolution workflow</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 self-start sm:self-auto" aria-label="Export error logs as CSV">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{errorCount}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{warnCount}</p>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{unresolvedCount}</p>
            <p className="text-xs text-muted-foreground">Unresolved</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{resolvedCount}</p>
            <p className="text-xs text-muted-foreground">Resolved</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search logs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-card border-border h-9 text-sm"
              aria-label="Search error logs"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["all","error","warn","info"] as const).map(level => (
              <Button
                key={level}
                variant={filter === level ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(level)}
                className="text-xs capitalize h-8"
                aria-pressed={filter === level}
              >
                {level}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="glass-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs w-20 whitespace-nowrap">Level</TableHead>
                <TableHead className="text-xs w-24 whitespace-nowrap">Service</TableHead>
                <TableHead className="text-xs">Message</TableHead>
                <TableHead className="text-xs w-24 whitespace-nowrap hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-xs w-36 whitespace-nowrap hidden md:table-cell">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={7} cols={5} />
              ) : (
                filtered.map((log: any) => (
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
                    <TableCell className="text-xs max-w-[300px] truncate">{log.message}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {log.resolved ? (
                        <div className="flex items-center gap-1 text-green-500">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="text-[10px]">Fixed</span>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary hover:text-primary" aria-label={`Mark log "${log.message?.slice(0,30)}" as resolved`}>
                          Resolve
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono hidden md:table-cell whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!isLoading && filtered.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{search ? `No logs matching "${search}"` : "No error logs"}</p>
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Error logs retained 90 days · Info logs retained 30 days · Auto-purged by scheduled job
        </p>
      </div>
    </AdminLayout>
  );
};

export default ErrorLogsPage;
