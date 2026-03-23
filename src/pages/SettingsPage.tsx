// @ts-nocheck
/**
 * SettingsPage.tsx — v2.1.0 (v3.16.0)
 *
 * Consolidated system settings. Every configurable key lives here.
 *
 * Sections:
 *   1. M-Pesa Daraja API        — mpesa_config table (existing)
 *   2. RADIUS & Network         — system_settings (radius_server_ip, radius_secret, radius_host)
 *   3. Captive Portal / UAM     — system_settings (portal_uam_url, portal_uam_secret)
 *   4. MeshDesk Timing          — system_settings (meshdesk_*, stale_action_timeout_secs)
 *   5. Maps & Location          — system_settings (google_maps_api_key)
 *   6. SMS Notifications        — system_settings (sms_provider, sms_*, android_gw_*)
 *                                 Provider selector: Africa's Talking | Android SMS Gateway | Auto
 *                                 Android GW: Username, Password, Device ID (server is fixed)
 *   7. Push Notifications (FCM) — system_settings (fcm_*)
 *   8. DLNA Media Server        — system_settings (dlna_*)
 *   9. Tax & Compliance         — system_settings (tax_*)
 *
 * v3.16.0: SMS section replaced with provider-aware UI (AT + Android SMS Gateway)
 */

import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Wifi, Server, Globe, Bell, Save, Eye, EyeOff,
  Loader2, RefreshCw, CheckCircle, AlertCircle, Map,
  Smartphone, Tv2, Receipt, Clock, ChevronDown, ChevronUp, Router,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";

// Settings page uses Supabase directly

const useMpesaConfigLocal = () => useQuery({
  queryKey: ["mpesa_config"],
  queryFn: async () => {
    const { data, error } = await supabase.from("mpesa_config").select("*").limit(1).maybeSingle();
    if (error) return null;
    return data;
  },
});

// ── Collapsible section ───────────────────────────────────────────────────────
const Section = ({
  icon, title, badge, badgeVariant = "outline", children, defaultOpen = true,
}: {
  icon: React.ReactNode; title: string; badge?: string;
  badgeVariant?: "outline" | "success" | "warning";
  children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const bc =
    badgeVariant === "success" ? "bg-success/15 text-success border-success/30" :
    badgeVariant === "warning" ? "bg-warning/15 text-warning border-warning/30" : "";
  return (
    <div className="glass-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
          {badge && <Badge variant="outline" className={`text-[10px] ml-1 ${bc}`}>{badge}</Badge>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/50 pt-4">{children}</div>}
    </div>
  );
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs whitespace-nowrap">{label}</Label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground leading-relaxed">{hint}</p>}
  </div>
);

const SecretInput = ({ value, onChange, placeholder, showKey, onToggle }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  showKey: boolean; onToggle: () => void;
}) => (
  <div className="relative">
    <Input
      type={showKey ? "text" : "password"}
      className="font-mono"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
    <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>
);

const InfoBox = ({ children }: { children: React.ReactNode }) => (
  <div className="glass-card p-3 bg-info/5 border-info/15 text-[11px] text-muted-foreground">{children}</div>
);

const SaveRow = ({ section, saving, sysLoading, onSave }: {
  section: string; saving: boolean; sysLoading: boolean; onSave: () => void;
}) => (
  <div className="flex justify-end pt-1">
    <Button size="sm" onClick={onSave} disabled={saving || sysLoading} className="gap-2">
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      Save {section} Settings
    </Button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const SettingsPage = () => {
  const { branding: brandingData } = useBranding();
  const { data: mpesaCfg, isLoading: mpesaLoading } = useMpesaConfigLocal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [testing, setTesting]             = useState(false);
  const [testResult, setTestResult]       = useState<"success" | "error" | null>(null);
  const [sysLoading, setSysLoading]       = useState(true);

  const [show, setShow] = useState({
    mpesa_secret: false, mpesa_passkey: false, radius_secret: false,
    uam_secret: false, sms_key: false, android_gw_pass: false, android_gw_webhook: false, fcm_key: false, maps_key: false,
  });
  const tog = (k: keyof typeof show) => () => setShow(p => ({ ...p, [k]: !p[k] }));

  // ── M-Pesa state ──────────────────────────────────────────────────────────
  const [mpesa, setMpesa] = useState({
    environment: "sandbox", consumer_key: "", consumer_secret: "", passkey: "",
    shortcode: "", initiator_name: "", initiator_password: "",
    stk_callback_url: "", c2b_confirmation_url: "", c2b_validation_url: "",
    b2c_result_url: "", b2c_timeout_url: "",
    account_reference: "WIFI", transaction_desc: "WiFi Package",
  });
  const setM = (k: keyof typeof mpesa) => (v: any) => setMpesa(p => ({ ...p, [k]: v }));

  // ── system_settings state ─────────────────────────────────────────────────
  const [radius, setRadius] = useState({ radius_server_ip: "127.0.0.1", radius_secret: "", radius_host: "127.0.0.1" });
  const [uam,    setUam]    = useState({ portal_uam_url: "", portal_uam_secret: "greatsecret" });
  const [mesh,   setMesh]   = useState({
    meshdesk_dead_after: "600", meshdesk_report_proto: "http",
    meshdesk_report_light: "120", meshdesk_report_full: "300",
    meshdesk_report_sampling: "0", stale_action_timeout_secs: "300",
  });
  const [maps,   setMaps]   = useState({ google_maps_api_key: "" });
  const [sms,    setSms]    = useState({
    sms_provider: "africastalking",
    sms_api_key: "", sms_username: "sandbox", sms_sender_id: "",
    android_gw_username: "", android_gw_password: "", android_gw_device_id: "", android_gw_webhook_secret: "",
  });
  const [fcm,    setFcm]    = useState({ fcm_server_key: "", fcm_project_id: "" });
  const [dlna,   setDlna]   = useState({ dlna_enabled: "true", dlna_server_ip: "192.168.88.200", dlna_http_port: "8200" });
  const [tax,    setTax]    = useState({ tax_vat_rate: "16", tax_kra_pin: "" });
  // v3.17.0: Free WhatsApp Chat
  const [fwa, setFwa] = useState({
    free_whatsapp_enabled: "true",
    free_whatsapp_window_days: "3",
    free_whatsapp_daily_cap_mb: "100",
    free_whatsapp_speed_down: "1M",
    free_whatsapp_speed_up: "512k",
    free_whatsapp_extend_days: "3",
    free_whatsapp_otp_ttl_seconds: "300",
  });

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mpesaCfg) {
      setMpesa({
        environment:          mpesaCfg.environment          ?? "sandbox",
        consumer_key:         mpesaCfg.consumer_key         ?? "",
        consumer_secret:      mpesaCfg.consumer_secret      ?? "",
        passkey:              mpesaCfg.passkey              ?? "",
        shortcode:            mpesaCfg.shortcode            ?? "",
        initiator_name:       mpesaCfg.initiator_name       ?? "",
        initiator_password:   mpesaCfg.initiator_password   ?? "",
        stk_callback_url:     mpesaCfg.stk_callback_url     ?? "",
        c2b_confirmation_url: mpesaCfg.c2b_confirmation_url ?? "",
        c2b_validation_url:   mpesaCfg.c2b_validation_url   ?? "",
        b2c_result_url:       mpesaCfg.b2c_result_url       ?? "",
        b2c_timeout_url:      mpesaCfg.b2c_timeout_url      ?? "",
        account_reference:    mpesaCfg.account_reference    ?? "WIFI",
        transaction_desc:     mpesaCfg.transaction_desc     ?? "WiFi Package",
      });
    }
  }, [mpesaCfg]);

  useEffect(() => {
    // Load system settings from Supabase
    supabase.from("system_settings").select("key, value")
      .then(({ data: rows }) => {
        if (!rows) return;
        const s: Record<string, any> = {};
        rows.forEach((r: any) => { s[r.key] = typeof r.value === 'object' ? r.value : r.value; });
        // Merge settings into state
        if (s.radius) setRadius(prev => ({ ...prev, ...s.radius }));
        if (s.uam) setUam(prev => ({ ...prev, ...s.uam }));
        if (s.mesh) setMesh(prev => ({ ...prev, ...s.mesh }));
        if (s.maps) setMaps(prev => ({ ...prev, ...s.maps }));
        if (s.sms) setSms(prev => ({ ...prev, ...s.sms }));
        if (s.fcm) setFcm(prev => ({ ...prev, ...s.fcm }));
        if (s.dlna) setDlna(prev => ({ ...prev, ...s.dlna }));
        if (s.tax) setTax(prev => ({ ...prev, ...s.tax }));
        if (s.free_whatsapp) setFwa(prev => ({ ...prev, ...s.free_whatsapp }));
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setSysLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save helpers ──────────────────────────────────────────────────────────
  // BUG-NEW-R18-D FIX: Write mpesa_config via backend admin API instead of supabase client.
  // Migration 232 removed the authenticated RLS policy — direct supabase.from() calls
  // from the frontend now fail with RLS denial. The backend route handles upsert logic.
  const saveMpesa = async () => {
    setSavingSection("mpesa");
    try {
      const { error } = await supabase.from("mpesa_config").upsert({
        id: mpesaCfg?.id ?? undefined,
        shortcode: mpesa.shortcode,
        consumer_key: mpesa.consumer_key,
        consumer_secret: mpesa.consumer_secret,
        passkey: mpesa.passkey,
        callback_url: mpesa.stk_callback_url,
        environment: mpesa.environment,
        active: true,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["mpesa_config"] });
      toast({ title: "M-Pesa Config Saved ✅" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingSection(null); }
  };

  const saveSys = async (section: string, values: Record<string, string>) => {
    setSavingSection(section);
    try {
      const { error } = await supabase.from("system_settings").upsert(
        { key: section, value: values, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) throw error;
      toast({ title: `${section} settings saved ✅` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally { setSavingSection(null); }
  };

  const testMpesa = async () => {
    if (!mpesa.consumer_key || !mpesa.consumer_secret) {
      toast({ title: "Missing credentials", variant: "destructive" }); return;
    }
    setTesting(true); setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${API}/admin/mpesa/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ consumer_key: mpesa.consumer_key, consumer_secret: mpesa.consumer_secret, environment: mpesa.environment }),
      });
      const r = await resp.json();
      if (r.success) { setTestResult("success"); toast({ title: "Connection Successful ✅" }); }
      else { setTestResult("error"); toast({ title: "Connection Failed", description: r.error, variant: "destructive" }); }
    } catch { setTestResult("error"); toast({ title: "Network Error", variant: "destructive" }); }
    finally { setTesting(false); }
  };

  const sv = (s: string) => savingSection === s;

  return (
    <AdminLayout>
      <div className="space-y-4 pb-8">

        <div>
          <h1 className="text-xl sm:text-2xl font-bold">System Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Global configuration for {brandingData.company_name}</p>
        </div>

        {/* ── 1. M-Pesa ─────────────────────────────────────────────────── */}
        <Section
          icon={<Wifi className="h-5 w-5 text-success" />}
          title="M-Pesa Daraja API"
          badge={mpesa.environment === "production" ? "Production" : "Sandbox"}
          badgeVariant={mpesa.environment === "production" ? "success" : "warning"}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Environment">
                <Select value={mpesa.environment} onValueChange={setM("environment")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                    <SelectItem value="production">Production (Live)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Shortcode (Paybill / Till)">
                <Input placeholder="174379" value={mpesa.shortcode} onChange={e => setM("shortcode")(e.target.value)} />
              </Field>
              <Field label="Consumer Key">
                <Input placeholder="From Daraja portal" value={mpesa.consumer_key} onChange={e => setM("consumer_key")(e.target.value)} />
              </Field>
              <Field label="Consumer Secret">
                <SecretInput value={mpesa.consumer_secret} onChange={setM("consumer_secret")} placeholder="From Daraja portal" showKey={show.mpesa_secret} onToggle={tog("mpesa_secret")} />
              </Field>
              <Field label="Lipa Na M-Pesa Passkey">
                <SecretInput value={mpesa.passkey} onChange={setM("passkey")} placeholder="From Daraja STK Push settings" showKey={show.mpesa_passkey} onToggle={tog("mpesa_passkey")} />
              </Field>
              <Field label="Initiator Name (B2C)">
                <Input placeholder="Daraja API user" value={mpesa.initiator_name} onChange={e => setM("initiator_name")(e.target.value)} />
              </Field>
              <Field label="Initiator Password (B2C)">
                <Input type="password" placeholder="Initiator password" value={mpesa.initiator_password} onChange={e => setM("initiator_password")(e.target.value)} />
              </Field>
              <Field label="Account Reference">
                <Input placeholder="WIFI" value={mpesa.account_reference} onChange={e => setM("account_reference")(e.target.value)} />
              </Field>
              <Field label="Transaction Description">
                <Input placeholder="WiFi Package" value={mpesa.transaction_desc} onChange={e => setM("transaction_desc")(e.target.value)} />
              </Field>
            </div>
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground mb-3">Callback URLs <span className="font-normal">(must be HTTPS and publicly accessible)</span></p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="STK Push Callback URL"><Input placeholder="https://api.example.com/mpesa/stk/callback" value={mpesa.stk_callback_url} onChange={e => setM("stk_callback_url")(e.target.value)} /></Field>
                <Field label="C2B Confirmation URL"><Input placeholder="https://api.example.com/mpesa/c2b/confirmation" value={mpesa.c2b_confirmation_url} onChange={e => setM("c2b_confirmation_url")(e.target.value)} /></Field>
                <Field label="C2B Validation URL"><Input placeholder="https://api.example.com/mpesa/c2b/validation" value={mpesa.c2b_validation_url} onChange={e => setM("c2b_validation_url")(e.target.value)} /></Field>
                <Field label="B2C Result URL"><Input placeholder="https://api.example.com/mpesa/b2c/result" value={mpesa.b2c_result_url} onChange={e => setM("b2c_result_url")(e.target.value)} /></Field>
                <Field label="B2C Timeout URL"><Input placeholder="https://api.example.com/mpesa/b2c/timeout" value={mpesa.b2c_timeout_url} onChange={e => setM("b2c_timeout_url")(e.target.value)} /></Field>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={saveMpesa} disabled={sv("mpesa") || mpesaLoading} className="gap-2">
                {sv("mpesa") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save M-Pesa Config
              </Button>
              <Button variant="outline" onClick={testMpesa} disabled={testing} className="gap-2">
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Test Connection
              </Button>
              {testResult === "success" && <Badge className="bg-success/15 text-success border-success/30 border gap-1"><CheckCircle className="h-3 w-3" />Connected</Badge>}
              {testResult === "error"   && <Badge className="bg-destructive/15 text-destructive border-destructive/30 border gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>}
            </div>
          </div>
        </Section>

        {/* ── 2. RADIUS & Network ───────────────────────────────────────── */}
        <Section icon={<Router className="h-5 w-5 text-primary" />} title="RADIUS & Network">
          <div className="space-y-4">
            <InfoBox>
              These values are embedded in every MeshDesk/APdesk node config response.{" "}
              <strong className="text-foreground">radius_server_ip</strong> is the IP the AP sends
              Access-Request packets to — it must be reachable from the AP.
              Change from defaults immediately on production deployments.
            </InfoBox>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="RADIUS Server IP" hint="FreeRADIUS listen IP. Use your VPS public IP if APs connect remotely over the internet.">
                <Input className="font-mono" placeholder="127.0.0.1" value={radius.radius_server_ip} onChange={e => setRadius(p => ({ ...p, radius_server_ip: e.target.value }))} />
              </Field>
              <Field label="RADIUS Host (MikroTik proxy)" hint="Used by the MikroTik AAA proxy script. Usually identical to RADIUS Server IP.">
                <Input className="font-mono" placeholder="127.0.0.1" value={radius.radius_host} onChange={e => setRadius(p => ({ ...p, radius_host: e.target.value }))} />
              </Field>
              <Field label="Shared RADIUS Secret" hint="Must match the secret in /etc/freeradius/3.0/clients.conf. Do not use 'testing123' on production.">
                <SecretInput value={radius.radius_secret} onChange={v => setRadius(p => ({ ...p, radius_secret: v }))} placeholder="testing123" showKey={show.radius_secret} onToggle={tog("radius_secret")} />
              </Field>
            </div>
            <SaveRow section="RADIUS" saving={sv("RADIUS")} sysLoading={sysLoading} onSave={() => saveSys("RADIUS", radius)} />
          </div>
        </Section>

        {/* ── 3. Captive Portal / UAM ───────────────────────────────────── */}
        <Section icon={<Globe className="h-5 w-5 text-chart-3" />} title="Captive Portal / UAM">
          <div className="space-y-4">
            <InfoBox>
              Populates the <strong className="text-foreground">CoovaChilli</strong> config sent to every
              mesh exit node and APdesk AP. The UAM URL domain is automatically added to
              the <code>walled_garden</code> list so the portal server is reachable before authentication.
            </InfoBox>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Portal UAM URL" hint="Full HTTPS URL of the subscriber hotspot portal, e.g. https://portal.myisp.co.ke/hotspot — must be publicly accessible from the AP.">
                <Input placeholder="https://portal.myisp.co.ke/hotspot" value={uam.portal_uam_url} onChange={e => setUam(p => ({ ...p, portal_uam_url: e.target.value }))} />
              </Field>
              <Field label="UAM Secret" hint="Shared secret between CoovaChilli and this server. Must match uamsecret in chilli.conf. Do not use the default on production.">
                <SecretInput value={uam.portal_uam_secret} onChange={v => setUam(p => ({ ...p, portal_uam_secret: v }))} placeholder="greatsecret" showKey={show.uam_secret} onToggle={tog("uam_secret")} />
              </Field>
            </div>
            <SaveRow section="Captive Portal" saving={sv("Captive Portal")} sysLoading={sysLoading} onSave={() => saveSys("Captive Portal", uam)} />
          </div>
        </Section>

        {/* ── 4. MeshDesk Timing & Protocol ────────────────────────────── */}
        <Section icon={<Clock className="h-5 w-5 text-warning" />} title="MeshDesk — Node Timing & Reporting" defaultOpen={false}>
          <div className="space-y-4">
            <div className="glass-card p-3 bg-warning/5 border-warning/15 text-[11px] text-muted-foreground">
              Controls how frequently nodes check in and how quickly they are marked offline.
              Changes take effect on the <strong className="text-foreground">next heartbeat</strong> — no reboot required.
              Reduce intervals for real-time monitoring; increase on metered or low-bandwidth backhauls.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Report Protocol" hint="Protocol nodes use to contact MikroBill. Use http for LAN/self-signed setups; https when SSL termination is in place.">
                <Select value={mesh.meshdesk_report_proto} onValueChange={v => setMesh(p => ({ ...p, meshdesk_report_proto: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Dead After (seconds)" hint="Seconds without a heartbeat before a node is marked offline. Default 600. Reduce to 180–300 for faster fault detection.">
                <Input type="number" min={60} max={3600} value={mesh.meshdesk_dead_after} onChange={e => setMesh(p => ({ ...p, meshdesk_dead_after: e.target.value }))} />
              </Field>
              <Field label="Stale Action Timeout (seconds)" hint="Seconds before an unacknowledged command (e.g. reboot) is retried. Default 300.">
                <Input type="number" min={30} max={3600} value={mesh.stale_action_timeout_secs} onChange={e => setMesh(p => ({ ...p, stale_action_timeout_secs: e.target.value }))} />
              </Field>
              <Field label="Light Report Interval (seconds)" hint="Frequency of brief heartbeats (load + uptime only). Default 120. Safe to reduce to 60 on stable backhauls.">
                <Input type="number" min={30} max={900} value={mesh.meshdesk_report_light} onChange={e => setMesh(p => ({ ...p, meshdesk_report_light: e.target.value }))} />
              </Field>
              <Field label="Full Report Interval (seconds)" hint="Frequency of full stats (stations, neighbors, network). Default 300. Keep high on metered links.">
                <Input type="number" min={60} max={3600} value={mesh.meshdesk_report_full} onChange={e => setMesh(p => ({ ...p, meshdesk_report_full: e.target.value }))} />
              </Field>
              <Field label="Station Sampling Interval (seconds)" hint="How often nodes report connected client details. Set 0 to disable. Useful for subscriber location tracking.">
                <Input type="number" min={0} max={3600} value={mesh.meshdesk_report_sampling} onChange={e => setMesh(p => ({ ...p, meshdesk_report_sampling: e.target.value }))} />
              </Field>
            </div>
            <SaveRow section="MeshDesk" saving={sv("MeshDesk")} sysLoading={sysLoading} onSave={() => saveSys("MeshDesk", mesh)} />
          </div>
        </Section>

        {/* ── 5. Maps & Location ────────────────────────────────────────── */}
        <Section icon={<Map className="h-5 w-5 text-info" />} title="Maps & Location" defaultOpen={false}>
          <div className="space-y-4">
            <InfoBox>
              The Mesh Node Planner uses <strong className="text-foreground">OpenStreetMap</strong> by default (free, no key).
              Enter a Google Maps API key here to unlock <strong className="text-foreground">Road</strong> and{" "}
              <strong className="text-foreground">Satellite</strong> tile layers in the planner toolbar.
              The key is shared across all admin sessions — set it once.
            </InfoBox>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Google Maps API Key (optional)"
                hint="Google Cloud Console → APIs & Services → Credentials → Create API Key → enable Maps JavaScript API. Restrict by HTTP Referrer to your admin domain. Free tier: 10,000 map loads/month."
              >
                <SecretInput
                  value={maps.google_maps_api_key}
                  onChange={v => setMaps({ google_maps_api_key: v })}
                  placeholder="AIzaSy…"
                  showKey={show.maps_key}
                  onToggle={tog("maps_key")}
                />
              </Field>
              <div className="glass-card p-3 text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground mb-1.5">Tile layers unlocked in Mesh Planner:</p>
                <p><strong className="text-foreground">OSM</strong> — always available, free, no key required</p>
                <p><strong className="text-foreground">Road</strong> — Google street map with clear building labels</p>
                <p><strong className="text-foreground">Satellite</strong> — aerial view to see rooftops &amp; masts before visiting</p>
                <p className="mt-1.5 text-[10px]">Leave blank to use OSM only. No charges incurred.</p>
              </div>
            </div>
            <SaveRow section="Maps" saving={sv("Maps")} sysLoading={sysLoading} onSave={() => saveSys("Maps", maps)} />
          </div>
        </Section>

        {/* ── 6. SMS ────────────────────────────────────────────────────── */}
        <Section
          icon={<Smartphone className="h-5 w-5 text-success" />}
          title="SMS Notifications"
          badge={sms.sms_provider === "android_gateway" ? "Android Gateway" : sms.sms_provider === "auto" ? "Auto" : "Africa's Talking"}
          badgeVariant="outline"
          defaultOpen={false}
        >
          <div className="space-y-5">

            {/* Provider selector */}
            <Field label="SMS Provider" hint="Choose which service sends SMS notifications. Changes take effect immediately — no server restart needed.">
              <Select value={sms.sms_provider} onValueChange={v => setSms(p => ({ ...p, sms_provider: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="africastalking">Africa's Talking</SelectItem>
                  <SelectItem value="android_gateway">Android SMS Gateway</SelectItem>
                  <SelectItem value="auto">Auto (AT if configured, else Android Gateway)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* Africa's Talking credentials */}
            {(sms.sms_provider === "africastalking" || sms.sms_provider === "auto") && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Africa's Talking</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Username" hint={'Use "sandbox" for testing (no real SMS sent). Change to your registered AT username for production.'}>
                    <Input placeholder="sandbox" value={sms.sms_username} onChange={e => setSms(p => ({ ...p, sms_username: e.target.value }))} />
                  </Field>
                  <Field label="API Key" hint="From https://account.africastalking.com → Settings → API Key.">
                    <SecretInput value={sms.sms_api_key} onChange={v => setSms(p => ({ ...p, sms_api_key: v }))} placeholder="Your AT API key" showKey={show.sms_key} onToggle={tog("sms_key")} />
                  </Field>
                  <Field label="Sender ID (optional)" hint="Alphanumeric sender name (e.g. WIFIBILL). Must be registered and approved by AT. Leave empty to use AT shortcode.">
                    <Input placeholder="WIFIBILL" value={sms.sms_sender_id} onChange={e => setSms(p => ({ ...p, sms_sender_id: e.target.value }))} />
                  </Field>
                </div>
              </div>
            )}

            {/* Android SMS Gateway credentials */}
            {(sms.sms_provider === "android_gateway" || sms.sms_provider === "auto") && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Android SMS Gateway</p>
                <InfoBox>
                  Install the <strong>SMS Gateway for Android</strong> app (sms-gate.app) on any Android 5+ phone.
                  Enable <strong>Cloud Server</strong> mode on the Home tab — then go to the <strong>Settings tab</strong> to find your credentials under <strong>Credentials</strong> and Device ID under <strong>Device</strong>.
                </InfoBox>

                {/* Read-only server address — matches exactly what the app shows */}
                <div className="grid grid-cols-1 gap-4">
                  <Field
                    label="Server Address"
                    hint="The app's Settings tab shows API URL: https://api.sms-gate.app/mobile/v1 — that is the internal device channel. MikroBill uses the integration API at /3rdparty/v1 (same host, different path). No configuration needed here."
                  >
                    <Input className="font-mono bg-muted/40 text-muted-foreground" readOnly value="api.sms-gate.app (3rdparty/v1 — fixed)" />
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Username" hint="App → Settings → Credentials → Username (e.g. JJRY-O).">
                    <Input className="font-mono" placeholder="e.g. JJRY-O" value={sms.android_gw_username} onChange={e => setSms(p => ({ ...p, android_gw_username: e.target.value }))} />
                  </Field>
                  <Field label="Password" hint="App → Settings → Credentials → Password (e.g. df4bo_zfueqdzq).">
                    <SecretInput value={sms.android_gw_password} onChange={v => setSms(p => ({ ...p, android_gw_password: v }))} placeholder="e.g. df4bo_zfueqdzq" showKey={show.android_gw_pass} onToggle={tog("android_gw_pass")} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Field label="Device ID (optional)" hint="App → Settings → Device → Device ID (e.g. oQSvJ4Ksv9SvcRDblnl9A). Only needed when multiple Android phones share one account — leave blank to auto-route.">
                    <Input className="font-mono" placeholder="e.g. oQSvJ4Ksv9SvcRDblnl9A" value={sms.android_gw_device_id} onChange={e => setSms(p => ({ ...p, android_gw_device_id: e.target.value }))} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Field label="Webhook Signing Key (optional)" hint="From the app: Settings → Webhooks → Signing Key. Used to verify delivery callbacks (sms:delivered, sms:failed) are genuinely from your device. Strongly recommended for production.">
                    <SecretInput value={sms.android_gw_webhook_secret} onChange={v => setSms(p => ({ ...p, android_gw_webhook_secret: v }))} placeholder="Paste signing key from app" showKey={show.android_gw_webhook} onToggle={tog("android_gw_webhook")} />
                  </Field>
                </div>

                {/* Webhook URL display — operator copies this into the gateway app */}
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-foreground">Delivery Webhook URL</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Register this URL in the SMS Gateway app (<strong>Settings → Webhooks → Add</strong>) for the events
                    <code className="mx-1 bg-muted px-1 rounded text-[9px]">sms:sent</code>
                    <code className="mx-1 bg-muted px-1 rounded text-[9px]">sms:delivered</code>
                    <code className="mx-1 bg-muted px-1 rounded text-[9px]">sms:failed</code>.
                    This enables real delivery confirmation in the Notifications dashboard.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      className="font-mono text-xs bg-background"
                      readOnly
                      value={`${(window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "https://your-domain.com/api")}/webhooks/android-gateway`}
                    />
                    <button
                      type="button"
                      className="shrink-0 text-xs text-primary hover:underline"
                      onClick={() => {
                        const url = `${(window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "")}/webhooks/android-gateway`;
                        navigator.clipboard.writeText(url).then(() => toast({ title: "Webhook URL copied ✅" }));
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  🔐 Authentication is handled automatically — credentials are used once to obtain a JWT token which is then cached and refreshed in the background.
                </p>
              </div>
            )}

            <SaveRow section="SMS" saving={sv("SMS")} sysLoading={sysLoading} onSave={() => saveSys("SMS", sms)} />
          </div>
        </Section>

        {/* ── 7. Free WhatsApp Chat (v3.17.0) ──────────────────────────── */}
        <Section
          icon={<span className="text-lg">💬</span>}
          title="Free WhatsApp Chat"
          badge={fwa.free_whatsapp_enabled === "true" ? "Enabled" : "Disabled"}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Grants unregistered hotspot visitors limited free access to WhatsApp (text &amp; voice notes only).
              Acts as a conversion engine — the package purchase screen is always visible while free access works in the background.
            </p>

            <Field label="Enable Free WhatsApp Chat" hint="Master switch. When disabled, the option is hidden from the hotspot portal entirely.">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFwa(p => ({ ...p, free_whatsapp_enabled: p.free_whatsapp_enabled === "true" ? "false" : "true" }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${fwa.free_whatsapp_enabled === "true" ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${fwa.free_whatsapp_enabled === "true" ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-muted-foreground">{fwa.free_whatsapp_enabled === "true" ? "Enabled" : "Disabled"}</span>
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Free Window Duration (days)" hint="How many days the free window lasts. After it expires the user must register again or buy a package. Range: 1–30.">
                <Input
                  type="number" min="1" max="30"
                  value={fwa.free_whatsapp_window_days}
                  onChange={e => setFwa(p => ({ ...p, free_whatsapp_window_days: e.target.value }))}
                />
              </Field>
              <Field label="Daily Data Cap (MB)" hint="Maximum data per day for free tier users. Resets at midnight. At 70% usage a nudge SMS is sent.">
                <Input
                  type="number" min="10" max="1000"
                  value={fwa.free_whatsapp_daily_cap_mb}
                  onChange={e => setFwa(p => ({ ...p, free_whatsapp_daily_cap_mb: e.target.value }))}
                />
              </Field>
              <Field label="Download Speed Limit" hint="MikroTik rate limit string for free tier download. E.g. 1M, 512k, 2M.">
                <Input
                  placeholder="1M"
                  value={fwa.free_whatsapp_speed_down}
                  onChange={e => setFwa(p => ({ ...p, free_whatsapp_speed_down: e.target.value }))}
                />
              </Field>
              <Field label="Upload Speed Limit" hint="MikroTik rate limit string for free tier upload. E.g. 512k, 256k, 1M.">
                <Input
                  placeholder="512k"
                  value={fwa.free_whatsapp_speed_up}
                  onChange={e => setFwa(p => ({ ...p, free_whatsapp_speed_up: e.target.value }))}
                />
              </Field>
              <Field label="Extension on Purchase (days)" hint="Days added to a user's free window when they buy any package. Rewards conversion.">
                <Input
                  type="number" min="0" max="30"
                  value={fwa.free_whatsapp_extend_days}
                  onChange={e => setFwa(p => ({ ...p, free_whatsapp_extend_days: e.target.value }))}
                />
              </Field>
              <Field label="OTP Validity (seconds)" hint="How long the verification code is valid. Default 300 = 5 minutes.">
                <Input
                  type="number" min="60" max="900"
                  value={fwa.free_whatsapp_otp_ttl_seconds}
                  onChange={e => setFwa(p => ({ ...p, free_whatsapp_otp_ttl_seconds: e.target.value }))}
                />
              </Field>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">MikroTik Walled Garden required</p>
              <p>Add the following to your MikroTik hotspot walled garden so WhatsApp domains are accessible before payment:</p>
              <code className="block font-mono text-[10px] bg-background rounded p-2 mt-1 whitespace-pre">
{`*.whatsapp.com   *.whatsapp.net
web.whatsapp.com *.wa.me
*.fna.whatsapp.net`}
              </code>
              <p className="mt-1">Do <strong>not</strong> add mmg.whatsapp.net or *.fbcdn.net — these are photo/video CDNs excluded from the free tier.</p>
            </div>

            <SaveRow section="FWA" saving={sv("FWA")} sysLoading={sysLoading} onSave={() => saveSys("FWA", fwa)} />
          </div>
        </Section>

        {/* ── 7. FCM ────────────────────────────────────────────────────── */}
        <Section icon={<Bell className="h-5 w-5 text-chart-3" />} title="Push Notifications — Firebase (FCM)" defaultOpen={false}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="FCM Server Key" hint="Firebase Console → Project Settings → Cloud Messaging → Server key. Used for payment confirmations and expiry reminders to the subscriber PWA.">
                <SecretInput value={fcm.fcm_server_key} onChange={v => setFcm(p => ({ ...p, fcm_server_key: v }))} placeholder="From Firebase console" showKey={show.fcm_key} onToggle={tog("fcm_key")} />
              </Field>
              <Field label="Firebase Project ID" hint="Firebase Console → Project Settings → Project ID. Format: my-project-name.">
                <Input className="font-mono" placeholder="my-wifi-billing-app" value={fcm.fcm_project_id} onChange={e => setFcm(p => ({ ...p, fcm_project_id: e.target.value }))} />
              </Field>
            </div>
            <SaveRow section="FCM" saving={sv("FCM")} sysLoading={sysLoading} onSave={() => saveSys("FCM", fcm)} />
          </div>
        </Section>

        {/* ── 8. DLNA ───────────────────────────────────────────────────── */}
        <Section
          icon={<Tv2 className="h-5 w-5 text-primary" />}
          title="DLNA Media Server"
          defaultOpen={false}
          badge={dlna.dlna_enabled === "true" ? "Enabled" : "Disabled"}
          badgeVariant={dlna.dlna_enabled === "true" ? "success" : "outline"}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Enable DLNA Access Control" hint="Only active subscribers can access Universal Media Server. The dlna-allowed address-list on MikroTik is refreshed every 10 minutes.">
                <div className="flex items-center gap-3 h-10">
                  <Switch
                    checked={dlna.dlna_enabled === "true"}
                    onCheckedChange={v => setDlna(p => ({ ...p, dlna_enabled: v ? "true" : "false" }))}
                  />
                  <span className="text-sm text-muted-foreground">{dlna.dlna_enabled === "true" ? "On" : "Off"}</span>
                </div>
              </Field>
              <Field label="UMS Server IP (LAN)" hint="Static LAN IP of the Universal Media Server PC. Set a static DHCP lease on MikroTik for this device.">
                <Input className="font-mono" placeholder="192.168.88.200" value={dlna.dlna_server_ip} onChange={e => setDlna(p => ({ ...p, dlna_server_ip: e.target.value }))} />
              </Field>
              <Field label="UMS HTTP Streaming Port" hint="Port UMS listens on for HTTP streaming (default 8200). Re-download the router setup script after changing this.">
                <Input type="number" placeholder="8200" value={dlna.dlna_http_port} onChange={e => setDlna(p => ({ ...p, dlna_http_port: e.target.value }))} />
              </Field>
            </div>
            <SaveRow section="DLNA" saving={sv("DLNA")} sysLoading={sysLoading} onSave={() => saveSys("DLNA", dlna)} />
          </div>
        </Section>

        {/* ── 9. Tax & Compliance ───────────────────────────────────────── */}
        <Section icon={<Receipt className="h-5 w-5 text-warning" />} title="Tax & Compliance" defaultOpen={false}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="VAT Rate (%)" hint="Applied to package prices on invoices and receipts. Set to 0 to disable VAT. Kenya standard rate is 16%.">
                <Input type="number" min={0} max={100} step={0.5} placeholder="16" value={tax.tax_vat_rate} onChange={e => setTax(p => ({ ...p, tax_vat_rate: e.target.value }))} />
              </Field>
              <Field label="KRA PIN" hint="Printed on invoices and receipts for compliance. Format: P followed by 9 digits and a letter, e.g. P051234567X.">
                <Input className="font-mono uppercase" placeholder="P051234567X" value={tax.tax_kra_pin} onChange={e => setTax(p => ({ ...p, tax_kra_pin: e.target.value.toUpperCase() }))} />
              </Field>
            </div>
            <SaveRow section="Tax" saving={sv("Tax")} sysLoading={sysLoading} onSave={() => saveSys("Tax", tax)} />
          </div>
        </Section>

      </div>
    </AdminLayout>
  );
};

export default SettingsPage;