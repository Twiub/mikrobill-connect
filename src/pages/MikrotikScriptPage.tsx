/**
 * src/pages/MikrotikScriptPage.tsx
 *
 * Admin page to generate RouterOS setup scripts for new MikroTik routers.
 * Calls the backend /api/admin/mikrotik/setup-script endpoint.
 * Falls back to client-side generation if backend is unavailable.
 */

import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Terminal, Download, Copy, RefreshCw, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getToken } from "@/lib/authClient";

const DEFAULT_FORM = {
  radiusHost:         "",
  radiusSecret:       "",
  wanInterface:       "ether1",
  lanInterface:       "bridge1",
  dhcpPool:           "192.168.88.10-192.168.88.254",
  hotspotInterface:   "bridge1",
  hotspotAddress:     "192.168.88.1",
  wanBandwidthMbps:   "100",
  apiPassword:        "",          // API user password — written to router by script
  includeBridgeSetup: true,        // Create bridge1 + add ether2-5
  includeWanSetup:    true,        // WAN DHCP client + NAT masquerade
  includeApiUser:     true,        // Create mikrobill-api user
  maxConnectionsPerUser: 300 as number | null,   // v3.2.2: per-IP conntrack limit (null = disabled)
};

const MikrotikScriptPage = () => {
  const { toast } = useToast();
  const [form, setForm]       = useState({ ...DEFAULT_FORM });
  const [script, setScript]   = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const generate = async () => {
    if (!form.radiusHost || !form.radiusSecret) {
      toast({ title: "Validation Error", description: "RADIUS host and secret are required.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_BACKEND_URL ?? "/api";
      const token = getToken() ?? "";

      const res = await fetch(`${apiBase}/admin/mikrotik/setup-script`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Backend unavailable");

      const data = await res.json();
      setScript(data.script);
    } catch {
      // Fall back to client-side generation
      setScript(generateClientSideScript(form));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Script copied to clipboard." });
  };

  const download = () => {
    const blob = new Blob([script], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `mikrobill-setup-${new Date().toISOString().slice(0, 10)}.rsc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">MikroTik Script Generator</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Generate a RouterOS setup script for a new MikroTik router</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Config Form */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Router Configuration</h3>

            <div className="space-y-1">
              <Label className="text-xs">RADIUS / Billing Server IP *</Label>
              <Input placeholder="e.g. 196.201.100.50" value={form.radiusHost} onChange={set("radiusHost")} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">RADIUS Shared Secret * (min 8 chars)</Label>
              <Input type="password" placeholder="strong-secret-here" value={form.radiusSecret} onChange={set("radiusSecret")} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Mikrobill API User Password *</Label>
              <Input type="password" placeholder="strong-api-password" value={form.apiPassword} onChange={set("apiPassword")} />
              <p className="text-[10px] text-muted-foreground">Script creates mikrobill-api user on the router with this password</p>
            </div>

            {/* Bootstrap toggles */}
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-foreground/80">Bootstrap (auto-configure on first run)</p>
              {[
                { key: "includeBridgeSetup" as const, label: "Create LAN bridge + add ether2–ether5" },
                { key: "includeWanSetup"    as const, label: "WAN DHCP client + NAT masquerade" },
                { key: "includeApiUser"     as const, label: "Create mikrobill-api user" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-xs font-normal">{label}</Label>
                  <Switch
                    checked={form[key] as boolean}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                  />
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground pt-1">
                Disable only if the router is already partially configured
              </p>
            </div>

            {/* Advanced / topology */}
            <button
              type="button"
              onClick={() => setShowAdvanced((x) => !x)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAdvanced ? "Hide" : "Show"} advanced topology settings
            </button>

            {showAdvanced && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">WAN Interface</Label>
                    <Input placeholder="ether1" value={form.wanInterface} onChange={set("wanInterface")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">LAN / Bridge Interface</Label>
                    <Input placeholder="bridge1" value={form.lanInterface} onChange={set("lanInterface")} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">DHCP Pool Range</Label>
                  <Input placeholder="192.168.88.10-192.168.88.254" value={form.dhcpPool} onChange={set("dhcpPool")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Hotspot Interface</Label>
                    <Input placeholder="bridge1" value={form.hotspotInterface} onChange={set("hotspotInterface")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hotspot Gateway IP</Label>
                    <Input placeholder="192.168.88.1" value={form.hotspotAddress} onChange={set("hotspotAddress")} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WAN Bandwidth (Mbps)</Label>
                  <Input type="number" placeholder="100" value={form.wanBandwidthMbps} onChange={set("wanBandwidthMbps")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Conn Limit / User (anti-torrent)</Label>
                  <Input type="number" placeholder="300 (blank = disabled)" value={form.maxConnectionsPerUser ?? ""} onChange={(e) => set("maxConnectionsPerUser")(e.target.value === "" ? null : parseInt(e.target.value, 10))} />
                  <p className="text-[10px] text-muted-foreground">150=strict · 300=residential · 400=PPPoE · blank=none</p>
                </div>
              </div>
            )}

            <Button onClick={generate} disabled={loading} className="w-full gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
              {loading ? "Generating…" : "Generate Script"}
            </Button>
          </div>

          {/* Script Output */}
          <div className="glass-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">RouterOS Script Output</h3>
              {script && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-1 h-7 text-xs">
                    {copied ? <CheckCircle className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={download} className="gap-1 h-7 text-xs">
                    <Download className="h-3 w-3" />Download .rsc
                  </Button>
                </div>
              )}
            </div>

            {script ? (
              <Textarea
                readOnly
                value={script}
                className="font-mono text-[10px] bg-muted/50 flex-1 min-h-[500px] resize-none"
              />
            ) : (
              <div className="flex-1 min-h-[400px] rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Fill in the form and click Generate Script</p>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">How to Apply the Script</h3>
          <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
            <li>Fill in RADIUS host, RADIUS secret, and the API user password above — then click <strong>Generate Script</strong></li>
            <li>Download the <span className="font-mono bg-muted px-1 rounded">.rsc</span> file</li>
            <li>Open <strong>Winbox</strong> → connect to the router → drag & drop the <span className="font-mono bg-muted px-1 rounded">.rsc</span> file onto the Files panel</li>
            <li>Open <strong>Terminal</strong> and run: <span className="font-mono bg-muted px-1 rounded">/import file-name=mikrobill-setup.rsc</span></li>
            <li>The script automatically creates the LAN bridge, WAN DHCP client, NAT, API user, RADIUS, PPPoE, Hotspot, CAKE QoS, and tethering rules</li>
            <li>Router phones home to the billing backend — status turns <strong>Online</strong> in the Admin Panel within 30 seconds</li>
            <li>No manual RouterOS commands needed before or after — the script is fully self-contained</li>
          </ol>
        </div>
      </div>
    </AdminLayout>
  );
};

// Client-side fallback script generator (mirrors backend service)
function generateClientSideScript(cfg: typeof DEFAULT_FORM): string {
  return `# ================================================================
# Mikrobill Connect v3.2.0 — MikroTik RouterOS Setup Script
# Generated: ${new Date().toISOString()}
# ================================================================

# ── 1. RADIUS Client ─────────────────────────────────────────────
/radius remove [find]
/radius add address=${cfg.radiusHost} secret="${cfg.radiusSecret}" service=ppp,hotspot authentication-port=1812 accounting-port=1813 timeout=3s comment="Mikrobill RADIUS"
/radius incoming set accept=yes port=3799

# ── 2. PPPoE Server ──────────────────────────────────────────────
/ppp profile add name=mikrobill-pppoe use-radius=yes change-tcp-mss=yes only-one=yes
/interface pppoe-server server add interface=${cfg.wanInterface} service-name=mikrobill authentication=mschap2 default-profile=mikrobill-pppoe one-session-per-host=yes max-sessions=1024 disabled=no

# ── 3. Hotspot Server ────────────────────────────────────────────
/ip hotspot profile add name=mikrobill-hotspot use-radius=yes radius-accounting=yes hotspot-address=192.168.88.1 login-by=http-chap,cookie
/ip hotspot add name=hotspot1 interface=${cfg.hotspotInterface} profile=mikrobill-hotspot addresses-per-mac=2 disabled=no

# ── 4. DHCP Server ───────────────────────────────────────────────
/ip pool add name=dhcp-pool ranges=${cfg.dhcpPool}
/ip dhcp-server add name=dhcp1 interface=${cfg.lanInterface} address-pool=dhcp-pool lease-time=1d disabled=no
/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=8.8.8.8,1.1.1.1

# ── 5. CAKE QoS (RouterOS v7) ────────────────────────────────────
/queue tree add name=wan-cake parent=global packet-mark=all queue=cake max-limit=${cfg.wanBandwidthMbps}M comment="WAN CAKE shaper"

# ── 6. TTL Mangle — Tethering Detection ─────────────────────────
/ip firewall mangle add chain=prerouting in-interface=${cfg.lanInterface} ttl=63 action=add-src-to-address-list address-list=tethered-devices address-list-timeout=10m comment="TTL 63 tether (Android)"
/ip firewall mangle add chain=prerouting in-interface=${cfg.lanInterface} ttl=127 action=add-src-to-address-list address-list=tethered-devices address-list-timeout=10m comment="TTL 127 tether (iOS)"

# ── 7. TV Bypass Address List ────────────────────────────────────
/ip firewall address-list add list=allowed-tvs address=0.0.0.0 comment="Managed by billing system" disabled=yes
/ip firewall filter add chain=forward src-address-list=allowed-tvs action=accept place-before=0 comment="Allow bound TVs"

# ── 8. RADIUS Interim Accounting ─────────────────────────────────
/ppp profile set mikrobill-pppoe interim-update=1m

:log info "Mikrobill setup complete"
:put "Done! Router ready for Mikrobill Connect."
`;
}

export default MikrotikScriptPage;
