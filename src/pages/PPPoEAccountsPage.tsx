// @ts-nocheck
import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import StatusBadge from "@/components/StatusBadge";
import { formatKES, useSubscribers } from "@/hooks/useDatabase";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Home, Wifi, WifiOff, Copy, RefreshCw, Search, Phone, User,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const PORTAL_BASE = typeof window !== "undefined" ? `${window.location.origin}/portal` : "/portal";

const PPPoEAccountsPage = () => {
  const { toast } = useToast();
  const { data: allSubscribers = [], isLoading: loading } = useSubscribers();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Filter PPPoE subscribers
  const subscribers = useMemo(() =>
    (allSubscribers as any[]).filter((s: any) => s.type === "pppoe" || s.type === "both"),
    [allSubscribers]
  );

  const filtered = useMemo(() =>
    subscribers.filter((s: any) =>
      !debouncedSearch ||
      s.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      s.phone?.includes(debouncedSearch) ||
      s.username?.toLowerCase().includes(debouncedSearch.toLowerCase())
    ),
    [subscribers, debouncedSearch]
  );

  const activeCount = subscribers.filter((s: any) => s.status === "active").length;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-4 pb-12 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Home className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">PPPoE Portal Access</h1>
              <p className="text-xs text-muted-foreground">Home broadband subscribers portal management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(PORTAL_BASE); toast({ title: "Portal URL copied!", description: PORTAL_BASE }); }} className="gap-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" />Copy Portal URL
            </Button>
            <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["subscribers"] })} className="gap-1.5 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        </div>

        <div className="glass-card p-4 bg-info/5 border-info/20 text-xs space-y-2">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5 text-info" />PPPoE Portal Access
          </p>
          <p className="text-muted-foreground">
            PPPoE subscribers can log in at <code className="font-mono bg-muted px-1 rounded">{PORTAL_BASE}</code> using
            their phone number. They can view their plan, pay via M-Pesa STK push, and manage their connection.
          </p>
          <p className="font-semibold text-foreground">{activeCount} of {subscribers.length} subscribers active</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone or username…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 bg-muted/50" />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-8 text-center space-y-2">
            <Home className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">No PPPoE subscribers found</p>
            <p className="text-xs text-muted-foreground">Add subscribers with type "pppoe" in the Users page.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((sub: any) => {
              const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
              const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : 0;

              return (
                <div key={sub.id} className="glass-card p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${sub.status === "active" ? "bg-success/20" : "bg-muted"}`}>
                        {sub.status === "active"
                          ? <Wifi className="h-4 w-4 text-success" />
                          : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{sub.full_name}</p>
                          <StatusBadge status={sub.status} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{sub.phone}</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{sub.username}</span>
                          {sub.packages?.name && <span>{sub.packages.name}</span>}
                          {expiresAt && <span className={daysLeft <= 3 ? "text-warning font-medium" : ""}>{daysLeft > 0 ? `${daysLeft}d left` : "Expired"}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default PPPoEAccountsPage;
