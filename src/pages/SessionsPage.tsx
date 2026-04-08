/**
 * SessionsPage.tsx — v2.1.0
 *
 * FIXES:
 *  - RESP-03: Responsive header stacking, table overflow-x-auto.
 *  - PERF-07: Debounced search filter — no re-render on every keystroke.
 *  - UX-03: Skeleton loading rows instead of plain text.
 *  - UX-04: Column visibility collapsed on narrow screens.
 *  - ARIA-02: Disconnect button has proper aria-label per session.
 */

import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useActiveSessions, formatBytes } from "@/hooks/useDatabase";
import { useDebounce } from "@/hooks/useDebounce";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { XCircle, RefreshCw, Search, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SessionsPage = () => {
  const { data: sessions, isLoading, refetch, isFetching } = useActiveSessions();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const { toast } = useToast();

  const filtered = useMemo(() => {
    const list = (sessions ?? []) as any[];
    if (!debouncedSearch) return list;
    const q = debouncedSearch.toLowerCase();
    return list.filter(s =>
      s.username?.toLowerCase().includes(q) ||
      s.ip_address?.includes(q) ||
      s.mac_address?.toLowerCase().includes(q) ||
      s.mikrotik_name?.toLowerCase().includes(q)
    );
  }, [sessions, debouncedSearch]);

  const handleDisconnect = async (session: any) => {
    setDisconnecting(session.id);
    try {
      const res = await fetch(`/api/admin/mikrotik/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // BUG-P3-HIGH-01 FIX: backend mikrotik.js:731 validates routerIds as .isArray({min:1}).
        // Sending routerId (string) always failed validation; wrap in array.
        body: JSON.stringify({ username: session.username, routerIds: [session.router_id].filter(Boolean).map(Number) }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Disconnected", description: `${session.username} has been disconnected.` });
        refetch();
      } else {
        toast({ title: "Error", description: data.error ?? "Disconnect failed.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDisconnecting(null);
    }
  };

  const isStale = (s: any) =>
    s.last_seen ? Date.now() - new Date(s.last_seen).getTime() > 5 * 60 * 1000 : false;

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Active Sessions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Live hotspot &amp; PPPoE connections</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground">Refreshing…</span>
            )}
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-green-500 font-medium">{filtered.length} active</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh sessions"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Username, IP, MAC…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
            aria-label="Search sessions"
          />
        </div>

        <div className="glass-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs whitespace-nowrap">Username</TableHead>
                <TableHead className="text-xs whitespace-nowrap">IP Address</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden sm:table-cell">MAC</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden md:table-cell">Router</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden md:table-cell">Uptime</TableHead>
                <TableHead className="text-xs whitespace-nowrap">↓ Down</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden lg:table-cell">↑ Up</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden xl:table-cell">Last Seen</TableHead>
                <TableHead className="text-xs w-12">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={6} cols={9} />
              ) : (
                filtered.map((s: any) => (
                  <TableRow key={s.id} className="border-border/30">
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-1.5">
                        <Wifi className="h-3 w-3 text-green-500 shrink-0" aria-hidden="true" />
                        <span className="truncate max-w-[120px]">{s.username}</span>
                        {isStale(s) && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">stale</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-primary whitespace-nowrap">{s.ip_address ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground hidden sm:table-cell whitespace-nowrap">{s.mac_address ?? "—"}</TableCell>
                    <TableCell className="text-xs hidden md:table-cell whitespace-nowrap">{s.mikrotik_name}</TableCell>
                    <TableCell className="text-xs font-mono hidden md:table-cell whitespace-nowrap">{s.uptime}</TableCell>
                    <TableCell className="text-xs font-mono text-green-500 whitespace-nowrap">{formatBytes(Number(s.bytes_in ?? 0))}</TableCell>
                    <TableCell className="text-xs font-mono text-blue-400 hidden lg:table-cell whitespace-nowrap">{formatBytes(Number(s.bytes_out ?? 0))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden xl:table-cell whitespace-nowrap">
                      {s.last_seen ? new Date(s.last_seen).toLocaleTimeString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label={`Disconnect ${s.username}`}
                        title={`Disconnect ${s.username}`}
                        onClick={() => handleDisconnect(s)}
                        disabled={disconnecting === s.id}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!isLoading && filtered.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <Wifi className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No active sessions</p>
              <p className="text-xs mt-1">
                {search ? `No sessions matching "${search}"` : "Connected users will appear here."}
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default SessionsPage;
