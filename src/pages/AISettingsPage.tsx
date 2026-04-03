// @ts-nocheck
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
import { supabase } from "@/integrations/supabase/client";

const SETTINGS_KEY = "ai_settings";

const MODELS = [
  { value: "claude-sonnet-4-20250514",  label: "Claude Sonnet 4 (Recommended)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fast & affordable)" },
  { value: "claude-opus-4-6",           label: "Claude Opus 4.6 (Most capable)" },
];

const DEFAULT_SETTINGS = {
  ai_enabled: true, ai_model: "claude-sonnet-4-20250514",
  ai_temperature: 0.7, ai_max_tokens: 1000,
  health_scan_interval: 15, health_alert_channel: "both",
  nudge_ai_enabled: true, nudge_tone: "friendly", nudge_language: "en",
  custom_system_prompt: "",
};

const AISettingsPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });

  useEffect(() => {
    supabase.from("system_settings").select("*").eq("key", SETTINGS_KEY).maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
            setSettings(p => ({ ...p, ...parsed }));
          } catch { /* use defaults */ }
        }
      })
      .catch(() => toast({ title: "Failed to load AI settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase.from("system_settings").select("id").eq("key", SETTINGS_KEY).maybeSingle();
      if (existing) {
        await supabase.from("system_settings").update({ value: settings }).eq("key", SETTINGS_KEY);
      } else {
        await supabase.from("system_settings").insert({ key: SETTINGS_KEY, value: settings });
      }
      toast({ title: "Settings saved ✅" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const s = (k: string) => (v: any) => setSettings(p => ({ ...p, [k]: v }));

  if (loading) return (
    <AdminLayout>
      <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Settings</h1>
              <p className="text-xs text-muted-foreground">Configure AI engine for health scans, nudges & automation</p>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </div>

        {/* AI Engine */}
        <div className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> AI Engine</h2>
          <div className="flex items-center justify-between">
            <Label>Enable AI Features</Label>
            <Switch checked={settings.ai_enabled} onCheckedChange={s("ai_enabled")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Select value={settings.ai_model} onValueChange={s("ai_model")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Temperature ({settings.ai_temperature})</Label>
              <Input type="range" min="0" max="1" step="0.1" value={settings.ai_temperature} onChange={e => s("ai_temperature")(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Tokens</Label>
              <Input type="number" value={settings.ai_max_tokens} onChange={e => s("ai_max_tokens")(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Health Scans */}
        <div className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> Health Scan Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Scan Interval (minutes)</Label>
              <Input type="number" value={settings.health_scan_interval} onChange={e => s("health_scan_interval")(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alert Channel</Label>
              <Select value={settings.health_alert_channel} onValueChange={s("health_alert_channel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Nudge AI */}
        <div className="glass-card p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Nudge AI (Subscriber Messages)</h2>
          <div className="flex items-center justify-between">
            <Label>Enable AI Nudges</Label>
            <Switch checked={settings.nudge_ai_enabled} onCheckedChange={s("nudge_ai_enabled")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tone</Label>
              <Select value={settings.nudge_tone} onValueChange={s("nudge_tone")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Language</Label>
              <Select value={settings.nudge_language} onValueChange={s("nudge_language")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="sw">Swahili</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Custom Prompt */}
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Custom System Prompt</h2>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Optional: override the default system prompt for AI operations..."
            value={settings.custom_system_prompt}
            onChange={e => s("custom_system_prompt")(e.target.value)}
          />
        </div>
      </div>
    </AdminLayout>
  );
};

export default AISettingsPage;
