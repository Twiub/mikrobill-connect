/**
 * src/pages/APdeskPage.tsx — v3.6.0
 *
 * APdesk Management Page
 * Full port of rdcore APdesk features:
 *   - AP Profile list (name, AP count, online/offline)
 *   - Create / Edit / Delete AP Profiles
 *   - Profile entries (SSID slots: encryption, radius, band, VLAN)
 *   - Profile exits (captive portal / gateway config)
 *   - Access Point list per profile (status, last contact, MAC, IP, firmware)
 *   - Add / Edit / Delete access points
 *   - Queue AP actions (reboot, reconfigure)
 *   - Network → Site → Cloud hierarchy browser
 *   - Export APs to CSV
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Wifi, Plus, Trash2, RefreshCw, ChevronRight, ChevronDown,
  Network, Globe, MapPin, Activity, Settings, Radio, Download,
  RotateCw, AlertCircle, CheckCircle2, Edit, Phone, LocateFixed,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/authClient";
import DumbApTab from "@/components/DumbApTab";

const API = (window as Window & { __MIKROBILL_API__?: string }).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");
async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Cloud { id: number; name: string; site_name: string; network_name: string; }

interface ApProfile {
  id: number; name: string; description: string; cloud_id: number | null;
  timezone: string; ap_count: number; aps_up: number; created_at: string;
  entries?: ProfileEntry[]; exits?: ProfileExit[]; aps?: AccessPoint[];
}

interface ProfileEntry {
  id: number; ssid: string; encryption: string; key: string;
  vlan_id: number | null; radius_ip: string; band: string;
  hidden: boolean; isolate: boolean;
}

interface ProfileExit {
  id: number; name: string; gateway_type: string;
  radius_ip: string; radius_secret: string;
  uam_url: string; uam_secret: string; walled_garden: string;
}

interface AccessPoint {
  id: number; name: string; mac: string; description: string;
  ap_profile_id: number | null; profile_name: string | null;
  hardware: string | null; firmware: string | null;
  last_contact: string | null; last_contact_from_ip: string | null;
  lat: number | null; lon: number | null;
  contact_phone: string;
  lan_ip: string; lan_proto: string;
  status: "online" | "offline";
  station_count: number; pending_action: string | null;
  reboot_flag: boolean; on_public_maps: boolean;
}

const ago = (dt: string | null) => {
  if (!dt) return "never";
  const s = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};

const StatusDot = ({ online }: { online: boolean }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${online ? "bg-green-500" : "bg-red-500"}`} />
);

const ENCRYPTIONS = ["none", "psk", "psk2", "psk-mixed", "wpa3", "wpa2", "802.1x"];
const BANDS       = ["both", "2ghz", "5ghz", "6ghz"];
const GATEWAY_TYPES = ["none", "lan", "3g", "mwan", "wifi", "wan_static"];


// ── Location Picker (shared with MeshDesk) ───────────────────────────────────
function ApLocationPicker({ lat, lon, onChange }: { lat: string; lon: string; onChange: (lat: string, lon: string) => void }) {
  const [method, setMethod]   = React.useState<"manual"|"gps"|"map">("manual");
  const [gpsState, setGpsState] = React.useState<"idle"|"loading"|"done"|"error">("idle");
  const [gpsError, setGpsError] = React.useState("");
  const mapRef     = React.useRef<HTMLDivElement>(null);
  const leafletMap = React.useRef<any>(null);
  const markerRef  = React.useRef<any>(null);

  const getGPS = () => {
    if (!navigator.geolocation) { setGpsError("Geolocation not supported"); return; }
    setGpsState("loading");
    navigator.geolocation.getCurrentPosition(
      pos => { onChange(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6)); setGpsState("done"); },
      err => { setGpsError(err.message); setGpsState("error"); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  React.useEffect(() => {
    if (method !== "map" || !mapRef.current || leafletMap.current) return;
    const init = async () => {
      if (!document.getElementById("leaflet-css")) {
        const l = document.createElement("link"); l.id = "leaflet-css"; l.rel = "stylesheet";
        l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(l);
      }
      type LeafletWindow = Window & { L?: unknown };
      if (!(window as LeafletWindow).L) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
          s.onload = res; s.onerror = rej; document.body.appendChild(s);
        });
      }
      const L = (window as LeafletWindow).L as Record<string, (...args: unknown[]) => unknown>;
      const iLat = lat ? parseFloat(lat) : -1.2921, iLon = lon ? parseFloat(lon) : 36.8219;
      leafletMap.current = L.map(mapRef.current).setView([iLat, iLon], lat ? 15 : 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(leafletMap.current);
      if (lat && lon) {
        markerRef.current = L.marker([iLat, iLon], { draggable: true }).addTo(leafletMap.current);
        markerRef.current.on("dragend", () => { const p = markerRef.current.getLatLng(); onChange(p.lat.toFixed(6), p.lng.toFixed(6)); });
      }
      leafletMap.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const { lat: la, lng: lo } = e.latlng; onChange(la.toFixed(6), lo.toFixed(6));
        if (markerRef.current) markerRef.current.setLatLng([la, lo]);
        else {
          markerRef.current = L.marker([la, lo], { draggable: true }).addTo(leafletMap.current);
          markerRef.current.on("dragend", () => { const p = markerRef.current.getLatLng(); onChange(p.lat.toFixed(6), p.lng.toFixed(6)); });
        }
      });
    };
    init().catch(console.error);
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; markerRef.current = null; } };
  }, [method]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Location</Label>
      <div className="flex gap-1">
        {(["manual","gps","map"] as const).map(m => (
          <button key={m} type="button" onClick={() => setMethod(m)}
            className={`px-2.5 py-1 rounded border text-xs transition-colors ${method === m ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"}`}>
            {m === "manual" && "✏ Manual"}{m === "gps" && "📍 GPS"}{m === "map" && "🗺 Map"}
          </button>
        ))}
      </div>
      {method === "manual" && (
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-[10px] text-muted-foreground">Latitude</Label><Input className="mt-0.5 h-8 text-sm" placeholder="-1.2921" value={lat} onChange={e => onChange(e.target.value, lon)} /></div>
          <div><Label className="text-[10px] text-muted-foreground">Longitude</Label><Input className="mt-0.5 h-8 text-sm" placeholder="36.8219" value={lon} onChange={e => onChange(lat, e.target.value)} /></div>
        </div>
      )}
      {method === "gps" && (
        <div className="space-y-1.5">
          <Button type="button" size="sm" variant="outline" className="w-full h-8 text-xs" onClick={getGPS} disabled={gpsState === "loading"}>
            {gpsState === "loading" ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" />Locating…</> : <><LocateFixed className="h-3 w-3 mr-2" />Get GPS location</>}
          </Button>
          {gpsState === "done" && lat && <p className="text-[10px] text-green-600 font-mono">✓ {lat}, {lon}</p>}
          {gpsState === "error" && <p className="text-[10px] text-destructive">{gpsError}</p>}
        </div>
      )}
      {method === "map" && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Click to place pin. Drag to adjust.</p>
          <div ref={mapRef} style={{ height: 220, borderRadius: 6, border: "1px solid var(--border)" }} />
          {lat && lon && <p className="text-[10px] text-muted-foreground font-mono mt-1">📍 {lat}, {lon}</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function APdeskPage() {
  const { toast } = useToast();

  const [profiles,  setProfiles]  = useState<ApProfile[]>([]);
  const [allAps,    setAllAps]    = useState<AccessPoint[]>([]);
  const [clouds,    setClouds]    = useState<Cloud[]>([]);
  const [tab, setTab]             = useState("profiles");
  const [loading, setLoading]     = useState(true);
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);

  // Dialogs
  const [profileDialog, setProfileDialog] = useState<{
    open: boolean; mode: "add"|"edit"; profile?: ApProfile
  }>({ open: false, mode: "add" });

  const [apDialog, setApDialog] = useState<{
    open: boolean; mode: "add"|"edit"; ap?: AccessPoint; profileId?: number
  }>({ open: false, mode: "add" });

  const [entryDialog, setEntryDialog] = useState<{
    open: boolean; profileId: number | null; mode: "add"|"edit"; entryId?: number;
  }>({ open: false, profileId: null, mode: "add" });

  const [exitDialog, setExitDialog] = useState<{
    open: boolean; profileId: number | null;
  }>({ open: false, profileId: null });

  // Form state
  const [profileForm, setProfileForm] = useState({
    name: "", description: "", cloud_id: "", timezone: "Africa/Nairobi",
  });
  const [apForm, setApForm] = useState({
    name: "", mac: "", description: "", ap_profile_id: "",
    hardware: "", lat: "", lon: "", on_public_maps: false, contact_phone: "",
  });
  const [entryForm, setEntryForm] = useState({
    ssid: "", encryption: "none", key: "", vlan_id: "",
    radius_ip: "", radius_secret: "", hidden: false, isolate: false, band: "both",
    exit_id: "" as string,
  });
  const [exitForm, setExitForm] = useState({
    name: "", gateway_type: "none", radius_ip: "", radius_secret: "",
    uam_url: "", uam_secret: "", walled_garden: "",
  });

  const load = useCallback(async () => {
    try {
      const [pr, ap, cl] = await Promise.all([
        apiFetch("/admin/apdesk/profiles"),
        apiFetch("/admin/apdesk/access-points"),
        apiFetch("/admin/apdesk/clouds"),
      ]);
      setProfiles(pr.data || []);
      setAllAps(ap.data || []);
      setClouds(cl.data || []);
    } catch (err) {
      toast({ title: "Load failed", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const loadProfile = async (id: number) => {
    try {
      const res = await apiFetch(`/admin/apdesk/profiles/${id}`);
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...res.data } : p));
    } catch { /* silent */ }
  };

  const toggleProfile = async (id: number) => {
    if (expandedProfile === id) { setExpandedProfile(null); return; }
    setExpandedProfile(id);
    await loadProfile(id);
  };

  // ── Profile CRUD ────────────────────────────────────────────────────────────
  const saveProfile = async () => {
    try {
      if (profileDialog.mode === "add") {
        await apiFetch("/admin/apdesk/profiles", {
          method: "POST",
          body: JSON.stringify({
            name: profileForm.name,
            description: profileForm.description,
            cloud_id: profileForm.cloud_id || null,
            timezone: profileForm.timezone,
          }),
        });
        toast({ title: "AP Profile created" });
      } else if (profileDialog.profile) {
        await apiFetch(`/admin/apdesk/profiles/${profileDialog.profile.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: profileForm.name,
            description: profileForm.description,
            timezone: profileForm.timezone,
          }),
        });
        toast({ title: "Profile updated" });
      }
      setProfileDialog({ open: false, mode: "add" });
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    }
  };

  const deleteProfile = async (id: number) => {
    if (!confirm("Delete this AP profile? All linked APs will be unlinked.")) return;
    try {
      await apiFetch(`/admin/apdesk/profiles/${id}`, { method: "DELETE" });
      toast({ title: "Profile deleted" });
      await load();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  // ── Profile Entry (SSID) CRUD ───────────────────────────────────────────────
  const saveEntry = async () => {
    if (!entryDialog.profileId) return;
    const body = {
      ssid: entryForm.ssid,
      encryption: entryForm.encryption,
      key: entryForm.key,
      vlan_id: entryForm.vlan_id ? parseInt(entryForm.vlan_id) : null,
      radius_ip: entryForm.radius_ip,
      radius_secret: entryForm.radius_secret,
      hidden: entryForm.hidden,
      isolate: entryForm.isolate,
      band: entryForm.band,
      exit_id: entryForm.exit_id ? parseInt(entryForm.exit_id) : null,
    };
    try {
      if (entryDialog.mode === "add") {
        await apiFetch(`/admin/apdesk/profiles/${entryDialog.profileId}/entries`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast({ title: "SSID added" });
      } else {
        await apiFetch(`/admin/apdesk/entries/${entryDialog.entryId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast({ title: "SSID updated" });
      }
      setEntryDialog({ open: false, profileId: null, mode: "add" });
      await loadProfile(entryDialog.profileId);
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    }
  };

  const deleteEntry = async (id: number, profileId: number) => {
    try {
      await apiFetch(`/admin/apdesk/profile-entries/${id}`, { method: "DELETE" });
      toast({ title: "SSID removed" });
      await loadProfile(profileId);
    } catch { /* silent */ }
  };

  // ── Profile Exit CRUD ───────────────────────────────────────────────────────
  const saveExit = async () => {
    if (!exitDialog.profileId) return;
    try {
      await apiFetch(`/admin/apdesk/profiles/${exitDialog.profileId}/exits`, {
        method: "POST",
        body: JSON.stringify(exitForm),
      });
      toast({ title: "Exit added" });
      setExitDialog({ open: false, profileId: null });
      await loadProfile(exitDialog.profileId);
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    }
  };

  // ── AP CRUD ─────────────────────────────────────────────────────────────────
  const saveAp = async () => {
    try {
      const payload = {
        name: apForm.name, mac: apForm.mac, description: apForm.description,
        ap_profile_id: apForm.ap_profile_id || null,
        hardware: apForm.hardware,
        lat: apForm.lat ? parseFloat(apForm.lat) : null,
        lon: apForm.lon ? parseFloat(apForm.lon) : null,
        on_public_maps: apForm.on_public_maps,
        contact_phone: apForm.contact_phone,
      };

      if (apDialog.mode === "add") {
        await apiFetch("/admin/apdesk/access-points", {
          method: "POST", body: JSON.stringify(payload),
        });
        toast({ title: "Access point added" });
      } else if (apDialog.ap) {
        await apiFetch(`/admin/apdesk/access-points/${apDialog.ap.id}`, {
          method: "PATCH", body: JSON.stringify(payload),
        });
        toast({ title: "Access point updated" });
      }
      setApDialog({ open: false, mode: "add" });
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    }
  };

  const deleteAp = async (id: number) => {
    if (!confirm("Delete this access point?")) return;
    try {
      await apiFetch(`/admin/apdesk/access-points/${id}`, { method: "DELETE" });
      toast({ title: "AP deleted" });
      await load();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  const queueApAction = async (id: number, action: string) => {
    try {
      await apiFetch(`/admin/apdesk/access-points/${id}/actions`, {
        method: "POST", body: JSON.stringify({ action }),
      });
      toast({ title: `Queued: ${action}` });
    } catch { /* silent */ }
  };

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = [
      ["Name","MAC","Profile","Status","Last Contact","IP","Hardware","Firmware","Stations"],
      ...allAps.map(ap => [
        ap.name, ap.mac, ap.profile_name||"", ap.status,
        ap.last_contact||"", ap.lan_ip||"", ap.hardware||"", ap.firmware||"",
        ap.station_count,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "access_points.csv";
    a.click();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <AdminLayout>
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </AdminLayout>
  );

  const onlineAps  = allAps.filter(a => a.status === "online").length;
  const offlineAps = allAps.length - onlineAps;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wifi className="h-6 w-6 text-primary" /> APdesk
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage AP profiles, SSID slots, captive portal exits, and access points
            </p>
          </div>
          <Button size="sm" onClick={load} variant="outline">
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh
          </Button>
        </div>

        {/* Overview stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Profiles", value: profiles.length, sub: "", color: "text-primary" },
            { label: "Total APs", value: allAps.length, sub: "", color: "text-primary" },
            { label: "Online",   value: onlineAps,  sub: "APs online",  color: "text-green-500" },
            { label: "Offline",  value: offlineAps, sub: "APs offline", color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="glass-card p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="profiles">AP Profiles</TabsTrigger>
            <TabsTrigger value="access-points">All Access Points</TabsTrigger>
            <TabsTrigger value="dumb-aps">Dumb APs</TabsTrigger>
          </TabsList>

          {/* ── AP Profiles ───────────────────────────────────────────────────── */}
          <TabsContent value="profiles" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => {
                setProfileForm({ name: "", description: "", cloud_id: "", timezone: "Africa/Nairobi" });
                setProfileDialog({ open: true, mode: "add" });
              }}>
                <Plus className="h-3.5 w-3.5 mr-2" /> New Profile
              </Button>
            </div>

            {profiles.map(profile => {
              const isExpanded = expandedProfile === profile.id;
              return (
                <div key={profile.id} className="glass-card overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleProfile(profile.id)}>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Wifi className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">{profile.name}</p>
                        <p className="text-[10px] text-muted-foreground">{profile.description || "No description"} · {profile.timezone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center hidden md:block">
                        <p className="text-sm font-bold">{profile.ap_count}</p>
                        <p className="text-[10px] text-muted-foreground">APs</p>
                      </div>
                      <div className="text-center hidden md:block">
                        <p className="text-sm font-bold text-green-500">{profile.aps_up}</p>
                        <p className="text-[10px] text-muted-foreground">Online</p>
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => {
                            setProfileForm({ name: profile.name, description: profile.description, cloud_id: profile.cloud_id?.toString()||"", timezone: profile.timezone });
                            setProfileDialog({ open: true, mode: "edit", profile });
                          }}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive"
                          onClick={() => deleteProfile(profile.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/40">
                      {/* SSIDs section */}
                      <div className="p-3 bg-muted/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">SSID Slots</span>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                            onClick={() => {
                              setEntryForm({ ssid:"", encryption:"none", key:"", vlan_id:"", radius_ip:"", radius_secret:"", hidden:false, isolate:false, band:"both", exit_id:"" });
                              setEntryDialog({ open: true, profileId: profile.id, mode: "add" });
                            }}>
                            <Plus className="h-3 w-3 mr-1" /> Add SSID
                          </Button>
                        </div>
                        {(profile.entries?.length ?? 0) === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No SSIDs configured.</p>
                        ) : profile.entries?.map(e => (
                          <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                            <div>
                              <span className="text-xs font-medium">{e.ssid}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">
                                {e.encryption} · {e.band} · {e.hidden ? "hidden" : "visible"}
                                {e.radius_ip ? ` · RADIUS: ${e.radius_ip}` : ""}
                                {e.vlan_id ? ` · VLAN ${e.vlan_id}` : ""}
                              </span>
                            </div>
                            <div className="flex gap-0.5">
                              <Button size="sm" variant="ghost" className="h-6 px-1.5"
                                onClick={() => {
                                  setEntryForm({
                                    ssid: e.ssid, encryption: e.encryption, key: e.key || "",
                                    vlan_id: e.vlan_id?.toString() ?? "", radius_ip: e.radius_ip || "",
                                    radius_secret: e.radius_secret || "", hidden: e.hidden, isolate: e.isolate,
                                    band: e.band, exit_id: (e as Record<string, unknown>).exit_id?.toString() ?? "",
                                  });
                                  setEntryDialog({ open: true, profileId: profile.id, mode: "edit", entryId: e.id });
                                }}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive"
                                onClick={() => deleteEntry(e.id, profile.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Exits section */}
                      <div className="p-3 bg-muted/10 border-t border-border/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">Captive Portal Exits</span>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                            onClick={() => {
                              setExitForm({ name:"", gateway_type:"none", radius_ip:"", radius_secret:"", uam_url:"", uam_secret:"", walled_garden:"" });
                              setExitDialog({ open: true, profileId: profile.id });
                            }}>
                            <Plus className="h-3 w-3 mr-1" /> Add Exit
                          </Button>
                        </div>
                        {(profile.exits?.length ?? 0) === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No exits configured.</p>
                        ) : profile.exits?.map(x => (
                          <div key={x.id} className="text-xs py-1.5 border-b border-border/20 last:border-0">
                            <span className="font-medium">{x.name}</span>
                            <span className="text-muted-foreground ml-2">{x.gateway_type}</span>
                            {x.radius_ip && <span className="text-muted-foreground ml-2">· RADIUS: {x.radius_ip}</span>}
                            {x.uam_url && <span className="text-muted-foreground ml-2">· UAM: {x.uam_url.slice(0,40)}…</span>}
                          </div>
                        ))}
                      </div>

                      {/* APs in this profile */}
                      <div className="p-3 border-t border-border/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">Access Points ({profile.aps?.length ?? 0})</span>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                            onClick={() => {
                              setApForm({ name:"", mac:"", description:"", ap_profile_id: profile.id.toString(), hardware:"", lat:"", lon:"", on_public_maps:false, contact_phone:"" });
                              setApDialog({ open: true, mode: "add", profileId: profile.id });
                            }}>
                            <Plus className="h-3 w-3 mr-1" /> Add AP
                          </Button>
                        </div>
                        {(profile.aps?.length ?? 0) === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No APs in this profile.</p>
                        ) : profile.aps?.map(ap => (
                          <div key={ap.id} className="flex items-center justify-between py-2 border-b border-border/10 last:border-0">
                            <div className="flex items-center gap-2">
                              <StatusDot online={ap.status === "online"} />
                              <div>
                                <p className="text-xs font-medium">{ap.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {ap.mac} · {ap.lan_ip||"dhcp"} · {ap.hardware||"—"}
                                  · Last: {ago(ap.last_contact)}
                                  · {ap.station_count} clients
                                  {ap.contact_phone && <> · <Phone className="inline h-2.5 w-2.5" />{ap.contact_phone}</>}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {ap.pending_action && (
                                <Badge variant="outline" className="text-[9px]">{ap.pending_action}</Badge>
                              )}
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs"
                                title="Reboot" onClick={() => queueApAction(ap.id, "reboot")}>
                                <RotateCw className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs"
                                title="Edit" onClick={() => {
                                  setApForm({ name: ap.name, mac: ap.mac, description: ap.description, ap_profile_id: profile.id.toString(), hardware: ap.hardware||"", lat: ap.lat?.toString()||"", lon: ap.lon?.toString()||"", on_public_maps: ap.on_public_maps, contact_phone: ap.contact_phone||"" });
                                  setApDialog({ open: true, mode: "edit", ap });
                                }}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-destructive"
                                onClick={() => deleteAp(ap.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>

          {/* ── All Access Points tab ─────────────────────────────────────────── */}
          <TabsContent value="access-points" className="space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{allAps.length} access points total</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
                </Button>
                <Button size="sm" onClick={() => {
                  setApForm({ name:"", mac:"", description:"", ap_profile_id:"", hardware:"", lat:"", lon:"", on_public_maps:false, contact_phone:"" });
                  setApDialog({ open: true, mode: "add" });
                }}>
                  <Plus className="h-3.5 w-3.5 mr-2" /> Add AP
                </Button>
              </div>
            </div>

            <div className="glass-card divide-y divide-border/30">
              {allAps.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  <Wifi className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No access points registered. Add APs via a profile above.</p>
                </div>
              )}
              {allAps.map(ap => (
                <div key={ap.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <StatusDot online={ap.status === "online"} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{ap.name}</p>
                        {ap.pending_action && (
                          <Badge variant="outline" className="text-[9px] h-4">{ap.pending_action}</Badge>
                        )}
                        {ap.reboot_flag && (
                          <Badge variant="destructive" className="text-[9px] h-4">Reboot Pending</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {ap.mac} · {ap.profile_name || "No profile"} · {ap.hardware || "unknown hw"}
                        · {ap.lan_ip || "dhcp"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Last: {ago(ap.last_contact)} from {ap.last_contact_from_ip || "—"}
                        · {ap.station_count} clients
                        {ap.lat ? ` · ${ap.lat.toFixed(4)}, ${ap.lon?.toFixed(4)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      title="Reboot" onClick={() => queueApAction(ap.id, "reboot")}>
                      <RotateCw className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      title="Reconfigure" onClick={() => queueApAction(ap.id, "reconfigure")}>
                      <Settings className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => {
                        setApForm({ name: ap.name, mac: ap.mac, description: ap.description, ap_profile_id: ap.ap_profile_id?.toString()||"", hardware: ap.hardware||"", lat: ap.lat?.toString()||"", lon: ap.lon?.toString()||"", on_public_maps: ap.on_public_maps, contact_phone: ap.contact_phone||"" });
                        setApDialog({ open: true, mode: "edit", ap });
                      }}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive"
                      onClick={() => deleteAp(ap.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Dumb APs (VLAN-polled, non-APdesk APs) ────────────────────── */}
          <TabsContent value="dumb-aps" className="mt-4">
            <DumbApTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Profile Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={profileDialog.open} onOpenChange={o => setProfileDialog(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{profileDialog.mode === "add" ? "Create AP Profile" : "Edit AP Profile"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs">Profile Name *</Label>
              <Input className="mt-1" placeholder="e.g. Hotel Network"
                value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Description</Label>
              <Input className="mt-1" placeholder="Optional"
                value={profileForm.description} onChange={e => setProfileForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label className="text-xs">Timezone</Label>
              <Input className="mt-1" placeholder="Africa/Nairobi"
                value={profileForm.timezone} onChange={e => setProfileForm(p => ({ ...p, timezone: e.target.value }))} /></div>
            {clouds.length > 0 && (
              <div><Label className="text-xs">Cloud (optional)</Label>
                <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={profileForm.cloud_id} onChange={e => setProfileForm(p => ({ ...p, cloud_id: e.target.value }))}>
                  <option value="">None</option>
                  {clouds.map(c => <option key={c.id} value={c.id}>{c.network_name} › {c.site_name} › {c.name}</option>)}
                </select></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProfileDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveProfile} disabled={!profileForm.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AP Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={apDialog.open} onOpenChange={o => setApDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{apDialog.mode === "add" ? "Add Access Point" : "Edit Access Point"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* Basic info */}
            <div className="rounded-lg border border-border/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AP Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label className="text-xs">Name *</Label>
                  <Input className="mt-1" placeholder="e.g. Room 101 AP"
                    value={apForm.name} onChange={e => setApForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div className="col-span-2"><Label className="text-xs">MAC Address *</Label>
                  <Input className="mt-1" placeholder="AA:BB:CC:DD:EE:FF"
                    value={apForm.mac} onChange={e => setApForm(p => ({ ...p, mac: e.target.value }))} /></div>
                <div><Label className="text-xs">Hardware</Label>
                  <Input className="mt-1" placeholder="e.g. tp-link-eap225"
                    value={apForm.hardware} onChange={e => setApForm(p => ({ ...p, hardware: e.target.value }))} /></div>
                <div><Label className="text-xs">AP Profile</Label>
                  <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={apForm.ap_profile_id} onChange={e => setApForm(p => ({ ...p, ap_profile_id: e.target.value }))}>
                    <option value="">None</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pub" checked={apForm.on_public_maps}
                  onChange={e => setApForm(p => ({ ...p, on_public_maps: e.target.checked }))} />
                <Label htmlFor="pub" className="text-xs cursor-pointer">Show on public coverage map</Label>
              </div>
            </div>
            {/* Contact & Location */}
            <div className="rounded-lg border border-border/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact & Location</p>
              <div>
                <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Contact Phone</Label>
                <Input className="mt-1" placeholder="+254 700 000 000"
                  value={apForm.contact_phone} onChange={e => setApForm(p => ({ ...p, contact_phone: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground mt-0.5">Phone of person responsible at this AP location</p>
              </div>
              <ApLocationPicker
                lat={apForm.lat} lon={apForm.lon}
                onChange={(lat, lon) => setApForm(p => ({ ...p, lat, lon }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveAp} disabled={!apForm.name || !apForm.mac}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SSID Entry Dialog ────────────────────────────────────────────────── */}
      <Dialog open={entryDialog.open} onOpenChange={o => setEntryDialog(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{entryDialog.mode === "edit" ? "Edit SSID Slot" : "Add SSID Slot"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">SSID *</Label>
              <Input className="mt-1" placeholder="e.g. HotelWifi"
                value={entryForm.ssid} onChange={e => setEntryForm(p => ({ ...p, ssid: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Encryption</Label>
                <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={entryForm.encryption} onChange={e => setEntryForm(p => ({ ...p, encryption: e.target.value }))}>
                  {ENCRYPTIONS.map(enc => <option key={enc} value={enc}>{enc}</option>)}
                </select></div>
              <div><Label className="text-xs">Band</Label>
                <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={entryForm.band} onChange={e => setEntryForm(p => ({ ...p, band: e.target.value }))}>
                  {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select></div>
            </div>
            {entryForm.encryption !== "none" && entryForm.encryption !== "802.1x" && (
              <div><Label className="text-xs">Key / Password</Label>
                <Input className="mt-1" type="password" placeholder="WiFi password"
                  value={entryForm.key} onChange={e => setEntryForm(p => ({ ...p, key: e.target.value }))} /></div>
            )}
            {entryForm.encryption === "802.1x" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">RADIUS Server IP</Label>
                  <Input className="mt-1" placeholder="192.168.1.10"
                    value={entryForm.radius_ip} onChange={e => setEntryForm(p => ({ ...p, radius_ip: e.target.value }))} /></div>
                <div><Label className="text-xs">RADIUS Secret</Label>
                  <Input className="mt-1" placeholder="radius_secret"
                    value={entryForm.radius_secret} onChange={e => setEntryForm(p => ({ ...p, radius_secret: e.target.value }))} /></div>
              </div>
            )}
            <div><Label className="text-xs">VLAN ID (optional)</Label>
              <Input className="mt-1" type="number" placeholder="e.g. 10"
                value={entryForm.vlan_id} onChange={e => setEntryForm(p => ({ ...p, vlan_id: e.target.value }))} /></div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={entryForm.hidden}
                  onChange={e => setEntryForm(p => ({ ...p, hidden: e.target.checked }))} />
                Hidden SSID
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={entryForm.isolate}
                  onChange={e => setEntryForm(p => ({ ...p, isolate: e.target.checked }))} />
                Client Isolation
              </label>
            </div>
            {(() => {
              const profileExits = entryDialog.profileId
                ? (profiles.find(p => p.id === entryDialog.profileId)?.exits ?? [])
                : [];
              return profileExits.length > 0 ? (
                <div>
                  <Label className="text-xs">Captive Portal Exit (optional)</Label>
                  <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={entryForm.exit_id}
                    onChange={e => setEntryForm(p => ({ ...p, exit_id: e.target.value }))}>
                    <option value="">— None / apply to all exits —</option>
                    {profileExits.map((x: Record<string, unknown>) => (
                      <option key={x.id} value={x.id}>{x.name} ({x.gateway_type})</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Link this SSID to a specific captive portal exit point.</p>
                </div>
              ) : null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEntryDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveEntry} disabled={!entryForm.ssid}>{entryDialog.mode === "edit" ? "Save Changes" : "Add SSID"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Exit Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={exitDialog.open} onOpenChange={o => setExitDialog(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Captive Portal Exit</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">Exit Name *</Label>
              <Input className="mt-1" placeholder="e.g. Coova Chilli Exit"
                value={exitForm.name} onChange={e => setExitForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Gateway Type</Label>
              <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={exitForm.gateway_type} onChange={e => setExitForm(p => ({ ...p, gateway_type: e.target.value }))}>
                {GATEWAY_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
              </select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">RADIUS IP</Label>
                <Input className="mt-1" placeholder="192.168.1.10"
                  value={exitForm.radius_ip} onChange={e => setExitForm(p => ({ ...p, radius_ip: e.target.value }))} /></div>
              <div><Label className="text-xs">RADIUS Secret</Label>
                <Input className="mt-1" type="password"
                  value={exitForm.radius_secret} onChange={e => setExitForm(p => ({ ...p, radius_secret: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">UAM URL</Label>
              <Input className="mt-1" placeholder="https://hotspot.example.com/portal"
                value={exitForm.uam_url} onChange={e => setExitForm(p => ({ ...p, uam_url: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">UAM Secret</Label>
                <Input className="mt-1" type="password"
                  value={exitForm.uam_secret} onChange={e => setExitForm(p => ({ ...p, uam_secret: e.target.value }))} /></div>
              <div><Label className="text-xs">Walled Garden (CSV)</Label>
                <Input className="mt-1" placeholder="google.com,facebook.com"
                  value={exitForm.walled_garden} onChange={e => setExitForm(p => ({ ...p, walled_garden: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExitDialog(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveExit} disabled={!exitForm.name}>Add Exit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
