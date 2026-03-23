// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePackages, formatKES } from "@/hooks/useDatabase";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Ticket, Plus, Ban, ChevronRight, Copy, Download,
  CheckCircle2, XCircle, Clock, RefreshCw, Search, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    active:    { color: "bg-success/15 text-success border-success/30", icon: <CheckCircle2 className="h-3 w-3" />, label: "Active" },
    redeemed:  { color: "bg-info/15 text-info border-info/30",         icon: <Ticket className="h-3 w-3" />,       label: "Redeemed" },
    cancelled: { color: "bg-destructive/15 text-destructive border-destructive/30", icon: <XCircle className="h-3 w-3" />, label: "Cancelled" },
    expired:   { color: "bg-warning/15 text-warning border-warning/30", icon: <Clock className="h-3 w-3" />,        label: "Expired" },
  };
  const s = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

function genCode(len = 8): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function VouchersPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchCodes, setBatchCodes] = useState<any[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codeSearch, setCodeSearch] = useState("");
  const debouncedCodeSearch = useDebounce(codeSearch, 300);
  const { data: packages } = usePackages();
  const { toast } = useToast();

  const [form, setForm] = useState({ packageId: "", count: "10", expiresAt: "", batchLabel: "" });

  const loadBatches = async () => {
    setLoading(true);
    const { data: batchRows } = await supabase.from("voucher_batches").select("*, packages(name, price, duration_days)").order("created_at", { ascending: false });
    if (!batchRows) { setLoading(false); return; }

    // Get voucher counts per batch
    const { data: vouchers } = await supabase.from("vouchers").select("batch_id, status");
    const countMap: Record<string, { total: number; active: number; redeemed: number; cancelled: number; expired: number }> = {};
    (vouchers ?? []).forEach((v: any) => {
      if (!countMap[v.batch_id]) countMap[v.batch_id] = { total: 0, active: 0, redeemed: 0, cancelled: 0, expired: 0 };
      countMap[v.batch_id].total++;
      if (v.status in countMap[v.batch_id]) countMap[v.batch_id][v.status]++;
    });

    const enriched = batchRows.map((b: any) => ({
      ...b,
      package_name: b.packages?.name ?? "Unknown",
      price: b.packages?.price ?? 0,
      duration_days: b.packages?.duration_days ?? 0,
      ...(countMap[b.batch_id] ?? { total: 0, active: 0, redeemed: 0, cancelled: 0, expired: 0 }),
    }));
    setBatches(enriched);
    setLoading(false);
  };

  useEffect(() => { loadBatches(); }, []);

  const loadCodes = async (batchId: string) => {
    setCodesLoading(true);
    const { data } = await supabase.from("vouchers").select("*").eq("batch_id", batchId).order("created_at");
    setBatchCodes(data ?? []);
    setCodesLoading(false);
  };

  const toggleBatch = (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      setBatchCodes([]);
      setCodeSearch("");
    } else {
      setExpandedBatch(batchId);
      loadCodes(batchId);
    }
  };

  const handleGenerate = async () => {
    if (!form.packageId || !form.count) return;
    setGenerating(true);
    try {
      const count = parseInt(form.count);
      const batchId = crypto.randomUUID();
      // Create batch
      const { error: batchErr } = await supabase.from("voucher_batches").insert({
        batch_id: batchId,
        batch_label: form.batchLabel || `Batch ${new Date().toLocaleDateString()}`,
        package_id: form.packageId,
        expires_at: form.expiresAt || null,
      });
      if (batchErr) throw batchErr;

      // Generate codes
      const codes = Array.from({ length: count }, () => ({
        batch_id: batchId,
        code: genCode(),
        status: "active",
        expires_at: form.expiresAt || null,
      }));
      const { error: codesErr } = await supabase.from("vouchers").insert(codes);
      if (codesErr) throw codesErr;

      toast({ title: "✅ Vouchers generated", description: `${count} codes created.` });
      setGenOpen(false);
      setForm({ packageId: "", count: "10", expiresAt: "", batchLabel: "" });
      loadBatches();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const cancelBatch = async (batchId: string) => {
    const { error } = await supabase.from("vouchers").update({ status: "cancelled" }).eq("batch_id", batchId).eq("status", "active");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Batch cancelled" });
      loadBatches();
      if (expandedBatch === batchId) loadCodes(batchId);
    }
  };

  const handleExport = async (batchId: string, label: string) => {
    const { data } = await supabase.from("vouchers").select("code, status, expires_at").eq("batch_id", batchId).eq("status", "active");
    if (!data) return;
    const csv = ["Code,Status,Expires"].concat(data.map((v: any) => `${v.code},${v.status},${v.expires_at ?? ""}`)).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vouchers-${label.replace(/\s+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    toast({ title: "Copied!", description: code });
  };

  const filteredCodes = useMemo(() => {
    if (!debouncedCodeSearch) return batchCodes;
    const q = debouncedCodeSearch.toLowerCase();
    return batchCodes.filter((c: any) => c.code.toLowerCase().includes(q) || c.status.includes(q));
  }, [batchCodes, debouncedCodeSearch]);

  const totalActive = batches.reduce((s, b) => s + Number(b.active ?? 0), 0);
  const totalRedeemed = batches.reduce((s, b) => s + Number(b.redeemed ?? 0), 0);
  const totalAll = batches.reduce((s, b) => s + Number(b.total ?? 0), 0);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 p-6">
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

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Total Generated", value: totalAll, color: "text-foreground" },
            { label: "Active / Unused", value: totalActive, color: "text-success" },
            { label: "Redeemed", value: totalRedeemed, color: "text-info" },
          ].map(s => (
            <div key={s.label} className="glass-card p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Batches */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : batches.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Ticket className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium text-muted-foreground">No voucher batches yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Generate Vouchers" to create your first batch</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((batch: any) => {
              const pct = batch.total > 0 ? Math.round((batch.redeemed / batch.total) * 100) : 0;
              const isExpanded = expandedBatch === batch.batch_id;
              return (
                <div key={batch.batch_id} className="rounded-2xl border border-border/60 overflow-hidden bg-card/50 backdrop-blur-sm">
                  <button onClick={() => toggleBatch(batch.batch_id)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left">
                    <div className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Ticket className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground truncate">{batch.package_name}</span>
                        {batch.batch_label && <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border/50">{batch.batch_label}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{formatKES(Number(batch.price))}</span>
                        <span>·</span>
                        <span>{batch.duration_days}d</span>
                        <span>·</span>
                        <span>{new Date(batch.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 shrink-0">
                      <div className="hidden sm:flex flex-col items-center gap-0.5">
                        <span className="text-lg font-bold text-foreground">{batch.total}</span>
                        <span className="text-xs text-muted-foreground">Total</span>
                      </div>
                      <div className="hidden sm:flex flex-col items-center gap-0.5">
                        <span className="text-lg font-bold text-success">{batch.active}</span>
                        <span className="text-xs text-muted-foreground">Active</span>
                      </div>
                      <div className="hidden md:flex flex-col gap-1 w-20">
                        <div className="flex justify-between text-xs text-muted-foreground"><span>Used</span><span>{pct}%</span></div>
                        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-primary to-info rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Actions row */}
                  {batch.active > 0 && (
                    <div className="flex gap-2 px-5 pb-3" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => handleExport(batch.batch_id, batch.batch_label || batch.package_name)}>
                        <Download className="h-3.5 w-3.5 mr-1" />Export CSV
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => cancelBatch(batch.batch_id)}>
                        <Ban className="h-3.5 w-3.5 mr-1" />Cancel Active
                      </Button>
                    </div>
                  )}

                  {/* Expanded codes */}
                  {isExpanded && (
                    <div className="border-t border-border/50 px-5 py-4 space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input placeholder="Filter codes…" value={codeSearch} onChange={e => setCodeSearch(e.target.value)} className="pl-8 h-9 text-sm" />
                      </div>
                      {codesLoading ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {filteredCodes.map((v: any) => (
                            <div key={v.id} className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${v.status === "active" ? "border-primary/30 bg-card" : "border-border/40 opacity-60"}`}>
                              <div className="min-w-0">
                                <p className={`font-mono text-base font-bold tracking-widest ${v.status !== "active" ? "line-through text-muted-foreground" : "text-foreground"}`}>{v.code}</p>
                                {v.status === "redeemed" && v.redeemed_by_name && <p className="text-xs text-muted-foreground mt-0.5 truncate">Used by {v.redeemed_by_name}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <StatusPill status={v.status} />
                                {v.status === "active" && (
                                  <button onClick={() => copyCode(v.code)} className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Copy code">
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!codesLoading && filteredCodes.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No codes match your filter</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate Vouchers</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Package *</Label>
              <Select value={form.packageId} onValueChange={v => setForm(f => ({ ...f, packageId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>
                  {(packages as any[] ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {formatKES(p.price)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Number of Codes</Label>
              <Input type="number" min="1" max="500" value={form.count} onChange={e => setForm(f => ({ ...f, count: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Batch Label</Label>
              <Input placeholder="e.g. Q1 Promos" value={form.batchLabel} onChange={e => setForm(f => ({ ...f, batchLabel: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Expires At (optional)</Label>
              <Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generating || !form.packageId}>
              {generating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}