/**
 * AISettingsPage.tsx — v1.0.0 (v3.13.0)
 * Admin → AI Settings
 */
import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Brain, Save, RefreshCw, CheckCircle, AlertCircle, Loader2, Zap, Bell, MapPin, MessageSquare } from "lucide-react";

const API = (window as Window & { __MIKROBILL_API__?: string }).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");
async function adminApi(method: string, path: string, body?: object) {
  const token = localStorage.getItem("auth_token") ?? sessionStorage.getItem("auth_token");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const MODELS = [
  { value: "claude-sonnet-4-20250514",  label: "Claude Sonnet 4 (Recommended)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fast & affordable)" },
  { value: "claude-opus-4-6",           label: "Claude Opus 4.6 (Most capable)" },
];

const AISettingsPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [settings, setSettings] = useState({
    ai_enabled: true, ai_model: "claude-sonnet-4-20250514",
    ai_temperature: 0.7, ai_max_tokens: 1000,
    health_scan_interval: 15, health_alert_channel: "both",
    nudge_ai_enabled: true, nudge_tone: "friendly", nudge_language: "en",
    custom_system_prompt: "",
  });

  useEffect(() => {
    adminApi("GET", "/admin/ai-settings").then(d => {
      if (d.success && d.settings) setSettings(p => ({ ...p, ...d.settings }));
    }).catch(() => toast({ title: "Failed to load AI settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (key: string, value: unknown) => setSettings(p => ({ ...p, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const d = await adminApi("PUT", "/admin/ai-settings", settings);
      if (d.success) toast({ title: "AI Settings Saved ✅" });
      else toast({ title: "Save failed", description: d.error, variant: "destructive" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const d = await adminApi("POST", "/admin/ai-settings/test");
      if (d.success) { setTestResult("success"); toast({ title: `Connected ✅ — "${d.reply}"` }); }
      else { setTestResult("error"); toast({ title: "Failed", description: d.error, variant: "destructive" }); }
    } catch { setTestResult("error"); }
    finally { setTesting(false); }
  };

  if (loading) return <AdminLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6 p-4 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center"><Brain className="h-5 w-5 text-primary" /></div>
            <div><h1 className="text-xl font-bold">AI Settings</h1><p className="text-xs text-muted-foreground">Configure Claude AI features</p></div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>

        {/* Core AI */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3"><Zap className="h-4 w-4 text-primary" /><h2 className="font-semibold">Core AI Configuration</h2></div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><Label className="font-medium">Enable AI Features</Label><p className="text-[11px] text-muted-foreground">Master switch for all AI features</p></div>
            <Switch checked={settings.ai_enabled} onCheckedChange={v => patch("ai_enabled", v)} />
          </div>
          <div className="space-y-1.5"><Label>AI Model</Label>
            <Select value={settings.ai_model} onValueChange={v => patch("ai_model", v)}>
              <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>{MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Temperature <span className="text-muted-foreground text-[10px]">(0–1)</span></Label>
              <Input type="number" min={0} max={1} step={0.1} value={settings.ai_temperature} onChange={e => patch("ai_temperature", parseFloat(e.target.value))} className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label>Max Tokens</Label>
              <Input type="number" min={100} max={4000} step={100} value={settings.ai_max_tokens} onChange={e => patch("ai_max_tokens", parseInt(e.target.value))} className="bg-muted/50" /></div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing} className="gap-2">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}{testing ? "Testing…" : "Test API Connection"}
            </Button>
            {testResult === "success" && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle className="h-3.5 w-3.5" />Connected</span>}
            {testResult === "error"   && <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" />Failed — check ANTHROPIC_API_KEY</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">API key read from <code className="font-mono bg-muted px-1 rounded">ANTHROPIC_API_KEY</code> env var on the backend server.</p>
        </div>

        {/* Health Monitor */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3"><Bell className="h-4 w-4 text-warning" /><h2 className="font-semibold">Health Monitor AI</h2></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Scan Interval <span className="text-muted-foreground text-[10px]">(minutes)</span></Label>
              <Input type="number" min={1} max={1440} value={settings.health_scan_interval} onChange={e => patch("health_scan_interval", parseInt(e.target.value))} className="bg-muted/50" /></div>
            <div className="space-y-1.5"><Label>Alert Channel</Label>
              <Select value={settings.health_alert_channel} onValueChange={v => patch("health_alert_channel", v)}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="push">Push only</SelectItem><SelectItem value="sms">SMS only</SelectItem>
                  <SelectItem value="both">Push + SMS</SelectItem><SelectItem value="none">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Proximity Nudge */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3"><MapPin className="h-4 w-4 text-info" /><h2 className="font-semibold">Proximity WiFi Nudge AI</h2></div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><Label className="font-medium">AI-Generated Templates</Label><p className="text-[11px] text-muted-foreground">Claude writes 7 unique messages (one per weekday)</p></div>
            <Switch checked={settings.nudge_ai_enabled} onCheckedChange={v => patch("nudge_ai_enabled", v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Message Tone</Label>
              <Select value={settings.nudge_tone} onValueChange={v => patch("nudge_tone", v)}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly & Warm 😊</SelectItem>
                  <SelectItem value="casual">Casual & Fun 🎉</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Language</Label>
              <Select value={settings.nudge_language} onValueChange={v => patch("nudge_language", v)}>
                <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="sw">Swahili</SelectItem>
                  <SelectItem value="mixed">Sheng (EN + SW)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Custom prompt */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3">
            <MessageSquare className="h-4 w-4 text-primary" /><h2 className="font-semibold">Custom System Prompt</h2>
            <Badge variant="outline" className="text-[9px]">Advanced</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">Override the default AI prompt for nudge generation. Leave blank to use built-in.</p>
          <textarea
            className="w-full rounded-lg border border-border bg-muted/50 p-3 text-xs min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            placeholder="e.g. You are a helpful WiFi assistant for MyISP in Nairobi Kenya..."
            value={settings.custom_system_prompt}
            onChange={e => patch("custom_system_prompt", e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => window.location.reload()} className="gap-2"><RefreshCw className="h-4 w-4" />Reset</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save All Settings"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};
export default AISettingsPage;