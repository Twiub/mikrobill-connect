/**
 * frontend/src/pages/JoinPage.tsx  — v2.9
 *
 * The page that opens when someone clicks a sharing/invite link.
 * Route: /join/:token
 *
 * FLOW A — Device is ON ISP WiFi:
 *   1. Page loads → hits /api/portal/sharing/join with detected MAC
 *   2. MAC is captured from the hotspot DHCP table via the backend
 *      (MikroTik hotspot populates X-Hotspot-User or we read from RADIUS session)
 *      Fallback: Walled-garden redirect gives us the MAC in query params
 *   3. Device registered → access granted immediately
 *
 * FLOW B — Device is NOT on ISP WiFi (mobile data, home broadband):
 *   1. Page loads → shows link preview (donor name, package, slots left)
 *   2. User sees: "You're not on our WiFi yet"
 *   3. User types their name, clicks "Remember My Device"
 *   4. Browser generates a UUID cookie_id → stored in localStorage + cookie
 *   5. POST /api/portal/sharing/defer → pending_joins row created
 *   6. Instructions shown: "Connect to [ISP] WiFi and you'll be added automatically"
 *   7. When they connect → HotspotPortal detects cookie → calls claim-deferred
 *      → MAC captured → device registered → access granted
 *
 * DETECTION:
 *   Whether user is "on WiFi" is determined by:
 *   (a) The backend reads X-Subscriber-IP / RADIUS session to find their MAC
 *   (b) Or query param ?mac=... from MikroTik walled-garden redirect
 *   (c) If neither → "not on WiFi" flow
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Wifi, WifiOff, Smartphone, CheckCircle2, Clock, AlertCircle, Loader2, User, Zap, Shield, Users } from "lucide-react";

// ── Cookie / localStorage helpers ─────────────────────────────────────────────
const JOIN_COOKIE_KEY  = "mikrobill_join_cookie";
const JOIN_TOKEN_KEY   = "mikrobill_join_token";

function getOrCreateCookieId(): string {
  let id = localStorage.getItem(JOIN_COOKIE_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(JOIN_COOKIE_KEY, id);
    // Also set as a real cookie so hotspot portal can read it
    const exp = new Date(Date.now() + 30 * 86400000).toUTCString();
    document.cookie = `${JOIN_COOKIE_KEY}=${id};expires=${exp};path=/;SameSite=Lax`;
  }
  return id;
}

function savePendingToken(token: string) {
  localStorage.setItem(JOIN_TOKEN_KEY, token);
  const exp = new Date(Date.now() + 30 * 86400000).toUTCString();
  document.cookie = `${JOIN_TOKEN_KEY}=${token};expires=${exp};path=/;SameSite=Lax`;
}

// ── API base ───────────────────────────────────────────────────────────────────
const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_API_BASE ?? "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface LinkPreview {
  donorName: string;
  packageName: string;
  speedDown: string;
  speedUp: string;
  maxDevices: number;
  slotsRemaining: number;
  note: string | null;
  expiresAt: string;
  deviceFilter: string | null;
  isValid: boolean;
  invalidReason: string | null;
}

type PageState =
  | "loading"
  | "invalid"
  | "on_wifi_joining"
  | "on_wifi_success"
  | "offline_preview"
  | "offline_deferred"
  | "offline_error"
  | "already_claimed"
  | "slots_full";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSpeed(kbps: string | number | null): string {
  if (!kbps) return "—";
  const n = typeof kbps === "string" ? parseInt(kbps) : kbps;
  return n >= 1000 ? `${(n / 1000).toFixed(0)} Mbps` : `${n} Kbps`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setPageState]     = useState<PageState>("loading");
  const [preview, setPreview]     = useState<LinkPreview | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any>(null);
  const [isBusy, setIsBusy]       = useState(false);

  // Detect MAC from query params (MikroTik walled-garden injects ?mac=... on redirect)
  // Memoised so it's stable across renders and safe to use in dependency arrays.
  const macFromUrl = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("mac") || p.get("identity") || null;
  }, []);

  // ── Step 2A: Direct join (on WiFi, MAC from URL params) ───────────────────
  // Declared BEFORE the Step-1 useEffect so it is in scope for the dep array.
  const attemptDirectJoin = useCallback(async (mac: string) => {
    if (!token) return;
    setPageState("on_wifi_joining");
    try {
      const r = await fetch(`${API}/api/portal/sharing/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, mac, deviceName: deviceName || "My Phone", deviceType: "phone" }),
      });
      const data = await r.json();
      if (data.success) {
        setSuccessData(data);
        setPageState("on_wifi_success");
        // Clean up any stored pending state
        localStorage.removeItem(JOIN_COOKIE_KEY);
        localStorage.removeItem(JOIN_TOKEN_KEY);
        document.cookie = `${JOIN_COOKIE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
        document.cookie = `${JOIN_TOKEN_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
      } else {
        setErrorMsg(data.error ?? "Failed to join. Please try again.");
        setPageState("offline_error");
      }
    } catch {
      setErrorMsg("Connection error. Please try again.");
      setPageState("offline_error");
    }
  }, [token, deviceName]);

  // ── Step 1: Load preview ───────────────────────────────────────────────────
  // Placed after attemptDirectJoin so both are stable references in the dep array.
  useEffect(() => {
    if (!token || token.length !== 32) {
      setPageState("invalid");
      setErrorMsg("This link is invalid or has been damaged.");
      return;
    }

    fetch(`${API}/api/portal/sharing/preview/${token}`)
      .then(r => r.json())
      .then(data => {
        if (!data.success) { setPageState("invalid"); setErrorMsg("Link not found."); return; }
        const p: LinkPreview = data.preview;
        setPreview(p);

        if (!p.isValid) {
          setPageState("invalid");
          setErrorMsg(p.invalidReason ?? "This link is no longer valid.");
          return;
        }

        if (p.slotsRemaining <= 0) {
          setPageState("slots_full");
          return;
        }

        // Check if device is on WiFi (MAC detected from URL or we try an immediate join)
        if (macFromUrl) {
          // MikroTik provided MAC via walled-garden redirect — we're on WiFi
          attemptDirectJoin(macFromUrl);
        } else {
          // Not on WiFi (or MAC not provided) — show deferred flow
          setPageState("offline_preview");
        }
      })
      .catch(() => { setPageState("invalid"); setErrorMsg("Could not load link details. Please try again."); });
  }, [token, macFromUrl, attemptDirectJoin]);

  // ── Step 2B: Deferred join (not on WiFi) ──────────────────────────────────
  const handleDefer = useCallback(async () => {
    if (!token || isBusy) return;
    if (!deviceName.trim()) {
      setErrorMsg("Please enter your name or device name first.");
      return;
    }
    setIsBusy(true);
    setErrorMsg(null);
    const cookieId = getOrCreateCookieId();
    savePendingToken(token);

    try {
      const r = await fetch(`${API}/api/portal/sharing/defer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, deviceName: deviceName.trim(), cookieId }),
      });
      const data = await r.json();
      if (data.success) {
        setPageState("offline_deferred");
      } else {
        setErrorMsg(data.error ?? "Failed to save your join request.");
        setPageState("offline_error");
      }
    } catch {
      setErrorMsg("Connection error. Please try again.");
      setPageState("offline_error");
    } finally {
      setIsBusy(false);
    }
  }, [token, deviceName, isBusy]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 40%, #0a0e1a 100%)",
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      color: "#e8eaf0",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(56,189,248,0.08) 0%, transparent 70%)",
      }} />

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>

        {/* ISP branding bar */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px",
            boxShadow: "0 0 32px rgba(14,165,233,0.3)",
          }}>
            <Wifi size={28} color="#fff" />
          </div>
          <div style={{ fontSize: 13, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            WiFi Access Invitation
          </div>
        </div>

        {/* Main card */}
        <div style={{
          background: "rgba(15,20,30,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24,
          backdropFilter: "blur(20px)",
          overflow: "hidden",
        }}>

          {/* ── LOADING — skeleton instead of bare spinner ── */}
          {state === "loading" && (
            <div style={{ padding: "24px 20px" }}>
              {/* Donor info skeleton */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(14,165,233,0.15)", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 14, width: "60%", background: "rgba(100,116,139,0.2)", borderRadius: 6, marginBottom: 8 }} />
                  <div style={{ height: 12, width: "40%", background: "rgba(100,116,139,0.15)", borderRadius: 6 }} />
                </div>
              </div>
              {/* Package info skeleton */}
              <div style={{ background: "rgba(14,165,233,0.06)", border: "1px solid rgba(14,165,233,0.15)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <div style={{ height: 12, width: "30%", background: "rgba(100,116,139,0.2)", borderRadius: 4, marginBottom: 10 }} />
                <div style={{ height: 18, width: "55%", background: "rgba(100,116,139,0.25)", borderRadius: 6, marginBottom: 10 }} />
                <div style={{ height: 11, width: "70%", background: "rgba(100,116,139,0.15)", borderRadius: 4 }} />
              </div>
              {/* Button skeleton */}
              <div style={{ height: 48, borderRadius: 12, background: "rgba(14,165,233,0.2)" }} />
              <style>{`@keyframes shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} } div { animation: shimmer 1.4s ease-in-out infinite; }`}</style>
            </div>
          )}

          {/* ── INVALID / ERROR ── */}
          {(state === "invalid" || state === "offline_error") && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px",
              }}>
                <AlertCircle size={32} color="#ef4444" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Link Unavailable</div>
              <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>{errorMsg}</div>
              <div style={{ marginTop: 24, fontSize: 13, color: "#475569" }}>
                Ask the person who shared this link to send you a new one.
              </div>
            </div>
          )}

          {/* ── SLOTS FULL ── */}
          {state === "slots_full" && preview && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px",
              }}>
                <Users size={32} color="#fbbf24" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>All Slots Taken</div>
              <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
                {preview.donorName}'s plan ({preview.packageName}) currently has no free device slots.
                Ask them to free a slot or upgrade their plan.
              </div>
            </div>
          )}

          {/* ── ON WIFI — JOINING ── */}
          {state === "on_wifi_joining" && (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "rgba(14,165,233,0.12)", border: "1px solid rgba(14,165,233,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px",
              }}>
                <Loader2 size={32} color="#0ea5e9" style={{ animation: "spin 1s linear infinite" }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Connecting…</div>
              <div style={{ color: "#64748b", fontSize: 14 }}>Registering your device to the plan</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── ON WIFI — SUCCESS ── */}
          {state === "on_wifi_success" && successData && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.1))",
                border: "1px solid rgba(34,197,94,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px",
                boxShadow: "0 0 40px rgba(34,197,94,0.15)",
              }}>
                <CheckCircle2 size={40} color="#22c55e" />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>You're Connected!</div>
              <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
                {successData.message}
              </div>
              <SpeedBadges
                down={successData.subscriber?.speedDown}
                up={successData.subscriber?.speedUp}
              />
              {!successData.device?.hasSlot && (
                <div style={{
                  marginTop: 20, padding: "12px 16px",
                  background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
                  borderRadius: 12, fontSize: 13, color: "#fbbf24",
                }}>
                  ⚠ All slots are currently in use. Internet will activate once a slot frees up.
                </div>
              )}
            </div>
          )}

          {/* ── OFFLINE PREVIEW — main deferred flow ── */}
          {state === "offline_preview" && preview && (
            <>
              {/* Header */}
              <div style={{
                padding: "28px 28px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 16,
                }}>
                  <WifiOff size={16} color="#64748b" />
                  <span style={{ fontSize: 12, color: "#64748b", letterSpacing: "0.04em" }}>
                    NOT ON WIFI YET
                  </span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 6 }}>
                  You've been invited!
                </div>
                <div style={{ fontSize: 14, color: "#94a3b8" }}>
                  <strong style={{ color: "#e2e8f0" }}>{preview.donorName}</strong> is sharing their WiFi plan with you.
                </div>
              </div>

              {/* Plan info */}
              <div style={{ padding: "20px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <PlanCard preview={preview} />
              </div>

              {/* Note */}
              {preview.note && (
                <div style={{
                  margin: "0 28px",
                  padding: "12px 16px",
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 10,
                  marginTop: 16,
                  fontSize: 13, color: "#a5b4fc",
                }}>
                  "{preview.note}"
                </div>
              )}

              {/* Form */}
              <div style={{ padding: "20px 28px 28px" }}>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>
                  You're not on this WiFi network yet. Enter your name and click the button below — when you connect to the WiFi, you'll be added automatically.
                </div>

                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6, letterSpacing: "0.04em" }}>
                  YOUR NAME OR DEVICE NAME
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={e => setDeviceName(e.target.value)}
                  placeholder="e.g. John's iPhone"
                  maxLength={80}
                  autoComplete="name"
                  autoCapitalize="words"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "14px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    // PERF-INPUT: fontSize 16px prevents iOS Safari auto-zoom on focus
                    color: "#e8eaf0", fontSize: 16,
                    outline: "none", marginBottom: 14,
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => (e.target.style.borderColor = "rgba(14,165,233,0.5)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
                />

                {errorMsg && (
                  <div style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{errorMsg}</div>
                )}

                <button
                  onClick={handleDefer}
                  disabled={isBusy || !deviceName.trim()}
                  style={{
                    width: "100%", padding: "16px",
                    minHeight: 52,
                    background: isBusy || !deviceName.trim()
                      ? "rgba(14,165,233,0.3)"
                      : "linear-gradient(135deg, #0ea5e9, #6366f1)",
                    border: "none", borderRadius: 12, cursor: isBusy || !deviceName.trim() ? "not-allowed" : "pointer",
                    color: "#fff", fontSize: 16, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "all 0.15s",
                    touchAction: "manipulation",
                  }}
                >
                  {isBusy
                    ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Saving…</>
                    : <><Shield size={18} /> Remember My Device</>
                  }
                </button>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                <div style={{ marginTop: 14, fontSize: 12, color: "#475569", lineHeight: 1.6, textAlign: "center" }}>
                  Your device will be added automatically once you connect to the WiFi network.
                  This invitation expires {new Date(preview.expiresAt).toLocaleString()}.
                </div>
              </div>
            </>
          )}

          {/* ── DEFERRED — SUCCESS ── */}
          {state === "offline_deferred" && preview && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "rgba(14,165,233,0.12)",
                border: "1px solid rgba(14,165,233,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px",
                boxShadow: "0 0 40px rgba(14,165,233,0.15)",
              }}>
                <Clock size={40} color="#0ea5e9" />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Almost there!</div>
              <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
                Your device has been remembered. Now connect to the WiFi network — you'll be added automatically within seconds.
              </div>

              {/* Step indicators */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
                {[
                  { done: true,  icon: Shield,     label: "Device remembered" },
                  { done: false, icon: Wifi,        label: "Connect to ISP WiFi" },
                  { done: false, icon: CheckCircle2, label: "Internet access granted" },
                ].map((step, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px",
                    background: step.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${step.done ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 10,
                  }}>
                    <step.icon size={18} color={step.done ? "#22c55e" : "#475569"} />
                    <span style={{ fontSize: 14, color: step.done ? "#86efac" : "#64748b" }}>{step.label}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 20, fontSize: 12, color: "#475569" }}>
                This invitation expires {new Date(preview.expiresAt).toLocaleString()}.
                The owner's plan must remain active for access to work.
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#334155" }}>
          Powered by Mikrobill Connect
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlanCard({ preview }: { preview: LinkPreview }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ fontSize: 11, color: "#475569", letterSpacing: "0.06em", marginBottom: 8 }}>PLAN DETAILS</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{preview.packageName}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat icon={Zap} label="Download" value={formatSpeed(preview.speedDown)} accent="#22c55e" />
        <Stat icon={Zap} label="Upload" value={formatSpeed(preview.speedUp)} accent="#0ea5e9" iconFlip />
        <Stat icon={Users} label="Max Devices" value={String(preview.maxDevices)} accent="#a78bfa" />
        <Stat icon={Users} label="Slots Free" value={String(preview.slotsRemaining)}
          accent={preview.slotsRemaining > 0 ? "#22c55e" : "#ef4444"} />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent, iconFlip = false }: {
  icon: any; label: string; value: string; accent: string; iconFlip?: boolean;
}) {
  return (
    <div style={{
      background: `${accent}10`, border: `1px solid ${accent}25`,
      borderRadius: 10, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Icon size={12} color={accent} style={iconFlip ? { transform: "rotate(180deg)" } : {}} />
        <span style={{ fontSize: 10, color: accent, letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#e8eaf0" }}>{value}</div>
    </div>
  );
}

function SpeedBadges({ down, up }: { down?: string; up?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      <div style={{
        padding: "8px 16px",
        background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
        borderRadius: 20, fontSize: 14, fontWeight: 600, color: "#86efac",
      }}>↓ {formatSpeed(down ?? null)}</div>
      <div style={{
        padding: "8px 16px",
        background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.3)",
        borderRadius: 20, fontSize: 14, fontWeight: 600, color: "#7dd3fc",
      }}>↑ {formatSpeed(up ?? null)}</div>
    </div>
  );
}
