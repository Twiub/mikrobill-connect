/**
 * TransactionsPage.tsx — v2.1.0
 *
 * FIXES:
 *  - RESP-01: Added search, filter bar, and responsive padding.
 *  - RESP-02: Table wrapped in overflow-x-auto for mobile.
 *  - PERF-06: Debounced search (300ms) — no per-keystroke DB queries.
 *  - UX-01: Skeleton rows shown while loading instead of plain text.
 *  - UX-02: Row count shown in header.
 */

import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { PanelErrorBoundary } from "@/components/ErrorBoundary";
import StatusBadge from "@/components/StatusBadge";
import { useTransactions, formatKES } from "@/hooks/useDatabase";
import { useDebounce } from "@/hooks/useDebounce";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Receipt } from "lucide-react";

const TransactionsPage = () => {
  const { data: transactions, isLoading } = useTransactions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const debouncedSearch = useDebounce(search, 300);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return (transactions as any[]).filter(t => {
      const matchSearch = !debouncedSearch ||
        t.user_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.mpesa_ref?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.phone?.includes(debouncedSearch);
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [transactions, debouncedSearch, statusFilter]);

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Transactions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              M-Pesa payment history
              {!isLoading && <span className="ml-2 text-muted-foreground/70">({filtered.length} records)</span>}
            </p>
          </div>
          {/* Status filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "success", "pending", "failed"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={[
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                ].join(" ")}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search name, ref, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-card border-border"
            aria-label="Search transactions"
          />
        </div>

        <PanelErrorBoundary title="Transactions">
          <div className="glass-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs whitespace-nowrap">M-Pesa Ref</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">User</TableHead>
                  <TableHead className="text-xs whitespace-nowrap hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Amount</TableHead>
                  <TableHead className="text-xs whitespace-nowrap hidden md:table-cell">Type</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-xs whitespace-nowrap hidden lg:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={8} cols={7} />
                ) : (
                  filtered.map((t: any) => (
                    <TableRow key={t.id} className="border-border/30">
                      <TableCell className="text-xs font-mono font-semibold text-primary whitespace-nowrap">{t.mpesa_ref}</TableCell>
                      <TableCell className="text-sm font-medium whitespace-nowrap">{t.user_name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground hidden sm:table-cell whitespace-nowrap">{t.phone}</TableCell>
                      <TableCell className="text-sm font-mono font-semibold whitespace-nowrap">{formatKES(Number(t.amount))}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground hidden md:table-cell whitespace-nowrap">{t.type?.replace(/_/g, " ")}</TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {!isLoading && filtered.length === 0 && (
              <div className="p-12 text-center text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">{search ? `No results for "${search}"` : "No transactions yet"}</p>
                <p className="text-xs mt-1">M-Pesa payments will appear here</p>
              </div>
            )}
          </div>
        </PanelErrorBoundary>
      </div>
    </AdminLayout>
  );
};

export default TransactionsPage;
