// @ts-nocheck
/**
 * frontend/src/pages/LibreQoSPage.tsx  — v3.12.2
 *
 * Admin page for LibreQoS integration management.
 * Sections:
 *   1. Status overview (lqosd health, last sync, config summary)
 *   2. Configuration editor
 *   3. Manual sync trigger
 *   4. Live throughput (fetched from lqosd via backend proxy)
 *   5. Top downloaders
 *   6. Worst RTT hosts
 *   7. Sync audit log
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw, Settings, Activity, Wifi, WifiOff,
  AlertTriangle, CheckCircle, Clock, Zap, TrendingDown, Radio,
  ChevronDown, ChevronRight, Save, Play, BarChart2
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibreQoSConfig {
  id: number;
  enabled: boolean;
  api_url: string;
  api_key_set: boolean;
  shaped_devices_path: string;
  network_json_path: string;
  sync_interval_mins: number;
  bandwidth_overhead_factor: number;
  min_rate_mbps: number;
  flat_topology: boolean;
  auto_reload: boolean;
  api_timeout_ms: number;
  libreqos_script_path: string;
  libreqos_python: string;
  lqos_username: string;
  lqos_password_set: boolean;
}

interface SyncLogEntry {
  triggered_by: string;
  circuits_written: number | null;
  reload_ok: boolean | null;
  reload_status: number | null;
  error_message: string | null;
  duration_ms: number;
  synced_at: string;
}

interface StatusInfo {
  enabled: boolean;
  api_url: string;
  sync_interval_mins: number;
  auto_reload: boolean;
  flat_topology: boolean;
  libreqos_script_path: string;
  lqos_username: string;
  lqosd_health: { httpStatus?: number; body?: unknown; error?: string } | null;
  last_sync: SyncLogEntry | null;
}

// IpStatsWithPlan — from TopDownloads / WorstRTT pub-sub channels
// (lqosd ws/ticker/ipstats_conversion.rs)
interface IpStatsPlan {
  ip_address: string;
  bits_per_second: { down: number; up: number };
  median_tcp_rtt: number;
  circuit_id: string;
  plan: { down: number; up: number };
}

// ShapedDevice — from DevicesAll / CircuitByIdResult
// (lqos_config shaped_device.rs)
interface ShapedDevice {
  circuit_id: string;
  circuit_name: string;
  device_id: string;
  device_name: string;
  download_max_mbps: number;
  upload_max_mbps: number;
}

type Circuit = IpStatsPlan | ShapedDevice;

// ── API helpers ───────────────────────────────────────────────────────────────

const API = "/api/admin/libreqos";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function fmtMbps(bps: number): string {
  const mbps = (bps * 8) / 1_000_000;
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
      <Clock className="w-3 h-3" /> {label}
    </span>
  );
  return ok ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
      <CheckCircle className="w-3 h-3" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
      <AlertTriangle className="w-3 h-3" /> {label}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Section({
  title, icon, children, collapsible = false
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode; collapsible?: boolean
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => collapsible && setOpen(!open)}
        disabled={!collapsible}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          {icon} {title}
        </h2>
        {collapsible && (open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />)}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LibreQoSPage() {
  const navigate = useNavigate();

  const [status, setStatus]     = useState<StatusInfo | null>(null);
  const [config, setConfig]     = useState<LibreQoSConfig | null>(null);
  const [syncLog, setSyncLog]   = useState<SyncLogEntry[]>([]);
  const [circuits, setCircuits] = useState<ShapedDevice[]>([]);
  const [topDL, setTopDL]       = useState<IpStatsPlan[]>([]);
  const [worstRtt, setWorstRtt] = useState<IpStatsPlan[]>([]);

  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [saveMsg, setSaveMsg]         = useState<string | null>(null);

  // Config form state
  const [form, setForm] = useState<Partial<LibreQoSConfig & {
    api_key?: string; lqos_password?: string
  }>>({});

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, log] = await Promise.all([
        apiFetch<StatusInfo>("/status"),
        apiFetch<LibreQoSConfig>("/config"),
        apiFetch<SyncLogEntry[]>("/sync-log?limit=20"),
      ]);
      setStatus(s);
      setConfig(c);
      setSyncLog(log);
      setForm({
        enabled:                  c.enabled,
        api_url:                  c.api_url,
        shaped_devices_path:      c.shaped_devices_path,
        network_json_path:        c.network_json_path,
        sync_interval_mins:       c.sync_interval_mins,
        bandwidth_overhead_factor: c.bandwidth_overhead_factor,
        min_rate_mbps:            c.min_rate_mbps,
        flat_topology:            c.flat_topology,
        auto_reload:              c.auto_reload,
        api_timeout_ms:           c.api_timeout_ms,
        libreqos_script_path:     c.libreqos_script_path,
        libreqos_python:          c.libreqos_python,
        lqos_username:            c.lqos_username,
      });
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadPage(); }, [loadPage]);

  const loadLiveData = async () => {
    if (!status?.enabled) return;
    setLiveLoading(true);
    try {
      const [c, t, r] = await Promise.all([
        apiFetch<Circuit[]>("/circuits").catch(() => []),
        apiFetch<Circuit[]>("/top-downloaders?n=10").catch(() => []),
        apiFetch<Circuit[]>("/worst-rtt?n=10").catch(() => []),
      ]);
      setCircuits(Array.isArray(c) ? c : []);
      setTopDL(Array.isArray(t) ? t : []);
      setWorstRtt(Array.isArray(r) ? r : []);
    } catch { /* non-fatal */ }
    setLiveLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; circuitCount?: number; reloadOk?: boolean; durationMs?: number; error?: string }>("/sync", { method: "POST" });
      if (!result.ok) setError(result.error || "Sync failed");
      await loadPage();
    } catch (e) {
      setError((e as Error).message);
    }
    setSyncing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      await apiFetch("/config", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setSaveMsg("Configuration saved successfully.");
      await loadPage();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  const setF = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }));

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading LibreQoS...
    </div>
  );

  const isHealthy = status?.lqosd_health?.httpStatus === 200;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-indigo-600" />
            LibreQoS Integration
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage CAKE+HTB traffic shaping via LibreQoS (v2.x)
          </p>
        </div>
        <button
          onClick={loadPage}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Status Overview */}
      <Section title="Status Overview" icon={<Activity className="w-4 h-4 text-indigo-500" />}>
        <div className="grid grid-cols-2 md:grid-cols-2 sm:grid-cols-4 gap-3">

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Integration</p>
            <StatusBadge ok={status?.enabled ?? false} label={status?.enabled ? "Enabled" : "Disabled"} />
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">lqosd Health</p>
            {status?.enabled ? (
              <StatusBadge ok={isHealthy} label={isHealthy ? "Online" : "Offline"} />
            ) : (
              <span className="text-xs text-gray-400">N/A</span>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Last Sync</p>
            {status?.last_sync ? (
              <div className="space-y-1">
                <StatusBadge ok={status.last_sync.reload_ok} label={status.last_sync.reload_ok === false ? "Failed" : status.last_sync.reload_ok === null ? "No reload" : "OK"} />
                <p className="text-xs text-gray-400">{timeSince(status.last_sync.synced_at)}</p>
              </div>
            ) : (
              <span className="text-xs text-gray-400">Never</span>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Circuits Written</p>
            <p className="text-lg font-semibold text-gray-800">
              {status?.last_sync?.circuits_written ?? "—"}
            </p>
          </div>
        </div>

        {/* Last sync error */}
        {status?.last_sync?.error_message && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 font-mono break-all">
            {status.last_sync.error_message}
          </div>
        )}

        {/* Sync button */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing || !status?.enabled}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition"
          >
            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {syncing ? "Syncing…" : "Manual Sync Now"}
          </button>
          <p className="text-xs text-gray-400">
            Auto-sync every {status?.sync_interval_mins ?? "?"}m
            {status?.auto_reload ? " + auto-reload" : ""}
          </p>
        </div>
      </Section>

      {/* Configuration */}
      <Section title="Configuration" icon={<Settings className="w-4 h-4 text-gray-500" />} collapsible>
        <div className="space-y-4">

          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" className="sr-only peer"
                checked={form.enabled ?? false}
                onChange={e => setF("enabled", e.target.checked)} />
              <div className="w-10 h-5 bg-gray-200 peer-checked:bg-indigo-600 rounded-full transition"></div>
              <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition peer-checked:translate-x-5"></div>
            </div>
            <span className="text-sm font-medium text-gray-700">Enable LibreQoS Integration</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* lqosd URL */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                lqosd URL <span className="text-gray-400">(port 9123)</span>
              </label>
              <input type="text" value={form.api_url ?? ""} onChange={e => setF("api_url", e.target.value)}
                placeholder="http://localhost:9123"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>

            {/* Sync interval */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sync Interval (minutes)</label>
              <input type="number" min={1} max={60} value={form.sync_interval_mins ?? 5} onChange={e => setF("sync_interval_mins", parseInt(e.target.value))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>

            {/* ShapedDevices path */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ShapedDevices.csv Path</label>
              <input type="text" value={form.shaped_devices_path ?? ""} onChange={e => setF("shaped_devices_path", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono" />
            </div>

            {/* network.json path */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">network.json Path</label>
              <input type="text" value={form.network_json_path ?? ""} onChange={e => setF("network_json_path", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono" />
            </div>

            {/* Script path */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">LibreQoS.py Script Path</label>
              <input type="text" value={form.libreqos_script_path ?? ""} onChange={e => setF("libreqos_script_path", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono" />
            </div>

            {/* Python executable */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Python Executable</label>
              <input type="text" value={form.libreqos_python ?? "python3"} onChange={e => setF("libreqos_python", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono" />
            </div>

            {/* lqosd username */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">lqosd Username</label>
              <input type="text" value={form.lqos_username ?? "admin"} onChange={e => setF("lqos_username", e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>

            {/* lqosd password */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                lqosd Password {config?.lqos_password_set && <span className="text-indigo-500">(set)</span>}
              </label>
              <input type="password" value={form.lqos_password ?? ""} onChange={e => setF("lqos_password", e.target.value)}
                placeholder={config?.lqos_password_set ? "Leave blank to keep current" : "Enter password"}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>

            {/* BW overhead */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Bandwidth Overhead Factor <span className="text-gray-400">(1.15 = 15% headroom)</span>
              </label>
              <input type="number" step={0.01} min={1.0} max={2.0} value={form.bandwidth_overhead_factor ?? 1.15} onChange={e => setF("bandwidth_overhead_factor", parseFloat(e.target.value))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>

            {/* Min rate */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Rate Mbps (guaranteed per circuit)</label>
              <input type="number" step={0.1} min={1.0} value={form.min_rate_mbps ?? 1.0} onChange={e => setF("min_rate_mbps", parseFloat(e.target.value))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.flat_topology ?? true} onChange={e => setF("flat_topology", e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              <span className="text-sm text-gray-700">Flat Topology</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.auto_reload ?? true} onChange={e => setF("auto_reload", e.target.checked)}
                className="rounded border-gray-300 text-indigo-600" />
              <span className="text-sm text-gray-700">Auto-reload after sync</span>
            </label>
          </div>

          {saveMsg && (
            <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> {saveMsg}
            </div>
          )}

          <div className="pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Configuration"}
            </button>
          </div>

          {/* Sudoers reminder */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Required: sudoers entry for reload</p>
            <p className="font-mono bg-amber-100 rounded px-2 py-1">
              mikrobill ALL=(ALL) NOPASSWD: /usr/bin/python3 {form.libreqos_script_path || "/opt/libreqos/src/LibreQoS.py"}
            </p>
            <p>Run <code className="bg-amber-100 px-1 rounded">sudo visudo</code> and add the line above for the MikroBill process user.</p>
          </div>
        </div>
      </Section>

      {/* Live Data */}
      {status?.enabled && (
        <Section title="Live Stats" icon={<Zap className="w-4 h-4 text-yellow-500" />} collapsible>
          <div className="mb-3">
            <button onClick={loadLiveData} disabled={liveLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition">
              {liveLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Fetch Live Data from lqosd
            </button>
          </div>

          {/* Top Downloaders */}
          {topDL.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Top Downloaders
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="pb-1 pr-4">Circuit</th>
                      <th className="pb-1 pr-4">Download</th>
                      <th className="pb-1">Upload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDL.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 font-mono text-gray-700 truncate max-w-[200px]">
                          {c.circuit_id || "—"}
                        </td>
                        <td className="py-1.5 pr-4 text-indigo-600 font-medium">
                          {c.bits_per_second ? fmtMbps(c.bits_per_second.down) : "—"}
                        </td>
                        <td className="py-1.5 text-emerald-600 font-medium">
                          {c.bits_per_second ? fmtMbps(c.bits_per_second.up) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Worst RTT */}
          {worstRtt.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5" /> Worst Latency (RTT)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="pb-1 pr-4">Circuit</th>
                      <th className="pb-1">Median RTT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstRtt.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 font-mono text-gray-700 truncate max-w-[200px]">
                          {c.circuit_id || "—"}
                        </td>
                        <td className={`py-1.5 font-medium ${
                            (c.median_tcp_rtt ?? 0) > 100 ? "text-red-600" :
                            (c.median_tcp_rtt ?? 0) > 50  ? "text-amber-600" : "text-green-600"
                          }`}>
                          {c.median_tcp_rtt != null ? `${c.median_tcp_rtt.toFixed(1)} ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {topDL.length === 0 && worstRtt.length === 0 && !liveLoading && (
            <p className="text-sm text-gray-400 text-center py-4">Click "Fetch Live Data" to load stats from lqosd.</p>
          )}
        </Section>
      )}

      {/* Sync Log */}
      <Section title="Sync Log" icon={<Clock className="w-4 h-4 text-gray-500" />} collapsible>
        {syncLog.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No sync history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Trigger</th>
                  <th className="pb-2 pr-4">Circuits</th>
                  <th className="pb-2 pr-4">Reload</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {syncLog.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{timeSince(row.synced_at)}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        row.triggered_by === "manual" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      }`}>{row.triggered_by}</span>
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{row.circuits_written ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {row.reload_ok === true  && <span className="text-green-600">✓ OK</span>}
                      {row.reload_ok === false && <span className="text-red-600">✗ Failed</span>}
                      {row.reload_ok === null  && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{row.duration_ms != null ? fmtMs(row.duration_ms) : "—"}</td>
                    <td className="py-2 text-red-600 font-mono truncate max-w-[200px]">{row.error_message || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

    </div>
  );
}
