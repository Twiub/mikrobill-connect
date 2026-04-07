import { useDebounce } from "@/hooks/useDebounce";
import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { usePackages } from "@/hooks/useDatabase";
import {
  Ticket, Plus, Ban, ChevronDown, ChevronRight, Copy, Download,
  CheckCircle2, XCircle, Clock, RefreshCw, Search, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Batch {
  batch_id: string;
  batch_label: string;
  created_at: string;
  package_id: string;
  package_name: string;
  price: number;
  duration_days: number;
  total: number;
  active: number;
  redeemed: number;
  cancelled: number;
  expired: number;
  expires_at: string | null;
}

interface VoucherCode {
  id: string;
  code: string;
  status: "active" | "redeemed" | "cancelled" | "expired";
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by_name: string | null;
  redeemed_by_phone: string | null;
  created_at: string;
}

const API = import.meta.env.VITE_BACKEND_URL ?? "/api";

function authHeaders() {
  return { "Content-Type": "application/json" };
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    active:    { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" />, label: "Active" },
    redeemed:  { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",         icon: <Ticket className="h-3 w-3" />,       label: "Redeemed" },
    cancelled: { color: "bg-red-500/15 text-red-400 border-red-500/30",            icon: <XCircle className="h-3 w-3" />,      label: "Cancelled" },
    expired:   { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: <Clock className="h-3 w-3" />,        label: "Expired" },
  };
  const s = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

// ── Voucher card design ───────────────────────────────────────────────────────
function VoucherCard({ voucher, onCopy }: { voucher: VoucherCode; onCopy: (code: string) => void }) {
  const isActive = voucher.status === "active";
  return (
    <div className={`
      relative overflow-hidden rounded-xl border transition-all
      ${isActive
        ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-primary/30 shadow-lg shadow-primary/5"
        : "bg-slate-900/50 border-border/40 opacity-60"}
    `}>
      {/* Decorative perforated edge */}
      <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col justify-between py-2 gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`h-1 w-1 rounded-full ${isActive ? "bg-primary/40" : "bg-border/40"}`} />
        ))}
      </div>
      {/* Torn edge simulation */}
      <div className={`absolute left-5 top-0 bottom-0 w-px border-l-2 border-dashed ${isActive ? "border-primary/20" : "border-border/20"}`} />

      <div className="pl-8 pr-4 py-3 flex items-center justify-between gap-3">
        {/* Code */}
        <div className="flex-1 min-w-0">
          <p className={`font-mono text-base font-bold tracking-widest ${isActive ? "text-foreground" : "text-muted-foreground line-through"}`}>
            {voucher.code}
          </p>
          {voucher.status === "redeemed" && voucher.redeemed_by_name && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Used by {voucher.redeemed_by_name} · {voucher.redeemed_by_phone}
            </p>
          )}
          {voucher.expires_at && isActive && (
            <p className="text-xs text-amber-400/80 mt-0.5">
              Expires {new Date(voucher.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={voucher.status} />
          {isActive && (
            <button
              onClick={() => onCopy(voucher.code)}
              className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="Copy code"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Batch row ─────────────────────────────────────────────────────────────────
function BatchRow({ batch, onCancelBatch, onExport }: {
  batch: Batch;
  onCancelBatch: (batchId: string, label: string) => void;
  onExport: (batchId: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [codes, setCodes] = useState<VoucherCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { toast } = useToast();

  const pct = batch.total > 0 ? Math.round((batch.redeemed / batch.total) * 100) : 0;

  const load = async () => {
    if (codes.length) return;
    setLoading(true);
    try {
      const h = await authHeaders();
      const r = await fetch(`/admin/vouchers/${batch.batch_id}`, { headers: h });
      const d = await r.json();
      if (d.success) setCodes(d.vouchers);
    } catch { /* non-fatal */ }
    setLoading(false);
  };

  const toggle = () => { setExpanded(v => !v); if (!expanded) load(); };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast({ title: "Copied!", description: code });
  };

  const filtered = search
    ? codes.filter(c => c.code.includes(search.toUpperCase()) || c.status.includes(debouncedSearch.toLowerCase()))
    : codes;

  return (
    <div className="rounded-2xl border border-border/60 overflow-hidden bg-card/50 backdrop-blur-sm">
      {/* Batch header */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Package badge */}
        <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Ticket className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{batch.package_name}</span>
            {batch.batch_label && (
              <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border/50">
                {batch.batch_label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>KES {Number(batch.price).toLocaleString()}</span>
            <span>·</span>
            <span>{batch.duration_days}d</span>
            <span>·</span>
            <span>{new Date(batch.created_at).toLocaleDateString()}</span>
            {batch.expires_at && <><span>·</span><span className="text-amber-400">Exp {new Date(batch.expires_at).toLocaleDateString()}</span></>}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="hidden sm:flex flex-col items-center gap-0.5">
            <span className="text-lg font-bold text-foreground">{batch.total}</span>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
          <div className="hidden sm:flex flex-col items-center gap-0.5">
            <span className="text-lg font-bold text-emerald-400">{batch.active}</span>
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
          <div className="hidden sm:flex flex-col items-center gap-0.5">
            <span className="text-lg font-bold text-blue-400">{batch.redeemed}</span>
            <span className="text-xs text-muted-foreground">Used</span>
          </div>

          {/* Usage bar */}
          <div className="hidden md:flex flex-col gap-1 w-20">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Used</span><span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {batch.active > 0 && (
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onExport(batch.batch_id, batch.batch_label || batch.package_name)}
                className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => onCancelBatch(batch.batch_id, batch.batch_label || batch.package_name)}
                className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                title="Cancel all active"
              >
                <Ban className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </button>

      {/* Expanded codes */}
      {expanded && (
        <div className="border-t border-border/50 px-5 py-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Filter codes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-muted/30 border border-border/50 rounded-lg outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(v => <VoucherCard key={v.id} voucher={v} onCopy={copyCode} />)}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">No codes match your filter</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VouchersPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState<{ batchId: string; label: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { data: packages } = usePackages();
  const { toast } = useToast();

  const [form, setForm] = useState({
    packageId: "",
    count: "10",
    expiresAt: "",
    batchLabel: "",
  });

  const loadBatches = async () => {
    setLoading(true);
    try {
      const h = await authHeaders();
      const r = await fetch(`/admin/vouchers`, { headers: h });
      const d = await r.json();
      if (d.success) setBatches(d.batches);
    } catch {
      toast({ title: "Error", description: "Failed to load vouchers", variant: "destructive" });
    }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBatches(); }, []);

  const handleGenerate = async () => {
    if (!form.packageId || !form.count) return;
    setGenerating(true);
    try {
      const h = await authHeaders();
      const r = await fetch(`/admin/vouchers/generate`, {
        method: "POST", headers: h,
        body: JSON.stringify({
          packageId: form.packageId,
          count: parseInt(form.count),
          expiresAt: form.expiresAt || null,
          batchLabel: form.batchLabel || null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: "✅ Vouchers generated", description: `${d.count} codes created for ${d.package.name}` });
        setGenOpen(false);
        setForm({ packageId: "", count: "10", expiresAt: "", batchLabel: "" });
        loadBatches();
      } else {
        toast({ title: "Error", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleCancelBatch = async () => {
    if (!cancelOpen) return;
    setCancelling(true);
    try {
      const h = await authHeaders();
      const r = await fetch(`/admin/vouchers/cancel-batch`, {
        method: "POST", headers: h,
        body: JSON.stringify({ batchId: cancelOpen.batchId }),
      });
      const d = await r.json();
      if (d.success) {
        toast({ title: "Batch cancelled", description: `${d.cancelled} codes cancelled` });
        setCancelOpen(null);
        loadBatches();
      } else {
        toast({ title: "Error", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
    setCancelling(false);
  };

  const handleExport = async (batchId: string, label: string) => {
    try {
      const h = await authHeaders();
      const r = await fetch(`/admin/vouchers/${batchId}`, { headers: h });
      const d = await r.json();
      if (!d.success) return;
      const active = d.vouchers.filter((v: VoucherCode) => v.status === "active");
      // FIX: CRLF line endings for Windows Excel compatibility; escape commas/quotes in fields
      const escapeCsv = (val: string | null) => val ? `"${val.replace(/"/g, '""')}"` : "";
      const csv = ["Code,Status,Expires"].concat(
        active.map((v: VoucherCode) => `${v.code},${v.status},${escapeCsv(v.expires_at ?? null)}`)
      ).join("\r\n"); // FIX: was \n — breaks Excel on Windows
      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `vouchers-${label.replace(/\s+/g, "-")}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  // Summary stats
  const totalActive   = batches.reduce((s, b) => s + Number(b.active), 0);
  const totalRedeemed = batches.reduce((s, b) => s + Number(b.redeemed), 0);
  const totalAll      = batches.reduce((s, b) => s + Number(b.total), 0);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 p-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Ticket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Vouchers</h1>
              <p className="text-xs text-muted-foreground">Pre-paid WiFi codes for offline distribution</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadBatches} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setGenOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Generate Vouchers
            </Button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Total Generated", value: totalAll,      color: "text-foreground" },
            { label: "Active / Unused",  value: totalActive,  color: "text-emerald-400" },
            { label: "Redeemed",         value: totalRedeemed, color: "text-blue-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border/60 bg-card/50 p-4 text-center">
              <p className={`text-2xl font-extrabold ${color}`}>{value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Batch list ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 py-20 text-center space-y-3">
            <Ticket className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground text-sm">No voucher batches yet</p>
            <Button size="sm" onClick={() => setGenOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Generate your first batch
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map(b => (
              <BatchRow
                key={b.batch_id}
                batch={b}
                onCancelBatch={(id, label) => setCancelOpen({ batchId: id, label })}
                onExport={handleExport}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Generate dialog ── */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />Generate Vouchers
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Package</Label>
              <Select value={form.packageId} onValueChange={v => setForm(f => ({ ...f, packageId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a package" /></SelectTrigger>
                <SelectContent>
                  {(packages ?? []).filter((p: any) => p.is_active !== false).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — KES {Number(p.price).toLocaleString()} · {p.duration_days}d
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Number of codes</Label>
              <Input
                type="number" min="1" max="500"
                value={form.count}
                onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">Max 500 per batch</p>
            </div>

            <div className="space-y-1.5">
              <Label>Batch label <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={form.batchLabel}
                onChange={e => setForm(f => ({ ...f, batchLabel: e.target.value }))}
                placeholder="e.g. March promo · School batch 1"
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Expiry date <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                min={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-muted-foreground">Leave blank for no expiry</p>
            </div>

            {/* Preview */}
            {form.packageId && form.count && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1">
                <p className="text-xs font-semibold text-primary">Preview</p>
                <p className="text-sm text-foreground">
                  {form.count} × <span className="font-semibold">
                    {(packages ?? []).find((p: any) => p.id === form.packageId)?.name}
                  </span> vouchers
                </p>
                <p className="text-xs text-muted-foreground font-mono">Format: XXXX-XXXX-XXXX</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || !form.packageId || !form.count}
            >
              {generating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</> : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel batch confirm ── */}
      <Dialog open={!!cancelOpen} onOpenChange={() => setCancelOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />Cancel Batch
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Cancel all active vouchers in batch <span className="font-semibold text-foreground">"{cancelOpen?.label}"</span>?
            This cannot be undone. Redeemed codes are unaffected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(null)}>Keep</Button>
            <Button variant="destructive" onClick={handleCancelBatch} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Cancel All Active
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
