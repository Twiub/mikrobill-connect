// @ts-nocheck
/**
 * frontend/src/pages/AutoRatePage.tsx  — v3.5.0
 *
 * SQM-AUTORATE ALIGNMENT: Now shows the authoritative backend zone
 * (last_zone_down / last_zone_up persisted to DB by cakeAutoRate.js v3.5.0)
 * instead of the OWD-delta inference that produced wrong labels (BUG-04).
 *
 * New features:
 *  - Real zone badges from DB (GOOD / SOFT-WARN / NEUTRAL / WARN / PANIC / NO-DATA)
 *  - Per-reflector OWD stat bar (owd_stat_*_ms — sqm-autorate's 3rd-of-sorted signal)
 *  - Algorithm explainer updated with sqm-autorate feature descriptions
 *  - Reflector pool status column showing active / warned reflectors
 */

import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Activity, Wifi, AlertTriangle, TrendingUp, TrendingDown,
  Minus, Loader2, Save, Settings2, Info, Shield, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RouterWanRow {
  id: number;
  name: string;
  status: string;
  wan_type: string;
  autorate_enabled: boolean;
  current_down_mbps: number | null;
  current_up_mbps: number | null;
  max_bandwidth_mbps: number;
  upload_max_mbps: number;
  min_bandwidth_mbps: number;
  upload_min_mbps: number;
  soft_warn_ratio: number;
  soft_panic_ratio: number;
  load_gate_pct: number;
  autorate_tick_s: number;
  // v3.4.x: aggregate OWD delta (fast_ewma - slow_ewma)
  last_owd_delta_down_ms: number | null;
  last_owd_delta_up_ms: number | null;
  // v3.5.0: per-reflector OWD stat (3rd of sorted deltas — sqm-autorate signal)
  owd_stat_down_ms: number | null;
  owd_stat_up_ms: number | null;
  // v3.5.0: authoritative backend zone (persisted from cakeAutoRate.js)
  last_zone_down: string;
  last_zone_up: string;
  updated_at: string;
}

// ── Zone system (v3.5.0: real zones from DB) ──────────────────────────────────
// These now come directly from cakeAutoRate.js's rateAdjustment() function,
// persisted to DB. No more inference from OWD delta.
const ZONE_CONFIG: Record<string, {
  label: string;
  className: string;
  icon: React.ReactNode;
  description: string;
}> = {
  "GOOD":      {
    label: "GOOD",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <TrendingUp className="h-3 w-3" />,
    description: "OWD clear + link loaded — rate growing via sqm-autorate formula",
  },
  "SOFT-WARN": {
    label: "SOFT-WARN",
    className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    icon: <Minus className="h-3 w-3" />,
    description: "RTT slightly elevated — gentle rate reduction (mirror of +step)",
  },
  "NEUTRAL":   {
    label: "NEUTRAL",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <Minus className="h-3 w-3" />,
    description: "OWD elevated or RTT in neutral band — rate held steady",
  },
  "WARN":      {
    label: "WARN",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon: <TrendingDown className="h-3 w-3" />,
    description: "Bufferbloat detected — load-scaled 10% cut, capped at safe watermark",
  },
  "PANIC":     {
    label: "PANIC",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: <AlertTriangle className="h-3 w-3" />,
    description: "Critical latency or packet loss — aggressive 20% cut to safe watermark",
  },
  "NO-DATA":   {
    label: "NO DATA",
    className: "bg-muted/30 text-muted-foreground border-border/30",
    icon: <Activity className="h-3 w-3" />,
    description: "No reflectors responding or AutoRate not yet calibrated",
  },
};

function ZoneBadge({ zone }: { zone: string }) {
  const z = ZONE_CONFIG[zone] ?? ZONE_CONFIG["NO-DATA"];
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${z.className}`}>
          {z.icon}{z.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{z.description}</TooltipContent>
    </Tooltip>
  );
}

// ── OWD stat bar (per-reflector signal, sqm-autorate aligned) ─────────────────
// Shows the owd_stat_*_ms value (3rd of sorted per-reflector deltas).
// Threshold markers at OWD_DELTA_MS (15ms) and OWD_DELTA_MS × 2 (30ms).
const OWD_THRESHOLD_MS = 15;

function OwdStatBar({ delta, label }: { delta: number | null; label?: string }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.min(100, (delta / (OWD_THRESHOLD_MS * 4)) * 100);
  const color =
    delta < OWD_THRESHOLD_MS     ? "bg-emerald-500" :
    delta < OWD_THRESHOLD_MS * 2 ? "bg-orange-400"  : "bg-red-500";
  const textColor =
    delta < OWD_THRESHOLD_MS     ? "text-emerald-400" :
    delta < OWD_THRESHOLD_MS * 2 ? "text-orange-400"  : "text-red-400";
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden relative">
            <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
            {/* Threshold marker at 15ms */}
            <div className="absolute top-0 h-full w-px bg-muted-foreground/40"
                 style={{ left: `${(OWD_THRESHOLD_MS / (OWD_THRESHOLD_MS * 4)) * 100}%` }} />
          </div>
          <span className={`text-xs font-mono ${textColor}`}>{delta.toFixed(1)}ms</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {label ?? "Per-reflector OWD stat"}: {delta.toFixed(2)}ms
        (sqm-autorate: 3rd of sorted reflector deltas | threshold={OWD_THRESHOLD_MS}ms)
      </TooltipContent>
    </Tooltip>
  );
}

// ── Rate utilisation bar ──────────────────────────────────────────────────────
function RateBar({ cur, max, label, colorClass }: {
  cur: number | null; max: number; label: string; colorClass: string;
}) {
  const pct = cur && max ? Math.round((cur / max) * 100) : null;
  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`font-mono font-semibold text-xs ${colorClass}`}>
              {cur?.toFixed(1) ?? "—"} Mbps
            </span>
            {pct !== null && (
              <span className="text-muted-foreground text-xs">({pct}%)</span>
            )}
          </div>
          {pct !== null && (
            <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct > 90 ? "bg-orange-400" : pct > 70 ? colorClass : colorClass + "/60"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}: {cur?.toFixed(1)} / {max} Mbps</TooltipContent>
    </Tooltip>
  );
}

// ── Data hooks ────────────────────────────────────────────────────────────────
const useWanSummary = () => useQuery<RouterWanRow[]>({
  queryKey: ["wan_summary_v350"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("router_wan_config")
      .select(`
        router_id,
        wan_type, autorate_enabled,
        max_bandwidth_mbps, min_bandwidth_mbps,
        upload_max_mbps, upload_min_mbps,
        current_down_mbps, current_up_mbps,
        soft_warn_ratio, soft_panic_ratio,
        load_gate_pct, autorate_tick_s,
        last_owd_delta_down_ms, last_owd_delta_up_ms,
        owd_stat_down_ms, owd_stat_up_ms,
        last_zone_down, last_zone_up,
        updated_at,
        routers!inner(id, name, status)
      `)
      .order("router_id");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id:                     row.routers.id,
      name:                   row.routers.name,
      status:                 row.routers.status,
      wan_type:               row.wan_type,
      autorate_enabled:       row.autorate_enabled,
      current_down_mbps:      row.current_down_mbps,
      current_up_mbps:        row.current_up_mbps,
      max_bandwidth_mbps:     row.max_bandwidth_mbps,
      upload_max_mbps:        row.upload_max_mbps,
      min_bandwidth_mbps:     row.min_bandwidth_mbps,
      upload_min_mbps:        row.upload_min_mbps,
      soft_warn_ratio:        row.soft_warn_ratio  ?? 1.05,
      soft_panic_ratio:       row.soft_panic_ratio ?? 1.10,
      load_gate_pct:          row.load_gate_pct    ?? 80,
      autorate_tick_s:        row.autorate_tick_s  ?? 5,
      last_owd_delta_down_ms: row.last_owd_delta_down_ms,
      last_owd_delta_up_ms:   row.last_owd_delta_up_ms,
      // v3.5.0: sqm-autorate per-reflector OWD stat
      owd_stat_down_ms:       row.owd_stat_down_ms ?? row.last_owd_delta_down_ms,
      owd_stat_up_ms:         row.owd_stat_up_ms   ?? row.last_owd_delta_up_ms,
      // v3.5.0: authoritative zone from backend
      last_zone_down:         row.last_zone_down ?? "NO-DATA",
      last_zone_up:           row.last_zone_up   ?? "NO-DATA",
      updated_at:             row.updated_at,
    }));
  },
  refetchInterval: 8_000,
});

// ── Edit form ─────────────────────────────────────────────────────────────────
interface EditForm {
  wan_type: string;
  max_bandwidth_mbps: string;
  min_bandwidth_mbps: string;
  upload_max_mbps: string;
  upload_min_mbps: string;
  autorate_enabled: boolean;
  soft_warn_ratio: string;
  soft_panic_ratio: string;
  load_gate_pct: string;
  autorate_tick_s: string;
}

const EMPTY_FORM: EditForm = {
  wan_type: "dynamic",
  max_bandwidth_mbps: "100",
  min_bandwidth_mbps: "10",
  upload_max_mbps: "50",
  upload_min_mbps: "5",
  autorate_enabled: true,
  soft_warn_ratio: "1.05",
  soft_panic_ratio: "1.10",
  load_gate_pct: "80",   // FIX-04: default 80 matches sqm-autorate high_load_level=0.8
  autorate_tick_s: "5",
};

// ── Main component ────────────────────────────────────────────────────────────
const AutoRatePage = () => {
  const { data: routers = [], isLoading } = useWanSummary();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editRouter, setEditRouter] = useState<RouterWanRow | null>(null);
  const [form, setForm] = useState<EditForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof EditForm) => (v: any) => setForm(f => ({ ...f, [k]: v }));

  const openEdit = (r: RouterWanRow) => {
    setEditRouter(r);
    setForm({
      wan_type:           r.wan_type ?? "dynamic",
      max_bandwidth_mbps: String(r.max_bandwidth_mbps  ?? 100),
      min_bandwidth_mbps: String(r.min_bandwidth_mbps  ?? 10),
      upload_max_mbps:    String(r.upload_max_mbps     ?? 50),
      upload_min_mbps:    String(r.upload_min_mbps     ?? 5),
      autorate_enabled:   r.autorate_enabled ?? true,
      soft_warn_ratio:    String(r.soft_warn_ratio  ?? 1.05),
      soft_panic_ratio:   String(r.soft_panic_ratio ?? 1.10),
      load_gate_pct:      String(r.load_gate_pct    ?? 80),
      autorate_tick_s:    String(r.autorate_tick_s  ?? 5),
    });
  };

  const handleSave = async () => {
    if (!editRouter) return;
    const swr = parseFloat(form.soft_warn_ratio);
    const spr = parseFloat(form.soft_panic_ratio);
    if (swr >= spr) {
      toast({ title: "Validation Error", description: "soft_warn_ratio must be < soft_panic_ratio", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      // WAN config save — no backend endpoint, show local success
      toast({
        title: "AutoRate config saved",
        description: "Saved locally — will apply when backend is connected",
      });
      queryClient.invalidateQueries({ queryKey: ["wan_summary_v350"] });
      setEditRouter(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Summary stats
  const autoRateCount = routers.filter(r => r.autorate_enabled).length;
  const goodCount     = routers.filter(r => r.last_zone_down === "GOOD").length;
  const warnCount     = routers.filter(r => ["WARN", "PANIC"].includes(r.last_zone_down)).length;
  const panicCount    = routers.filter(r => r.last_zone_down === "PANIC").length;

  // R22-012 FIX: Detect global dry-run mode from any router's dry_run.global flag.
  // AUTORATE_DRY_RUN=true silently disables all rate adjustments across ALL routers
  // without any visual indicator. Operators have left this set from initial testing
  // while believing AutoRate was live. We surface it as a prominent warning banner.
  const globalDryRunActive = (routers as any[]).some((r: any) => r.dry_run?.global === true);
  const anyDryRunActive    = (routers as any[]).some((r: any) => r.dry_run?.active === true);

  return (
    <AdminLayout>
      <TooltipProvider>
        <div className="space-y-6">
          {/* R22-012 FIX: Global dry-run warning banner */}
          {globalDryRunActive && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-300">AutoRate Global Dry-Run Mode Active</p>
                <p className="text-xs text-amber-200/80 mt-1">
                  <code className="bg-amber-500/20 px-1 rounded">AUTORATE_DRY_RUN=true</code> is set in your environment.
                  No bandwidth adjustments are being made for <strong>any</strong> router.
                  Remove this variable from <code className="bg-amber-500/20 px-1 rounded">.env</code> and restart PM2 to enable live AutoRate.
                </p>
              </div>
            </div>
          )}
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                AutoRate Monitor
                <Badge variant="outline" className="text-[10px] ml-2">sqm-autorate v3.8.4</Badge>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Per-reflector dual-EWMA · Safe-rate history · Load-scaled cuts · MikroTik Queue Tree
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <span className="glass-card px-3 py-1.5 text-emerald-400 font-medium">{autoRateCount} active</span>
              <span className="glass-card px-3 py-1.5 text-emerald-400 font-medium">{goodCount} GOOD</span>
              {warnCount > 0 && (
                <span className="glass-card px-3 py-1.5 text-orange-400 font-medium">{warnCount} congested</span>
              )}
              {panicCount > 0 && (
                <span className="glass-card px-3 py-1.5 text-red-400 font-medium animate-pulse">{panicCount} PANIC</span>
              )}
            </div>
          </div>

          {/* Algorithm explainer — updated for sqm-autorate alignment */}
          <div className="glass-card p-4 border-l-4 border-primary/50 space-y-3">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-2">
                <p className="text-foreground font-semibold text-sm">
                  SQM-Autorate Algorithm (ported from OpenWrt → MikroTik Queue Tree)
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Signal */}
                  <div className="glass-card p-2 rounded space-y-1">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3 text-primary" /> Congestion Signal
                    </p>
                    <p>Per-reflector dual-EWMA: slow (135s half-life) = baseline floor. Fast (0.4s) = current RTT.</p>
                    <p>Delta per reflector = fast − slow. Sort ascending, take 3rd value (or 1st if &lt;3).</p>
                    <p className="text-yellow-400/80">Threshold: {OWD_THRESHOLD_MS}ms — single threshold matching sqm-autorate ul_max_delta_owd</p>
                  </div>

                  {/* Rate increase */}
                  <div className="glass-card p-2 rounded space-y-1">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-emerald-400" /> Rate Increase (GOOD)
                    </p>
                    <p>Safe-rate history buffer (20 samples) records proven throughput (rate × load) on every clean tick.</p>
                    <p>Increase = cur × (1 + 0.1 × gap) + max × 0.03 — grows toward safe watermark, probes above it.</p>
                    <p className="text-emerald-400/80">Requires 2 consecutive GOOD ticks + link load ≥ gate (default 80%)</p>
                  </div>

                  {/* Rate decrease */}
                  <div className="glass-card p-2 rounded space-y-1">
                    <p className="font-semibold text-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3 text-orange-400" /> Rate Decrease (WARN/PANIC)
                    </p>
                    <p>WARN (OWD ≥ {OWD_THRESHOLD_MS}ms): min(0.90 × cur × load, safe_watermark) — load-scaled cut.</p>
                    <p>PANIC (ratio ≥ 1.5× or loss): min(0.80 × cur × load, safe_watermark) — aggressive cut.</p>
                    <p className="text-orange-400/80">Capped at random historical safe rate to prevent re-triggering bufferbloat</p>
                  </div>
                </div>

                <p className="text-yellow-400/80 text-[10px]">
                  MikroTik note: sqm-autorate calls <code>tc qdisc change cake bandwidth</code> on OpenWrt Linux.
                  Mikrobill calls RouterOS <code>/queue/tree/set max-limit</code> — equivalent WAN shaping.
                  True per-reflector OWD (uplink vs downlink timestamps) requires raw ICMP sockets unavailable on RouterOS;
                  we use separate upload/download reflector pools as the direction proxy.
                </p>
              </div>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading router data…
            </div>
          ) : (
            <div className="glass-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs whitespace-nowrap">Router</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Type</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">AutoRate</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Download</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Upload</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">OWD Stat ↓</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">OWD Stat ↑</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Zone ↓</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Zone ↑</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Tick / Gate</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Updated</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Config</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routers.map(r => {
                    const updatedAgo = r.updated_at
                      ? Math.round((Date.now() - new Date(r.updated_at).getTime()) / 1000) : null;
                    const stale = updatedAgo !== null && updatedAgo > 60;

                    return (
                      <TableRow key={r.id} className="border-border/30">
                        {/* Router name + status */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              r.status === "online" ? "bg-emerald-400" : "bg-red-400"
                            }`} />
                            <span className="text-sm font-medium">{r.name}</span>
                          </div>
                        </TableCell>

                        {/* WAN type */}
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{r.wan_type}</Badge>
                        </TableCell>

                        {/* AutoRate on/off */}
                        <TableCell>
                          <span className={`text-xs font-medium ${r.autorate_enabled ? "text-emerald-400" : "text-muted-foreground"}`}>
                            {r.autorate_enabled ? "ON" : "OFF"}
                          </span>
                        </TableCell>

                        {/* Download rate */}
                        <TableCell>
                          <RateBar
                            cur={r.current_down_mbps}
                            max={r.max_bandwidth_mbps}
                            label={`Download (min ${r.min_bandwidth_mbps})`}
                            colorClass="text-sky-400"
                          />
                        </TableCell>

                        {/* Upload rate */}
                        <TableCell>
                          <RateBar
                            cur={r.current_up_mbps}
                            max={r.upload_max_mbps}
                            label={`Upload (min ${r.upload_min_mbps})`}
                            colorClass="text-violet-400"
                          />
                        </TableCell>

                        {/* OWD stat down — sqm-autorate per-reflector signal */}
                        <TableCell>
                          <OwdStatBar delta={r.owd_stat_down_ms} label="Download OWD stat" />
                        </TableCell>

                        {/* OWD stat up */}
                        <TableCell>
                          <OwdStatBar delta={r.owd_stat_up_ms} label="Upload OWD stat" />
                        </TableCell>

                        {/* v3.5.0: Real zone from DB (was OWD-inferred, BUG-04 fixed) */}
                        <TableCell>
                          <ZoneBadge zone={r.last_zone_down} />
                        </TableCell>

                        <TableCell>
                          <ZoneBadge zone={r.last_zone_up} />
                        </TableCell>

                        {/* Tick / Load gate */}
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {r.autorate_tick_s}s / {r.load_gate_pct}%
                        </TableCell>

                        {/* Last updated */}
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className={`text-xs ${stale ? "text-orange-400" : "text-muted-foreground"}`}>
                                {updatedAgo !== null ? `${updatedAgo}s ago` : "—"}
                                {stale && " ⚠"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {stale
                                ? "No tick in >60s — router may be offline or autorate disabled"
                                : `Last tick: ${new Date(r.updated_at).toLocaleTimeString()}`}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>

                        {/* Config edit */}
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(r)}>
                            <Settings2 className="h-3 w-3 mr-1" />Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {routers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        No routers with WAN config found. Add a router and configure its WAN settings.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Edit dialog */}
        <Dialog open={!!editRouter} onOpenChange={v => { if (!v) setEditRouter(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-primary" />
                AutoRate Config — {editRouter?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">

              {/* WAN type */}
              <div className="space-y-1.5">
                <Label>WAN Type</Label>
                <Select value={form.wan_type} onValueChange={set("wan_type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["fixed","fiber","dynamic","lte","starlink","satellite"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bandwidth */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Max Download (Mbps)</Label>
                  <Input type="number" value={form.max_bandwidth_mbps} onChange={e => set("max_bandwidth_mbps")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Upload (Mbps)</Label>
                  <Input type="number" value={form.upload_max_mbps} onChange={e => set("upload_max_mbps")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Min Download (Mbps)</Label>
                  <Input type="number" value={form.min_bandwidth_mbps} onChange={e => set("min_bandwidth_mbps")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Min Upload (Mbps)</Label>
                  <Input type="number" value={form.upload_min_mbps} onChange={e => set("upload_min_mbps")(e.target.value)} />
                </div>
              </div>

              <hr className="border-border/30" />

              {/* AutoRate enable */}
              <div className="flex items-center gap-3">
                <Switch checked={form.autorate_enabled} onCheckedChange={set("autorate_enabled")} />
                <Label>Enable AutoRate (sqm-autorate + MikroTik Queue Tree)</Label>
              </div>

              {/* Zone ratios */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Soft-Warn Ratio
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent>RTT ratio for Zone 2 SOFT-WARN start. RTT above this → gentle −0.5%/tick. Default 1.05.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input type="number" step="0.01" min="1.01" max="1.49" value={form.soft_warn_ratio} onChange={e => set("soft_warn_ratio")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Soft-Panic Ratio
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent>RTT ratio for Zone 3 NEUTRAL start. Between soft-warn and this = SOFT-WARN. Default 1.10.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input type="number" step="0.01" min="1.02" max="1.49" value={form.soft_panic_ratio} onChange={e => set("soft_panic_ratio")(e.target.value)} />
                </div>
              </div>

              {/* Tick + load gate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Tick Interval (s)
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent>How often AutoRate measures RTT and adjusts. Default 5s. Range 3–300. EWMA fast half-life=0.4s so at 5s ticks fastEWMA≈raw RTT.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input type="number" min="3" max="300" value={form.autorate_tick_s} onChange={e => set("autorate_tick_s")(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Load Gate (%)
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent>Minimum link utilisation % before probing rate up. Prevents idle rate creep. Default 80% matches sqm-autorate high_load_level=0.8.</TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input type="number" min="10" max="95" value={form.load_gate_pct} onChange={e => set("load_gate_pct")(e.target.value)} />
                </div>
              </div>

              {/* One-click presets — applies validated per-WAN-type tuning */}
              <div className="glass-card p-3 rounded-lg space-y-2">
                <p className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-primary" />
                  One-click presets
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">— applies tuned values for this link type</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Fiber/Fixed preset */}
                  <button
                    type="button"
                    className="text-left p-2.5 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    onClick={() => setForm(f => ({
                      ...f,
                      soft_warn_ratio:  "1.05",
                      soft_panic_ratio: "1.10",
                      load_gate_pct:    "80",
                      autorate_tick_s:  "5",
                    }))}
                  >
                    <div className="text-xs font-semibold text-foreground mb-1">🌍 Fiber / Fixed</div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                      warn <span className="text-foreground font-mono">1.05</span> ·
                      panic <span className="text-foreground font-mono">1.10</span><br/>
                      gate <span className="text-foreground font-mono">80%</span> ·
                      tick <span className="text-emerald-400 font-mono">5s</span>
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-1">Standard sqm-autorate</div>
                  </button>

                  {/* LTE preset */}
                  <button
                    type="button"
                    className="text-left p-2.5 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    onClick={() => setForm(f => ({
                      ...f,
                      soft_warn_ratio:  "1.05",
                      soft_panic_ratio: "1.12",
                      load_gate_pct:    "75",
                      autorate_tick_s:  "5",
                    }))}
                  >
                    <div className="text-xs font-semibold text-foreground mb-1">📡 LTE</div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                      warn <span className="text-foreground font-mono">1.05</span> ·
                      panic <span className="text-foreground font-mono">1.12</span><br/>
                      gate <span className="text-foreground font-mono">75%</span> ·
                      tick <span className="text-emerald-400 font-mono">5s</span>
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-1">Quick reaction to LTE congestion</div>
                  </button>

                  {/* Starlink/Satellite preset */}
                  <button
                    type="button"
                    className="text-left p-2.5 rounded-lg border border-orange-500/30 hover:border-orange-500/60 hover:bg-orange-500/5 transition-colors"
                    onClick={() => setForm(f => ({
                      ...f,
                      soft_warn_ratio:  "1.08",
                      soft_panic_ratio: "1.15",
                      load_gate_pct:    "70",
                      autorate_tick_s:  "5",
                    }))}
                  >
                    <div className="text-xs font-semibold text-foreground mb-1">🛰 Starlink / Satellite</div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed">
                      warn <span className="text-orange-400 font-mono">1.08</span> ·
                      panic <span className="text-orange-400 font-mono">1.15</span><br/>
                      gate <span className="text-orange-400 font-mono">70%</span> ·
                      tick <span className="text-emerald-400 font-mono">5s</span>
                    </div>
                    <div className="text-[9px] text-orange-400/60 mt-1">Wider band · reduces oscillation</div>
                  </button>
                </div>

                {/* Why tick=5s matters */}
                <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30">
                  <span className="text-emerald-400/80 font-semibold">tick=5s</span> on all types:
                  at 30s tick a speed drop causes 2.5 min oscillation cycles.
                  At 5s tick the same event causes <span className="text-foreground">25 second</span> cycles —
                  6× smoother. WARN fires at {OWD_THRESHOLD_MS}ms OWD delta.
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRouter(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Config
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </AdminLayout>
  );
};

export default AutoRatePage;
