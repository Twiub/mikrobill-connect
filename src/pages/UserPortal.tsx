/**
 * UserPortal.tsx — v3.4.0
 *
 * FIXES in this version:
 *  - usageData and formatBytes were undefined (crash on dashboard)
 *  - Devices tab read from wrong table (connected_devices → subscriber_devices via backend API)
 *  - Block/Unblock buttons were no-ops — now call /api/portal/devices/deactivate|reactivate
 *  - Device remove button now calls DELETE /api/portal/devices/:mac
 *  - Priority drag-reorder now calls /api/portal/devices/set-priority
 *  - No redirect when user has no active package — now auto-opens "payments" tab
 *  - Devices tab shows slot status (has internet / queued) per device
 *  - Sharing tab: generate invite link, manage existing links
 *  - Settings tab: logout actually works (clears cookie + token)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wifi, User, Smartphone, BarChart3, CreditCard, Ticket, Tv, FileText,
  LogOut, Home, Bell, Settings, RefreshCw, Share2, Loader2, ArrowUp,
  ArrowDown, Trash2, CheckCircle2, WifiOff, AlertCircle, Link, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { formatKES } from "@/hooks/useDatabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import PriorityBadge from "@/components/PriorityBadge";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import LocationConsentModal from "@/components/LocationConsentModal";
import { useToast } from "@/hooks/use-toast";

// Shared chart tooltip style — prevents new object reference on every render
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
} as const;


type PortalTab = "dashboard" | "devices" | "payments" | "usage" | "tickets" | "share" | "settings" | "homewifi";

const COOKIE_KEY = "portal_token";

function getPortalToken(): string | null {
  const match = document.cookie.match(/(?:^|; )portal_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : localStorage.getItem("portal_token");
}

/**
 * SECURITY-FIX-10: clearPortalToken clears ALL storage locations where the token
 * may reside: cookie, localStorage, AND the service worker's IndexedDB.
 *
 * The ISSUE-15 fix stores the token in IndexedDB for SW keepalive after restarts.
 * Without clearing IndexedDB here, the token survives logout — a subsequent user of
 * the same shared device can be automatically authenticated via the stale SW token.
 *
 * Steps:
 *   1. Expire the cookie (SameSite=Strict to prevent CSRF)
 *   2. Remove localStorage entry
 *   3. Post CLEAR_TOKEN to the service worker so it deletes from IndexedDB
 *   4. Clear the device token from the SW's in-memory state
 */
function clearPortalToken() {
  // 1. Expire cookie — use SameSite=Strict for CSRF protection
  document.cookie = `${COOKIE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Strict`;
  // 2. Clear localStorage
  localStorage.removeItem("portal_token");
  // 3. & 4. Tell the service worker to clear its in-memory token AND IndexedDB
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_TOKEN" });
  }
}

/**
 * SECURITY-FIX-10: setPortalToken stores the token and ensures the SW also
 * receives it. Called after login to keep SW keepalive in sync.
 */
function setPortalToken(token: string, rememberDays = 30) {
  const expires = new Date(Date.now() + rememberDays * 24 * 60 * 60 * 1000).toUTCString();
  // SameSite=Strict prevents the cookie being sent on cross-site requests (CSRF protection)
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(token)};expires=${expires};path=/;SameSite=Strict`;
  localStorage.setItem("portal_token", token);
  // Sync to service worker
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SET_TOKEN", token });
  }
}

/api");

async function apiCall(method: string, path: string, body?: object, token?: string | null) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// HIGH-09 FIX v3.19.0: buildUsageData() was completely fake — it distributed the
// subscriber's cumulative data_used_gb across weekdays using hardcoded weights,
// giving every user the same usage pattern (Mon:14%, Tue:12%, Fri:18%, etc.)
// regardless of when they actually used data. A subscriber who used 10 GB only
// on Tuesday still saw Friday as their "peak" day. This led to billing disputes.
//
// Replacement: fetchUsageHistory() calls the backend which queries
// hotspot_active_sessions (RADIUS Accounting data) grouped by date.
// Falls back to the cumulative total distributed evenly when no daily data exists.
async function fetchUsageHistory(token: string | null, days = 7): Promise<{day: string; usage: number}[]> {
  if (!token) return [];
  try {
    /api");
    const res  = await fetch(`/portal/usage-history?days=${days}`, {
      headers: token ? { } : {},
    });
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    if (data.success && Array.isArray(data.history)) return data.history;
  } catch (_) { console.warn("[UserPortal] buildFallbackUsageData parse error"); }
  return [];
}

// Fallback when no RADIUS history exists: distribute total evenly across last N days
function buildFallbackUsageData(totalGb: number, days = 7): {day: string; usage: number}[] {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today  = new Date().getDay(); // 0=Sun … 6=Sat
  return Array.from({ length: days }, (_, i) => {
    const d   = (today - (days - 1 - i) + 7) % 7;
    return { day: labels[d] ?? `D${i+1}`, usage: parseFloat((totalGb / days).toFixed(2)) };
  });
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const UserPortal = () => {
  const [activeTab, setActiveTab]   = useState<PortalTab>("dashboard");
  const [portalUser, setPortalUser] = useState<any>(null);
  const [userPkg, setUserPkg]       = useState<any>(null);
  const [devices, setDevices]       = useState<any[]>([]);
  const [slotsInfo, setSlotsInfo]   = useState({
    used: 0, total: 1, allowSharing: false, allowTransfer: false, tvAllowed: false,
  });
  const [txns, setTxns]             = useState<any[]>([]);
  const [tickets, setTickets]       = useState<any[]>([]);
  const [allPackages, setAllPackages] = useState<any[]>([]);
  const [shareLinks, setShareLinks] = useState<any[]>([]);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc]   = useState("");
  const [tvMac, setTvMac]           = useState("");
  const [voucherCode, setVoucherCode]   = useState("");
  const [voucherError, setVoucherError] = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherSuccess, setVoucherSuccess] = useState("");
  const [loading, setLoading]       = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [priorityChanging, setPriorityChanging] = useState<string | null>(null);
  const [isOffline, setIsOffline]   = useState(false);
  // E-01: Track MikroTik grant status — "connected" | "connecting" | "inactive"
  // "connecting" = DB active but MikroTik grant still in-flight (router was briefly offline)
  const [internetStatus, setInternetStatus] = useState<"connected"|"connecting"|"inactive">("inactive");
  // HIGH-09 FIX v3.19.0: real per-day usage from RADIUS; fallback to even distribution
  const [usageData, setUsageData]   = useState<{day: string; usage: number}[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const token = getPortalToken();
  const { toast } = useToast();

  // ── PPPoE state ───────────────────────────────────────────────────────────
  const [pppoePackages, setPppoePackages]     = useState<any[]>([]);
  const [pppoeStkLoading, setPppoeStkLoading] = useState(false);
  const [pppoeStkMsg, setPppoeStkMsg]         = useState("");

  // ── Dynamic nav: Home WiFi tab only for PPPoE subscribers ────────────────
  const isPppoe = portalUser?.account_type === "pppoe";
  // useMemo: navItems recomputes only when isPppoe changes — not on every state
  // update (tab changes, loading flags, form input, etc.)
  const navItems: { tab: PortalTab; label: string; icon: React.ElementType }[] = useMemo(() => [
    { tab: "dashboard", label: "Home",     icon: Home },
    ...(isPppoe  ? [{ tab: "homewifi" as const, label: "Home WiFi", icon: Wifi }] : []),
    ...(!isPppoe ? [{ tab: "devices"  as const, label: "Devices",   icon: Smartphone }] : []),
    { tab: "payments",  label: "Pay",      icon: CreditCard },
    ...(!isPppoe ? [{ tab: "usage"    as const, label: "Usage",     icon: BarChart3 }] : []),
    { tab: "tickets",   label: "Support",  icon: Ticket },
    ...(!isPppoe ? [{ tab: "share"    as const, label: "Share",     icon: Share2 }] : []),
    { tab: "settings",  label: "Settings", icon: Settings },
  ], [isPppoe]);

  const { needsConsent, grantPermission, denyPermission, isReporting, lastSent } = useLocationTracking(token);

  // ── Load subscriber data ──────────────────────────────────────────────────
  const loadSubscriber = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall("GET", "/portal/status", undefined, token);
      if (!data.success) { clearPortalToken(); window.location.reload(); return; }
      setIsOffline(false);
      setPortalUser(data.subscriber);
      // E-01 FIX: Store internet_status so dashboard can show "Connecting…"
      // when payment was received but MikroTik grant is still in flight.
      if (data.internet_status) setInternetStatus(data.internet_status);
      // If no active package → show payments tab immediately.
      // NULL expires_at = lifetime/unlimited plan — treat as active (matches backend getSessionType).
      const isActive = data.subscriber.status === "active" &&
        (!data.subscriber.expires_at || new Date(data.subscriber.expires_at) > new Date());
      if (!isActive) setActiveTab("payments");
    } catch (err: any) {
      // MED-04 FIX: Detect offline marker injected by service worker instead of
      // silently retaining stale 'Active' state. Show banner; do NOT update portalUser.
      if (err?.offline === true || err?.error === "offline" ||
          err instanceof TypeError /* network failure */) {
        setIsOffline(true);
        // Do NOT call setPortalUser — keep last-known state visually frozen
        return;
      }
      // Auth / server error — token is invalid
      clearPortalToken(); window.location.reload();
    }
  }, [token]);

  const loadDevices = useCallback(async () => {
    if (!token) return;
    setDevicesLoading(true);
    try {
      const data = await apiCall("GET", "/portal/devices", undefined, token);
      if (data.success) {
        setDevices(data.devices ?? []);
        setSlotsInfo({
          used:          data.slotsUsed ?? 0,
          total:         data.slotsTotal ?? 1,
          allowSharing:  data.allowSharing ?? false,
          allowTransfer: data.allowTransfer ?? false,
          tvAllowed:     data.tvAllowed ?? false,
        });
        setUserPkg({ name: data.packageName, max_devices: data.slotsTotal, tv_allowed: data.tvAllowed });
      }
    } catch (err) { console.error("[UserPortal] loadDevices:", err); } finally { setDevicesLoading(false); }
  }, [token]);

  const loadTxns = useCallback(async () => {
    if (!token) return;
    try {
      const txnData = await apiCall("GET", "/portal/transactions?limit=20", undefined, token);
      setTxns(txnData?.success ? (txnData.transactions ?? []) : []);
    } catch (err) { console.error("[UserPortal] loadTxns:", err); }
  }, [token]);

  const loadShareLinks = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall("GET", "/portal/sharing/links", undefined, token);
      if (data.success) setShareLinks(data.links ?? []);
    } catch (err) { console.error("[UserPortal] loadStatus:", err); }

  }, [token]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      // PERF-WATERFALL: Previously three sequential awaits:
      //   await loadSubscriber()          → ~400ms
      //   await Promise.all([loadDevices()]) → ~300ms
      //   await supabase packages          → ~200ms
      //   Total: ~900ms before UI renders
      //
      // Now: fire all three in parallel. loadSubscriber finishes first
      // (lightest call), triggers setPortalUser which React renders immediately
      // while devices+packages are still in-flight. Total wait: ~400ms (longest
      // single call), not the sum. Same pattern WordPress uses with async action
      // hooks to parallelize database queries.
      const portalToken = getPortalToken();
      const [pkgsData] = await Promise.all([
        apiCall("GET", "/portal/packages", undefined, portalToken),
        loadSubscriber(),
        loadDevices(),
      ]);
      const pkgList = pkgsData?.success ? (pkgsData.packages ?? []) : [];
      setAllPackages(pkgList.filter((p: any) => p.is_active));
      setLoading(false);

      // FIX #8 (MEDIUM — PWA keepalive browser cap):
      // Periodic Background Sync has a minimum interval of ~12 hours on low-engagement
      // sites. Call keepalive on every app open (mount) as a synchronous fallback.
      // This ensures the session stays alive for subscribers who open the portal
      // infrequently, without depending on the browser's engagement-score scheduling.
      if (token) {
        fetch("/api/portal/keepalive", {
          method: "POST",
          headers: {, "Content-Type": "application/json" },
        }).catch(() => {});
      }
    };
    init();
  }, []);

  useEffect(() => { if (token) loadTxns(); }, [token, loadTxns]);
  useEffect(() => { if (activeTab === "share") loadShareLinks(); }, [activeTab]);
  useEffect(() => {
    if (activeTab === "tickets" && token) {
      apiCall("GET", "/portal/tickets", undefined, token)
        .then((data: any) => { if (data.success) setTickets(data.tickets ?? []); })
        .catch(() => {});
    }
  }, [activeTab, token]);

  // ── Load PPPoE packages when Home WiFi tab opened ─────────────────────────
  useEffect(() => {
    if (activeTab === "homewifi" && portalUser?.account_type === "pppoe" && pppoePackages.length === 0) {
      apiCall("GET", "/portal/packages", undefined, getPortalToken())
        .then((data: any) => {
          const list: any[] = data?.success ? (data.packages ?? []) : [];
          setPppoePackages(list.filter((p: any) => p.is_active && ["pppoe", "both"].includes(p.type)));
        })
        .catch(() => {});
    }
  }, [activeTab, portalUser?.account_type]);

  // ── PPPoE STK push: handles both PPPoE renewal and hotspot purchase ───────
  const handlePppoePay = async (pkg: any, purchaseType?: string) => {
    if (!pkg || !token) return;
    setPppoeStkLoading(true);
    setPppoeStkMsg("");
    try {
      const body: any = { package_id: pkg.id };
      if (purchaseType) body.purchase_type = purchaseType;
      const data = await apiCall("POST", "/pppoe/pay", body, token);
      if (data.success) {
        setPppoeStkMsg(data.message ?? "Check your phone for the M-Pesa prompt.");
        toast({ title: "Payment initiated ✅", description: `${pkg.name} — ${formatKES(pkg.price)}` });
      } else {
        toast({ title: "Payment failed", description: data.error ?? "STK push failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setPppoeStkLoading(false);
    }
  };

  // ISSUE-09 FIX: Add Page Visibility API listener + foreground polling interval.
  // The PWA relies on Periodic Background Sync for keepalive, but browsers cap this
  // at ~12 hours minimum interval. If the subscriber's package expires overnight while
  // the PWA is backgrounded, the UI shows stale "Active" status when they return.
  // Fix: poll /portal/status immediately on app foreground (visibilitychange → visible)
  // and every 5 minutes while in the foreground, independent of background sync.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // App came to foreground — immediately refresh status
        loadSubscriber().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Foreground polling every 5 minutes when app is visible
    const foregroundPollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadSubscriber().catch(() => {});
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(foregroundPollInterval);
    };
  }, [loadSubscriber]);

  const expiresIn = portalUser?.expires_at
    ? Math.max(0, Math.ceil((new Date(portalUser.expires_at).getTime() - Date.now()) / 86400000))
    : 0;
  const dataCapGb   = userPkg?.data_cap_gb ?? 50;
  const dataPercent = Math.min(100, ((portalUser?.data_used_gb ?? 0) / dataCapGb) * 100);
  // HIGH-09 FIX v3.19.0: Load real per-day usage from RADIUS accounting.
  // On tab open or when subscriber data changes, fetch actual usage history.
  // Falls back to even-distribution if backend has no daily breakdown.
  useEffect(() => {
    if (!portalUser?.id) return;
    if (activeTab !== "usage" && activeTab !== "dashboard") return;
    setUsageLoading(true);
    fetchUsageHistory(token).then((history) => {
      if (history.length > 0) {
        setUsageData(history);
      } else {
        setUsageData(buildFallbackUsageData(portalUser?.data_used_gb ?? 0));
      }
    }).finally(() => setUsageLoading(false));
  }, [portalUser?.id, activeTab, token]); // BUG-S2-006 FIX v3.19.1: removed portalUser?.data_used_gb — it's always 0 (BUG-S3-002) and caused the effect to never re-fire meaningfully. Depend on subscriber id instead.
  // NULL expires_at = lifetime/unlimited plan — active indefinitely
  const isActive    = portalUser?.status === "active" &&
    (!portalUser?.expires_at || expiresIn > 0);

  // ── Device actions ────────────────────────────────────────────────────────
  const deactivateDevice = async (mac: string) => {
    const res = await apiCall("POST", "/portal/devices/deactivate", { mac }, token);
    if (res.success) { toast({ title: "Device deactivated" }); loadDevices(); }
    else toast({ title: "Error", description: res.error, variant: "destructive" });
  };

  const reactivateDevice = async (mac: string) => {
    const res = await apiCall("POST", "/portal/devices/reactivate", { mac }, token);
    if (res.success) { toast({ title: "Device reactivated" }); loadDevices(); }
    else toast({ title: "Error", description: res.error, variant: "destructive" });
  };

  const removeDevice = async (mac: string, name: string) => {
    if (!confirm(`Remove "${name}" from your account? It will lose internet access.`)) return;
    const res = await apiCall("DELETE", `/portal/devices/${encodeURIComponent(mac)}`, undefined, token);
    if (res.success) { toast({ title: "Device removed" }); loadDevices(); }
    else toast({ title: "Error", description: res.error, variant: "destructive" });
  };

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving]   = useState(false);

  // KYC self-service state
  const [kycOpen, setKycOpen]       = useState(false);
  const [kycIdType, setKycIdType]   = useState("national_id");
  const [kycIdNumber, setKycIdNumber] = useState("");
  const [kycSaving, setKycSaving]   = useState(false);
  const [kycMsg, setKycMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async () => {
    if (!currentPwd) {
      toast({ title: "Current password required", description: "Enter your existing password", variant: "destructive" });
      return;
    }
    if (!newPwd || newPwd.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters", variant: "destructive" });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setPwdSaving(true);
    try {
      const res = await apiCall("POST", "/portal/change-password", { currentPassword: currentPwd, newPassword: newPwd }, token);
      if (res.success) {
        toast({ title: "Password updated", description: "Your password has been changed." });
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      } else {
        toast({ title: "Error", description: res.error ?? "Failed to change password", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to update password", variant: "destructive" });
    } finally {
      setPwdSaving(false);
    }
  };

  const submitKyc = async () => {
    if (!kycIdNumber.trim()) return;
    setKycSaving(true);
    setKycMsg(null);
    try {
      const res = await apiCall("POST", "/portal/kyc", { idType: kycIdType, idNumber: kycIdNumber.trim() }, token);
      if (res.success) {
        setKycMsg({ ok: true, text: res.message ?? "KYC submitted successfully." });
        setKycIdNumber("");
        setKycOpen(false);
      } else {
        setKycMsg({ ok: false, text: res.error ?? "Submission failed." });
      }
    } catch {
      setKycMsg({ ok: false, text: "Network error. Please try again." });
    }
    setKycSaving(false);
  };

  const movePriority = async (deviceId: number, direction: "up" | "down") => {
    const sortedActive = [...devices].filter(d => d.is_active).sort((a, b) => a.priority - b.priority);
    const idx = sortedActive.findIndex(d => d.id === deviceId);
    if (direction === "up" && idx <= 0) return;
    if (direction === "down" && idx >= sortedActive.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [sortedActive[idx], sortedActive[swapIdx]] = [sortedActive[swapIdx], sortedActive[idx]];
    const orderedIds = sortedActive.map(d => d.id);
    setPriorityChanging(`${deviceId}`);
    const res = await apiCall("POST", "/portal/devices/set-priority", { orderedIds }, token);
    setPriorityChanging(null);
    if (res.success) { toast({ title: "Priority updated", description: "Changes apply within 10 minutes" }); loadDevices(); }
    else toast({ title: "Error", description: res.error, variant: "destructive" });
  };

  const registerTV = async () => {
    if (!tvMac) return;
    const res = await apiCall("POST", "/portal/devices/register", { mac: tvMac, deviceName: "My TV", deviceType: "tv" }, token);
    if (res.success) { toast({ title: "TV registered" }); setTvMac(""); loadDevices(); }
    else toast({ title: "Error", description: res.error, variant: "destructive" });
  };

  const redeemVoucher = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (code.length !== 14) { setVoucherError("Enter a valid code (XXXX-XXXX-XXXX)"); return; }
    setVoucherLoading(true);
    setVoucherError("");
    setVoucherSuccess("");
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL ?? "/api"}/portal/redeem-voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setVoucherCode("");
        setVoucherSuccess(`✓ ${data.package.name} activated! Expires ${new Date(data.expiresAt).toLocaleDateString()}`);
        toast({ title: "Voucher redeemed! ✅", description: `${data.package.name} is now active` });
        // Refresh portal data
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setVoucherError(data.error ?? "Redemption failed");
      }
    } catch {
      setVoucherError("Network error. Please try again.");
    }
    setVoucherLoading(false);
  };

  const generateShareLink = async () => {
    const res = await apiCall("POST", "/portal/sharing/generate-link", { expiresInHours: 24, maxUses: 1 }, token);
    if (res.success) {
      toast({ title: "Share link created", description: "Link valid for 24 hours" });
      loadShareLinks();
      if (res.link) navigator.clipboard.writeText(res.link).catch(() => {});
    } else {
      toast({ title: "Error", description: res.error, variant: "destructive" });
    }
  };

  const revokeLink = async (tokenId: number) => {
    const res = await apiCall("DELETE", `/portal/sharing/links/${tokenId}`, undefined, token);
    if (res.success) { toast({ title: "Link revoked" }); loadShareLinks(); }
    else toast({ title: "Error", description: res.error, variant: "destructive" });
  };

  const handleLogout = () => {
    apiCall("POST", "/portal/logout", undefined, token).catch(() => {});
    clearPortalToken();
    window.location.href = "/hotspot";
  };

  const submitTicket = async () => {
    if (!ticketTitle.trim() || !ticketDesc.trim()) return;
    try {
      const res = await apiCall("POST", "/portal/tickets", {
        title: ticketTitle,
        description: ticketDesc,
        priority: "medium",
      }, token);
      if (res.success) {
        toast({ title: "Ticket submitted" });
        setTicketTitle(""); setTicketDesc("");
        // Reload tickets list
        const tRes = await apiCall("GET", "/portal/tickets", undefined, token);
        if (tRes.success) setTickets(tRes.tickets ?? []);
      } else {
        toast({ title: "Error", description: res.error ?? "Failed to submit ticket", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Skeleton that matches the real portal layout — eliminates layout shift */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-3.5 w-28 bg-muted rounded animate-pulse" />
          <div className="h-2.5 w-20 bg-muted/60 rounded animate-pulse" />
        </div>
      </header>
      <main className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="glass-card p-4 space-y-2 animate-pulse">
              <div className="h-3 w-16 bg-muted/60 rounded" />
              <div className="h-6 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
        {/* Content card */}
        <div className="glass-card p-5 space-y-3 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-3 w-full bg-muted/60 rounded" />
          <div className="h-3 w-3/4 bg-muted/60 rounded" />
          <div className="h-3 w-1/2 bg-muted/60 rounded" />
        </div>
      </main>
    </div>
  );

  if (!token || !portalUser) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <WifiOff className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="font-semibold">Not logged in</p>
        <Button size="sm" onClick={() => window.location.href = "/hotspot"}>Go to Login</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {needsConsent && <LocationConsentModal onAccept={grantPermission} onDecline={denyPermission} />}

      {/* MED-04 FIX: Offline banner — shown when status fetch fails (wrong WiFi / no internet) */}
      {isOffline && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 flex items-center gap-2 text-yellow-700 dark:text-yellow-400 text-xs">
          <WifiOff className="h-3 w-3 flex-shrink-0" />
          <span>Cannot verify connection — are you on the correct WiFi? Showing last known status.</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-md border-b border-border/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Wifi className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold">WiFi Portal</span>
          </div>
          <div className="flex items-center gap-2">
            {/* E-01: Show "Connecting…" when payment confirmed but MikroTik grant still in-flight */}
            {isActive && internetStatus === "connecting" ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warning/20 text-warning animate-pulse">
                Connecting…
              </span>
            ) : (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isActive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                {isActive ? "Active" : "Expired"}
              </span>
            )}
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
        </div>
      </header>

      {/* No active package banner */}
      {!isActive && activeTab !== "payments" && (
        <div className="max-w-lg mx-auto w-full px-4 pt-3">
          <button onClick={() => setActiveTab("payments")}
            className="w-full glass-card p-3 border-warning/50 bg-warning/5 text-left flex items-center gap-2 hover:border-warning/70 transition-colors">
            <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
            <span className="text-xs text-warning font-medium">No active package — tap to renew</span>
          </button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 pb-24">

        {/* ── Dashboard ── */}
        {activeTab === "dashboard" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold">Hi, {portalUser?.full_name?.split(" ")[0] ?? "User"} 👋</p>
              <p className="text-xs text-muted-foreground">Account: {portalUser?.username ?? "—"}</p>
            </div>
            <div className="glass-card p-5 border-l-4 border-l-primary">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Current Package</p>
                  <p className="text-xl font-bold text-primary">{portalUser?.package_name ?? userPkg?.name ?? "No Package"}</p>
                </div>
                {/* E-01: Show "Connecting" badge when MikroTik grant still in-flight */}
                {isActive && internetStatus === "connecting"
                  ? <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-warning/20 text-warning border border-warning/30 animate-pulse">Connecting…</span>
                  : <StatusBadge status={portalUser?.status ?? "inactive"} />
                }
              </div>
              {/* E-01: Informational banner shown only while grant is in-flight */}
              {isActive && internetStatus === "connecting" && (
                <div className="mb-3 p-2.5 rounded-lg bg-warning/8 border border-warning/25 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 text-warning animate-spin shrink-0" />
                  <p className="text-[11px] text-warning/90 leading-snug">
                    Payment received — setting up your internet access. Usually takes under 60 seconds.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div>
                  <p className="text-sm font-bold">{portalUser?.speed_down ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground">{isPppoe ? "Download" : "Speed"}</p>
                </div>
                <div>
                  <p className="text-sm font-bold">{isPppoe ? (portalUser?.speed_up ?? "—") : `${expiresIn}d`}</p>
                  <p className="text-[10px] text-muted-foreground">{isPppoe ? "Upload" : "Remaining"}</p>
                </div>
                <div>
                  <p className="text-sm font-bold">{isPppoe ? `${expiresIn}d` : `${slotsInfo.used}/${slotsInfo.total}`}</p>
                  <p className="text-[10px] text-muted-foreground">{isPppoe ? "Days Left" : "Devices"}</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Data Used</span>
                  <span className="font-semibold">{portalUser?.data_used_gb ?? 0} GB</span>
                </div>
                <Progress value={dataPercent} className="h-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(isPppoe ? [
                { tab: "homewifi" as const, icon: Wifi,       label: "Home WiFi", color: "text-primary" },
                { tab: "payments" as const, icon: CreditCard, label: "Pay",       color: "text-success" },
                { tab: "tickets"  as const, icon: Ticket,     label: "Support",   color: "text-warning" },
              ] : [
                { tab: "payments" as const, icon: CreditCard, label: "Renew",   color: "text-primary" },
                { tab: "devices"  as const, icon: Smartphone, label: "Devices", color: "text-info" },
                { tab: "tickets"  as const, icon: Ticket,     label: "Support", color: "text-warning" },
              ]).map(({ tab, icon: Icon, label, color }) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ touchAction: "manipulation" }} className="glass-card p-3 text-center hover:border-primary/50 active:scale-95 transition-all min-h-[64px] flex flex-col items-center justify-center gap-1">
                  <Icon className={`h-5 w-5 ${color} mx-auto mb-1`} />
                  <p className="text-[10px] font-medium">{label}</p>
                </button>
              ))}
            </div>
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold mb-3">This Week's Usage</h3>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={usageData}>
                  <defs>
                    <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={9} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }} formatter={(v: number) => [`${v} GB`]} />
                  <Area type="monotone" dataKey="usage" stroke="hsl(var(--primary))" fill="url(#usageGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Devices ── */}
        {activeTab === "devices" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">My Devices</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{slotsInfo.used}/{slotsInfo.total} slots used</span>
                <Button variant="ghost" size="sm" onClick={loadDevices} className="h-7 w-7 p-0">
                  <RefreshCw className={`h-3.5 w-3.5 ${devicesLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Slot usage bar */}
            <div className="glass-card p-3">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-muted-foreground">Device slots in use</span>
                <span className="font-semibold">{slotsInfo.used} / {slotsInfo.total}</span>
              </div>
              <Progress value={(slotsInfo.used / Math.max(1, slotsInfo.total)) * 100} className="h-2" />
              <p className="text-[10px] text-muted-foreground mt-1">
                Priority 1 gets internet first. If a device is offline, the next in line gets its slot automatically.
              </p>
            </div>

            {/* Device list */}
            {devices.length === 0 && !devicesLoading && (
              <div className="glass-card p-6 text-center text-sm text-muted-foreground">
                No devices registered. Your device was auto-registered on login.
              </div>
            )}
            {devices.map((d, idx) => {
              const isOnline = !!d.last_seen && (Date.now() - new Date(d.last_seen).getTime()) < 15 * 60 * 1000;
              const activeDevices = devices.filter(x => x.is_active).sort((a, b) => a.priority - b.priority);
              const posInActive = activeDevices.findIndex(x => x.id === d.id);
              return (
                <div key={d.id} className={`glass-card p-4 ${!d.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${isOnline ? "bg-success" : "bg-muted-foreground"}`} />
                      <span className="text-sm font-semibold">{d.device_name}</span>
                      {d.has_slot && d.is_active && (
                        <Badge variant="outline" className="text-[9px] bg-success/15 text-success border-success/30">Internet ✓</Badge>
                      )}
                      {!d.has_slot && d.is_active && (
                        <Badge variant="outline" className="text-[9px] bg-warning/15 text-warning border-warning/30">Queued</Badge>
                      )}
                      {!d.is_active && (
                        <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground">Paused</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Priority up/down — only for active devices */}
                      {d.is_active && (
                        <>
                          <button
                            onClick={() => movePriority(d.id, "up")}
                            disabled={posInActive <= 0 || priorityChanging === `${d.id}`}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                            title="Move up in priority">
                            <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => movePriority(d.id, "down")}
                            disabled={posInActive >= activeDevices.length - 1 || priorityChanging === `${d.id}`}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                            title="Move down in priority">
                            <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </>
                      )}
                      {/* Pause/Resume */}
                      {d.is_active ? (
                        <Button variant="outline" size="sm" className="h-7 text-[10px]"
                          onClick={() => deactivateDevice(d.mac_address)}>Pause</Button>
                      ) : (
                        <Button variant="outline" size="sm" className="h-7 text-[10px] text-success border-success/50"
                          onClick={() => reactivateDevice(d.mac_address)}>Resume</Button>
                      )}
                      {/* Remove */}
                      <button
                        onClick={() => removeDevice(d.mac_address, d.device_name)}
                        className="p-1 rounded hover:bg-destructive/20 text-destructive/70 hover:text-destructive transition-colors"
                        title="Remove device">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                    <div>
                      <span className="font-mono">{d.mac_address?.slice(0, 11)}...</span>
                      <p className="text-[9px]">MAC Address</p>
                    </div>
                    <div>
                      <span className="capitalize font-medium">{d.device_type ?? "phone"}</span>
                      <p className="text-[9px]">Type</p>
                    </div>
                    <div>
                      <span className="font-medium">#{posInActive >= 0 ? posInActive + 1 : "—"}</span>
                      <p className="text-[9px]">Priority</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Register TV */}
            {slotsInfo.tvAllowed && (
              <div className="glass-card p-4 space-y-3 border-dashed">
                <h3 className="text-xs font-semibold flex items-center gap-1.5"><Tv className="h-3.5 w-3.5 text-info" /> Add TV (by MAC Address)</h3>
                <p className="text-[10px] text-muted-foreground">Find your TV's MAC in Settings → Network → WiFi → MAC Address</p>
                <div className="flex gap-2">
                  <Input placeholder="AA:BB:CC:DD:EE:FF" value={tvMac} onChange={e => setTvMac(e.target.value)} className="font-mono text-xs bg-muted/50 flex-1" />
                  <Button size="sm" onClick={registerTV} disabled={!tvMac}>Add TV</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Home WiFi (PPPoE only) ── */}
        {activeTab === "homewifi" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold">🏠 Home Broadband</p>
              <p className="text-xs text-muted-foreground">PPPoE Account{portalUser?.pppoe_username ? ` · ${portalUser.pppoe_username}` : ""}</p>
            </div>

            {/* Status card */}
            <div className="glass-card p-5 border-l-4 border-l-primary space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-muted-foreground">Current Package</p>
                  <p className="text-xl font-bold text-primary">{portalUser?.package_name ?? "No Package"}</p>
                </div>
                <StatusBadge status={portalUser?.status ?? "inactive"} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="text-sm font-bold text-primary">{portalUser?.speed_down ?? "—"}</p><p className="text-[10px] text-muted-foreground">Download</p></div>
                <div><p className="text-sm font-bold">{portalUser?.speed_up ?? "—"}</p><p className="text-[10px] text-muted-foreground">Upload</p></div>
                <div><p className={`text-sm font-bold ${expiresIn <= 3 && expiresIn > 0 ? "text-warning" : ""}`}>{expiresIn}d</p><p className="text-[10px] text-muted-foreground">Days Left</p></div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Days remaining</span>
                  <span className="font-semibold">{expiresIn} / {portalUser?.duration_days ?? 30} days</span>
                </div>
                <Progress value={(expiresIn / Math.max(1, portalUser?.duration_days ?? 30)) * 100} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Data Used</span>
                  <span className="font-semibold">{portalUser?.data_used_gb ?? 0} GB</span>
                </div>
                <Progress value={dataPercent} className="h-1.5" />
              </div>
            </div>

            {expiresIn <= 3 && isActive && (
              <div className="glass-card p-3 border-warning/40 bg-warning/5 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
                <p className="text-xs text-warning font-medium">Plan expires in {expiresIn} day{expiresIn !== 1 ? "s" : ""}. Renew now to avoid interruption.</p>
              </div>
            )}

            {pppoeStkMsg && (
              <div className="glass-card p-3 border-success/40 bg-success/5 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                <p className="text-xs text-success font-medium">{pppoeStkMsg}</p>
              </div>
            )}

            <h3 className="text-sm font-semibold">Renew / Change Plan</h3>
            {pppoePackages.length === 0 && <p className="text-xs text-muted-foreground">Loading available plans…</p>}
            <div className="space-y-2">
              {pppoePackages.map((pkg) => {
                const isCurrent   = pkg.id === portalUser?.package_id;
                // FIX-5: look up price from pppoePackages (same source), not allPackages
                const currentPkg  = pppoePackages.find(p => p.id === portalUser?.package_id);
                const currentPrice = currentPkg?.price ?? 0;
                const isUpgrade   = !isCurrent && pkg.price > currentPrice;
                const isDowngrade = !isCurrent && pkg.price < currentPrice && currentPrice > 0;
                return (
                  <div key={pkg.id} className={`glass-card p-4 transition-all ${isCurrent ? "border-primary/50" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm">{pkg.name}</h3>
                          {isCurrent  && <Badge variant="outline" className="text-[9px] bg-primary/15 text-primary border-primary/30">Current</Badge>}
                          {isUpgrade  && <span className="text-[9px] text-success font-semibold flex items-center gap-0.5"><ArrowUpCircle className="h-3 w-3" />Upgrade</span>}
                          {isDowngrade && <span className="text-[9px] text-warning font-semibold flex items-center gap-0.5"><ArrowDownCircle className="h-3 w-3" />Downgrade</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{pkg.speed_down} ↓ · {pkg.speed_up} ↑ · {pkg.duration_days}d</p>
                      </div>
                      <p className="text-lg font-extrabold text-primary">{formatKES(pkg.price)}</p>
                    </div>
                    <Button size="sm" className="w-full" variant={isCurrent ? "outline" : "default"} disabled={pppoeStkLoading}
                      onClick={() => handlePppoePay(pkg, "pppoe_renewal")}>
                      {pppoeStkLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Processing…</> :
                        isCurrent ? "Renew — Pay via M-Pesa" : isUpgrade ? "Upgrade — Pay via M-Pesa" : "Change Plan — Pay via M-Pesa"}
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="glass-card p-4 space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Connection Details</h3>
              {[
                ["Account Type",   "Home Broadband (PPPoE)"],
                ["PPPoE Username", portalUser?.pppoe_username ?? "—"],
                ["Phone",          portalUser?.phone ?? "—"],
                ["Expires",        portalUser?.expires_at ? new Date(portalUser.expires_at).toLocaleDateString() : "—"],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-border/20 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payments ── */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{isPppoe ? "📶 Buy Hotspot Data" : "Pay / Renew"}</h2>

            {/* PPPoE context banner */}
            {isPppoe && (
              <div className="glass-card p-4 bg-info/5 border-info/20 flex items-start gap-2.5">
                <Wifi className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Away from home?</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Buy a hotspot session to browse on public WiFi.
                    To renew your home plan, go to the{" "}
                    <button onClick={() => setActiveTab("homewifi")} className="text-primary underline underline-offset-2">Home WiFi</button> tab.
                  </p>
                </div>
              </div>
            )}

            {/* STK confirmation for PPPoE hotspot purchase */}
            {isPppoe && pppoeStkMsg && (
              <div className="glass-card p-3 border-success/40 bg-success/5 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                <p className="text-xs text-success font-medium">{pppoeStkMsg}</p>
              </div>
            )}

            {/* Expired banner for hotspot users */}
            {!isPppoe && !isActive && (
              <div className="glass-card p-4 border-warning/40 bg-warning/5">
                <p className="text-xs text-warning font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Your package has expired. Select a package below to reconnect.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {/* PPPoE: hotspot packages with inline STK pay */}
              {isPppoe && allPackages.filter(p => p.type === "hotspot" || p.type === "both").map((pkg) => (
                <div key={pkg.id} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-bold">{pkg.name}</h3>
                      <p className="text-[10px] text-muted-foreground">{pkg.speed_down} · {pkg.duration_days}d · {pkg.max_devices} device{pkg.max_devices > 1 ? "s" : ""}</p>
                    </div>
                    <p className="text-lg font-extrabold text-primary">{formatKES(pkg.price)}</p>
                  </div>
                  <Button size="sm" className="w-full gap-1.5" disabled={pppoeStkLoading}
                    onClick={() => handlePppoePay(pkg, "hotspot_purchase")}>
                    {pppoeStkLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Processing…</> : "Buy Now — Pay via M-Pesa"}
                  </Button>
                </div>
              ))}

              {/* Hotspot users: standard package redirect */}
              {!isPppoe && allPackages.map((pkg) => (
                <button key={pkg.id}
                  onClick={() => window.location.href = `/hotspot?pkg=${pkg.id}`}
                  className={`w-full glass-card p-4 text-left transition-all hover:border-primary/50 ${pkg.id === portalUser?.package_id ? "border-primary/50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{pkg.name}</h3>
                      <p className="text-[10px] text-muted-foreground">{pkg.speed_down} · {pkg.duration_days}d · {pkg.max_devices} device{pkg.max_devices > 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold text-primary">{formatKES(pkg.price)}</p>
                      {pkg.id === portalUser?.package_id && <Badge variant="outline" className="text-[9px] bg-primary/15 text-primary border-primary/30">Current</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {/* ── Voucher Redemption ── */}
            {/* NOTE: No overflow-hidden here — that clips the button on some screen sizes */}
            <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/20 via-card to-card">
              {/* Gold stripe */}
              <div className="h-[3px] rounded-t-xl bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600" />

              {/* Header */}
              <div className="flex items-center gap-2.5 px-4 pt-4">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Ticket className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-300">Redeem Voucher Code</p>
                  <p className="text-[10px] text-muted-foreground">Enter your pre-paid WiFi code</p>
                </div>
              </div>

              {/* Thin divider */}
              <div className="mx-4 mt-3 border-t border-amber-500/10" />

              {/* Code input */}
              <div className="px-4 pt-3">
                <label className="text-[9px] font-semibold text-amber-400/55 uppercase tracking-widest block mb-1.5">Voucher Code</label>
                <input
                  value={voucherCode}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
                    const fmt = raw.match(/.{1,4}/g)?.join("-") ?? raw;
                    setVoucherCode(fmt);
                    setVoucherError("");
                    setVoucherSuccess("");
                  }}
                  placeholder="XXXX-XXXX-XXXX"
                  maxLength={14}
                  autoComplete="off"
                  className="w-full px-4 py-3 font-mono text-xl font-bold tracking-[0.28em] text-center bg-black/50 border-[1.5px] border-amber-500/35 rounded-xl text-amber-200 placeholder:text-amber-900/50 outline-none focus:border-amber-400/60 transition-all uppercase"
                />
                {/* Progress dots */}
                <div className="flex justify-center gap-[3px] mt-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className={`h-[3px] rounded-full transition-all ${
                      i === 3 || i === 7 ? "w-2 bg-amber-500/15" :
                      voucherCode.replace(/-/g, "").length > i ? "w-[5px] bg-amber-400" : "w-[5px] bg-border"
                    }`} />
                  ))}
                </div>
              </div>

              {/* Feedback */}
              {voucherError && (
                <p className="mx-4 mt-2.5 text-[11px] text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  ⚠ {voucherError}
                </p>
              )}
              {voucherSuccess && (
                <p className="mx-4 mt-2.5 text-[11px] text-success bg-success/8 border border-success/20 rounded-lg px-3 py-2">
                  {voucherSuccess}
                </p>
              )}

              {/* Button — in its own padded block so it can never be clipped */}
              <div className="px-4 pt-3 pb-4">
                <Button
                  className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-sm hover:from-amber-400 hover:to-yellow-400 border-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={redeemVoucher}
                  disabled={voucherLoading || voucherCode.length !== 14}
                >
                  {voucherLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redeeming…</>
                    : <><Ticket className="h-4 w-4 mr-2" />Redeem Voucher</>
                  }
                </Button>
              </div>
            </div>

            <h3 className="text-sm font-semibold mt-4">Payment History</h3>
            {txns.length === 0 && <p className="text-xs text-muted-foreground">No payment history yet.</p>}
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/30">
                <div>
                  <p className="text-xs font-mono text-primary">{t.mpesa_ref ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatKES(t.amount)}</p>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Usage ── */}
        {activeTab === "usage" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Usage Analytics</h2>
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold mb-3">Daily Data Usage</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} formatter={(v: number) => [`${v} GB`]} />
                  <Area type="monotone" dataKey="usage" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold text-primary">{portalUser?.data_used_gb ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">GB Used Total</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{((portalUser?.data_used_gb ?? 0) / 7).toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">GB/Day Average</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Support Tickets ── */}
        {activeTab === "tickets" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Support Tickets</h2>
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold">Create New Ticket</h3>
              <Input placeholder="Issue title..." value={ticketTitle} onChange={(e) => setTicketTitle(e.target.value)} className="bg-muted/50 border-border text-sm" />
              <textarea placeholder="Describe the issue..." value={ticketDesc} onChange={(e) => setTicketDesc(e.target.value)} className="w-full rounded-md border border-border bg-muted/50 p-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              <Button className="w-full" size="sm" onClick={submitTicket} disabled={!ticketTitle.trim() || !ticketDesc.trim()}>Submit Ticket</Button>
            </div>
            {tickets.map((t) => (
              <div key={t.id} className="glass-card p-4">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <PriorityBadge priority={t.priority} />
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">{t.description?.slice(0, 100)}</p>
                <div className="flex gap-2">
                  <StatusBadge status={t.status} />
                  <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Share ── */}
        {activeTab === "share" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Share My Package</h2>
            {!slotsInfo.allowSharing ? (
              <div className="glass-card p-5 text-center space-y-2">
                <Share2 className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Sharing not available</p>
                <p className="text-[10px] text-muted-foreground">Your current package does not support device sharing. Upgrade to a multi-device plan to share your WiFi with family or friends.</p>
                <Button size="sm" onClick={() => setActiveTab("payments")} className="mt-2">View Packages</Button>
              </div>
            ) : (
              <>
                <div className="glass-card p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">Generate a one-time link to let another device join your plan. The link expires in 24 hours. The recipient uses their own device — their MAC is registered to your package, using one of your device slots.</p>
                  <Button className="w-full gap-2" onClick={generateShareLink}>
                    <Link className="h-4 w-4" /> Generate Share Link
                  </Button>
                </div>
                {shareLinks.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground">Active Links</h3>
                    {shareLinks.map(lnk => (
                      <div key={lnk.id} className="glass-card p-3 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-mono truncate text-primary">{lnk.link}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {lnk.uses_count}/{lnk.max_uses} uses · Expires {new Date(lnk.expires_at).toLocaleDateString()}
                            {lnk.is_expired && " · EXPIRED"}{lnk.is_exhausted && " · USED"}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => navigator.clipboard.writeText(lnk.link).then(() => toast({ title: "Copied!" }))}>
                            <Link className="h-3 w-3" />
                          </Button>
                          {lnk.is_active && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                              onClick={() => revokeLink(lnk.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Settings ── */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Account Settings</h2>
            <div className="glass-card p-4 space-y-2">
              <p className="text-xs font-semibold">Account Info</p>
              {[["Username", portalUser?.username], ["Phone", portalUser?.phone], ["Status", portalUser?.status]].map(([label, val]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-border/30 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium capitalize">{val ?? "—"}</span>
                </div>
              ))}
            </div>
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold">Change Password</h3>
              <Input type="password" placeholder="Current password" className="bg-muted/50 border-border"
                value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
              <Input type="password" placeholder="New password (min 6 chars)" className="bg-muted/50 border-border"
                value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              <Input type="password" placeholder="Confirm new password" className="bg-muted/50 border-border"
                value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Password updated immediately on your account.</p>
              <Button size="sm" className="w-full" onClick={changePassword}
                disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}>
                {pwdSaving ? "Saving…" : "Update Password"}
              </Button>
            </div>
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold">KYC Compliance</h3>
              <p className="text-[10px] text-muted-foreground">Submit your ID details as required by Kenya ICT regulations.</p>
              {kycMsg && (
                <p className={`text-[11px] px-3 py-2 rounded-lg border ${kycMsg.ok ? "text-success bg-success/8 border-success/20" : "text-destructive bg-destructive/8 border-destructive/20"}`}>
                  {kycMsg.text}
                </p>
              )}
              {kycOpen ? (
                <div className="space-y-2">
                  <select
                    value={kycIdType}
                    onChange={e => setKycIdType(e.target.value)}
                    className="w-full rounded-md border border-border bg-muted/50 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="driving_license">Driving License</option>
                    <option value="alien_id">Alien ID</option>
                  </select>
                  <Input
                    placeholder="ID / Passport number"
                    value={kycIdNumber}
                    onChange={e => setKycIdNumber(e.target.value)}
                    className="bg-muted/50 border-border text-sm"
                    maxLength={30}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setKycOpen(false); setKycMsg(null); }}>Cancel</Button>
                    <Button size="sm" className="flex-1 gap-1.5" onClick={submitKyc} disabled={kycSaving || !kycIdNumber.trim()}>
                      {kycSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Submitting…</> : "Submit"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => { setKycOpen(true); setKycMsg(null); }}>
                  <FileText className="h-3.5 w-3.5" /> Submit ID Details
                </Button>
              )}
            </div>
            <Button variant="ghost" className="w-full text-destructive gap-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Log Out
            </Button>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border/50 z-50"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {isReporting && (
          <div className="max-w-lg mx-auto px-4 py-1 border-b border-border/30">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Location sharing active{lastSent && ` · Last sent ${lastSent.toLocaleTimeString()}`}
            </p>
          </div>
        )}
        {/* TOUCH-04: Each tab button gets min 44px height + touchAction:manipulation
            to eliminate the 300ms delay on Android. safe-area-inset-bottom handles
            iPhone X+ home indicator overlap. Active indicator dot gives clear
            visual feedback without relying on colour alone (accessibility). */}
        <div className="max-w-lg mx-auto flex justify-around px-1 py-1">
          {navItems.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ touchAction: "manipulation" }}
              className={`flex flex-col items-center gap-0.5 flex-1 min-h-[52px] py-2 px-1 rounded-lg transition-colors relative ${
                activeTab === tab ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={activeTab === tab ? "page" : undefined}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="text-[9px] font-medium leading-tight">{label}</span>
              {activeTab === tab && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default UserPortal;