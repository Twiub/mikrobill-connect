/**
 * frontend/src/components/DumbApTab.tsx — v3.21.0
 *
 * Dumb APs tab — full monitoring dashboard.
 *
 * Features:
 *   - AP list with live online/offline status, VLAN, mgmt IP
 *   - Click any AP row to expand:
 *       • Summary stats (total download, upload, active clients, peak clients)
 *       • Period selector (1h / 6h / 24h / 7d / 30d)
 *       • Hourly traffic bar chart (rx=blue, tx=amber, inline SVG)
 *       • Connected clients table (MAC, subscriber name/phone, bytes, last seen)
 *       • Click any client → modal with their full traffic history across all APs
 *       • "Poll now" debug button (triggers immediate MikroTik poll)
 *   - Register AP dialog (VLAN auto-provisioned on MikroTik)
 *   - Config snippet dialog (one-time paste into AP UI)
 *   - Retry provisioning / Delete AP
 *   - Auto-refresh every 30 s
 *
 * API endpoints used (all now registered in index.js v3.20.7):
 *   GET  /api/admin/apdesk/dumb-aps                      list
 *   POST /api/admin/apdesk/dumb-aps                      register
 *   DELETE /api/admin/apdesk/dumb-aps/:id                delete
 *   POST /api/admin/apdesk/dumb-aps/:id/retry            retry
 *   GET  /api/admin/apdesk/dumb-aps/:id/config           config snippet
 *   GET  /api/admin/apdesk/aps/:id/traffic?period=       hourly chart
 *   GET  /api/admin/apdesk/aps/:id/clients?period=       client table
 *   GET  /api/admin/apdesk/clients/:mac/traffic?period=  client drill-down
 *   POST /api/admin/apdesk/aps/:id/poll-now              force poll
 */

import React, { useEffect, useState, useCallback } from "react";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import { Badge }   from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/authClient";
import {
  Wifi, ChevronDown, ChevronRight, RefreshCw, Trash2,
  Users, Activity, ArrowDown, ArrowUp, Clock, Radio,
  AlertTriangle, CheckCircle2, XCircle, BarChart2, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

const API = (window as Window & { __MIKROBILL_API__?: string }).__MIKROBILL_API__
  ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok && !json.partial) throw new Error(json.error || `HTTP ${r.status}`);
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Router {
  id: string; name: string; ip_address: string;
  ip_slot: number | null; status: string;
}

interface DumbAp {
  ap_id: number; ap_name: string; ap_mac: string; ap_ip: string;
  status: "online" | "offline";
  last_contact: string | null;
  vlan_id: number; mgmt_ip: string; vlan_iface_name: string;
  provision_state: "pending" | "provisioned" | "failed" | "deprovisioned";
  provision_error: string | null; provisioned_at: string | null;
  router_id: string; router_name: string; router_ip: string; ip_slot: number;
}

interface TrafficHour {
  hour: string;
  rx_bytes: number; tx_bytes: number;
  client_count: number;
}

interface ApClient {
  client_mac: string; ssid: string;
  total_rx: number; total_tx: number;
  last_seen: string;
  subscriber_name: string | null; subscriber_phone: string | null;
}

interface ClientApTraffic {
  ap_id: number; ap_name: string; hour: string;
  rx_bytes: number; tx_bytes: number;
}

type Period = "1h" | "6h" | "24h" | "7d" | "30d";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (!b || b < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function fmtHour(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Period selector (shared)
// ─────────────────────────────────────────────────────────────────────────────

function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1">
      {(["1h", "6h", "24h", "7d", "30d"] as Period[]).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors
            ${value === p
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini bar chart — inline SVG, no external deps
// ─────────────────────────────────────────────────────────────────────────────

function TrafficBars({ data }: { data: TrafficHour[] }) {
  const W = 600; const H = 120; const PAD = 4;
  const barW = Math.max(2, Math.floor((W - PAD * 2) / Math.max(data.length, 1)) - 1);
  const maxVal = Math.max(...data.map(d => Number(d.rx_bytes) + Number(d.tx_bytes)), 1);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground">
        No traffic data for this period
      </div>
    );
  }

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {data.map((d, i) => {
          const rx  = Number(d.rx_bytes); const tx = Number(d.tx_bytes);
          const tot = rx + tx;
          const barH = Math.max(1, (tot / maxVal) * (H - PAD * 2));
          const rxH  = Math.max(0, (rx / maxVal)  * (H - PAD * 2));
          const txH  = barH - rxH;
          const x    = PAD + i * (barW + 1);
          const y    = H - PAD - barH;
          return (
            <g key={i}>
              <rect x={x} y={y}        width={barW} height={txH} fill="#f59e0b" opacity={0.85} rx={1} />
              <rect x={x} y={y + txH}  width={barW} height={rxH} fill="#3b82f6" opacity={0.85} rx={1} />
              <title>{fmtHour(d.hour)} · ↓{fmtBytes(rx)} ↑{fmtBytes(tx)} · {d.client_count} clients</title>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm bg-blue-500" />Download
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />Upload
        </span>
        <span className="ml-auto">
          Total: ↓{fmtBytes(data.reduce((s, d) => s + Number(d.rx_bytes), 0))}
          {" "}↑{fmtBytes(data.reduce((s, d) => s + Number(d.tx_bytes), 0))}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-across-all-APs modal
// ─────────────────────────────────────────────────────────────────────────────

function ClientDetailModal({
  mac, name, onClose,
}: { mac: string; name: string | null; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("24h");
  const [rows, setRows]     = useState<ClientApTraffic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/admin/apdesk/clients/${encodeURIComponent(mac)}/traffic?period=${period}`)
      .then(r => setRows(r.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [mac, period]);

  const totalRx = rows.reduce((s, r) => s + Number(r.rx_bytes), 0);
  const totalTx = rows.reduce((s, r) => s + Number(r.tx_bytes), 0);
  const apCount = new Set(rows.map(r => r.ap_id)).size;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-500" />
            {name ?? "Unknown subscriber"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">{mac}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <PeriodPicker value={period} onChange={setPeriod} />

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Downloaded", value: fmtBytes(totalRx), icon: <ArrowDown className="h-3 w-3 text-blue-500" /> },
              { label: "Uploaded",   value: fmtBytes(totalTx), icon: <ArrowUp   className="h-3 w-3 text-amber-500" /> },
              { label: "APs seen",   value: String(apCount),   icon: <Wifi      className="h-3 w-3 text-green-500" /> },
            ].map(s => (
              <div key={s.label} className="rounded-lg border border-border/40 bg-muted/30 p-3">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                  {s.icon}{s.label}
                </div>
                <p className="text-sm font-semibold">{s.value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="text-center text-xs text-muted-foreground py-8">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              No traffic data for this period
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">AP</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Time</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">↓ Down</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">↑ Up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{r.ap_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtHour(r.hour)}</td>
                      <td className="px-3 py-2 text-right text-blue-600">{fmtBytes(Number(r.rx_bytes))}</td>
                      <td className="px-3 py-2 text-right text-amber-600">{fmtBytes(Number(r.tx_bytes))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AP detail panel (expands inline below the AP row)
// ─────────────────────────────────────────────────────────────────────────────

function ApDetailPanel({ ap }: { ap: DumbAp }) {
  const [period, setPeriod]   = useState<Period>("24h");
  const [traffic, setTraffic] = useState<TrafficHour[]>([]);
  const [clients, setClients] = useState<ApClient[]>([]);
  const [loadingT, setLT]     = useState(true);
  const [loadingC, setLC]     = useState(true);
  const [drillMac, setDrillMac] = useState<{ mac: string; name: string | null } | null>(null);
  const { toast } = useToast();

  const fetchTraffic = useCallback(() => {
    setLT(true);
    apiFetch(`/admin/apdesk/aps/${ap.ap_id}/traffic?period=${period}`)
      .then(r => setTraffic(r.data ?? []))
      .catch(() => setTraffic([]))
      .finally(() => setLT(false));
  }, [ap.ap_id, period]);

  const fetchClients = useCallback(() => {
    setLC(true);
    apiFetch(`/admin/apdesk/aps/${ap.ap_id}/clients?period=${period}`)
      .then(r => setClients(r.data ?? []))
      .catch(() => setClients([]))
      .finally(() => setLC(false));
  }, [ap.ap_id, period]);

  useEffect(() => { fetchTraffic(); fetchClients(); }, [fetchTraffic, fetchClients]);

  const pollNow = async () => {
    try {
      await apiFetch(`/admin/apdesk/aps/${ap.ap_id}/poll-now`, { method: "POST" });
      toast({ title: "Poll triggered", description: "Data will update in ~30 seconds" });
      setTimeout(() => { fetchTraffic(); fetchClients(); }, 8000);
    } catch (err) {
      toast({ title: "Poll failed", description: String(err), variant: "destructive" });
    }
  };

  const totalRx      = traffic.reduce((s, d) => s + Number(d.rx_bytes), 0);
  const totalTx      = traffic.reduce((s, d) => s + Number(d.tx_bytes), 0);
  const peakClients  = traffic.reduce((m, d) => Math.max(m, d.client_count), 0);

  return (
    <div className="border-t border-border/40 bg-muted/20 px-4 py-4 space-y-4">

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Downloaded",     value: fmtBytes(totalRx),       icon: <ArrowDown  className="h-3.5 w-3.5 text-blue-500" />,   sub: `last ${period}` },
          { label: "Uploaded",       value: fmtBytes(totalTx),       icon: <ArrowUp    className="h-3.5 w-3.5 text-amber-500" />, sub: `last ${period}` },
          { label: "Clients seen",   value: String(clients.length),  icon: <Users      className="h-3.5 w-3.5 text-green-500" />,  sub: `last ${period}` },
          { label: "Peak per hour",  value: String(peakClients),     icon: <Activity   className="h-3.5 w-3.5 text-purple-500" />, sub: "highest single hour" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border/40 bg-card p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
              {s.icon}{s.label}
            </div>
            <p className="text-base font-semibold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Period + Poll now */}
      <div className="flex items-center justify-between">
        <PeriodPicker value={period} onChange={setPeriod} />
        <Button size="sm" variant="outline" onClick={pollNow} className="h-7 text-xs gap-1.5">
          <RefreshCw className="h-3 w-3" /> Poll now
        </Button>
      </div>

      {/* Traffic chart */}
      <div className="rounded-lg border border-border/40 bg-card p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <BarChart2 className="h-3.5 w-3.5" /> Hourly Traffic
        </p>
        {loadingT
          ? <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
          : <TrafficBars data={traffic} />
        }
      </div>

      {/* Clients table */}
      <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
        <div className="px-3 py-2 bg-muted/40 border-b border-border/30 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Clients
            {!loadingC && <span className="text-foreground ml-1">{clients.length}</span>}
          </p>
          <p className="text-[10px] text-muted-foreground">Click a row to see full history</p>
        </div>

        {loadingC ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading clients…</div>
        ) : clients.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No clients seen in the last {period}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20">
                <tr>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">MAC / Subscriber</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">↓ Downloaded</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">↑ Uploaded</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {clients.map(c => (
                  <tr
                    key={c.client_mac}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setDrillMac({ mac: c.client_mac, name: c.subscriber_name })}
                    title="Click to view full traffic history across all APs"
                  >
                    <td className="px-3 py-2">
                      <p className="font-mono text-[10px] text-muted-foreground">{c.client_mac}</p>
                      {c.subscriber_name
                        ? <p className="font-medium mt-0.5">{c.subscriber_name}</p>
                        : <p className="text-muted-foreground mt-0.5 italic text-[10px]">unknown subscriber</p>
                      }
                      {c.subscriber_phone && (
                        <p className="text-[10px] text-muted-foreground">{c.subscriber_phone}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-600 font-mono tabular-nums">
                      {fmtBytes(Number(c.total_rx))}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-600 font-mono tabular-nums">
                      {fmtBytes(Number(c.total_tx))}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {timeAgo(c.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drillMac && (
        <ClientDetailModal
          mac={drillMac.mac}
          name={drillMac.name}
          onClose={() => setDrillMac(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config snippet dialog
// ─────────────────────────────────────────────────────────────────────────────

function ConfigSnippetDialog({ apId, apName, onClose }: {
  apId: number; apName: string; onClose: () => void;
}) {
  const [snippet, setSnippet] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    apiFetch(`/admin/apdesk/dumb-aps/${apId}/config`)
      .then(r => setSnippet(r.data?.config_text || ""))
      .catch(() => setSnippet("Failed to load config"))
      .finally(() => setLoading(false));
  }, [apId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>AP Config — {apName}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Paste these settings into the AP's management interface once.
            After saving, MikroBill will detect the AP automatically within 5 minutes.
          </p>
          {loading
            ? <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            : <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono whitespace-pre overflow-x-auto border border-border/40">{snippet}</pre>
          }
          <Button variant="outline" size="sm"
            onClick={() => { navigator.clipboard.writeText(snippet).catch(() => {}); toast({ title: "Copied" }); }}>
            Copy to clipboard
          </Button>
        </div>
        <DialogFooter><Button onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add AP dialog
// ─────────────────────────────────────────────────────────────────────────────

function AddDumbApDialog({ routers, onSaved, onClose }: {
  routers: Router[];
  onSaved: (result: { vlan_id: number; mgmt_ip: string; config_snippet: string }) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", mac: "", router_id: "", hardware: "", description: "", bridge_iface: "bridge1",
  });
  const eligible = routers.filter(r => r.ip_slot !== null);

  const save = async () => {
    if (!form.name || !form.mac || !form.router_id) {
      toast({ title: "Name, MAC and Router are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/admin/apdesk/dumb-aps", {
        method: "POST", body: JSON.stringify(form),
      });
      if (res.partial) {
        toast({ title: "AP saved but provisioning failed", description: res.error, variant: "destructive" });
        onClose(); return;
      }
      toast({ title: `AP "${form.name}" registered`, description: `VLAN ${res.data.vlan_id} · ${res.data.mgmt_ip}` });
      onSaved(res.data);
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Register Dumb AP</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="rounded-lg border border-border/40 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AP Details</p>
            <div>
              <Label className="text-xs">Name *</Label>
              <Input className="mt-1" placeholder="e.g. Block A Rooftop"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">AP MAC Address *</Label>
              <Input className="mt-1" placeholder="AA:BB:CC:DD:EE:FF"
                value={form.mac} onChange={e => setForm(p => ({ ...p, mac: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground mt-0.5">The AP's hardware MAC. Used for DHCP reservation.</p>
            </div>
            <div>
              <Label className="text-xs">Hardware Model</Label>
              <Input className="mt-1" placeholder="e.g. ubiquiti-liteap-ac"
                value={form.hardware} onChange={e => setForm(p => ({ ...p, hardware: e.target.value }))} />
            </div>
          </div>

          <div className="rounded-lg border border-border/40 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">MikroTik Router</p>
            <div>
              <Label className="text-xs">Router *</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.router_id}
                onChange={e => setForm(p => ({ ...p, router_id: e.target.value }))}
              >
                <option value="">Select a router…</option>
                {eligible.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.ip_address}) — slot {r.ip_slot}
                  </option>
                ))}
              </select>
              {routers.length > eligible.length && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {routers.length - eligible.length} router(s) hidden — no ip_slot assigned.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Bridge Interface</Label>
              <Input className="mt-1" placeholder="bridge1"
                value={form.bridge_iface}
                onChange={e => setForm(p => ({ ...p, bridge_iface: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground mt-0.5">The MikroTik bridge the AP port is on. Usually "bridge1".</p>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-semibold">What MikroBill will do automatically:</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
              <li>Assign the next free VLAN ID on this router (starting from 100)</li>
              <li>Assign a management IP from 10.200.&lt;slot&gt;.0/24</li>
              <li>Create the VLAN interface on MikroTik bridge</li>
              <li>Create DHCP server + static reservation for this AP's MAC</li>
              <li>Show you the config to paste into the AP (one time)</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name || !form.mac || !form.router_id}>
            {saving ? "Provisioning…" : "Register AP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AP row (expandable)
// ─────────────────────────────────────────────────────────────────────────────

function ApRow({ ap, onDelete, onRetry, onConfig }: {
  ap: DumbAp;
  onDelete: (ap: DumbAp) => void;
  onRetry:  (ap: DumbAp) => void;
  onConfig: (ap: DumbAp) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isOnline  = ap.status === "online";
  const isFailed  = ap.provision_state === "failed";
  const isPending = ap.provision_state === "pending";

  return (
    <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
      {/* Collapsed header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Status icon */}
        <div className="flex-shrink-0">
          {isOnline   ? <CheckCircle2  className="h-4 w-4 text-green-500" />
           : isFailed  ? <AlertTriangle className="h-4 w-4 text-amber-500" />
           : isPending ? <Clock         className="h-4 w-4 text-muted-foreground animate-pulse" />
           :             <XCircle       className="h-4 w-4 text-red-400" />}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{ap.ap_name}</p>
            <Badge variant="outline" className="font-mono text-[10px]">VLAN {ap.vlan_id}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">{ap.mgmt_ip}</Badge>
            <Badge variant="outline" className={`text-[10px] ${
              isOnline   ? "text-green-600 border-green-400"  :
              isFailed   ? "text-amber-600 border-amber-400"  :
              isPending  ? "text-muted-foreground"            :
                           "text-red-500 border-red-300"
            }`}>
              {isFailed ? "prov failed" : isPending ? "pending" : ap.status}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {ap.ap_mac} · {ap.router_name}
            {" · "}
            {isOnline ? `seen ${timeAgo(ap.last_contact)}` : `offline ${timeAgo(ap.last_contact)}`}
          </p>
          {isFailed && ap.provision_error && (
            <p className="text-[10px] text-amber-600 mt-0.5 truncate">{ap.provision_error}</p>
          )}
        </div>

        {/* Action buttons — stopPropagation so click doesn't also toggle expand */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
            onClick={() => onConfig(ap)}>
            Config
          </Button>
          {isFailed && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
              onClick={() => onRetry(ap)}>
              Retry
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => onDelete(ap)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Chevron */}
        <div className="flex-shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && <ApDetailPanel ap={ap} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main DumbApTab
// ─────────────────────────────────────────────────────────────────────────────

export default function DumbApTab() {
  const { toast } = useToast();
  const [aps, setAps]         = useState<DumbAp[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [configAp, setConfigAp] = useState<DumbAp | null>(null);
  const [newApResult, setNewApResult] = useState<{
    vlan_id: number; mgmt_ip: string; config_snippet: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [apRes, rRes] = await Promise.all([
        apiFetch("/admin/apdesk/dumb-aps"),
        apiFetch("/admin/routers"),
      ]);
      setAps(apRes.data || []);
      setRouters(rRes.data || []);
    } catch (err) {
      toast({ title: "Load failed", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const deleteAp = async (ap: DumbAp) => {
    if (!confirm(`Delete "${ap.ap_name}"? This will remove VLAN ${ap.vlan_id} from MikroTik.`)) return;
    try {
      await apiFetch(`/admin/apdesk/dumb-aps/${ap.ap_id}`, { method: "DELETE" });
      toast({ title: "AP deleted" });
      load();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  const retryProvision = async (ap: DumbAp) => {
    try {
      await apiFetch(`/admin/apdesk/dumb-aps/${ap.ap_id}/retry`, { method: "POST" });
      toast({ title: "Provisioning succeeded" });
      load();
    } catch (err) {
      toast({ title: "Retry failed", description: String(err), variant: "destructive" });
    }
  };

  const online  = aps.filter(a => a.status === "online").length;
  const offline = aps.filter(a => a.status === "offline").length;
  const failed  = aps.filter(a => a.provision_state === "failed").length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            Dumb Access Points
          </h2>
          {!loading && aps.length > 0 && (
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />{online} online
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />{offline} offline
              </span>
              {failed > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />{failed} prov failed
                </span>
              )}
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Register AP</Button>
      </div>

      {/* New AP provisioning result banner */}
      {newApResult && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-700 p-4 space-y-2">
          <div className="flex items-start justify-between">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
              ✅ AP provisioned — VLAN {newApResult.vlan_id} · Management IP {newApResult.mgmt_ip}
            </p>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-700"
              onClick={() => setNewApResult(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-green-700 dark:text-green-400">
            Paste the config below into your AP's management interface, then save.
            The AP will appear online within 5 minutes.
          </p>
          <pre className="rounded bg-white dark:bg-black/30 border border-green-200 dark:border-green-800 text-xs font-mono px-3 py-2 overflow-x-auto whitespace-pre">
            {newApResult.config_snippet}
          </pre>
          <Button size="sm" variant="outline" onClick={() => {
            navigator.clipboard.writeText(newApResult.config_snippet).catch(() => {});
            toast({ title: "Copied" });
          }}>Copy config</Button>
        </div>
      )}

      {/* AP list */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>
      ) : aps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-12 text-center">
          <Wifi className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No dumb APs registered.</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Register AP" to add one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {aps.map(ap => (
            <ApRow
              key={ap.ap_id}
              ap={ap}
              onDelete={deleteAp}
              onRetry={retryProvision}
              onConfig={setConfigAp}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showAdd && (
        <AddDumbApDialog
          routers={routers}
          onSaved={result => { setShowAdd(false); setNewApResult(result); load(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {configAp && (
        <ConfigSnippetDialog
          apId={configAp.ap_id}
          apName={configAp.ap_name}
          onClose={() => setConfigAp(null)}
        />
      )}
    </div>
  );
}
