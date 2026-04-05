/**
 * frontend/src/pages/HotspotPortal.tsx — v3.8.3-patch1
 *
 * TWO-LAYER AUTO-RECONNECT SYSTEM
 * ================================
 * On mount, extracts MikroTik URL parameters (mac, ip, link-login, link-orig)
 * and attempts automatic re-authentication BEFORE showing the portal UI.
 *
 * Layer 1 — MAC Auth:
 *   If MikroTik passed a MAC address in the redirect URL, try MAC-based auth.
 *   Fast and requires no browser storage. Best for fixed devices.
 *
 * Layer 2 — Device Token Auth:
 *   If Layer 1 fails (MAC randomization, new MAC, etc.), check localStorage
 *   and cookie for a persistent device token. Issue a one-time OTP on success.
 *
 * Internet Grant:
 *   Both layers return { username, otp }. The portal auto-submits a hidden form
 *   to MikroTik's `link-login` URL to complete the RADIUS authentication.
 *   MikroTik validates via FreeRADIUS → grants the session with correct
 *   bandwidth limits, Session-Timeout, and Idle-Timeout (ARCH-01..04).
 *
 * After Payment:
 *   1. Call /api/portal/issue-device-token to get a 64-char persistent token.
 *   2. Store token in localStorage (DEVICE_TOKEN_KEY) AND cookie (30-day fallback).
 *   3. Auto-grant internet access via MikroTik login form.
 */

import { useBranding } from "@/hooks/useBranding";
import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import {
  Wifi, Phone, CheckCircle, Loader2, Lock, LogIn, X, Download, RefreshCw,
  AlertTriangle, UserMinus, Crown, Users, ArrowLeft, KeyRound, RotateCcw, Ticket,
} from "lucide-react";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ── Storage keys ──────────────────────────────────────────────────────────────
const COOKIE_KEY          = "hs_portal_token";      // portal session token (existing)
const DEVICE_TOKEN_KEY    = "hs_device_token";      // persistent device token (Layer 2)
const LAST_LINK_LOGIN_KEY = "hs_last_link_login";   // BUG-PWA-01 FIX: persist gateway IP across standalone launches
const COOKIE_DAYS         = 30;

// ── Cookie helpers ────────────────────────────────────────────────────────────
function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Strict`;
}
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}
function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
}

// ── Service Worker token messaging (CRIT-03 FIX) ─────────────────────────────
// The SW keeps the portal token in memory to include it in the Authorization
// header of background keepalive requests. Without this, the backend's
// keepalive endpoint returns 401 because it reads req.headers.authorization
// exclusively — not cookies.
function notifySwToken(token: string | null) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  if (token) {
    navigator.serviceWorker.controller.postMessage({ type: "SET_TOKEN", token });
  } else {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_TOKEN" });
  }
}

// ── MikroTik URL param parser ─────────────────────────────────────────────────
// MikroTik hotspot redirect includes these params in the captive portal URL:
//   mac         — client device MAC address
//   ip          — client IP address
//   username    — pre-filled username (may be empty)
//   link-login  — URL to POST credentials to (grants internet on success)
//   link-orig   — original destination the user was trying to reach
//   link-logout — URL to call to disconnect
interface HotspotParams {
  mac:       string | null;
  ip:        string | null;
  username:  string | null;
  linkLogin: string | null;
  linkOrig:  string | null;
  linkLogout: string | null;
}
function parseMikrotikParams(): HotspotParams {
  const p = new URLSearchParams(window.location.search);
  return {
    mac:        p.get("mac"),
    ip:         p.get("ip"),
    username:   p.get("username"),
    linkLogin:  p.get("link-login") || p.get("link-login-only"),
    linkOrig:   p.get("link-orig")  || "http://connectivitycheck.gstatic.com/generate_204",
    linkLogout: p.get("link-logout"),
  };
}

// ── PWA install prompt ────────────────────────────────────────────────────────
let deferredPrompt: any = null;
window.addEventListener("beforeinstallprompt", (e: any) => {
  e.preventDefault();
  deferredPrompt = e;
});

// ── Types ─────────────────────────────────────────────────────────────────────
type Step =
  | "loading"          // initial auth check
  | "auto-connecting"  // Layer 1/2 auth in progress
  | "select"           // package selection
  | "phone"            // phone number entry for payment
  | "processing"       // payment in progress (waiting for M-Pesa PIN)
  | "activating"       // payment confirmed, subscription being activated
  | "success"          // payment + auth complete
  | "login"            // manual login form
  | "recover"          // M-Pesa TXN ID recovery
  | "voucher"          // voucher code redemption
  | "portal"           // account dashboard
  | "fwa_register";    // v3.17.0: Free WhatsApp phone+OTP signup

// BUG-PWA-02/03 FIX: Typed auth result so the package page can show the correct
// contextual message instead of a generic "Select a package" for all failure cases.
type AuthResult =
  | "granted"        // internet access granted — MikroTik form submitted
  | "portal"         // session valid, show dashboard (no MikroTik grant needed)
  | "new_device"     // neither layer recognised this device — new customer
  | "mac_expired"    // MAC known, subscription expired
  | "token_expired"  // device token found, subscription/token expired
  | "no_credentials" // no MAC and no stored token at all
  | "slot_overflow"  // BUG-2 FIX: MAC on owner's plan but all slots taken
  | "failed";        // unexpected network or server error

type AuthFailReason = Exclude<AuthResult, "granted" | "portal"> | null;

interface Package {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  speed_down: string;
  speed_up: string;
  max_devices: number;
  type: string;
}
interface Subscriber {
  id: string;
  full_name: string;
  username: string;
  phone: string;
  status: string;
  package_id: string | null;
  [key: string]: any;
  expires_at: string | null;
  packages?: { name: string } | null;
  package_name?: string | null;
  speed_down?: string | number | null;
  speed_up?: string | number | null;
  max_devices?: number | null;
  duration_days?: number | null;
  data_cap_gb?: number | null;
  router_id?: string | null;
}

// ── PWA-UX-01 FIX: Device type detection from User-Agent ────────────────────────
// Replaces hardcoded "phone" in issue-device-token calls so laptop/tablet users
// get correct device labels in the admin portal.
function inferDeviceTypeFromUA(): "phone" | "tablet" | "laptop" | "other" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("ipad") || (ua.includes("android") && !ua.includes("mobile"))) return "tablet";
  if (ua.includes("android") || ua.includes("iphone") || ua.includes("ipod")) return "phone";
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) return "laptop";
  return "other";
}

// BUG-6 FIX: Normalise MAC to AA:BB:CC:DD:EE:FF regardless of input format.
// Handles: AA:BB:CC:DD:EE:FF (already ok), AA-BB-CC-DD-EE-FF (dashes),
// AABBCCDDEEFF (no separators — common on Android and embedded devices).
// Without this, no-separator MACs silently fail auth.
function normalizeMac(raw: string): string {
  const clean = raw.replace(/[:\-.]/g, "").toUpperCase();
  if (/^[0-9A-F]{12}$/.test(clean)) {
    return clean.match(/.{2}/g)!.join(":");
  }
  return raw.toUpperCase().replace(/-/g, ":").trim();
}

// ── Internet grant via MikroTik hotspot login ─────────────────────────────────
// Creates a hidden form, submits it to MikroTik's login URL, then redirects.
// MikroTik validates username+OTP via FreeRADIUS → grants session.
// Uses OTP (one-time password, 60s TTL) — pppoe_password is NEVER sent to frontend.
function grantInternetAccess(linkLogin: string, username: string, otp: string, dst: string) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = linkLogin;
  form.style.display = "none";

  const fields: Record<string, string> = {
    username,
    password: otp,
    dst,
  };

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type  = "hidden";
    input.name  = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PortalDashboard — full account management panel
// Handles: own-account view, shared-plan view, reclaim, leave-shared, evict-guest
// ─────────────────────────────────────────────────────────────────────────────
interface PortalDashboardProps {
  subscriber: Subscriber;
  packages: Package[];
  hotspotParams: any;
  apiBase: string;
  onReconnect: () => void;
  onBuyPackage: (pkg: Package | null) => void;
  onLogout: () => void;
  toast: any;
}

function PortalDashboard({
  subscriber, packages, hotspotParams, apiBase, onReconnect, onBuyPackage, onLogout, toast,
}: PortalDashboardProps) {
  const [devices, setDevices]         = useState<any[]>([]);
  const [loadingDevices, setLoading]  = useState(false);
  const [busyMac, setBusyMac]         = useState<string | null>(null);
  const [sharedInfo, setSharedInfo]   = useState<{ ownerName: string; mac: string } | null>(null);
  const portalToken = getCookie(COOKIE_KEY);

  // Detect if this device is on someone else's plan
  // BUG-6 FIX: Use normalizeMac() to handle AABBCCDDEEFF no-separator format
  const currentMac = hotspotParams.mac ? normalizeMac(hotspotParams.mac) : null;

  const loadDevices = async () => {
    if (!portalToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/portal/devices`, {
        headers: { Authorization: `Bearer ${portalToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setDevices(data.devices || []);
      // Check if current device is registered under a different account
      if (currentMac) {
        const myDevice = (data.devices || []).find(
          (d: any) => d.mac_address?.toUpperCase() === currentMac.toUpperCase()
        );
        if (!myDevice) {
          // Current MAC not in this subscriber's device list — might be on someone else's plan
          // Check via a quick API call
          fetch(`${apiBase}/portal/devices/where-am-i`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${portalToken}` },
            body: JSON.stringify({ mac: currentMac }),
          }).then(r => r.json()).then(d => {
            if (d.success && d.onSharedPlan) {
              setSharedInfo({ ownerName: d.ownerName, mac: currentMac });
            }
          }).catch(() => {});
        }
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDevices(); }, []);

  const hasGuests = devices.some(d => d.onboarded_via === "invite_link");
  const ownerDevices = devices.filter(d => ["self", "portal", "transfer"].includes(d.onboarded_via));
  const maxDevices = subscriber as any;

  // ── Leave shared plan ─────────────────────────────────────────────────────
  const leaveShared = async () => {
    if (!currentMac || !portalToken) return;
    setBusyMac(currentMac);
    try {
      const res = await fetch(`${apiBase}/portal/devices/leave-shared`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${portalToken}` },
        body: JSON.stringify({ mac: currentMac }),
      });
      const data = await res.json();
      if (data.success) {
        setSharedInfo(null);
        toast({ title: "Left shared plan", description: data.message });
        loadDevices();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Failed to leave plan.", variant: "destructive" }); }
    finally { setBusyMac(null); }
  };

  // ── Reclaim package ────────────────────────────────────────────────────────
  const reclaimPackage = async () => {
    if (!portalToken) return;
    setBusyMac("reclaim");
    try {
      const ownerMacs = ownerDevices.map((d: any) => d.mac_address).filter(Boolean);
      const res = await fetch(`${apiBase}/portal/devices/reclaim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${portalToken}` },
        body: JSON.stringify({ ownerMacs }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Package reclaimed! ✓", description: data.message });
        loadDevices();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Reclaim failed.", variant: "destructive" }); }
    finally { setBusyMac(null); }
  };

  // ── Evict a guest ──────────────────────────────────────────────────────────
  const evictGuest = async (mac: string, name: string) => {
    if (!portalToken) return;
    setBusyMac(mac);
    try {
      const res = await fetch(`${apiBase}/portal/devices/evict-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${portalToken}` },
        body: JSON.stringify({ mac }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `${name} removed`, description: data.message });
        loadDevices();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Eviction failed.", variant: "destructive" }); }
    finally { setBusyMac(null); }
  };

  return (
    <div className="space-y-4">

      {/* Shared plan banner — shown when this device is on someone else's plan */}
      {sharedInfo && (
        <div className="glass-card p-4 sm:p-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">
                You're enjoying {sharedInfo.ownerName}'s WiFi 🎉
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your spot depends on their plan staying active. Get your own plan for
                guaranteed access — no sharing, no waiting, no interruptions.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5 border-amber-500/40 text-amber-300"
                  disabled={busyMac === currentMac}
                  onClick={leaveShared}
                >
                  {busyMac === currentMac
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <UserMinus className="h-3 w-3" />}
                  Leave plan
                </Button>
                {/* BUG-2 FIX: Pass null so parent navigates to package select without pre-selecting */}
                <Button
                  size="sm"
                  className="text-xs gap-1.5 bg-primary"
                  onClick={() => onBuyPackage(null as any)}
                >
                  Get my own plan →
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account info card */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold">{subscriber.full_name}</p>
            <p className="text-xs font-mono text-muted-foreground">{subscriber.username}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
            subscriber.status === "active"
              ? "bg-success/20 text-success"
              : "bg-destructive/20 text-destructive"
          }`}>
            {subscriber.status}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Package</span>
            <span className="font-semibold">{(subscriber as any).packages?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border/30">
            <span className="text-muted-foreground">Expires</span>
            <span className="font-mono text-xs">
              {subscriber.expires_at ? new Date(subscriber.expires_at).toLocaleDateString() : "—"}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-mono text-xs">{subscriber.phone}</span>
          </div>
        </div>

        {/* Reconnect button */}
        {hotspotParams.linkLogin && (
          <Button variant="outline" size="sm" className="w-full mt-4 gap-2" onClick={onReconnect}>
            <RefreshCw className="h-3.5 w-3.5" />Get Online
          </Button>
        )}
      </div>

      {/* Guest devices panel — shown to plan owners who have shared */}
      {hasGuests && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Devices on your plan</h3>
            </div>
            {ownerDevices.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5 h-7"
                disabled={busyMac === "reclaim"}
                onClick={reclaimPackage}
              >
                {busyMac === "reclaim"
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Crown className="h-3 w-3" />}
                Reclaim
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Top devices get internet when slots are limited. Drag to reorder — or tap Reclaim to put your device first.
          </p>
          <div className="space-y-2">
            {devices.filter((d: any) => d.is_active).map((d: any, i: number) => {
              const isOwner = ["self", "portal", "transfer"].includes(d.onboarded_via);
              const isGuest = !isOwner;
              return (
                <div key={d.mac_address} className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${
                  isOwner ? "border-primary/30 bg-primary/5" : "border-border/40"
                }`}>
                  <span className="text-xs text-muted-foreground w-4 text-center font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{d.device_name || d.mac_address}</p>
                    <p className="text-xs text-muted-foreground capitalize">{d.device_type}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isOwner && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                    {isGuest && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        disabled={busyMac === d.mac_address}
                        onClick={() => evictGuest(d.mac_address, d.device_name)}
                      >
                        {busyMac === d.mac_address
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <UserMinus className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Renew / Upgrade */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Renew / Upgrade Package</h3>
        <div className="space-y-2">
          {packages.slice(0, 4).map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => onBuyPackage(pkg)}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 transition-colors text-sm"
            >
              <span>{pkg.name} · {pkg.duration_days}d</span>
              <span className="font-bold text-primary">KES {Number(pkg.price).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={onLogout}>Sign Out</Button>
    </div>
  );
}

// memo: PortalDashboard only re-renders when subscriber/packages actually change,
// not on every step transition in the parent (e.g. payment modal open/close).
const MemoPortalDashboard = memo(PortalDashboard);

const HotspotPortal = () => {
  const { branding }         = useBranding();
  const [step, setStep]      = useState<Step>("loading");
  const [packages, setPackages]    = useState<Package[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [phone, setPhone]          = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [pwdVisible, setPwdVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  // MED-01 FIX: Track subscription expiry detected by background polling
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [loggingIn, setLoggingIn]  = useState(false);
  // PERF-UX: track poll iteration so processing screen shows real elapsed time
  // instead of an infinite spinner (users on slow M-Pesa wait up to 90s — they
  // need feedback that the system is still working, not frozen)
  const [pollCount, setPollCount] = useState(0);
  const [autoConnectStatus, setAutoConnectStatus] = useState("");
  // BUG-PWA-02 FIX: Track WHY auth failed so package page shows correct context
  const [authFailReason, setAuthFailReason] = useState<AuthFailReason>(null);
  // BUG-2 FIX: Owner's username for slot_overflow banner ("You're on X's plan")
  const [slotOwnerUsername, setSlotOwnerUsername] = useState<string | null>(null);
  // Recovery state
  const [recoverTxnId, setRecoverTxnId]       = useState("");
  const [recoverPhone, setRecoverPhone]        = useState("");
  const [recoverError, setRecoverError]        = useState("");
  const [recoverLoading, setRecoverLoading]    = useState(false);
  const [recoverNeedsPhone, setRecoverNeedsPhone] = useState(false);
  const [recoverInUse, setRecoverInUse]        = useState<{ msg: string; sessionId?: string } | null>(null);
  // Voucher state
  const [voucherCode, setVoucherCode]    = useState("");
  const [voucherPhone, setVoucherPhone]  = useState("");
  const [voucherName, setVoucherName]    = useState("");
  const [voucherError, setVoucherError]  = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);

  // v3.17.0: Free WhatsApp Chat state
  interface FwaStatus {
    windowEnd: string;
    daysRemaining: number;
    dataUsedMb: number;
    dailyCapMb: number;
    dataRemainingMb: number;
  }
  const [fwaPhone, setFwaPhone]       = useState("");
  const [fwaOtp, setFwaOtp]           = useState("");
  const [fwaError, setFwaError]       = useState("");
  const [fwaLoading, setFwaLoading]   = useState(false);
  const [fwaOtpSent, setFwaOtpSent]   = useState(false);
  const [fwaStatus, setFwaStatus]     = useState<FwaStatus | null>(null);
  const [fwaEnabled, setFwaEnabled]   = useState(false);
  const [fwaCap, setFwaCap]           = useState(100);
  const [fwaDays, setFwaDays]         = useState(3);
  const { toast }                  = useToast();

  const hotspotParams = useRef<HotspotParams>(parseMikrotikParams());
  const apiBase = import.meta.env.VITE_BACKEND_URL ?? "/api";

  // ── Core auto-reconnect logic ───────────────────────────────────────────────
  // BUG-PWA-02/03 FIX: Returns typed AuthResult instead of boolean so callers
  // can set authFailReason and show the correct message on the package page.
  const attemptAutoReconnect = useCallback(async (params: HotspotParams): Promise<AuthResult> => {
    const { mac, linkLogin, linkOrig } = params;

    // ── Layer 1: MAC Auth ─────────────────────────────────────────────────────
    if (mac) {
      setAutoConnectStatus("Checking your device…");
      try {
        // BUG-NEW-A07 FIX (MEDIUM): Add 90-second AbortSignal timeout to mac-auth fetch.
        //
        // Without a timeout, this fetch can hang indefinitely on congested hotspot networks
        // (2G, poor signal, overloaded AP). The OTP issued on the backend has a 120s TTL.
        // If the round-trip takes >120s (fetch hangs), the OTP expires before the portal
        // can submit it to MikroTik — the subscriber sees an infinite spinner with no error.
        //
        // 90s = OTP_TTL_SECONDS (120s) × 0.75 — gives a 30s margin for the form submission
        // to MikroTik after we receive the OTP. AbortSignal.timeout() is supported in all
        // modern browsers (Chrome 103+, Firefox 100+, Safari 16+). Older browsers fall back
        // to no timeout (the catch block handles the AbortError gracefully).

        // GAP-2 FIX: 429 thundering-herd backoff for mass-reconnect events.
        //
        // Problem: After a power outage, 200+ subscribers reconnect simultaneously.
        // All devices are behind a single NAT IP — the backend IP-rate-limiter
        // (500 req/min) throttles the burst. The old code had zero retry logic on
        // HTTP 429, leaving users with a dead spinner and no feedback.
        //
        // Fix: Wrap both mac-auth and device-token-auth with fetchWithBackoff().
        // On 429, wait 1s → 2s → 4s (3 attempts total) with ±500ms jitter to
        // de-synchronise clients that all started retrying at exactly the same time.
        // After 3 failed attempts the error propagates and the portal falls through
        // to Layer 2 / shows the UI as normal — no silent dead spinner.
        //
        // Jitter formula: delay × (0.75 + Math.random() × 0.5)
        //   → spreads retries across 75%–125% of the base delay window
        //   → for delay=1000ms: 750ms–1250ms per client, so 200 clients
        //     spread over a ~500ms window instead of hitting all at once.
        const fetchWithBackoff = async (url: string, opts: RequestInit, maxRetries = 3): Promise<Response> => {
          let delay = 1000; // 1s base
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            const res = await fetch(url, opts);
            if (res.status !== 429) return res;
            if (attempt < maxRetries - 1) {
              const jitter = delay * (0.75 + Math.random() * 0.5);
              setAutoConnectStatus(`Network busy, retrying… (${attempt + 1}/${maxRetries - 1})`);
              await new Promise(resolve => setTimeout(resolve, jitter));
              delay *= 2; // exponential: 1s → 2s → 4s
            }
          }
          // All retries exhausted — return the last 429 so callers handle it gracefully
          return fetch(url, opts);
        };

        const macAuthSignal = typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(90_000)
          : undefined;

        const macRes = await fetchWithBackoff(`${apiBase}/portal/mac-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mac }),
          signal: macAuthSignal,
        });

        if (macRes.ok) {
          const macData = await macRes.json();
          if (macData.success && macData.otp) {
            setAutoConnectStatus("Connecting…");

            // PWA-UX-02 FIX: After MAC auth success, silently issue a device token
            // so the next reconnect uses Layer 2 (survives MAC randomization on iOS/Android).
            const existingToken = localStorage.getItem(DEVICE_TOKEN_KEY) || getCookie(DEVICE_TOKEN_KEY);
            if (!existingToken) {
              const portalCookie = getCookie(COOKIE_KEY);
              if (portalCookie) {
                fetch(`${apiBase}/portal/issue-device-token`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${portalCookie}`,
                  },
                  body: JSON.stringify({ mac, deviceType: inferDeviceTypeFromUA() }),
                }).then(r => r.json()).then(d => {
                  if (d.success && d.token) {
                    localStorage.setItem(DEVICE_TOKEN_KEY, d.token);
                    setCookie(DEVICE_TOKEN_KEY, d.token, COOKIE_DAYS);
                  }
                }).catch(() => {});
              }
            }

            if (linkLogin) {
              grantInternetAccess(linkLogin, macData.username, macData.otp, linkOrig ?? "");
              return "granted";
            }
            // No MikroTik redirect context — show portal dashboard
            setSubscriber(macData.subscriber as Subscriber);
            setStep("portal");
            return "portal";
          }
        }

        // HTTP 404 = MAC not found in DB (unknown device).
        // HTTP 403 = MAC known but subscription has expired — return mac_expired
        // so the package page shows the AMBER renewal banner instead of the BLUE welcome banner.
        // In both cases fall through to Layer 2: a valid device token may still grant access
        // (e.g. MAC randomization — new MAC, but token still valid).
        if (macRes.status === 403) {
          // BUG-2 FIX: Check for slot_overflow before treating as generic mac_expired.
          // slot_overflow = MAC is on owner's plan but all slots are full.
          try {
            const macData403 = await macRes.clone().json();
            if (macData403.authFailReason === "slot_overflow") {
              setSlotOwnerUsername(macData403.ownerUsername ?? null);
              return "slot_overflow";
            }
          } catch { /* fall through */ }
          // MAC is recognised but subscription is expired — capture reason, then try Layer 2
          // If Layer 2 also fails we'll return mac_expired below
          ;(params as any)._macExpired = true;
        }
        if (macRes.status === 404 || macRes.status === 403) {
          // fall through to Layer 2
        }
      } catch {
        // Network error — fall through to Layer 2
      }
    }

    // ── Layer 2: Device Token Auth ────────────────────────────────────────────
    const storedToken = localStorage.getItem(DEVICE_TOKEN_KEY) || getCookie(DEVICE_TOKEN_KEY);
    if (storedToken) {
      setAutoConnectStatus("Checking saved session…");
      try {
        // BUG-NEW-A07 FIX (MEDIUM): Same 90-second AbortSignal timeout as mac-auth.
        // Device-token-auth also issues an OTP (120s TTL). Hanging fetch → expired OTP → infinite spinner.
        // GAP-2 FIX: fetchWithBackoff defined in Layer 1 above applies here too.
        const tokenAuthSignal = typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(90_000)
          : undefined;

        // GAP-2 FIX: Same 429 thundering-herd protection as Layer 1.
        // fetchWithBackoff is defined inside attemptAutoReconnect so it's in scope here.
        const tokenRes = await fetch(`${apiBase}/portal/device-token-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: storedToken, mac: mac || undefined }),
          signal: tokenAuthSignal,
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();

          if (tokenData.success && tokenData.otp) {
            setAutoConnectStatus("Connecting…");
            if (tokenData.newPortalToken) {
              setCookie(COOKIE_KEY, tokenData.newPortalToken, COOKIE_DAYS);
            }
            if (linkLogin) {
              grantInternetAccess(linkLogin, tokenData.username, tokenData.otp, linkOrig ?? "");
              return "granted";
            }
            setSubscriber(tokenData.subscriber as Subscriber);
            setStep("portal");
            return "portal";
          }

          // BUG-PWA-03 FIX: Distinguish token-expired from revoked/invalid.
          // Both return reauth:true but the error message differs. Read it to
          // set the correct authFailReason for the package page context banner.
          if (tokenData.reauth) {
            localStorage.removeItem(DEVICE_TOKEN_KEY);
            deleteCookie(DEVICE_TOKEN_KEY);
            const isExpired = tokenData.error?.toLowerCase().includes("expired") ?? false;
            return isExpired ? "token_expired" : "new_device";
          }
        }

        // HTTP 401 = token expired or subscription ended
        if (tokenRes.status === 401) {
          localStorage.removeItem(DEVICE_TOKEN_KEY);
          deleteCookie(DEVICE_TOKEN_KEY);
          // BUG-9 FIX: Also clear the portal cookie — after 30+ days offline the
          // local cookie is gone but backend may say "keep". Clearing ensures the
          // next auth cycle issues a fresh token instead of leaving the subscriber
          // stuck with no session and no explanation.
          setCookie(COOKIE_KEY, "", -1);
          return "token_expired";
        }
      } catch {
        // Network error — fall through
      }

      // ── Layer 3: Free WhatsApp status check ───────────────────────────────
      // Token auth failed (no paid package) but token exists — check if this
      // device has an active Free WhatsApp session and reconnect automatically.
      if (storedToken) {
        try {
          const fwaRes = await fetch(`${apiBase}/portal/fwa/status`, {
            // FWA-01 FIX: was { "Authorization": storedToken } — missing "Bearer " prefix
            // caused resolveToken() to hash the raw token correctly but backend
            // strip logic always expects the standard scheme for consistency.
            headers: { "Authorization": `Bearer ${storedToken}` },
          });
          if (fwaRes.ok) {
            const fwaData = await fwaRes.json();
            if (fwaData.valid) {
              setFwaStatus(fwaData as FwaStatus);
              // Attempt seamless rejoin (re-issue MikroTik OTP)
              try {
                const rejoinRes = await fetch(`${apiBase}/portal/fwa/rejoin`, {
                  method: "POST",
                  // FWA-01 FIX: was { "Authorization": storedToken } — missing "Bearer " prefix
                  headers: { "Authorization": `Bearer ${storedToken}` },
                });
                if (rejoinRes.ok) {
                  const rejoinData = await rejoinRes.json();
                  if (rejoinData.success && rejoinData.otp && mac) {
                    grantInternetAccess(
                      (params as any).linkLogin || "",
                      rejoinData.username,
                      rejoinData.otp,
                      (params as any).linkOrig || ""
                    );
                    // FWA-02 FIX: was "new_device" — internet access was granted above,
                    // returning "new_device" incorrectly showed the "new customer" banner
                    // and set authFailReason. Correct result is "granted".
                    return "granted";
                  }
                }
              } catch { /* non-fatal */ }
              // FWA-02 FIX: Only reach here if rejoin succeeded but linkLogin was absent
              // (e.g. direct portal visit without MikroTik redirect). Show packages.
              return "new_device";
            }
          }
        } catch { /* non-fatal */ }
      }
    }

    // ── Neither layer worked ──────────────────────────────────────────────────
    if (!mac && !storedToken) return "no_credentials";
    // If MAC auth got a 403 (known-but-expired) and Layer 2 also failed,
    // tell the caller the subscription is expired — amber RENEW banner.
    if ((params as any)._macExpired) return "mac_expired";
    return "new_device"; // MAC present but unrecognised; token absent or invalid
  }, [apiBase]);

  // ── MED-01 FIX: Foreground subscription status polling ───────────────────
  // The PWA previously showed "Active" indefinitely after a subscription
  // expired because there was no mechanism to detect mid-session expiry.
  // RADIUS Session-Timeout disconnects MikroTik, but the PWA UI never
  // knew — users saw stale "Active" status with no renewal prompt.
  //
  // This effect polls /api/portal/status every 2 minutes while the portal
  // dashboard is visible. On expiry or 401, it shows a renewal banner.
  // The SW also sends SESSION_EXPIRED messages from keepalive 401 responses.
  useEffect(() => {
    const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

    // Listen for SW-sent session expiry notifications (CRIT-03 fix integration)
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "SESSION_EXPIRED") {
        setSubscriptionExpired(true);
        setStep("select");
        toast({
          title: "⏰ Your session has expired",
          description: "Please renew your package to continue using the internet.",
          variant: "destructive",
        });
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleSwMessage);

    // Polling: only run when dashboard is visible and we have a valid session
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    if (step === "portal" && subscriber) {
      pollTimer = setInterval(async () => {
        const portalToken = getCookie(COOKIE_KEY);
        if (!portalToken) return;
        try {
          const res = await fetch(`${apiBase}/portal/status`, {
            headers: { Authorization: `Bearer ${portalToken}` },
          });
          if (res.status === 401) {
            // Session expired or invalidated
            setSubscriptionExpired(true);
            deleteCookie(COOKIE_KEY);
            notifySwToken(null);
            setStep("select");
            toast({
              title: "⏰ Your session has expired",
              description: "Please renew your package to continue.",
              variant: "destructive",
            });
            return;
          }
          if (!res.ok) return;
          const data = await res.json();
          if (data?.subscriber) {
            // Update subscriber data to reflect latest status
            setSubscriber(data.subscriber as Subscriber);
            if (data.portalOnly || data.subscriber?.status === "expired") {
              setSubscriptionExpired(true);
              setStep("select");
              toast({
                title: "⏰ Your package has expired",
                description: "Please purchase a new package to restore access.",
                variant: "destructive",
              });
            } else {
              setSubscriptionExpired(false);
            }
          }
        } catch { /* network error — will retry next poll */ }
      }, POLL_INTERVAL_MS);
    }

    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleSwMessage);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [step, subscriber, apiBase, toast]);

  // ── Initialisation ──────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Load packages + FWA settings in parallel (both are public, no auth needed)
      const [pkgRes, fwaRes] = await Promise.allSettled([
        fetch(`${apiBase}/portal/packages`).then(r => r.json()),
        fetch(`${apiBase}/portal/fwa-settings`).then(r => r.json()),
      ]);

      let loadedPackages: Package[] = [];
      if (pkgRes.status === "fulfilled" && pkgRes.value?.success) {
        const all: Package[] = pkgRes.value.packages ?? [];
        loadedPackages = all.filter(p => p.type === "hotspot" || p.type === "both");
        setPackages(loadedPackages);
      }

      // Pre-select package when UserPortal redirects with ?pkg=<id>
      const preselect = new URLSearchParams(window.location.search).get("pkg");
      if (preselect && loadedPackages.length) {
        const match = loadedPackages.find(p => String(p.id) === preselect);
        if (match) { setSelectedPkg(match); setStep("phone"); return; }
      }

      // v3.17.0: Apply Free WhatsApp settings from backend
      if (fwaRes.status === "fulfilled" && fwaRes.value?.success) {
        setFwaEnabled(fwaRes.value.enabled !== false);
        setFwaCap(fwaRes.value.dailyCapMb ?? 100);
        setFwaDays(fwaRes.value.windowDays ?? 3);
      }

      const params = hotspotParams.current;

      // ── Existing portal session check (fast path for returning users) ─────
      const portalToken = getCookie(COOKIE_KEY);
      if (portalToken) {
        try {
          const statusRes = await fetch(`${apiBase}/portal/status`, {
            headers: { Authorization: `Bearer ${portalToken}` },
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData?.subscriber) {
              setSubscriber(statusData.subscriber as Subscriber);
              // If in MikroTik redirect context, attempt auto-grant
              if (params.linkLogin) {
                setStep("auto-connecting");
                const reconnectResult = await attemptAutoReconnect(params);
                if (reconnectResult !== "granted" && reconnectResult !== "portal") {
                  // Portal session valid but couldn't auto-grant (e.g. first visit on this MAC)
                  // Show portal dashboard — user can see their account
                  setStep("portal");
                }
              } else {
                setStep("portal");
              }
              // Auto-claim deferred sharing invite if present
              const joinCookieId = getCookie("mikrobill_join_cookie");
              if (joinCookieId && params.mac) {
                fetch(`${apiBase}/portal/sharing/claim-deferred`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ cookieId: joinCookieId, mac: params.mac }),
                }).then(r => r.json()).then(d => {
                  if (d.success && d.joined) {
                    document.cookie = "mikrobill_join_cookie=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/";
                    localStorage.removeItem("mikrobill_join_cookie");
                    toast({ title: "✅ Device added!", description: d.message });
                  }
                }).catch(() => {});
              }
              return;
            }
          }
        } catch { /* portal status check failed — fall through */ }
        deleteCookie(COOKIE_KEY);
    notifySwToken(null); // CRIT-03 FIX: clear SW token on logout
      }

      // ── PWA STANDALONE: no MikroTik redirect params ──────────────────────
      // Installed PWA opens at /hotspot without ?mac= or ?link-login= from MikroTik.
      // Ask the backend to identify the device by IP → DHCP lease lookup, and
      // reconstruct the link-login URL from the known/stored gateway IP.
      const runningStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as any).standalone === true;
      const hasMikrotikRedirect = !!(params.mac || params.linkLogin);

      if (runningStandalone && !hasMikrotikRedirect) {
        try {
          setStep("auto-connecting");
          setAutoConnectStatus("Identifying your device…");

          const detectRes = await fetch(`${apiBase}/portal/detect-client`, { cache: "no-store" });
          if (detectRes.ok) {
            const detectData = await detectRes.json();
            if (detectData.success && detectData.mac) {
              // Patch hotspotParams with server-detected values
              params.mac = detectData.mac;

              // Reconstruct link-login URL: prefer server-returned, then stored
              const serverLinkLogin = detectData.linkLoginUrl;
              const storedLinkLogin = localStorage.getItem(LAST_LINK_LOGIN_KEY);
              const resolvedLinkLogin = serverLinkLogin || storedLinkLogin || null;

              if (resolvedLinkLogin) {
                params.linkLogin = resolvedLinkLogin;
                localStorage.setItem(LAST_LINK_LOGIN_KEY, resolvedLinkLogin);
              }

              if (detectData.alreadyAuthenticated) {
                // Device is already in MikroTik's active-users — just show portal
                setStep("portal");
                return;
              }
            }
          }
          // Detection done (success or fail) — fall through to normal auth flow below
          setStep("loading");
        } catch { /* detection failed — continue to normal flow */ setStep("loading"); }
      }

      // ── No portal session — try two-layer auto-reconnect ─────────────────
      if (params.mac || localStorage.getItem(DEVICE_TOKEN_KEY) || getCookie(DEVICE_TOKEN_KEY)) {
        setStep("auto-connecting");
        const result = await attemptAutoReconnect(params);

        // BUG-PWA-02 FIX: Use AuthResult to set context for package page banner.
        if (result === "granted" || result === "portal") return;

        // Auth failed — record WHY so package page shows the right message
        setAuthFailReason(result as AuthFailReason);
        setStep("select");
        return;
      }

      // ── Completely fresh device (no MAC, no token) ────────────────────────
      setAuthFailReason("no_credentials");
      setStep("select");
    };

    init().catch(() => setStep("select"));

    const timer = setTimeout(() => { if (deferredPrompt) setShowInstallBanner(true); }, 5000);
    return () => clearTimeout(timer);
  }, [apiBase, attemptAutoReconnect, toast]);

  // ── After purchase: issue device token + grant internet ───────────────────
  const grantInternetAfterPurchase = useCallback(async (portalToken: string, sub: Subscriber) => {
    const params = hotspotParams.current;

    // Issue a persistent device token for future reconnects
    try {
      const tokenRes = await fetch(`${apiBase}/portal/issue-device-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${portalToken}`,
        },
        body: JSON.stringify({ mac: params.mac, deviceType: inferDeviceTypeFromUA() }), // PWA-UX-01 FIX
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.success && tokenData.token) {
          // Store in BOTH localStorage and cookie (belt-and-suspenders)
          localStorage.setItem(DEVICE_TOKEN_KEY, tokenData.token);
          setCookie(DEVICE_TOKEN_KEY, tokenData.token, COOKIE_DAYS);
        }
      }
    } catch { /* non-fatal — payment succeeded; device token is a convenience */ }

    // Grant internet access via MikroTik if we have the login URL
    if (params.linkLogin) {
      // Re-auth via device token to get a fresh OTP
      const storedToken = localStorage.getItem(DEVICE_TOKEN_KEY) || getCookie(DEVICE_TOKEN_KEY);
      if (storedToken) {
        try {
          const authRes = await fetch(`${apiBase}/portal/device-token-auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: storedToken, mac: params.mac }),
          });
          if (authRes.ok) {
            const authData = await authRes.json();
            if (authData.success && authData.otp) {
              // Small delay to let the user see the success screen
              setTimeout(() => {
                grantInternetAccess(
                  params.linkLogin!,
                  authData.username,
                  authData.otp,
                  params.linkOrig ?? ""
                );
              }, 2000);
              return;
            }
          }
        } catch { /* non-fatal */ }
      }
    }
  }, [apiBase]);

  // ── Payment / purchase handler ─────────────────────────────────────────────
  const handlePurchase = async () => {
    if (!selectedPkg || !phone || phone.length < 9) return;
    setStep("processing");
    setPollCount(0);

    const portalToken = getCookie(COOKIE_KEY);

    try {
      // Normalise phone
      let formattedPhone = phone.trim();
      if (formattedPhone.startsWith("0")) formattedPhone = "254" + formattedPhone.slice(1);
      else if (!formattedPhone.startsWith("254")) formattedPhone = "254" + formattedPhone;
      if (!/^254\d{9}$/.test(formattedPhone)) {
        toast({ title: "Invalid phone", description: "Enter a valid Kenyan phone number, e.g. 0712 345 678", variant: "destructive" });
        setStep("phone");
        return;
      }

      // Fetch subscriber ID from portal session
      let subscriberId: string | null = null;
      if (portalToken) {
        const statusRes = await fetch(`${apiBase}/portal/status`, {
          headers: { Authorization: `Bearer ${portalToken}` },
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          subscriberId = statusData.subscriber?.id ?? null;
        }
      }

      // FWA-08 FIX: When no portal session exists (new visitor), use the anonymous
      // STK push endpoint instead of bouncing to login. Pre-generate a device token
      // hash so the callback can bind it to the auto-created subscriber.
      if (!subscriberId) {
        const anonRawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, "0")).join("");
        // SHA-256 in browser
        const tokenHashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(anonRawToken));
        const anonTokenHash = Array.from(new Uint8Array(tokenHashBuf))
          .map(b => b.toString(16).padStart(2, "0")).join("");
        // Store raw token now so callback result can auto-reconnect this device
        localStorage.setItem(DEVICE_TOKEN_KEY, anonRawToken);
        setCookie(DEVICE_TOKEN_KEY, anonRawToken, COOKIE_DAYS);
        const anonRes = await fetch(`${apiBase}/mpesa/stk-push-anonymous`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: formattedPhone, packageId: selectedPkg.id, deviceTokenHash: anonTokenHash }),
        });
        const anonData = await anonRes.json();
        if (!anonRes.ok || !anonData.success) {
          toast({ title: "Payment Error", description: anonData.error ?? "STK push failed", variant: "destructive" });
          setStep("phone");
          return;
        }
        // Poll for anonymous payment — checkoutRequestId known, token will be in localStorage when done
        const anonCheckoutId = anonData.checkoutRequestId;
        let anonConfirmed = false;
        let anonActivated = false;
        for (let i = 0; i < 24; i++) {
          await new Promise(r => setTimeout(r, 5000));
          setPollCount(i + 1);
          try {
            // GAP-02 FIX: status-anonymous route now exists and runs inline activation
            // when Daraja confirms payment but callback never arrived.
            const aPollRes  = await fetch(`${apiBase}/mpesa/status-anonymous/${anonCheckoutId}?dth=${anonTokenHash}`);
            const aPollData = await aPollRes.json();
            if (aPollData.status === "success") {
              anonConfirmed = true;
              anonActivated = aPollData.activated === true;
              if (anonActivated) break;
              // GAP-02 FIX: show activating screen so user has accurate feedback
              setStep("activating");
              if (i >= 22) break;
            }
            if (aPollData.status === "failed") break;
          } catch { /* continue polling */ }
        }
        if (!anonConfirmed) {
          toast({ title: "Payment Cancelled", description: "Payment was not completed. Please try again.", variant: "destructive" });
          setStep("phone");
          return;
        }
        setStep("success");
        toast({ title: "Payment Successful!", description: `${selectedPkg.name} activated. Getting you online…` });
        // Auto-reconnect via device token (callback or inline activation bound it to new subscriber)
        const { linkLogin, linkOrig, mac } = hotspotParams.current;
        if (linkLogin) {
          const reconnectRes = await fetch(`${apiBase}/portal/device-token-auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: anonRawToken, mac }),
          }).catch(() => null);
          if (reconnectRes?.ok) {
            const reconnectData = await reconnectRes.json();
            if (reconnectData.success && reconnectData.otp) {
              if (reconnectData.newPortalToken) setCookie(COOKIE_KEY, reconnectData.newPortalToken, COOKIE_DAYS);
              grantInternetAccess(linkLogin, reconnectData.username, reconnectData.otp, linkOrig ?? "");
            }
          }
        }
        return;
      }

      // Initiate M-Pesa STK Push
      const pushRes = await fetch(`${apiBase}/mpesa/stk-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${portalToken}`,
        },
        body: JSON.stringify({ phone: formattedPhone, amount: selectedPkg.price, packageId: selectedPkg.id, subscriberId }),
      });
      const pushData = await pushRes.json();

      if (!pushRes.ok || !pushData.success) {
        toast({ title: "Payment Error", description: pushData.error ?? "STK push failed", variant: "destructive" });
        setStep("phone");
        return;
      }

      // Poll for payment confirmation
      const checkoutId = pushData.checkoutRequestId;
      let confirmed  = false;
      let activated  = false;
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 5000));
        setPollCount(i + 1);
        try {
          const statusRes  = await fetch(`${apiBase}/mpesa/status/${checkoutId}`, {
            headers: { Authorization: `Bearer ${portalToken}` },
          });
          const statusData = await statusRes.json();
          if (statusData.status === "success") {
            confirmed = true;
            activated = statusData.activated === true;
            if (activated) break;
            // GAP-01 FIX: Payment confirmed but subscription activating.
            // Show "activating" step so user sees accurate feedback instead of
            // a false "connected" success screen or a still-spinning progress bar.
            setStep("activating");
            if (i >= 22) break; // don't overshoot the 120s window
          }
          if (statusData.status === "failed") break;
        } catch { /* continue polling */ }
      }

      if (!confirmed) {
        toast({ title: "Payment Cancelled", description: "Payment was not completed. Please try again.", variant: "destructive" });
        setStep("phone");
        return;
      }

      // Refresh subscriber data — activated inline means this shows the live subscription
      const refreshRes = await fetch(`${apiBase}/portal/status`, {
        headers: { Authorization: `Bearer ${portalToken}` },
      });
      let refreshedSub = subscriber;
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        refreshedSub = refreshData.subscriber as Subscriber;
        setSubscriber(refreshedSub);
      }

      setStep("success");
      toast({ title: "Payment Successful!", description: `${selectedPkg.name} activated. Getting you online…` });

      // Issue device token + auto-grant internet
      if (portalToken && refreshedSub) {
        await grantInternetAfterPurchase(portalToken, refreshedSub);
      }

    } catch (err: any) {
      toast({ title: "Payment Error", description: err.message, variant: "destructive" });
      setStep("phone");
    }
  };

  // ── Voucher redemption handler ────────────────────────────────────────────
  // ── v3.17.0: Free WhatsApp handlers ─────────────────────────────────────────
  const handleFwaRequestOtp = async () => {
    setFwaLoading(true);
    setFwaError("");
    try {
      const res = await fetch(`${apiBase}/portal/fwa/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fwaPhone }),
      });
      const data = await res.json();
      if (data.alreadyActive) {
        setFwaError("You already have an active session. Just connect to WiFi.");
      } else if (data.success) {
        setFwaOtpSent(true);
      } else {
        setFwaError(data.error || "Could not send code. Try again.");
      }
    } catch {
      setFwaError("Network error. Please try again.");
    }
    setFwaLoading(false);
  };

  const handleFwaVerifyOtp = async () => {
    setFwaLoading(true);
    setFwaError("");
    try {
      const params = hotspotParams.current;
      const res = await fetch(`${apiBase}/portal/fwa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fwaPhone, otp: fwaOtp, mac: params.mac }),
      });
      const data = await res.json();
      if (data.success) {
        // Store device token (same as paying user flow)
        localStorage.setItem(DEVICE_TOKEN_KEY, data.token);
        setCookie(DEVICE_TOKEN_KEY, data.token, 30);
        setFwaStatus({
          windowEnd: data.windowEnd,
          // FWA-03 FIX: was `fwaDays` (loaded from system_settings at portal load time).
          // If admin changed window_days between load and verify, displayed value was wrong.
          // Derive daysRemaining from the authoritative server-returned windowEnd.
          daysRemaining: Math.max(1, Math.ceil((new Date(data.windowEnd).getTime() - Date.now()) / 86400000)),
          dataUsedMb: 0,
          dailyCapMb: data.dailyCapMb,
          dataRemainingMb: data.dailyCapMb,
        });
        // Grant internet access via MikroTik OTP
        if (params.linkLogin) {
          grantInternetAccess(params.linkLogin, data.username, data.otp, params.linkOrig ?? "");
        }
        // Return to select — packages always visible
        setFwaOtpSent(false);
        setFwaPhone("");
        setFwaOtp("");
        setStep("select");
      } else {
        setFwaError(data.error || "Incorrect code.");
      }
    } catch {
      setFwaError("Network error. Please try again.");
    }
    setFwaLoading(false);
  };

  const handleVoucherRedeem = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (code.length !== 14) { setVoucherError("Enter a valid voucher code (XXXX-XXXX-XXXX)"); return; }
    // Use logged-in subscriber data if available, otherwise use form fields
    const resolvedPhone    = subscriber?.phone    || voucherPhone.trim();
    const resolvedFullName = subscriber?.full_name || voucherName.trim() || null;
    if (!resolvedPhone || resolvedPhone.length < 9) { setVoucherError("Enter your phone number"); return; }
    setVoucherLoading(true);
    setVoucherError("");
    try {
      const params = hotspotParams.current;
      // If logged in, include the portal session token so backend can skip subscriber lookup
      const portalCookie = getCookie(COOKIE_KEY);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (portalCookie) headers["Authorization"] = `Bearer ${portalCookie}`;
      const res = await fetch(`${apiBase}/portal/redeem-voucher`, {
        method: "POST",
        headers,
        body: JSON.stringify({ code, phone: resolvedPhone, fullName: resolvedFullName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setVoucherError(data.error ?? "Redemption failed. Please try again.");
        setVoucherLoading(false);
        return;
      }
      // Store portal session
      setCookie(COOKIE_KEY, data.portalToken, COOKIE_DAYS);
      notifySwToken(data.portalToken);
      // Build subscriber object
      const sub: Subscriber = {
        id: data.subscriber.id, username: data.subscriber.username,
        full_name: data.subscriber.full_name, phone: data.subscriber.phone,
        status: "active", expires_at: data.expiresAt,
        package_id: null,
        package_name: data.package.name, speed_down: data.package.speed_down,
        speed_up: data.package.speed_up, max_devices: 5, duration_days: data.package.duration_days,
        data_cap_gb: null, router_id: null,
      };
      setSubscriber(sub);
      // Issue device token then grant internet
      await grantInternetAfterPurchase(data.portalToken, sub);
    } catch {
      setVoucherError("Network error. Please try again.");
    }
    setVoucherLoading(false);
  };

  // ── Login handler ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginPhone.trim() || !loginPassword.trim()) {
      setLoginError("Please enter your phone number and password.");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch(`${apiBase}/portal/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: loginPhone.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.error ?? "Account not found or password incorrect.");
        return;
      }
      // LOGIN-01 FIX: Guard against null token (returned when session is reused by concurrent
      // login — backend returns { token: null, reused: true }). Previously setCookie(COOKIE_KEY,
      // null, ...) wrote the literal string "null" to the cookie, causing every subsequent
      // API call to send "Authorization: Bearer null" → 401 session-not-found.
      if (data.token) {
        setCookie(COOKIE_KEY, data.token, COOKIE_DAYS);
        notifySwToken(data.token); // CRIT-03 FIX: pass token to SW for keepalive Auth header
      }
      setSubscriber(data.subscriber as Subscriber);

      // Issue device token on successful login too
      if (hotspotParams.current.mac) {
        const tokRes = await fetch(`${apiBase}/portal/issue-device-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.token}`,
          },
          body: JSON.stringify({ mac: hotspotParams.current.mac, deviceType: inferDeviceTypeFromUA() }),
        }).catch(() => null);
        if (tokRes?.ok) {
          const tokData = await tokRes.json();
          if (tokData.token) {
            localStorage.setItem(DEVICE_TOKEN_KEY, tokData.token);
            setCookie(DEVICE_TOKEN_KEY, tokData.token, COOKIE_DAYS);
          }
        }
      }

      // Auto-grant internet if in MikroTik redirect context
      const { linkLogin, linkOrig, mac } = hotspotParams.current;
      if (linkLogin) {
        const storedToken = localStorage.getItem(DEVICE_TOKEN_KEY) || getCookie(DEVICE_TOKEN_KEY);
        if (storedToken) {
          try {
            const authRes = await fetch(`${apiBase}/portal/device-token-auth`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: storedToken, mac }),
            });
            const authData = await authRes.json();
            if (authData.success && authData.otp) {
              grantInternetAccess(linkLogin, authData.username, authData.otp, linkOrig ?? "");
              return;
            }
          } catch { /* fall through */ }
        }
      }

      setStep("portal");
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  // ── TXN-ID recovery ───────────────────────────────────────────────────────
  const handleRecover = async (forceLogout = false) => {
    const txnId = recoverTxnId.trim().toUpperCase();
    if (!txnId || txnId.length < 6) {
      setRecoverError("Please enter your M-Pesa transaction code (e.g. RGX3YZ1ABC).");
      return;
    }
    if (recoverNeedsPhone && !recoverPhone.trim()) {
      setRecoverError("Please also enter the phone number used for this M-Pesa payment.");
      return;
    }
    setRecoverLoading(true);
    setRecoverError("");
    setRecoverInUse(null);

    try {
      // Step 1 (only if forcing): kick the other device off first
      if (forceLogout) {
        if (!recoverPhone.trim()) {
          setRecoverNeedsPhone(true);
          setRecoverLoading(false);
          setRecoverError("Enter your phone number to confirm ownership before forcing sign-out of the other device.");
          return;
        }
        const forceRes = await fetch(`${apiBase}/portal/txn-force-logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txnId, phone: recoverPhone.trim() }),
        });
        const forceData = await forceRes.json();
        if (!forceData.success) {
          setRecoverError(forceData.error ?? "Could not sign out the other device. Make sure the phone number matches your account.");
          setRecoverLoading(false);
          return;
        }
        // Force-logout succeeded — the other session is gone, now login normally below
      }

      // Step 2: Login with txnId
      const body: Record<string, string> = { txnId };
      if (recoverPhone.trim()) body.phone = recoverPhone.trim();

      const res = await fetch(`${apiBase}/portal/login-with-txn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      // Server needs phone number
      if (data.requiresPhone) {
        setRecoverNeedsPhone(true);
        setRecoverError("Please also enter the phone number used for this M-Pesa payment.");
        return;
      }

      // TXN already in use on another device
      if (data.inUse) {
        setRecoverInUse({ msg: data.error });
        return;
      }

      if (!data.success) {
        setRecoverError(data.error ?? "Recovery failed. Check your transaction code and try again.");
        return;
      }

      // Success — set session
      setCookie(COOKIE_KEY, data.token, COOKIE_DAYS);
      notifySwToken(data.token); // CRIT-03 FIX
      setSubscriber(data.subscriber as Subscriber);

      // Register current MAC to this account + issue a new device token
      // This is the key step: after recovery, the new/changed MAC is tied to account
      const mac = hotspotParams.current.mac;
      if (mac && data.token) {
        // Register device (MAC may be new/changed)
        await fetch(`${apiBase}/portal/devices/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ mac, deviceName: "My Device", deviceType: inferDeviceTypeFromUA() }),
        }).catch(() => {});

        // Issue fresh device token for auto-reconnect going forward
        const tokRes = await fetch(`${apiBase}/portal/issue-device-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ mac, deviceType: inferDeviceTypeFromUA() }),
        }).catch(() => null);

        if (tokRes?.ok) {
          const tokData = await tokRes.json();
          if (tokData.token) {
            localStorage.setItem(DEVICE_TOKEN_KEY, tokData.token);
            setCookie(DEVICE_TOKEN_KEY, tokData.token, COOKIE_DAYS);
          }
        }

        // Try to grant internet access immediately
        const { linkLogin, linkOrig } = hotspotParams.current;
        if (linkLogin) {
          const storedToken = localStorage.getItem(DEVICE_TOKEN_KEY) || getCookie(DEVICE_TOKEN_KEY);
          if (storedToken) {
            try {
              const authRes = await fetch(`${apiBase}/portal/device-token-auth`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: storedToken, mac }),
              });
              const authData = await authRes.json();
              if (authData.success && authData.otp) {
                grantInternetAccess(linkLogin, authData.username, authData.otp, linkOrig ?? "");
                return;
              }
            } catch { /* fall through to portal */ }
          }
        }
      }

      // Reset recovery state and go to portal (or package select if expired)
      setRecoverTxnId(""); setRecoverPhone(""); setRecoverError(""); setRecoverNeedsPhone(false);
      if (data.expired) {
        setStep("select");
      } else {
        setStep("portal");
      }
    } catch (err: any) {
      setRecoverError("Connection error. Please try again.");
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleLogout = () => {
    deleteCookie(COOKIE_KEY);
    notifySwToken(null); // CRIT-03 FIX: clear SW token on logout
    // Device token is kept — enables fast reconnect on next visit
    setSubscriber(null);
    setAuthFailReason(null); // clear context banner on manual logout
    setStep("select");
  };

  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    setShowInstallBanner(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // PERF-UX: Replace blank spinner with a content skeleton so users see the
  // brand and page structure immediately (perceived performance improvement).
  // On slow hotspot connections (2G, congested AP) auth can take 3–8 seconds —
  // an empty spinner with no context makes users think the page is broken.
  if (step === "loading" || step === "auto-connecting") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6 animate-pulse">
          {/* Brand header skeleton */}
          <div className="text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/20 mx-auto flex items-center justify-center">
              <Wifi className="h-7 w-7 text-primary opacity-60" />
            </div>
            <div className="h-7 w-40 bg-muted rounded-lg mx-auto" />
            <div className="h-4 w-56 bg-muted/60 rounded mx-auto" />
          </div>
          {/* Status message — shown during active reconnect */}
          {step === "auto-connecting" && (
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                {autoConnectStatus || "Connecting…"}
              </p>
              <p className="text-xs text-muted-foreground">Please wait</p>
            </div>
          )}
          {/* Package card skeletons */}
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-card p-4 sm:p-6 space-y-2">
                <div className="flex justify-between">
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 bg-muted rounded" />
                    <div className="h-3 w-40 bg-muted/60 rounded" />
                  </div>
                  <div className="h-6 w-16 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6">
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div className="fixed top-4 left-4 right-4 max-w-sm mx-auto z-50 glass-card p-4 sm:p-6 flex items-center gap-3 border-primary/50">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold">Install WiFi Portal App</p>
            <p className="text-[10px] text-muted-foreground">Access your account offline &amp; get notifications</p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={installPWA}>Install</Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowInstallBanner(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="w-full max-w-lg space-y-6">
        {/* Header — uses branding loaded from /api/portal/branding */}
        <div className="text-center space-y-2">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.company_name}
              className="h-14 w-auto object-contain mx-auto mb-4 rounded-xl"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <Wifi className="h-7 w-7 text-primary" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gradient">
            {branding.company_name !== "WiFi Billing System" ? branding.company_name : branding.portal_welcome}
          </h1>
          {step === "select" && (
            <p className="text-sm text-muted-foreground">
              {authFailReason === "mac_expired" || authFailReason === "token_expired"
                ? "Ready to get back online? Pick a package below 👇"
                : authFailReason === "new_device"
                ? "Choose a package and you'll be online in under a minute."
                : authFailReason === "slot_overflow"
                ? "Get your own plan and stay online anytime"
                : authFailReason === "failed"
                ? "Something went wrong — please try again or select a package."
                : branding.portal_subtext || "Pick a package & pay via M-Pesa. You're online in seconds."}
            </p>
          )}
          {step === "login"   && <p className="text-sm text-muted-foreground">Sign in with your phone &amp; password</p>}
          {step === "portal"  && <p className="text-sm text-muted-foreground">Your account dashboard</p>}
          {step === "recover" && <p className="text-sm text-muted-foreground">Recover access using your M-Pesa transaction code</p>}
          {step === "voucher" && <p className="text-sm text-muted-foreground">Redeem your pre-paid WiFi voucher code</p>}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
             PACKAGE SELECTION — The face of your ISP.
             
             LOGIC (v3.20.10):
               • Layer 1 (MAC auth) fires transparently on mount — user never sees
                 this screen if their package is active.  Only reaches here when:
                   a) new device (no MAC record)
                   b) subscription expired
                   c) token invalid / first visit
               • Three bold CTAs below the packages: Login · Voucher · Recover
                 Each is a full-width button — not a tiny link — so users find them
                 immediately on a small screen without reading fine print.
             ═══════════════════════════════════════════════════════════════════ */}
        {step === "select" && (
          <div className="space-y-4">

            {/* ── Context banner ─────────────────────────────────────────── */}
            {(authFailReason === "mac_expired" || authFailReason === "token_expired") && (
              <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-amber-400" style={{width:"1.125rem",height:"1.125rem"}} />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-300">Your package has expired</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Pick a package below — you'll be back online in under a minute.
                  </p>
                </div>
              </div>
            )}

            {authFailReason === "slot_overflow" && (
              <div className="flex items-start gap-3 p-4 rounded-2xl border border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-indigo-500/5">
                <div className="h-9 w-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Wifi className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-bold">You're on {slotOwnerUsername ?? "someone"}'s WiFi plan</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    All device slots are taken. Get your own plan for guaranteed, uninterrupted access.
                  </p>
                </div>
              </div>
            )}

            {(authFailReason === "new_device" || authFailReason === "no_credentials") && (
              <div className="flex items-start gap-3 p-4 rounded-2xl border border-primary/30 bg-primary/5">
                <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Wifi className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">Welcome! Pick a plan to get online</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Already subscribed?{" "}
                    <button className="text-primary underline font-semibold" onClick={() => setStep("login")}>Sign in</button>
                    {" "}or{" "}
                    <button className="text-primary underline font-semibold" onClick={() => { setStep("recover"); setRecoverError(""); setRecoverNeedsPhone(false); }}>
                      recover with M-Pesa code
                    </button>.
                  </p>
                </div>
              </div>
            )}

            {/* ── Package cards ─────────────────────────────────────────── */}
            <div className="space-y-2.5">
              {packages.map((pkg, idx) => (
                <button
                  key={pkg.id}
                  onClick={() => { setSelectedPkg(pkg); setStep("phone"); }}
                  className="group w-full text-left rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm px-4 py-4 transition-all duration-150 hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98] active:brightness-90 min-h-[64px]"
                  style={{ touchAction: "manipulation" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Speed tier indicator dot */}
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        idx === 0 ? "bg-emerald-400" :
                        idx === 1 ? "bg-blue-400" :
                        idx === 2 ? "bg-violet-400" : "bg-primary"
                      }`} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">{pkg.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          ↓{pkg.speed_down} · {pkg.duration_days} day{pkg.duration_days !== 1 ? "s" : ""} · {pkg.max_devices} device{pkg.max_devices > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-base font-extrabold text-primary leading-none">
                          KES {Number(pkg.price).toLocaleString()}
                        </p>
                      </div>
                      <div className="h-7 w-7 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                THREE PRIMARY ACTION BUTTONS
                These are full-width, high-contrast buttons — NOT tiny links.
                Login · Voucher · Recover must be immediately obvious on any
                phone screen. First-time visitors and returning users with
                expired sessions need to find these without hunting.
                ══════════════════════════════════════════════════════════════ */}
            <div className="pt-1 space-y-2.5">

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>

              {/* ── SIGN IN ── */}
              <button
                onClick={() => setStep("login")}
                className="group w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[54px] rounded-2xl border border-border/60 bg-card/40 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all duration-150"
                style={{ touchAction: "manipulation" }}
              >
                <div className="h-9 w-9 rounded-xl bg-primary/15 group-hover:bg-primary/25 flex items-center justify-center shrink-0 transition-colors">
                  <LogIn className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-foreground leading-none">Sign In</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Use your phone &amp; password</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground/40 shrink-0">
                  <path d="M5 8h6M8 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* ── VOUCHER ── */}
              <button
                onClick={() => { setStep("voucher"); setVoucherError(""); setVoucherCode(""); setVoucherPhone(""); setVoucherName(""); }}
                className="group w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[54px] rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10 active:scale-[0.98] transition-all duration-150"
                style={{ touchAction: "manipulation" }}
              >
                <div className="h-9 w-9 rounded-xl bg-amber-500/20 group-hover:bg-amber-500/30 flex items-center justify-center shrink-0 transition-colors">
                  <Ticket className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-amber-300 leading-none">Use a Voucher</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Redeem a pre-paid WiFi code</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground/40 shrink-0">
                  <path d="M5 8h6M8 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* ── RECOVER ── */}
              <button
                onClick={() => { setStep("recover"); setRecoverError(""); setRecoverNeedsPhone(false); }}
                className="group w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[54px] rounded-2xl border border-border/40 bg-card/20 hover:border-muted-foreground/30 hover:bg-muted/20 active:scale-[0.98] transition-all duration-150"
                style={{ touchAction: "manipulation" }}
              >
                <div className="h-9 w-9 rounded-xl bg-muted/40 group-hover:bg-muted/60 flex items-center justify-center shrink-0 transition-colors">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-foreground leading-none">Lost Access?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Recover with M-Pesa transaction code</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground/40 shrink-0">
                  <path d="M5 8h6M8 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

            </div>

            {/* ── Free WhatsApp — below the fold, secondary ─────────────── */}
            {fwaEnabled && (
              <>
                <div className="flex items-center gap-3 my-1 pt-1">
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[10px] text-muted-foreground">stay connected for free</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-base">💬</span>
                    <span className="text-sm font-semibold text-foreground">Free WhatsApp Chat</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Text &amp; voice notes only · {fwaCap}MB/day · {fwaDays} days free
                  </p>
                  {fwaStatus && (
                    <p className="text-xs text-emerald-400 mb-2">
                      ✓ Active · {fwaStatus.daysRemaining} day(s) left · {Math.round(fwaStatus.dataRemainingMb)}MB remaining today
                    </p>
                  )}
                  <button
                    onClick={() => { setFwaError(""); setFwaOtpSent(false); setStep("fwa_register"); }}
                    className="text-xs text-primary hover:underline underline-offset-2 font-medium"
                    style={{ touchAction: "manipulation" }}
                  >
                    {fwaStatus ? "Manage free access →" : "Continue with Free WhatsApp →"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {/* Free WhatsApp registration — phone + OTP */}
        {step === "fwa_register" && (
          <div className="glass-card p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold">Free WhatsApp Chat</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {fwaOtpSent
                  ? "Enter the 6-digit code sent to your phone."
                  : `Get ${fwaDays} days of free WhatsApp access — text & voice notes only, ${fwaCap}MB/day.`}
              </p>
            </div>

            {fwaError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
                {fwaError}
              </div>
            )}

            {!fwaOtpSent ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="07XX XXX XXX"
                    value={fwaPhone}
                    onChange={(e) => setFwaPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFwaRequestOtp()}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    We'll send a verification code to confirm your number.
                  </p>
                </div>
                <button
                  onClick={handleFwaRequestOtp}
                  disabled={fwaLoading || !fwaPhone.trim()}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-opacity"
                >
                  {fwaLoading ? "Sending…" : "Send Code"}
                </button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="123456"
                    maxLength={6}
                    value={fwaOtp}
                    onChange={(e) => setFwaOtp(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && handleFwaVerifyOtp()}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <button
                  onClick={handleFwaVerifyOtp}
                  disabled={fwaLoading || fwaOtp.length < 6}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-opacity"
                >
                  {fwaLoading ? "Verifying…" : "Activate Free WhatsApp"}
                </button>
                <button
                  onClick={() => { setFwaOtpSent(false); setFwaOtp(""); setFwaError(""); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
                >
                  ← Change phone number
                </button>
              </>
            )}

            <div className="pt-2 border-t border-border/50">
              <button
                onClick={() => { setStep("select"); setFwaError(""); setFwaOtpSent(false); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                ← Back to packages
              </button>
            </div>
          </div>
        )}

        {/* Phone entry */}
        {step === "phone" && selectedPkg && (
          <div className="glass-card p-6 space-y-5">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Selected: <span className="font-semibold text-foreground">{selectedPkg.name}</span></p>
              <p className="text-2xl font-extrabold text-primary mt-1">KES {Number(selectedPkg.price).toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="mpesa-phone">M-Pesa Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="mpesa-phone"
                  placeholder="0712 345 678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9 bg-muted/50 border-border h-12 text-base"
                  type="tel"
                  // PERF-INPUT: inputMode numeric opens numeric keypad on mobile
                  // (no letters, no symbols — faster entry). autoComplete tel
                  // allows browser/OS to autofill saved phone numbers.
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={12}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={() => { setStep("select"); setSelectedPkg(null); }} style={{ touchAction: "manipulation" }}>Back</Button>
              <Button className="flex-1 h-12 text-base font-semibold" onClick={handlePurchase} disabled={!phone || phone.length < 9} style={{ touchAction: "manipulation" }}>Pay via M-Pesa</Button>
            </div>
            <button onClick={() => setStep("login")} className="text-xs text-primary hover:underline w-full text-center min-h-[44px] flex items-center justify-center" style={{ touchAction: "manipulation" }}>
              Already paid? Sign in instead
            </button>
          </div>
        )}

        {/* Processing */}
        {step === "processing" && (() => {
          const elapsedSecs = pollCount * 5;
          const pct = Math.min(Math.round((pollCount / 24) * 100), 95); // cap at 95% until confirmed
          const messages = [
            "Sending payment request…",
            "Waiting for M-Pesa prompt…",
            "Enter your PIN on your phone",
            "Checking payment status…",
            "Still waiting — take your time",
            "Almost there…",
          ];
          const msgIndex = Math.min(Math.floor(pollCount / 4), messages.length - 1);
          return (
            <div className="glass-card p-8 text-center space-y-5">
              {/* Animated WiFi icon */}
              <div className="h-16 w-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
                <Wifi className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-bold text-base">M-Pesa STK Sent</p>
                <p className="text-sm text-muted-foreground mt-1 font-mono">{phone}</p>
              </div>
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>{messages[msgIndex]}</span>
                  <span>{elapsedSecs > 0 ? `${elapsedSecs}s` : "—"}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open M-Pesa on your phone and enter your PIN to confirm.<br />
                This page will update automatically.
              </p>
            </div>
          );
        })()}

        {/* GAP-01/02 FIX: Activating state — payment confirmed by Safaricom/backend
            but subscription not yet live (inline activation still settling).
            Shown briefly between "processing" and "success" so user never sees
            a false "You're Connected" before MikroTik accepts the session. */}
        {step === "activating" && (
          <div className="glass-card p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-success/15 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-success animate-pulse" />
            </div>
            <div>
              <p className="font-bold text-base text-success">Payment Confirmed ✓</p>
              <p className="text-sm text-muted-foreground mt-1">
                Activating your subscription…
              </p>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full animate-pulse w-3/4" />
            </div>
            <p className="text-xs text-muted-foreground">
              Almost done — setting up your internet access.
            </p>
          </div>
        )}

        {/* Success */}
        {step === "success" && subscriber && (
          <div className="glass-card p-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <div>
              <p className="font-bold text-lg">You're Connected, {subscriber.full_name?.split(" ")[0]}!</p>
              <p className="text-sm text-muted-foreground mt-1">Getting you online automatically…</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your device has been saved for quick reconnects
              </p>
            </div>
            <Button className="w-full" onClick={() => setStep("portal")}>View My Account</Button>
          </div>
        )}

        {/* Login Form */}
        {step === "login" && (
          <div className="glass-card p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="login-phone" className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="login-phone"
                  placeholder="0712 345 678"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  className="pl-9 bg-muted/50 border-border h-12 text-base"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">Password (sent via SMS)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="login-password"
                  type={pwdVisible ? "text" : "password"}
                  placeholder="Your WiFi password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="pl-9 pr-16 bg-muted/50 border-border h-12 text-base"
                  autoComplete="current-password"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                {/* TOUCH-03: show/hide button gets full right-side tap zone */}
                <button
                  type="button"
                  onClick={() => setPwdVisible(!pwdVisible)}
                  className="absolute right-0 top-0 h-12 px-4 text-muted-foreground text-xs hover:text-foreground transition-colors"
                  style={{ touchAction: "manipulation" }}
                  aria-label={pwdVisible ? "Hide password" : "Show password"}
                >
                  {pwdVisible ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {loginError && <p className="text-xs text-destructive">{loginError}</p>}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep("select")} style={{ touchAction: "manipulation" }}>Back</Button>
              <Button className="flex-1 h-12 gap-2 text-base font-semibold" onClick={handleLogin} disabled={loggingIn} style={{ touchAction: "manipulation" }}>
                {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Sign In
              </Button>
            </div>
            <div className="pt-1 text-center">
              <button
                onClick={() => { setStep("recover"); setRecoverError(""); setRecoverNeedsPhone(false); }}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 mx-auto transition-colors min-h-[44px] px-3"
                style={{ touchAction: "manipulation" }}
              >
                <KeyRound className="h-3.5 w-3.5" />Forgot password? Recover with M-Pesa code
              </button>
            </div>
          </div>
        )}

        {/* ── RECOVER STEP: M-Pesa TXN ID account recovery ── */}
        {step === "recover" && (
          <div className="glass-card p-6 space-y-5">
            <div className="flex items-center gap-3 pb-1">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <KeyRound className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">M-Pesa Recovery</p>
                <p className="text-xs text-muted-foreground">
                  Paste the M-Pesa transaction code from your payment SMS
                </p>
              </div>
            </div>

            {/* TXN ID field */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                M-Pesa Transaction Code
              </label>
              <Input
                placeholder="e.g. RGX3YZ1AB0"
                value={recoverTxnId}
                onChange={(e) => {
                  setRecoverTxnId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                  setRecoverError("");
                  setRecoverInUse(null);
                }}
                className="bg-muted/50 border-border font-mono tracking-widest text-center text-base uppercase"
                maxLength={30}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onKeyDown={(e) => e.key === "Enter" && handleRecover()}
              />
              <p className="text-[11px] text-muted-foreground">
                Found in your Safaricom SMS — starts with letters like RGX, QH5, etc.
              </p>
            </div>

            {/* Phone field — shown when required by server or on first attempt */}
            {(recoverNeedsPhone || recoverPhone) && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Phone Number Used for Payment
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="0712 345 678"
                    value={recoverPhone}
                    onChange={(e) => { setRecoverPhone(e.target.value); setRecoverError(""); }}
                    className="pl-9 bg-muted/50 border-border h-12"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    onKeyDown={(e) => e.key === "Enter" && handleRecover()}
                  />
                </div>
              </div>
            )}

            {/* Optional phone toggle (when not yet required) */}
            {!recoverNeedsPhone && !recoverPhone && (
              <button
                onClick={() => setRecoverPhone(" ")}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                <Phone className="h-3 w-3" />Also enter phone number for extra security
              </button>
            )}

            {/* Error */}
            {recoverError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{recoverError}</p>
              </div>
            )}

            {/* Session in-use warning + force option */}
            {recoverInUse && (
              <div className="p-4 sm:p-6 rounded-xl bg-amber-500/8 border border-amber-500/25 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed">{recoverInUse.msg}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-2"
                  disabled={recoverLoading}
                  onClick={() => handleRecover(true)}
                >
                  <RotateCcw className="h-3 w-3" />
                  Force sign out other device &amp; recover here
                </Button>
              </div>
            )}

            {/* What happens note */}
            {!recoverError && !recoverInUse && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground leading-relaxed">
                💡 After recovery, your current device will be registered to your account automatically — even if your MAC address has changed.
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setStep("login"); setRecoverError(""); setRecoverInUse(null); }}
              >
                Back
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => handleRecover()}
                disabled={recoverLoading || recoverTxnId.length < 6}
              >
                {recoverLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Recovering…</>
                  : <><KeyRound className="h-4 w-4" />Recover Account</>
                }
              </Button>
            </div>
          </div>
        )}

        {/* Voucher Redemption */}
        {step === "voucher" && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900">
              {/* Shimmer top stripe */}
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 animate-pulse" />
              {/* Perforated left edge */}
              <div className="absolute left-0 top-8 bottom-8 w-6 flex flex-col justify-around items-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-2 w-2 rounded-full bg-slate-950 border border-amber-500/20" />
                ))}
              </div>
              <div className="absolute left-6 top-0 bottom-0 border-l border-dashed border-amber-500/15" />

              <div className="pl-10 pr-5 py-5 space-y-4">

                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Ticket className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-amber-300">Redeem Voucher</p>
                    <p className="text-xs text-muted-foreground">Enter your pre-paid WiFi code</p>
                  </div>
                </div>

                {/* ── LOGGED-IN: show identity pill, no fields needed ── */}
                {subscriber ? (
                  <div className="flex items-center gap-3 bg-slate-950/50 border border-border/40 rounded-xl px-3 py-2.5">
                    <div className="h-8 w-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {subscriber.full_name?.charAt(0).toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{subscriber.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{subscriber.phone}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                      <CheckCircle className="h-3 w-3" />Signed in
                    </div>
                  </div>
                ) : (
                  /* ── GUEST: collect phone + name ── */
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Your Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          value={voucherPhone}
                          onChange={e => { setVoucherPhone(e.target.value); setVoucherError(""); }}
                          placeholder="0712 345 678"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          maxLength={12}
                          className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Your Name <span className="text-muted-foreground/50">(optional)</span>
                      </label>
                      <input
                        value={voucherName}
                        onChange={e => setVoucherName(e.target.value)}
                        placeholder="e.g. John Kamau"
                        autoCapitalize="words"
                        autoComplete="name"
                        className="w-full px-4 py-2.5 bg-slate-950/60 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </>
                )}

                {/* Code input — always prominent */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-amber-300/80">Voucher Code</label>
                  <input
                    value={voucherCode}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
                      const fmt = raw.match(/.{1,4}/g)?.join("-") ?? raw;
                      setVoucherCode(fmt);
                      setVoucherError("");
                    }}
                    placeholder="XXXX-XXXX-XXXX"
                    maxLength={14}
                    autoFocus
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full px-4 py-3 font-mono text-lg font-bold tracking-[0.3em] text-center bg-slate-950/60 border border-amber-500/30 rounded-xl text-amber-200 placeholder:text-muted-foreground/40 outline-none focus:border-amber-400/60 transition-colors uppercase"
                  />
                  {/* Character progress dots */}
                  <div className="flex justify-center gap-1 pt-0.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 w-1 rounded-full transition-all duration-150 ${
                          i === 3 || i === 7 ? "w-2 bg-amber-500/20" :
                          voucherCode.replace(/-/g, "").length > i
                            ? "bg-amber-400" : "bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Error */}
                {voucherError && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{voucherError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setStep("select")}
                    style={{ touchAction: "manipulation" }}
                    className="flex-1 py-3 min-h-[48px] rounded-xl border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleVoucherRedeem}
                    disabled={
                      voucherLoading ||
                      voucherCode.length !== 14 ||
                      (!subscriber && voucherPhone.length < 9)
                    }
                    style={{ touchAction: "manipulation" }}
                    className="flex-1 py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-sm hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {voucherLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Redeeming…</>
                      : <><Ticket className="h-4 w-4" />Redeem Code</>
                    }
                  </button>
                </div>

                {/* Guest: sign-in nudge */}
                {!subscriber && (
                  <p className="text-center text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      className="text-primary hover:underline font-medium min-h-[44px] inline-flex items-center"
                      onClick={() => setStep("login")}
                      style={{ touchAction: "manipulation" }}
                    >
                      Sign in
                    </button>{" "}to redeem faster
                  </p>
                )}
              </div>

              {/* Bottom band */}
              <div className="h-1 w-full bg-gradient-to-r from-amber-500/30 via-yellow-400/30 to-amber-500/30" />
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Don't have a voucher?{" "}
              <button className="text-primary hover:underline font-medium" onClick={() => setStep("select")}>
                Buy with M-Pesa instead
              </button>
            </p>
          </div>
        )}

        {/* Subscriber Portal */}
        {step === "portal" && subscriber && (
          <>
            {/* MED-01 FIX: Expiry banner — shown when polling detects subscription expired */}
            {subscriptionExpired && (
              <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <span className="text-lg">⏰</span>
                <div>
                  <strong>Your package has expired.</strong> Your internet access has been paused.
                  {" "}<button className="underline font-semibold" onClick={() => setStep("select")}>Renew now</button> to continue browsing.
                </div>
              </div>
            )}
          <MemoPortalDashboard
            subscriber={subscriber}
            packages={packages}
            hotspotParams={hotspotParams.current}
            apiBase={apiBase}
            onReconnect={() => {
              setStep("auto-connecting");
              setAutoConnectStatus("Reconnecting…");
              attemptAutoReconnect(hotspotParams.current).then(result => {
                if (result !== "granted" && result !== "portal") {
                  setStep("portal");
                  toast({ title: "Reconnect failed", description: "Please try logging in again.", variant: "destructive" });
                }
              });
            }}
            onBuyPackage={(pkg: Package | null) => {
              // BUG-2 FIX: null means "go to package select" (from shared-plan CTA),
              // not pre-selecting a specific package.
              if (pkg) {
                setSelectedPkg(pkg);
                setPhone(subscriber.phone);
                setStep("phone");
              } else {
                setStep("select");
              }
            }}
            onLogout={handleLogout}
            toast={toast}
          />
          </>
        )}

        <p className="text-[10px] text-center text-muted-foreground">{branding.footer_text}</p>
      </div>
    </div>
  );
};

export default HotspotPortal;
