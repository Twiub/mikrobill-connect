/**
 * SettingsPage.tsx — v2.1.0 (v3.16.0)
 *
 * Consolidated system settings. Every configurable key lives here.
 *
 * Sections:
 *   1. M-Pesa Daraja API        — mpesa_config table (existing)
 *   2. RADIUS & Network         — system_settings (radius_server_ip, radius_secret, radius_host)
 *   3. Captive Portal / UAM     — system_settings (portal_uam_url, portal_uam_secret)
 *   6. SMS Notifications        — system_settings (sms_provider, sms_*, android_gw_*)
 *                                 Provider selector: Africa's Talking | Android SMS Gateway | Auto
 *                                 Android GW: Username, Password, Device ID (server is fixed)
 *   8. Push Notifications (FCM) — system_settings (fcm_*)
 *  10. Tax & Compliance         — system_settings (tax_*)
 *
 * v3.16.0: SMS section replaced with provider-aware UI (AT + Android SMS Gateway)
 */

import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";

async function adminApi(method: string, path: string, body?: object) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// BUG-NEW-R18-D FIX: Read mpesa_config via backend admin API instead of the Supabase
// frontend client. Migration 232 (v3.18.0) removed the 'authenticated' RLS policy from
// mpesa_config, restricting it to service_role only. The frontend Supabase client uses
// SUPABASE_PUBLISHABLE_KEY (anon/authenticated role) which is now blocked by RLS.
// The backend route GET /api/admin/system-settings/mpesa-config uses the service-role
// connection and is protected by authenticateUser + requireRole('super_admin').
const useMpesaConfig = () => useQuery({
  queryKey: ["mpesa_config"],
  queryFn: async () => {
    const d = await adminApi("GET", "/admin/system-settings/mpesa-config");
    if (!d.success) throw new Error(d.error || "Failed to load M-Pesa config");
    return d.config;
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
  const { data: mpesaCfg, isLoading: mpesaLoading } = useMpesaConfig();
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
  });
  const [maps,   setMaps]   = useState({
  const [sms,    setSms]    = useState({
    sms_provider: "africastalking",
    sms_provider_fallback: "none",
    sms_api_key: "", sms_username: "sandbox", sms_sender_id: "",
    android_gw_username: "", android_gw_password: "", android_gw_device_id: "", android_gw_webhook_secret: "",
  });
  const [fcm,    setFcm]    = useState({ fcm_server_key: "", fcm_project_id: "" });
  const [dlna,   setDlna]   = useState({
  const [tax,    setTax]    = useState({ tax_vat_rate: "16", tax_kra_pin: "" });
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
    adminApi("GET", "/admin/system-settings")
      .then(d => {
        if (!d.success) return;
        const s = d.settings;
        setRadius({ radius_server_ip: s.radius_server_ip ?? "127.0.0.1", radius_secret: s.radius_secret ?? "", radius_host: s.radius_host ?? "127.0.0.1" });
        setUam({ portal_uam_url: s.portal_uam_url ?? "", portal_uam_secret: s.portal_uam_secret ?? "greatsecret" });
        setMesh({
        });
        setMaps({
        setSms({
          sms_provider:             s.sms_provider             ?? "africastalking",
          sms_provider_fallback:    s.sms_provider_fallback    ?? "none",
          sms_api_key:              s.sms_api_key              ?? "",
          sms_username:             s.sms_username             ?? "sandbox",
          sms_sender_id:            s.sms_sender_id            ?? "",
          android_gw_username:      s.android_gw_username      ?? "",
          android_gw_password:      s.android_gw_password      ?? "",
          android_gw_device_id:     s.android_gw_device_id     ?? "",
          android_gw_webhook_secret: s.android_gw_webhook_secret ?? "",
        });
        setFcm({ fcm_server_key: s.fcm_server_key ?? "", fcm_project_id: s.fcm_project_id ?? "" });
        setDlna({
        setTax({ tax_vat_rate: s.tax_vat_rate ?? "16", tax_kra_pin: s.tax_kra_pin ?? "" });
        setFwa({
        });
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
      const d = await adminApi("PUT", "/admin/system-settings/mpesa-config", mpesa);
      if (!d.success) throw new Error(d.error || "Save failed");
      queryClient.invalidateQueries({ queryKey: ["mpesa_config"] });
      toast({ title: "M-Pesa Config Saved ✅" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingSection(null); }
  };

  const saveSys = async (section: string, values: Record<string, string>) => {
    setSavingSection(section);
    try {
      const d = await adminApi("PUT", "/admin/system-settings", values);
      if (!d.success) throw new Error(d.error ?? "Save failed");
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
      const resp = await fetch(`/admin/mpesa/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
              These values configure the captive portal UAM behaviour.{" "}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Primary SMS Provider" hint="The first provider used for every SMS send. Changes take effect immediately — no server restart needed.">
                <Select value={sms.sms_provider} onValueChange={v => setSms(p => ({ ...p, sms_provider: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="africastalking">Africa's Talking</SelectItem>
                    <SelectItem value="android_gateway">Android SMS Gateway</SelectItem>
                    <SelectItem value="auto">Auto (AT if configured, else Android Gateway)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Fallback Provider" hint="If the primary provider fails, the SMS is automatically retried via this provider. Set to None to disable failover.">
                <Select value={sms.sms_provider_fallback} onValueChange={v => setSms(p => ({ ...p, sms_provider_fallback: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (no failover)</SelectItem>
                    {sms.sms_provider !== "africastalking" && (
                      <SelectItem value="africastalking">Africa's Talking</SelectItem>
                    )}
                    {sms.sms_provider !== "android_gateway" && (
                      <SelectItem value="android_gateway">Android SMS Gateway</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {sms.sms_provider_fallback !== "none" && sms.sms_provider_fallback === sms.sms_provider && (
                  <p className="text-[10px] text-destructive mt-1">Fallback must be different from primary.</p>
                )}
              </Field>
            </div>

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
                      value={`${""}/webhooks/android-gateway`}
                    />
                    <button
                      type="button"
                      className="shrink-0 text-xs text-primary hover:underline"
                      onClick={() => {
                        const url = `${""}/webhooks/android-gateway`;
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

        {/* ── 8. FCM ────────────────────────────────────────────────────── */}
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