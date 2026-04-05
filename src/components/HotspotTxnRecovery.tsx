/**
 * src/components/HotspotTxnRecovery.tsx  — v3.4.0
 *
 * Self-service package recovery via M-Pesa transaction code.
 *
 * Use cases:
 *   - Subscriber logged out (session expired, password forgotten, device switch)
 *   - Captive portal: before login, show "Use M-Pesa code" option
 *   - User portal: show in account page as "Recover access" fallback
 *
 * Flow:
 *   1. User enters their M-Pesa confirmation code (e.g. QGL5XYZABC)
 *   2. Backend validates: txn exists, package active, not claimed by another session
 *   3a. Success → calls onSuccess(token, subscriber) so parent can log user in
 *   3b. Expired → shows clear "renew" message with expiry date
 *   3c. In-use → shows device info + "Force logout" option (calls /portal/txn-force-logout)
 *   3d. Not found → helpful guidance on where to find the code
 *
 * Props:
 *   onSuccess — called with session token + subscriber data on successful recovery
 *   onCancel  — called when user dismisses (optional; shows back button if provided)
 *   compact   — render as inline card instead of full-page layout
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone, AlertCircle, CheckCircle2, RefreshCw,
  ArrowLeft, MessageSquare, Clock, LogOut, Loader2, Phone,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriberInfo {
  id: string;
  username: string;
  phone: string;
  full_name: string | null;
  status: string;
  expires_at: string | null;
  package_name: string | null;
  speed_down: number | null;
  speed_up: number | null;
}

interface TransactionInfo {
  mpesa_ref: string;
  amount: number;
  package: string | null;
  paid_at: string | null;
  expires_at: string | null;
}

interface RecoverySuccess {
  token: string;
  sessionType: string;
  expiresAt: string;
  subscriber: SubscriberInfo;
  transaction: TransactionInfo;
}

export interface HotspotTxnRecoveryProps {
  onSuccess: (token: string, subscriber: SubscriberInfo) => void;
  onCancel?: () => void;
  compact?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtAmount(n: number): string {
  return `KES ${n.toLocaleString("en-KE")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HotspotTxnRecovery({
  onSuccess,
  onCancel,
  compact = false,
}: HotspotTxnRecoveryProps) {
  const [txnId,        setTxnId]        = useState("");
  const [phone,        setPhone]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [forceLoading, setForceLoading] = useState(false);

  // State machine
  type Stage =
    | { type: "idle" }
    | { type: "error";   message: string }
    | { type: "notfound" }
    | { type: "pending" }  // GAP-04 FIX: payment confirmed, activation in progress
    | { type: "expired"; data: { expiredAt: string | null; packageName: string | null; paidAt: string | null } }
    | { type: "inuse";   data: { activeSessionId: string; error: string } }
    | { type: "success"; data: RecoverySuccess };

  const [stage, setStage] = useState<Stage>({ type: "idle" });

  // ── Submit recovery request ───────────────────────────────────────────────
  async function handleRecover() {
    const code = txnId.trim().toUpperCase();
    if (!code) return;

    setLoading(true);
    setStage({ type: "idle" });

    try {
      const body: Record<string, string> = { txnId: code };
      if (phone.trim()) body.phone = phone.trim();

      const res = await fetch("/api/portal/hotspot-recover", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json();

      if (json.success) {
        setStage({ type: "success", data: json });
        onSuccess(json.token, json.subscriber);
        return;
      }

      // GAP-04 FIX: Backend activated inline but session creation pending
      if (json.pending)    { setStage({ type: "pending" }); return; }
      if (json.notFound)   { setStage({ type: "notfound" }); return; }
      if (json.expired) {
        setStage({ type: "expired", data: {
          expiredAt:   json.expiredAt,
          packageName: json.packageName,
          paidAt:      json.paidAt,
        }}); return;
      }
      if (json.inUse) {
        setStage({ type: "inuse", data: {
          activeSessionId: json.activeSessionId,
          error:           json.error,
        }}); return;
      }
      setStage({ type: "error", message: json.error ?? "Something went wrong. Please try again." });

    } catch {
      setStage({ type: "error", message: "Could not connect. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  // ── Force logout other device ─────────────────────────────────────────────
  async function handleForceLogout(activeSessionId: string) {
    setForceLoading(true);
    try {
      const res = await fetch("/api/portal/txn-force-logout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId: activeSessionId, txnId: txnId.trim().toUpperCase() }),
      });
      const json = await res.json();
      if (json.success) {
        await handleRecover();
      } else {
        setStage({ type: "error", message: json.error ?? "Force logout failed." });
      }
    } catch {
      setStage({ type: "error", message: "Force logout failed. Try again." });
    } finally {
      setForceLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const wrapperCls = compact
    ? "w-full"
    : "w-full max-w-sm mx-auto";

  return (
    <div className={wrapperCls}>
      <div className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden
                       ${compact ? "" : "p-6"}`}>
        <div className={compact ? "p-5" : ""}>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            {onCancel && (
              <button onClick={onCancel}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                style={{ touchAction: "manipulation" }}
                aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">Recover with M-Pesa code</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use the code from your payment SMS
              </p>
            </div>
          </div>

          {/* Input fields */}
          <div className="space-y-3">
            <div>
              <label htmlFor="txn-input" className="text-xs font-medium text-muted-foreground mb-1.5 block">
                M-Pesa confirmation code
              </label>
              <div className="flex gap-2">
                <Input
                  id="txn-input"
                  value={txnId}
                  onChange={e => {
                    setTxnId(e.target.value.toUpperCase());
                    if (stage.type !== "idle") setStage({ type: "idle" });
                  }}
                  onKeyDown={e => { if (e.key === "Enter") handleRecover(); }}
                  placeholder="e.g. QGL5XYZABC"
                  className="font-mono tracking-wider h-11 text-sm uppercase"
                  maxLength={30}
                  disabled={loading || stage.type === "success"}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <Button
                  onClick={handleRecover}
                  disabled={!txnId.trim() || loading || stage.type === "success"}
                  className="h-11 px-4 flex-shrink-0"
                  style={{ touchAction: "manipulation" }}
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    "Recover"
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Check your M-Pesa SMS — the code starts with letters, e.g. <span className="font-mono">QGL5XY…</span>
              </p>
            </div>

            {/* Phone field — always shown for verification (required by backend) */}
            <div>
              <label htmlFor="txn-phone" className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Phone number used for payment
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="txn-phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0712 345 678"
                  className="pl-9 h-11"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  disabled={loading || stage.type === "success"}
                />
              </div>
            </div>
          </div>

          {/* ── State-specific feedback ─────────────────────────────────── */}

          {/* General error */}
          {stage.type === "error" && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{stage.message}</p>
            </div>
          )}

          {/* GAP-04 FIX: Payment confirmed, activation in progress */}
          {stage.type === "pending" && (
            <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-4 flex gap-3 items-start">
              <Loader2 className="h-4 w-4 text-warning animate-spin flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">Payment confirmed — activating…</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Your payment was verified with Safaricom. Your account is being set up.
                  Wait 30 seconds and tap <strong>Recover</strong> again.
                </p>
              </div>
            </div>
          )}

          {/* Not found */}
          {stage.type === "notfound" && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Transaction code not found
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Double-check the code in your M-Pesa SMS. It's usually 10 characters
                    and starts with a letter (not a number). Only successful payments work here.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  If you're sure it's correct, contact support with your phone number.
                </span>
              </div>
            </div>
          )}

          {/* Package expired */}
          {stage.type === "expired" && (
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Package has expired</p>
                  {stage.data.packageName && (
                    <Badge variant="outline" className="text-xs mt-1">{stage.data.packageName}</Badge>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pl-7">
                {stage.data.paidAt && (
                  <p>Paid: <span className="font-medium">{fmtDate(stage.data.paidAt)}</span></p>
                )}
                {stage.data.expiredAt && (
                  <p>Expired: <span className="font-medium text-destructive">{fmtDate(stage.data.expiredAt)}</span></p>
                )}
              </div>
              <div className="pl-7">
                <p className="text-xs text-muted-foreground mb-2">
                  To reconnect, purchase a new package using M-Pesa:
                </p>
                <div className="rounded-lg bg-muted border border-border p-3 text-xs space-y-0.5">
                  <p className="font-medium">Pay via M-Pesa Paybill</p>
                  <p>Business No: <span className="font-mono font-bold">XXXXXX</span></p>
                  <p>Account No: <span className="font-mono font-bold">your phone number</span></p>
                </div>
              </div>
            </div>
          )}

          {/* In use — another session active */}
          {stage.type === "inuse" && (
            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Code active on another device</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{stage.data.error}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/5"
                disabled={forceLoading}
                style={{ touchAction: "manipulation" }}
                onClick={() => handleForceLogout(stage.data.activeSessionId)}
              >
                {forceLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                {forceLoading ? "Logging out other device…" : "Force logout & take over"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Only do this if you recognise the payment and the other device is yours.
              </p>
            </div>
          )}

          {/* Success */}
          {stage.type === "success" && (
            <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-success">Access restored!</p>
                  <p className="text-xs text-muted-foreground">
                    Welcome back, {stage.data.data.subscriber.full_name || stage.data.data.subscriber.username}.
                    Your <strong>{stage.data.data.transaction.package}</strong> package is active
                    {stage.data.data.transaction.expires_at
                      ? ` until ${fmtDate(stage.data.data.transaction.expires_at)}`
                      : ""}.
                  </p>
                  {stage.data.data.transaction.amount && (
                    <p className="text-xs text-muted-foreground">
                      Payment: <strong>{fmtAmount(stage.data.data.transaction.amount)}</strong>
                      {stage.data.data.transaction.paid_at
                        ? ` on ${fmtDate(stage.data.data.transaction.paid_at)}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriberInfo {
  id: string;
  username: string;
  phone: string;
  full_name: string | null;
  status: string;
  expires_at: string | null;
  package_name: string | null;
  speed_down: number | null;
  speed_up: number | null;
}

interface TransactionInfo {
  mpesa_ref: string;
  amount: number;
  package: string | null;
  paid_at: string | null;
  expires_at: string | null;
}

interface RecoverySuccess {
  token: string;
  sessionType: string;
  expiresAt: string;
  subscriber: SubscriberInfo;
  transaction: TransactionInfo;
}

export interface HotspotTxnRecoveryProps {
  onSuccess: (token: string, subscriber: SubscriberInfo) => void;
  onCancel?: () => void;
  compact?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtAmount(n: number): string {
  return `KES ${n.toLocaleString("en-KE")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HotspotTxnRecovery({
  onSuccess,
  onCancel,
  compact = false,
}: HotspotTxnRecoveryProps) {
  const [txnId,        setTxnId]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [forceLoading, setForceLoading] = useState(false);

  // State machine
  type Stage =
    | { type: "idle" }
    | { type: "error";   message: string }
    | { type: "notfound" }
    | { type: "expired"; data: { expiredAt: string | null; packageName: string | null; paidAt: string | null } }
    | { type: "inuse";   data: { activeSessionId: string; error: string } }
    | { type: "success"; data: RecoverySuccess };

  const [stage, setStage] = useState<Stage>({ type: "idle" });

  // ── Submit recovery request ───────────────────────────────────────────────
  async function handleRecover() {
    const code = txnId.trim().toUpperCase();
    if (!code) return;

    setLoading(true);
    setStage({ type: "idle" });

    try {
      const res = await fetch("/api/portal/hotspot-recover", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ txnId: code }),
      });
      const json = await res.json();

      if (json.success) {
        setStage({ type: "success", data: json });
        onSuccess(json.token, json.subscriber);
        return;
      }

      if (json.notFound)   { setStage({ type: "notfound" }); return; }
      if (json.expired)    {
        setStage({ type: "expired", data: {
          expiredAt:   json.expiredAt,
          packageName: json.packageName,
          paidAt:      json.paidAt,
        }}); return;
      }
      if (json.inUse) {
        setStage({ type: "inuse", data: {
          activeSessionId: json.activeSessionId,
          error:           json.error,
        }}); return;
      }
      setStage({ type: "error", message: json.error ?? "Something went wrong. Please try again." });

    } catch {
      setStage({ type: "error", message: "Could not connect. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  // ── Force logout other device ─────────────────────────────────────────────
  async function handleForceLogout(activeSessionId: string) {
    setForceLoading(true);
    try {
      const res = await fetch("/api/portal/txn-force-logout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId: activeSessionId, txnId: txnId.trim().toUpperCase() }),
      });
      const json = await res.json();
      if (json.success) {
        // Retry recovery now that the other session is freed
        await handleRecover();
      } else {
        setStage({ type: "error", message: json.error ?? "Force logout failed." });
      }
    } catch {
      setStage({ type: "error", message: "Force logout failed. Try again." });
    } finally {
      setForceLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const wrapperCls = compact
    ? "w-full"
    : "w-full max-w-sm mx-auto";

  return (
    <div className={wrapperCls}>
      <div className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden
                       ${compact ? "" : "p-6"}`}>
        <div className={compact ? "p-5" : ""}>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            {onCancel && (
              <button onClick={onCancel}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">Recover with M-Pesa code</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use the code from your payment SMS
              </p>
            </div>
          </div>

          {/* Input row */}
          <div className="space-y-3">
            <div>
              <label htmlFor="txn-input" className="text-xs font-medium text-muted-foreground mb-1.5 block">
                M-Pesa confirmation code
              </label>
              <div className="flex gap-2">
                <Input
                  id="txn-input"
                  value={txnId}
                  onChange={e => {
                    setTxnId(e.target.value.toUpperCase());
                    if (stage.type !== "idle") setStage({ type: "idle" });
                  }}
                  onKeyDown={e => { if (e.key === "Enter") handleRecover(); }}
                  placeholder="e.g. QGL5XYZABC"
                  className="font-mono tracking-wider h-11 text-sm uppercase"
                  maxLength={30}
                  disabled={loading || stage.type === "success"}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <Button
                  onClick={handleRecover}
                  disabled={!txnId.trim() || loading || stage.type === "success"}
                  className="h-11 px-4 flex-shrink-0"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    "Recover"
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Check your M-Pesa SMS — the code starts with letters, e.g. <span className="font-mono">QGL5XY…</span>
              </p>
            </div>
          </div>

          {/* ── State-specific feedback ─────────────────────────────────── */}

          {/* General error */}
          {stage.type === "error" && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{stage.message}</p>
            </div>
          )}

          {/* Not found */}
          {stage.type === "notfound" && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Transaction code not found
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Double-check the code in your M-Pesa SMS. It's usually 10 characters
                    and starts with a letter (not a number). Only successful payments work here.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  If you're sure it's correct, contact support with your phone number.
                </span>
              </div>
            </div>
          )}

          {/* Package expired */}
          {stage.type === "expired" && (
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Package has expired</p>
                  {stage.data.packageName && (
                    <Badge variant="outline" className="text-xs mt-1">{stage.data.packageName}</Badge>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pl-7">
                {stage.data.paidAt && (
                  <p>Paid: <span className="font-medium">{fmtDate(stage.data.paidAt)}</span></p>
                )}
                {stage.data.expiredAt && (
                  <p>Expired: <span className="font-medium text-destructive">{fmtDate(stage.data.expiredAt)}</span></p>
                )}
              </div>
              <div className="pl-7">
                <p className="text-xs text-muted-foreground mb-2">
                  To reconnect, purchase a new package using M-Pesa:
                </p>
                <div className="rounded-lg bg-muted border border-border p-3 text-xs space-y-0.5">
                  <p className="font-medium">Pay via M-Pesa Paybill</p>
                  <p>Business No: <span className="font-mono font-bold">XXXXXX</span></p>
                  <p>Account No: <span className="font-mono font-bold">your phone number</span></p>
                </div>
              </div>
            </div>
          )}

          {/* In use — another session active */}
          {stage.type === "inuse" && (
            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Code active on another device</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{stage.data.error}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/5"
                disabled={forceLoading}
                onClick={() => handleForceLogout(stage.data.activeSessionId)}
              >
                {forceLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                {forceLoading ? "Logging out other device…" : "Force logout & take over"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Only do this if you recognise the payment and the other device is yours.
              </p>
            </div>
          )}

          {/* Success */}
          {stage.type === "success" && (
            <div className="mt-4 rounded-xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-success">Access restored!</p>
                  <p className="text-xs text-muted-foreground">
                    Welcome back, {stage.data.data.subscriber.full_name || stage.data.data.subscriber.username}.
                    Your <strong>{stage.data.data.transaction.package}</strong> package is active
                    {stage.data.data.transaction.expires_at
                      ? ` until ${fmtDate(stage.data.data.transaction.expires_at)}`
                      : ""}.
                  </p>
                  {stage.data.data.transaction.amount && (
                    <p className="text-xs text-muted-foreground">
                      Payment: <strong>{fmtAmount(stage.data.data.transaction.amount)}</strong>
                      {stage.data.data.transaction.paid_at
                        ? ` on ${fmtDate(stage.data.data.transaction.paid_at)}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
