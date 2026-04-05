/**
 * KYCPage.tsx — v2.1.0
 *
 * FIXES:
 *  - RESP-05: Responsive header, badges stack on mobile, overflow-x-auto on table.
 *  - PERF-09: Debounced search.
 *  - UX-07: Skeleton loading rows.
 *  - UX-08: Column collapse on narrow screens.
 *  - ARIA-03: Action buttons have descriptive aria-labels.
 */

import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useKycRecords } from "@/hooks/useDatabase";
import { useDebounce } from "@/hooks/useDebounce";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/authClient";

const KYCPage = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { data: kycRecords = [], isLoading } = useKycRecords();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const apiBase = () => (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");

  // BUG-P3-CRIT-03 FIX: Verify button previously had no onClick handler.
  const handleVerify = async (kyc: any) => {
    setActionLoading(`verify-${kyc.id}`);
    try {
      const res = await fetch(`${apiBase()}/admin/kyc/${kyc.id}/verify`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to verify");
      toast({ title: "KYC Verified", description: `${kyc.full_name} marked as verified.` });
      queryClient.invalidateQueries({ queryKey: ["kyc"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  // BUG-P3-CRIT-03 FIX: View ID button previously had no onClick handler.
  const handleViewId = (kyc: any) => {
    // Open KYC document viewer — fetch from /api/admin/kyc/:id to get doc info
    const url = `${apiBase()}/admin/kyc/${kyc.id}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const filtered = useMemo(() => {
    if (!debouncedSearch) return kycRecords as any[];
    const q = debouncedSearch.toLowerCase();
    return (kycRecords as any[]).filter(k =>
      k.full_name.toLowerCase().includes(q) || k.phone.includes(debouncedSearch)
    );
  }, [kycRecords, debouncedSearch]);

  const verified = (kycRecords as any[]).filter(k => k.verified).length;
  const pending  = (kycRecords as any[]).filter(k => !k.verified).length;

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">KYC / Legal Compliance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Kenya ICT Act subscriber identity records</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">
              {verified} verified
            </Badge>
            <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">
              {pending} pending
            </Badge>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border h-9 text-sm"
            aria-label="Search KYC records"
          />
        </div>

        {/* Table */}
        <div className="glass-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs whitespace-nowrap">Full Name</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden sm:table-cell">ID Type</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden md:table-cell">ID Number</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Phone</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden lg:table-cell">Address</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                <TableHead className="text-xs whitespace-nowrap hidden xl:table-cell">Verified By</TableHead>
                <TableHead className="text-xs whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={6} cols={8} />
              ) : (
                filtered.map((kyc: any) => (
                  <TableRow key={kyc.id} className="border-border/30">
                    <TableCell className="text-sm font-medium whitespace-nowrap">{kyc.full_name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[10px] capitalize">{kyc.id_type?.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground hidden md:table-cell whitespace-nowrap">{kyc.id_number}</TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap">{kyc.phone}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-[140px] truncate">{kyc.address}</TableCell>
                    <TableCell>
                      {kyc.verified ? (
                        <div className="flex items-center gap-1 text-green-500">
                          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="text-[10px] font-medium">Verified</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-yellow-500">
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="text-[10px] font-medium">Pending</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden xl:table-cell whitespace-nowrap">{kyc.verified_by || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          aria-label={`View ID document for ${kyc.full_name}`}
                          onClick={() => handleViewId(kyc)}
                        >
                          <FileText className="h-3 w-3" aria-hidden="true" />
                          <span className="hidden sm:inline">View ID</span>
                        </Button>
                        {!kyc.verified && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-green-500 hover:text-green-500"
                            aria-label={`Verify KYC record for ${kyc.full_name}`}
                            disabled={actionLoading === `verify-${kyc.id}`}
                            onClick={() => handleVerify(kyc)}
                          >
                            Verify
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!isLoading && filtered.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{search ? "No matching records" : "No KYC records yet"}</p>
              <p className="text-xs mt-1">Subscriber ID uploads will appear here</p>
            </div>
          )}
        </div>

        {/* Data retention */}
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold mb-2">Data Retention Policy</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-muted-foreground">
            <div>• KYC records: retained indefinitely</div>
            <div>• IP/MAC history: JSONB auto-logged</div>
            <div>• Session logs: 90-day retention</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default KYCPage;
