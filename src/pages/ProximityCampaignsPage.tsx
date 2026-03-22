// @ts-nocheck
/**
 * ProximityCampaignsPage.tsx — v1.0.0 (v3.13.0)
 * Admin → Proximity Campaigns
 */
import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Trash2, MessageSquare, Zap, BarChart3, Loader2, RefreshCw, Wifi } from "lucide-react";

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

const DAY_LABELS = ["Any Day","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const ProximityCampaignsPage = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selected, setSelected]   = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [nudgeLog, setNudgeLog]   = useState<any[]>([]);
  const [view, setView]           = useState<"campaigns"|"templates"|"log">("campaigns");
  const [loading, setLoading]     = useState(true);
  const [tplLoading, setTplLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [newC, setNewC] = useState({ name:"", channel:"push", trigger_radius_m:200, min_gap_hours:24, max_per_week:3, check_interval_min:60 });
  const [newTplMsg, setNewTplMsg] = useState("");
  const [newTplDay, setNewTplDay] = useState("0");
  const [aiPkgName, setAiPkgName] = useState("");
  const [aiPkgPrice, setAiPkgPrice] = useState("");

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const d = await adminApi("GET", "/admin/proximity/campaigns").catch(() => ({ success: false }));
    if (d.success) setCampaigns(d.campaigns ?? []);
    setLoading(false);
  }, []);

  const loadTemplates = useCallback(async (id: string) => {
    setTplLoading(true);
    const d = await adminApi("GET", `/admin/proximity/campaigns/${id}/templates`).catch(() => ({ success: false }));
    if (d.success) setTemplates(d.templates ?? []);
    setTplLoading(false);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { if (view === "log") adminApi("GET", "/admin/proximity/log").then(d => { if (d.success) setNudgeLog(d.log ?? []); }); }, [view]);
  useEffect(() => { if (selected && view === "templates") loadTemplates(selected.id); }, [selected, view, loadTemplates]);

  const toggleCampaign = async (c: any) => {
    const d = await adminApi("PUT", `/admin/proximity/campaigns/${c.id}`, { enabled: !c.enabled });
    if (d.success) setCampaigns(p => p.map(x => x.id === c.id ? d.campaign : x));
  };

  const createCampaign = async () => {
    if (!newC.name.trim()) { toast({ title: "Enter a campaign name", variant: "destructive" }); return; }
    const d = await adminApi("POST", "/admin/proximity/campaigns", newC);
    if (d.success) { setCampaigns(p => [...p, d.campaign]); setShowNew(false); setNewC({ name:"", channel:"push", trigger_radius_m:200, min_gap_hours:24, max_per_week:3, check_interval_min:60 }); toast({ title: "Campaign created ✅" }); }
    else toast({ title: "Error", description: d.error, variant: "destructive" });
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign and all its templates?")) return;
    const d = await adminApi("DELETE", `/admin/proximity/campaigns/${id}`);
    if (d.success) { setCampaigns(p => p.filter(c => c.id !== id)); if (selected?.id === id) setSelected(null); toast({ title: "Deleted" }); }
  };

  const addTemplate = async () => {
    if (!selected || !newTplMsg.trim()) return;
    const d = await adminApi("POST", `/admin/proximity/campaigns/${selected.id}/templates`, { message: newTplMsg.trim(), day_slot: parseInt(newTplDay) });
    if (d.success) { setTemplates(p => [...p, d.template]); setNewTplMsg(""); setNewTplDay("0"); setShowNewTpl(false); toast({ title: "Template added ✅" }); }
  };

  const deleteTemplate = async (id: string) => {
    const d = await adminApi("DELETE", `/admin/proximity/templates/${id}`);
    if (d.success) { setTemplates(p => p.filter(t => t.id !== id)); toast({ title: "Deleted" }); }
  };

  const aiGenerate = async () => {
    if (!selected) return;
    setAiGenerating(true);
    try {
      const d = await adminApi("POST", "/admin/ai-settings/generate-templates", {
        campaign_id: selected.id, count: 7, tone: "friendly",
        package_name: aiPkgName || undefined,
        package_price: aiPkgPrice ? parseFloat(aiPkgPrice) : undefined,
      });
      if (d.success) { await loadTemplates(selected.id); toast({ title: `✅ ${d.templates?.length ?? 7} templates generated!` }); }
      else toast({ title: "AI failed", description: d.error, variant: "destructive" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setAiGenerating(false); }
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto p-4 pb-12 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-info/20 flex items-center justify-center"><MapPin className="h-5 w-5 text-info" /></div>
            <div><h1 className="text-xl font-bold">Proximity Campaigns</h1><p className="text-xs text-muted-foreground">Re-engage offline subscribers near your WiFi</p></div>
          </div>
          <div className="flex gap-2">
            {["campaigns","log"].map(v => (
              <button key={v} onClick={() => { setView(v as any); setSelected(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === v && !selected ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
                {v === "log" ? <><BarChart3 className="h-3.5 w-3.5 inline mr-1" />Log</> : <><Wifi className="h-3.5 w-3.5 inline mr-1" />Campaigns</>}
              </button>
            ))}
          </div>
        </div>

        {/* Campaigns list */}
        {view === "campaigns" && !selected && (
          <div className="space-y-4">
            <div className="glass-card p-4 bg-info/5 border-info/20 text-xs text-muted-foreground space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-info" />How it works</p>
              <p>Hourly, the system checks which subscribers are <strong>offline</strong> but have a GPS ping within your radius of an online router. It sends a friendly nudge (push/SMS) — never more than your configured frequency.</p>
              <p className="text-warning text-[11px]">⚠ Requires: subscribers have the portal PWA installed (for GPS) and at least one router with lat/lng coordinates set.</p>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</p>
              <Button size="sm" onClick={() => setShowNew(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" />New Campaign</Button>
            </div>

            {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

            {!loading && campaigns.length === 0 && (
              <div className="glass-card p-8 text-center space-y-3">
                <MapPin className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="font-medium">No campaigns yet</p>
                <Button size="sm" onClick={() => setShowNew(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Create First Campaign</Button>
              </div>
            )}

            {campaigns.map(c => (
              <div key={c.id} className="glass-card p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <Switch checked={c.enabled} onCheckedChange={() => toggleCampaign(c)} />
                    <div>
                      <p className="font-semibold text-sm">{c.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[9px]">{c.channel.toUpperCase()}</Badge>
                        <span>📍{c.trigger_radius_m}m · ⏱{c.min_gap_hours}h gap · max {c.max_per_week}/week</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setSelected(c); setView("templates"); }}>
                      <MessageSquare className="h-3 w-3" />Templates
                    </Button>
                    <button onClick={() => deleteCampaign(c.id)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive/70 hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {showNew && (
              <div className="glass-card p-5 space-y-4 border-primary/30">
                <h3 className="font-semibold text-sm">New Campaign</h3>
                <div className="space-y-1.5"><Label className="text-xs whitespace-nowrap">Name</Label>
                  <Input placeholder="e.g. Evening Re-engagement" value={newC.name} onChange={e => setNewC(p => ({ ...p, name: e.target.value }))} className="bg-muted/50" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs whitespace-nowrap">Channel</Label>
                    <Select value={newC.channel} onValueChange={v => setNewC(p => ({ ...p, channel: v }))}>
                      <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="push">Push</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
                    </Select></div>
                  <div className="space-y-1.5"><Label className="text-xs whitespace-nowrap">Radius (metres)</Label>
                    <Input type="number" min={50} max={5000} value={newC.trigger_radius_m} onChange={e => setNewC(p => ({ ...p, trigger_radius_m: parseInt(e.target.value) }))} className="bg-muted/50" /></div>
                  <div className="space-y-1.5"><Label className="text-xs whitespace-nowrap">Min gap (hours)</Label>
                    <Input type="number" min={1} value={newC.min_gap_hours} onChange={e => setNewC(p => ({ ...p, min_gap_hours: parseInt(e.target.value) }))} className="bg-muted/50" /></div>
                  <div className="space-y-1.5"><Label className="text-xs whitespace-nowrap">Max per week</Label>
                    <Input type="number" min={1} max={7} value={newC.max_per_week} onChange={e => setNewC(p => ({ ...p, max_per_week: parseInt(e.target.value) }))} className="bg-muted/50" /></div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={createCampaign} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Create</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Templates view */}
        {view === "templates" && selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => { setView("campaigns"); setSelected(null); }} className="text-muted-foreground hover:text-foreground">← Campaigns</button>
              <span className="text-muted-foreground">/</span><span className="font-semibold">{selected.name}</span>
            </div>

            <div className="glass-card p-5 space-y-4 border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">AI-Generate 7 Templates (Mon–Sun)</h3></div>
              <p className="text-[11px] text-muted-foreground">Claude creates unique messages for each day of the week — so subscribers never see the same message twice in a row.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs whitespace-nowrap">Package Name <span className="text-muted-foreground">(optional)</span></Label>
                  <Input placeholder="e.g. Home 10Mbps" value={aiPkgName} onChange={e => setAiPkgName(e.target.value)} className="bg-background/50 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs whitespace-nowrap">Price KES <span className="text-muted-foreground">(optional)</span></Label>
                  <Input type="number" placeholder="e.g. 1500" value={aiPkgPrice} onChange={e => setAiPkgPrice(e.target.value)} className="bg-background/50 text-xs" /></div>
              </div>
              <Button size="sm" onClick={aiGenerate} disabled={aiGenerating} className="gap-2">
                {aiGenerating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</> : <><Zap className="h-3.5 w-3.5" />Generate with AI</>}
              </Button>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-sm font-medium">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
              <Button size="sm" variant="outline" onClick={() => setShowNewTpl(true)} className="gap-1 text-xs"><Plus className="h-3 w-3" />Manual</Button>
            </div>

            {tplLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
            {!tplLoading && templates.length === 0 && <div className="glass-card p-5 text-center text-sm text-muted-foreground">No templates yet. Generate with AI or add manually.</div>}

            {templates.map(t => (
              <div key={t.id} className={`glass-card p-4 flex gap-3 ${!t.active ? "opacity-50" : ""}`}>
                <div className="flex-shrink-0 h-7 w-7 rounded-lg bg-muted flex items-center justify-center">
                  <span className="text-[10px] font-bold">{DAY_LABELS[t.day_slot]?.slice(0,3) ?? "ANY"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs whitespace-nowrap">{t.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-muted-foreground">{DAY_LABELS[t.day_slot] ?? "Any day"} · {t.message.length}/160 chars</span>
                    {t.ai_generated && <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20">AI</Badge>}
                  </div>
                </div>
                <button onClick={() => deleteTemplate(t.id)} className="p-1 rounded hover:bg-destructive/20 text-destructive/70 hover:text-destructive transition-colors flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {showNewTpl && (
              <div className="glass-card p-4 space-y-3 border-dashed">
                <h3 className="text-xs font-semibold">Add Manual Template</h3>
                <div className="space-y-1.5"><Label className="text-xs whitespace-nowrap">Day</Label>
                  <Select value={newTplDay} onValueChange={setNewTplDay}>
                    <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                    <SelectContent>{DAY_LABELS.map((d,i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="space-y-1.5"><Label className="text-xs whitespace-nowrap">Message ({newTplMsg.length}/160)</Label>
                  <textarea className="w-full rounded-lg border border-border bg-muted/50 p-2 text-xs min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. Hey! You're near our WiFi 📶 Just KES 500 for a week of unlimited browsing!"
                    maxLength={160} value={newTplMsg} onChange={e => setNewTplMsg(e.target.value)} /></div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addTemplate} disabled={!newTplMsg.trim()}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewTpl(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Log view */}
        {view === "log" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="font-semibold">Nudge Send History</h2>
              <Button variant="ghost" size="sm" onClick={() => adminApi("GET", "/admin/proximity/log").then(d => { if (d.success) setNudgeLog(d.log ?? []); })} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />Refresh
              </Button>
            </div>
            {nudgeLog.length === 0 && <div className="glass-card p-6 text-center text-sm text-muted-foreground">No nudges sent yet.</div>}
            {nudgeLog.map(e => (
              <div key={e.id} className="glass-card p-4 flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-info/20 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-3.5 w-3.5 text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{e.subscribers?.full_name ?? "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground">{e.proximity_campaigns?.name ?? "—"} · {e.distance_m ?? "?"}m away · {e.channel}</p>
                  <p className="text-[11px] mt-1 italic text-muted-foreground">"{e.message_sent}"</p>
                </div>
                <span className="text-[9px] text-muted-foreground flex-shrink-0">{new Date(e.sent_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
export default ProximityCampaignsPage;
