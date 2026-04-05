/**
 * PPPoEAccountsPage.tsx — v1.1.0 (v3.13.3)
 * Admin → PPPoE Portal Mgmt
 * FIX-4: portal URL correctly points to /portal
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import StatusBadge from "@/components/StatusBadge";
import { formatKES } from "@/hooks/useDatabase";
import {
  Home, Wifi, WifiOff, CheckCircle, Eye, EyeOff, Copy,
  Loader2, RefreshCw, Search, Phone, User, Lock,
} from "lucide-react";

const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");
async function adminApi(method: string, path: string, body?: object) {
  const token = localStorage.getItem("auth_token") ?? sessionStorage.getItem("auth_token");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const PORTAL_BASE = typeof window !== "undefined" ? `${window.location.origin}/portal` : "/portal";

const PPPoEAccountsPage = () => {
  const { toast } = useToast();
  const [subscribers, setSubscribers]   = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [revealedPwds, setRevealedPwds] = useState<Record<string, string>>({});
  const [showPwd, setShowPwd]           = useState<Record<string, boolean>>({});
  const [customPwd, setCustomPwd]       = useState<Record<string, string>>({});
  const [showCustomFor, setShowCustomFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await adminApi("GET", "/admin/pppoe-accounts").catch(() => ({ success: false }));
    if (d.success) setSubscribers(d.subscribers ?? []);
    else toast({ title: "Failed to load", variant: "destructive" });
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEnable = async (sub: any) => {
    const password = customPwd[sub.id]?.trim() || undefined;
    setActionLoading(sub.id);
    const d = await adminApi("POST", `/admin/pppoe-accounts/${sub.id}/enable-portal`,
      password ? { portalPassword: password } : {}
    );
    if (d.success) {
      if (d.initialPassword) setRevealedPwds(p => ({ ...p, [sub.id]: d.initialPassword }));
      setSubscribers(p => p.map(s => s.id === sub.id ? { ...s, portal_enabled: true } : s));
      setShowCustomFor(null);
      setCustomPwd(p => { const n = { ...p }; delete n[sub.id]; return n; });
      toast({
        title: "Portal enabled ✅",
        description: d.initialPassword ? `Auto-generated password sent via SMS.` : "Subscriber notified via SMS.",
      });
    } else {
      toast({ title: "Enable failed", description: d.error, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const handleDisable = async (sub: any) => {
    if (!confirm(`Disable portal access for ${sub.full_name}?`)) return;
    setActionLoading(sub.id);
    const d = await adminApi("POST", `/admin/pppoe-accounts/${sub.id}/disable-portal`);
    if (d.success) {
      setSubscribers(p => p.map(s => s.id === sub.id ? { ...s, portal_enabled: false } : s));
      toast({ title: "Portal disabled" });
    } else {
      toast({ title: "Error", description: d.error, variant: "destructive" });
    }
    setActionLoading(null);
  };

  const filtered = subscribers.filter(s =>
    !search ||
    s.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    s.phone?.includes(debouncedSearch) ||
    s.pppoe_username?.toLowerCase().includes(debouncedSearch.toLowerCase())
  );
  const enabledCount = subscribers.filter(s => s.portal_enabled).length;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-4 pb-12 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Home className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">PPPoE Portal Access</h1>
              <p className="text-xs text-muted-foreground">Enable home broadband subscribers to pay & manage via the portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(PORTAL_BASE); toast({ title: "Portal URL copied!", description: PORTAL_BASE }); }} className="gap-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" />Copy Portal URL
            </Button>
            <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <div className="glass-card p-4 bg-info/5 border-info/20 text-xs space-y-2">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5 text-info" />PPPoE Portal Access
          </p>
          <p className="text-muted-foreground">
            When enabled, PPPoE subscribers can log in at <code className="font-mono bg-muted px-1 rounded">{PORTAL_BASE}</code> using
            their phone number and portal password. A <strong>Home WiFi</strong> tab appears automatically — they can view their plan,
            pay via M-Pesa STK push, and upgrade or downgrade. They can also buy hotspot sessions when away from home.
          </p>
          <p className="font-semibold text-foreground">{enabledCount} of {subscribers.length} subscribers enabled</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone or PPPoE username…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 bg-muted/50" />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-8 text-center space-y-2">
            <Home className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">No PPPoE subscribers found</p>
            <p className="text-xs text-muted-foreground">Add subscribers with account_type = "pppoe" in the Users page.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(sub => {
              const isLoading     = actionLoading === sub.id;
              const initialPwd    = revealedPwds[sub.id];
              const showingCustom = showCustomFor === sub.id;
              const expiresAt     = sub.expires_at ? new Date(sub.expires_at) : null;
              const daysLeft      = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : 0;

              return (
                <div key={sub.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${sub.portal_enabled ? "bg-success/20" : "bg-muted"}`}>
                        {sub.portal_enabled
                          ? <Wifi className="h-4 w-4 text-success" />
                          : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{sub.full_name}</p>
                          <StatusBadge status={sub.status} />
                          {sub.portal_enabled && (
                            <Badge variant="outline" className="text-[9px] bg-success/15 text-success border-success/30">Portal Active</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{sub.phone}</span>
                          {sub.pppoe_username && <span className="flex items-center gap-1"><User className="h-3 w-3" />{sub.pppoe_username}</span>}
                          {sub.packages?.name && <span>{sub.packages.name} · {formatKES(sub.packages.price)}/mo</span>}
                          {expiresAt && <span className={daysLeft <= 3 ? "text-warning font-medium" : ""}>{daysLeft > 0 ? `${daysLeft}d left` : "Expired"}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!sub.portal_enabled ? (
                        <>
                          <Button size="sm" variant="outline" className="text-xs gap-1.5 border-dashed"
                            onClick={() => setShowCustomFor(showingCustom ? null : sub.id)}>
                            <Lock className="h-3 w-3" />Set Password
                          </Button>
                          <Button size="sm" className="text-xs gap-1.5" disabled={isLoading} onClick={() => handleEnable(sub)}>
                            {isLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Enabling…</> : <><CheckCircle className="h-3.5 w-3.5" />Enable Portal</>}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" className="text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={isLoading} onClick={() => handleDisable(sub)}>
                          {isLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Disabling…</> : <><WifiOff className="h-3.5 w-3.5" />Disable Portal</>}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Optional custom password input */}
                  {showingCustom && !sub.portal_enabled && (
                    <div className="flex gap-2 items-center pl-12">
                      <div className="relative flex-1 max-w-xs">
                        <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input type={showPwd[sub.id] ? "text" : "password"} placeholder="Custom password (optional — leave blank for auto)"
                          value={customPwd[sub.id] ?? ""} onChange={e => setCustomPwd(p => ({ ...p, [sub.id]: e.target.value }))}
                          className="pl-8 text-xs bg-muted/50" />
                      </div>
                      <button onClick={() => setShowPwd(p => ({ ...p, [sub.id]: !p[sub.id] }))}
                        className="p-2 rounded hover:bg-muted transition-colors">
                        {showPwd[sub.id] ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    </div>
                  )}

                  {/* Revealed initial password (shown once) */}
                  {initialPwd && sub.portal_enabled && (
                    <div className="flex items-center gap-3 pl-12 p-3 rounded-lg bg-success/10 border border-success/20">
                      <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-success">Portal enabled! Auto-generated password (shown once):</p>
                        <p className="font-mono text-sm font-bold mt-0.5">{initialPwd}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Subscriber notified via SMS. Advise them to change after first login.</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(initialPwd); toast({ title: "Password copied!" }); }}
                        className="p-1.5 rounded hover:bg-success/20 transition-colors" title="Copy password">
                        <Copy className="h-3.5 w-3.5 text-success" />
                      </button>
                    </div>
                  )}
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