/**
 * src/pages/MeshDesk.tsx — v3.11.0
 *
 * Full rdcore MESHdesk feature parity:
 *  Mesh Networks
 *   ├─ Add / Edit mesh (name, description, cloud)
 *   ├─ Mesh Settings dialog  (2 tabs)
 *   │     ├─ batman-adv tab — routing algo, OGM interval, encryption,
 *   │     │    aggregated_ogms, ap_isolation, bonding, fragmentation,
 *   │     │    bridge_loop_avoidance, distributed_arp_table, enable_alerts,
 *   │     │    enable_overviews
 *   │     └─ Node Settings tab — node_password, power, apply_power_to_all,
 *   │            channel_2ghz, channel_5ghz, heartbeat_dead_after,
 *   │            eth_bridge_enabled, eth_bridge_for_all, country_code, timezone_id
 *   ├─ Entry Points (SSIDs) — add/edit/delete, hidden, client isolation, encryption, band
 *   ├─ Exit Points — nat, bridge_l2, bridge_l3, captive_portal, openvpn, pppoe_server
 *   ├─ Nodes
 *   │    ├─ Add/edit node — contact phone, GPS/map/coordinate location,
 *   │    │    internet connect type, hardware dropdown from API
 *   │    ├─ Internet Connect: autodetect / wan_static / wan_pppoe /
 *   │    │    wifi / wifi_pppoe / wifi_static
 *   │    └─ Delete / Reboot / Reconfigure actions
 *   ├─ Node↔Node topology — batman-adv originator table with TQ bars
 *   └─ Map — nodes plotted on Leaflet/OSM with batman-adv connection lines
 *            (green=good ≥70%, yellow=fair 40-69%, red dashed=weak <40%)
 *            Gateway nodes shown with blue border ring
 *            Map tab co-fetches topology so links draw immediately
 *  Unknown nodes (claim / dismiss)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button }  from "@/components/ui/button";
import { Badge }   from "@/components/ui/badge";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Radio, Wifi, Plus, Trash2, RefreshCw, ChevronRight, ChevronDown,
  AlertTriangle, CheckCircle2, Server, Network, MapPin, Phone,
  Settings, Share2, Globe, Edit, EyeOff, Shield, LocateFixed, Map,
  Link, Unlink, Router,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/authClient";

const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");
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

interface Mesh {
  id: number; name: string; ssid: string; bssid: string;
  description: string; cloud_id: number | null; cloud_name: string | null;
  last_contact: string | null; enable_alerts: boolean; enable_overviews: boolean;
  node_count: number; nodes_up: number; nodes_down: number;
  routing_algo: string; encryption: string; encryption_key: string;
  ap_isolation: boolean; bonding: boolean; orig_interval: number;
  created_at: string;
  // v3.15.5: MikroTik router integration (multi-gateway model)
  ip_pool_cidr: string | null;
  ap_dhcp_reserved_start: string | null;
  ap_dhcp_reserved_end: string | null;
  // Aggregated from gateway nodes — one mesh can have multiple routers
  linked_router_ids: number[] | null;
  linked_router_names: string[] | null;
  linked_router_dhcp_pools: string[] | null;
  ip_conflict: boolean;
  ip_conflict_reason: string | null;
}
interface RouterOption { id: number; name: string; dhcp_pool: string | null; hotspot_address: string | null; status: string; }
interface MeshNode {
  id: number; mesh_id: number; name: string; mac: string;
  hardware: string | null; firmware: string | null;
  ip: string | null; last_contact: string | null;
  last_contact_from_ip: string | null;
  lat: number | null; lon: number | null;
  contact_phone: string;
  is_gateway: boolean; status: "online" | "offline";
  station_count: number; gateway: string;
  // v3.15.5: gateway nodes declare their MikroTik uplink
  router_id: number | null;
  gateway_priority: number | null;
}
interface MeshEntry {
  id: number; mesh_id: number; name: string; ssid: string;
  encryption: string; special_key: string;
  hidden: boolean; isolate: boolean; apply_to_all: boolean;
  frequency_band: string; disabled: boolean;
}
interface MeshExit {
  id: number; mesh_id: number; name: string; type: string;
  vlan: number; proto: string; ipaddr: string; netmask: string; gateway: string;
  radius_1: string; radius_2: string; radius_secret: string;
  uam_url: string; uam_secret: string; walled_garden: string;
  openvpn_server_id: number | null;
}
interface UnknownNode {
  id: number; mac: string; vendor: string | null;
  from_ip: string; is_gateway: boolean;
  firmware_version: string; last_contact: string;
  new_mode: string | null;
}
interface TopoNode  { id: number; name: string; mac: string; ip: string | null; is_gateway: boolean; status: string; }
interface TopoEdge  { node_id: number; from_name: string; from_mac: string; neighbour_mac: string; to_name: string | null; tq: number; }
interface Overview  { total_meshes: number; meshes_up: number; total_nodes: number; nodes_up: number; total_aps: number; aps_up: number; unknown_nodes: number; total_ap_profiles: number; }
interface Hardware  { id: number; name: string; for_mesh: boolean; }
interface Timezone  { id: number; name: string; posix_value: string; }
// G-03/G-04: per-node stations (devices connected to a node)
interface NodeStation {
  id: number; node_id: number;
  mac: string; station_mac?: string; // service may return either
  ssid: string; signal: number;
  rx_bytes: number; tx_bytes: number;
  updated_at: string;
}
// G-05: WiFi scan results
interface ScanResult { bssid: string; ssid: string; channel: number; signal: number; encryption: string; }
interface NodeScan   { id: number; node_id: number; scan_time: string; results: ScanResult[]; }
interface TrustedAp  { id: number; bssid: string; ssid: string; description: string; }
interface BatmanSettings {
  enable_alerts: boolean; enable_overviews: boolean;
  routing_algo: string; encryption: string; encryption_key: string;
  orig_interval: number;
  aggregated_ogms: boolean; ap_isolation: boolean; bonding: boolean;
  fragmentation: boolean; bridge_loop_avoidance: boolean; distributed_arp_table: boolean;
}
interface NodeSettings {
  node_password: string; power: number; apply_power_to_all: boolean;
  channel_2ghz: number; channel_5ghz: number; heartbeat_dead_after: number;
  eth_bridge_enabled: boolean; eth_bridge_for_all: boolean;
  country_code: string; timezone_id: number | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ENCRYPTIONS = ["none","psk","psk2","psk-mixed","wpa3","802.1x"];
const BANDS: { value: string; label: string }[] = [
  { value: "both",        label: "2.4 GHz & 5 GHz" },
  { value: "2ghz",        label: "2.4 GHz" },
  { value: "5ghz",        label: "5 GHz" },
  { value: "5ghz_lower",  label: "5 GHz Lower" },
  { value: "5ghz_upper",  label: "5 GHz Upper" },
];
const EXIT_TYPES  = [
  { value: "nat",            label: "NAT + DHCP" },
  { value: "nat_specific",   label: "NAT + DHCP (Specific Subnet)" },
  { value: "captive_portal", label: "Captive Portal" },
  { value: "bridge_l2",     label: "Bridge Layer 2" },
  { value: "bridge_l3",     label: "Bridge Layer 3" },
  { value: "openvpn_bridge", label: "OpenVPN Bridge" },
  { value: "pppoe_server",   label: "PPPoE Server" },
];
const INET_TYPES  = [
  { value: "none",        label: "Autodetect / None" },
  { value: "wan_static",  label: "WAN Static IP" },
  { value: "wan_pppoe",   label: "WAN PPPoE" },
  { value: "wifi",        label: "WiFi Client" },
  { value: "wifi_pppoe",  label: "WiFi Client PPPoE" },
  { value: "wifi_static", label: "WiFi Client Static IP" },
];
const ROUTING_ALGOS = [{ value: "BATMAN_IV", label: "BATMAN_IV (default)" }, { value: "BATMAN_V", label: "BATMAN_V" }];
const CHANNELS_2GHZ = [1,2,3,4,5,6,7,8,9,10,11,12,13].map(c => ({ value: String(c), label: `Channel ${c}` }));
const CHANNELS_5GHZ = [36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,149,153,157,161,165].map(c => ({ value: String(c), label: `Channel ${c}` }));

const DEFAULT_BATMAN: BatmanSettings = {
  enable_alerts: true, enable_overviews: true,
  routing_algo: "BATMAN_IV", encryption: "none", encryption_key: "",
  orig_interval: 1000,
  aggregated_ogms: true, ap_isolation: false, bonding: false,
  fragmentation: true, bridge_loop_avoidance: true, distributed_arp_table: true,
};
const DEFAULT_NODESETTINGS: NodeSettings = {
  node_password: "admin", power: 100, apply_power_to_all: true,
  channel_2ghz: 6, channel_5ghz: 44, heartbeat_dead_after: 300,
  eth_bridge_enabled: false, eth_bridge_for_all: false,
  country_code: "US", timezone_id: null,
};

// ── Small helpers ─────────────────────────────────────────────────────────────

const ago = (dt: string | null) => {
  if (!dt) return "never";
  const s = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const Dot = ({ on }: { on: boolean }) => (
  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${on ? "bg-green-500" : "bg-red-500"}`} />
);

function Sel({ label, value, onChange, options }: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" className="rounded" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ── Location Picker ───────────────────────────────────────────────────────────

function LocationPicker({ lat, lon, onChange }: {
  lat: string; lon: string;
  onChange: (lat: string, lon: string) => void;
}) {
  const [method, setMethod]   = useState<"manual"|"gps"|"map">("manual");
  const [gpsState, setGpsState] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [gpsError, setGpsError] = useState("");
  const mapRef      = useRef<HTMLDivElement>(null);
  const leafletMap  = useRef<any>(null);
  const markerRef   = useRef<any>(null);

  const getGPS = () => {
    if (!navigator.geolocation) { setGpsError("Geolocation not supported by browser"); return; }
    setGpsState("loading");
    navigator.geolocation.getCurrentPosition(
      pos => { onChange(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6)); setGpsState("done"); },
      err => { setGpsError(err.message); setGpsState("error"); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  useEffect(() => {
    if (method !== "map" || !mapRef.current || leafletMap.current) return;
    const init = async () => {
      if (!document.getElementById("leaflet-css")) {
        const l = document.createElement("link");
        l.id = "leaflet-css"; l.rel = "stylesheet";
        l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
        document.head.appendChild(l);
      }
      if (!(window as any).L) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
          s.onload = res; s.onerror = rej; document.body.appendChild(s);
        });
      }
      const L = (window as any).L;
      const initLat = lat ? parseFloat(lat) : -1.2921;
      const initLon = lon ? parseFloat(lon) : 36.8219;
      const zoom    = lat ? 15 : 5;
      leafletMap.current = L.map(mapRef.current).setView([initLat, initLon], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(leafletMap.current);
      if (lat && lon) {
        markerRef.current = L.marker([initLat, initLon], { draggable: true }).addTo(leafletMap.current);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current.getLatLng();
          onChange(p.lat.toFixed(6), p.lng.toFixed(6));
        });
      }
      leafletMap.current.on("click", (e: any) => {
        const { lat: la, lng: lo } = e.latlng;
        onChange(la.toFixed(6), lo.toFixed(6));
        if (markerRef.current) { markerRef.current.setLatLng([la, lo]); }
        else {
          markerRef.current = L.marker([la, lo], { draggable: true }).addTo(leafletMap.current);
          markerRef.current.on("dragend", () => {
            const p = markerRef.current.getLatLng();
            onChange(p.lat.toFixed(6), p.lng.toFixed(6));
          });
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
            {m === "manual" && "✏ Manual"}
            {m === "gps"    && "📍 GPS"}
            {m === "map"    && "🗺 Map"}
          </button>
        ))}
      </div>

      {method === "manual" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><Label className="text-[10px] text-muted-foreground">Latitude</Label>
            <Input className="mt-0.5 h-8 text-sm" placeholder="-1.2921" value={lat}
              onChange={e => onChange(e.target.value, lon)} /></div>
          <div><Label className="text-[10px] text-muted-foreground">Longitude</Label>
            <Input className="mt-0.5 h-8 text-sm" placeholder="36.8219" value={lon}
              onChange={e => onChange(lat, e.target.value)} /></div>
        </div>
      )}

      {method === "gps" && (
        <div className="space-y-1.5">
          <Button type="button" size="sm" variant="outline" className="w-full h-8 text-xs"
            onClick={getGPS} disabled={gpsState === "loading"}>
            {gpsState === "loading"
              ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" />Locating…</>
              : <><LocateFixed className="h-3 w-3 mr-2" />Get current GPS location</>}
          </Button>
          {gpsState === "done" && lat && <p className="text-[10px] text-green-600 font-mono">✓ {lat}, {lon}</p>}
          {gpsState === "error" && <p className="text-[10px] text-destructive">{gpsError}</p>}
        </div>
      )}

      {method === "map" && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Click on the map to place a pin. Drag to adjust.</p>
          <div ref={mapRef} style={{ height: 220, borderRadius: 6, border: "1px solid var(--border)" }} />
          {lat && lon && <p className="text-[10px] text-muted-foreground font-mono mt-1">📍 {lat}, {lon}</p>}
        </div>
      )}
    </div>
  );
}

// ── Map sub-tab: all nodes in mesh plotted on Leaflet ─────────────────────────

function MeshMapView({ nodes, topology }: {
  nodes: MeshNode[];
  topology: { nodes: TopoNode[]; neighbors: TopoEdge[] } | undefined;
}) {
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const init = async () => {
      if (!document.getElementById("leaflet-css")) {
        const l = document.createElement("link");
        l.id = "leaflet-css"; l.rel = "stylesheet";
        l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
        document.head.appendChild(l);
      }
      if (!(window as any).L) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
          s.onload = res; s.onerror = rej; document.body.appendChild(s);
        });
      }
      const L = (window as any).L;

      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }

      const nodesWithCoords = nodes.filter(n => n.lat != null && n.lon != null);
      const center: [number, number] = nodesWithCoords.length > 0
        ? [nodesWithCoords[0].lat!, nodesWithCoords[0].lon!]
        : [-1.2921, 36.8219];

      leafletMap.current = L.map(mapRef.current).setView(center, nodesWithCoords.length > 0 ? 13 : 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(leafletMap.current);

      // Build mac → node lookup for drawing connection lines
      const byMac: Record<string, MeshNode> = {};
      for (const n of nodesWithCoords) byMac[n.mac.toLowerCase()] = n;

      // Draw batman-adv connection lines between nodes that have coordinates.
      // Deduplicate A↔B pairs so we only draw one line per link.
      // Colour by best TQ reported for that pair: ≥70% green, ≥40% yellow, else red.
      if (topology?.neighbors?.length) {
        const linkBestTq: Record<string, number> = {};
        for (const edge of topology.neighbors) {
          const a = edge.from_mac.toLowerCase();
          const b = edge.neighbour_mac.toLowerCase();
          const key = [a, b].sort().join("|");
          linkBestTq[key] = Math.max(linkBestTq[key] ?? 0, edge.tq);
        }
        for (const [key, tq] of Object.entries(linkBestTq)) {
          const [ma, mb] = key.split("|");
          const na = byMac[ma], nb = byMac[mb];
          if (!na || !nb) continue;           // one or both nodes have no coordinates
          const pct = Math.round((tq / 255) * 100);
          const color = pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
          const line = L.polyline(
            [[na.lat!, na.lon!], [nb.lat!, nb.lon!]],
            { color, weight: pct >= 70 ? 3 : 2, opacity: 0.85, dashArray: pct < 40 ? "6 4" : undefined }
          ).addTo(leafletMap.current);
          line.bindPopup(
            `<strong>${na.name}</strong> ↔ <strong>${nb.name}</strong><br/>` +
            `Link quality: <b>${pct}%</b> (TQ ${tq}/255)`
          );
        }
      }

      // Draw node markers on top of lines
      const markers = nodesWithCoords.map(node => {
        const online = node.status === "online";
        const isGw   = node.is_gateway;
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:${isGw ? 16 : 12}px;height:${isGw ? 16 : 12}px;border-radius:50%;
            background:${online ? "#22c55e" : "#ef4444"};
            border:${isGw ? "3px solid #3b82f6" : "2px solid white"};
            box-shadow:0 1px 4px rgba(0,0,0,0.4);
          "></div>`,
          iconSize:   [isGw ? 16 : 12, isGw ? 16 : 12],
          iconAnchor: [isGw ? 8  : 6,  isGw ? 8  : 6],
        });
        const m = L.marker([node.lat!, node.lon!], { icon }).addTo(leafletMap.current);
        m.bindPopup(
          `<strong>${node.name}</strong>${isGw ? " <span style='color:#3b82f6'>(Gateway)</span>" : ""}<br/>` +
          `<code style='font-size:11px'>${node.mac}</code><br/>` +
          `IP: ${node.ip || "—"}<br/>` +
          (node.contact_phone ? `📞 ${node.contact_phone}<br/>` : "") +
          `${online ? "🟢 Online" : "🔴 Offline"} · ${ago(node.last_contact)}`
        );
        return m;
      });

      if (markers.length > 1) {
        const group = L.featureGroup(markers);
        leafletMap.current.fitBounds(group.getBounds().pad(0.2));
      }
    };
    init().catch(console.error);
    return () => {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
    };
  }, [nodes, topology]);

  const nodesWithCoords = nodes.filter(n => n.lat != null && n.lon != null);
  const linkCount = (() => {
    if (!topology?.neighbors?.length) return 0;
    const seen = new Set<string>();
    for (const e of topology.neighbors) {
      seen.add([e.from_mac, e.neighbour_mac].map(m => m.toLowerCase()).sort().join("|"));
    }
    return seen.size;
  })();

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Nodes on Map
        </span>
        <span className="text-[10px] text-muted-foreground">
          {nodesWithCoords.length} of {nodes.length} nodes plotted
          {linkCount > 0 && ` · ${linkCount} link${linkCount !== 1 ? "s" : ""} drawn`}
        </span>
      </div>
      {nodesWithCoords.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No nodes have GPS coordinates yet. Edit a node and set its location.
        </div>
      ) : (
        <div ref={mapRef} style={{ height: 420, borderRadius: 8, border: "1px solid var(--border)" }} />
      )}
      {nodesWithCoords.length > 0 && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Online</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Offline</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block border-t-2 border-green-500" style={{height:0,width:16}} /> Good link (≥70%)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block border-t-2 border-yellow-400" style={{height:0,width:16}} /> Fair link (40–69%)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block border-t-2 border-red-500 border-dashed" style={{height:0,width:16}} /> Weak link (&lt;40%)</span>
          <span className="ml-auto">Gateway nodes have blue border · click any marker or line for details</span>
        </div>
      )}
    </div>
  );
}

// ── Default form values ───────────────────────────────────────────────────────

const blankNodeForm = () => ({
  name: "", mac: "", hardware: "", ip: "", is_gateway: false,
  router_id: "", gateway_priority: "1",
  contact_phone: "", lat: "", lon: "", gateway: "none",
  wan_static_ipaddr: "", wan_static_netmask: "255.255.255.0",
  wan_static_gateway: "", wan_static_dns_1: "", wan_static_dns_2: "",
  wan_pppoe_username: "", wan_pppoe_password: "",
  wan_pppoe_dns_1: "", wan_pppoe_mac: "", wan_pppoe_mtu: "",
  wbw_ssid: "", wbw_password: "",
  wifi_static_ipaddr: "", wifi_static_netmask: "255.255.255.0", wifi_static_gateway: "",
});
const blankEntryForm = () => ({
  name: "", ssid: "", encryption: "none", special_key: "",
  hidden: false, isolate: false, apply_to_all: true, frequency_band: "both",
  exitIds: [] as number[],
});
const blankExitForm = () => ({
  name: "", type: "nat", vlan: "0", proto: "dhcp",
  ipaddr: "", netmask: "", gateway: "",
  radius_1: "", radius_2: "", radius_secret: "testing123",
  uam_url: "", uam_secret: "greatsecret", walled_garden: "",
  openvpn_server_id: "",
  entryIds: [] as number[],
  // G-02: Common Settings (tagged bridge)
  auto_detect: true,
  vlan_range_or_list: "range" as "range" | "list",
  vlan_start: "10", vlan_end: "20", vlan_list: "",
  // v3.15.6: CAKE QoS
  apply_sqm_profile: false,
  cake_bandwidth: "",
  cake_options: "besteffort triple-isolate nat",
});

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function MeshDeskPage() {
  const { toast } = useToast();

  // top-level state
  const [overview,   setOverview]   = useState<Overview | null>(null);
  const [meshes,     setMeshes]     = useState<Mesh[]>([]);
  const [unknowns,   setUnknowns]   = useState<UnknownNode[]>([]);
  const [hardwares,  setHardwares]  = useState<Hardware[]>([]);
  const [timezones,  setTimezones]  = useState<Timezone[]>([]);
  const [clouds,     setClouds]     = useState<{ id: number; name: string }[]>([]);
  const [networks,   setNetworks]   = useState<{ id: number; name: string; cloud_id: number | null }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("meshes");

  // expanded mesh + per-mesh sub-tab
  const [expandedMesh, setExpandedMesh] = useState<number | null>(null);
  const [meshSubTab,   setMeshSubTab]   = useState<Record<number, string>>({});

  // per-mesh lazy-loaded data
  const [nodesBy,   setNodesBy]   = useState<Record<number, MeshNode[]>>({});
  const [entriesBy, setEntriesBy] = useState<Record<number, MeshEntry[]>>({});
  const [exitsBy,   setExitsBy]   = useState<Record<number, MeshExit[]>>({});
  const [topoBy,    setTopoBy]    = useState<Record<number, { nodes: TopoNode[]; neighbors: TopoEdge[] }>>({});

  // G-03: per-entry station/device data
  const [entryDevicesBy,   setEntryDevicesBy]   = useState<Record<number, NodeStation[]>>({});
  const [entryDevicesOpen, setEntryDevicesOpen] = useState<Record<number, boolean>>({});
  // G-04: per-node station/device data
  const [nodeStationsBy,   setNodeStationsBy]   = useState<Record<number, NodeStation[]>>({});
  const [nodeStationsOpen, setNodeStationsOpen] = useState<Record<number, boolean>>({});
  // G-05: nearby nodes (scans) per node
  const [nodeScansBy,     setNodeScansBy]     = useState<Record<number, NodeScan[]>>({});
  const [nodeScansOpen,   setNodeScansOpen]   = useState<Record<number, boolean>>({});
  const [trustedAps,      setTrustedAps]      = useState<TrustedAp[]>([]);
  const [scanLoading,     setScanLoading]     = useState<Record<number, boolean>>({});
  // G-06: node list filter per mesh
  const [nodeFilter, setNodeFilter] = useState<Record<number, string>>({});

  // dialogs
  const [meshDlg,     setMeshDlg]     = useState<{ open: boolean; mode: "add"|"edit"; mesh?: Mesh }>({ open: false, mode: "add" });
  const [settingsDlg, setSettingsDlg] = useState<{ open: boolean; mesh?: Mesh; settingsTab: "batman"|"nodes" }>({ open: false, settingsTab: "batman" });
  const [nodeDlg,     setNodeDlg]     = useState<{ open: boolean; mode: "add"|"edit"; meshId: number|null; node?: MeshNode }>({ open: false, mode: "add", meshId: null });
  const [entryDlg,    setEntryDlg]    = useState<{ open: boolean; mode: "add"|"edit"; meshId: number|null; entry?: MeshEntry }>({ open: false, mode: "add", meshId: null });
  const [exitDlg,     setExitDlg]     = useState<{ open: boolean; mode: "add"|"edit"; meshId: number|null; exitData?: MeshExit }>({ open: false, mode: "add", meshId: null });
  const [claimDlg,    setClaimDlg]    = useState<{ open: boolean; node?: UnknownNode }>({ open: false });

  // form state
  const [meshForm,        setMeshForm]        = useState({ name: "", description: "", cloud_id: "", network_id: "", router_id: "", ip_pool_cidr: "" });
  const [routers,         setRouters]         = useState<RouterOption[]>([]);
  const [cidrConflict,    setCidrConflict]    = useState<{ conflict: boolean; reason: string | null }>({ conflict: false, reason: null });
  const [cidrChecking,    setCidrChecking]    = useState(false);
  const [batmanForm,      setBatmanForm]      = useState<BatmanSettings>(DEFAULT_BATMAN);
  const [nodeSettingsForm, setNodeSettingsForm] = useState<NodeSettings>(DEFAULT_NODESETTINGS);
  const [nodeSettingsSaving, setNodeSettingsSaving] = useState(false);
  const [nodeForm,        setNodeForm]        = useState(blankNodeForm());
  const [entryForm,       setEntryForm]       = useState(blankEntryForm());
  const [exitForm,        setExitForm]        = useState(blankExitForm());
  const [claimForm,       setClaimForm]       = useState({ mesh_id: "", name: "" });

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [ovr, ml, ul, hw, tz, cl, nw, rt] = await Promise.all([
        apiFetch("/admin/meshdesk/overview"),
        apiFetch("/admin/meshdesk/meshes"),
        apiFetch("/admin/meshdesk/unknown-nodes"),
        apiFetch("/admin/meshdesk/hardwares"),
        apiFetch("/admin/meshdesk/timezones"),
        apiFetch("/admin/meshdesk/clouds"),
        apiFetch("/admin/meshdesk/networks"),
        fetch(`${API}/admin/routers`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).catch(() => ({ routers: [] })),
      ]);
      setOverview(ovr.data);
      setMeshes(ml.data || []);
      setUnknowns(ul.data || []);
      setHardwares((hw.data || []).filter((h: Hardware) => h.for_mesh !== false));
      setTimezones(tz.data || []);
      setClouds(cl.data || []);
      setNetworks(nw.data || []);
      setRouters((rt.routers || []).map((r: any) => ({ id: r.id, name: r.name, dhcp_pool: r.dhcp_pool, hotspot_address: r.hotspot_address, status: r.status })));
    } catch (err) {
      toast({ title: "Load failed", description: String(err), variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const fetchTab = async (meshId: number, which: string, force = false) => {
    try {
      if (which === "nodes"    && (force || !nodesBy[meshId]))   { const r = await apiFetch(`/admin/meshdesk/meshes/${meshId}/nodes`);    setNodesBy(p => ({ ...p, [meshId]: r.data || [] })); }
      if (which === "entries"  && (force || !entriesBy[meshId])) { const r = await apiFetch(`/admin/meshdesk/meshes/${meshId}/entries`);  setEntriesBy(p => ({ ...p, [meshId]: r.data || [] })); }
      if (which === "exits"    && (force || !exitsBy[meshId]))   { const r = await apiFetch(`/admin/meshdesk/meshes/${meshId}/exits`);    setExitsBy(p => ({ ...p, [meshId]: r.data || [] })); }
      if (which === "topology" && (force || !topoBy[meshId]))    { const r = await apiFetch(`/admin/meshdesk/meshes/${meshId}/topology`); setTopoBy(p => ({ ...p, [meshId]: r.data || { nodes: [], neighbors: [] } })); }
      if (which === "map") {
        // Map needs both node coordinates AND topology edges to draw connection lines
        if (force || !nodesBy[meshId])  { const r = await apiFetch(`/admin/meshdesk/meshes/${meshId}/nodes`);    setNodesBy(p => ({ ...p, [meshId]: r.data || [] })); }
        if (force || !topoBy[meshId])   { const r = await apiFetch(`/admin/meshdesk/meshes/${meshId}/topology`); setTopoBy(p => ({ ...p, [meshId]: r.data || { nodes: [], neighbors: [] } })); }
      }
    } catch { /* silent */ }
  };

  // G-04: toggle per-node station/device panel
  const toggleNodeStations = async (nodeId: number) => {
    const isOpen = nodeStationsOpen[nodeId];
    setNodeStationsOpen(p => ({ ...p, [nodeId]: !isOpen }));
    if (!isOpen && !nodeStationsBy[nodeId]) {
      try {
        const r = await apiFetch(`/admin/meshdesk/nodes/${nodeId}/stations`);
        const rows: NodeStation[] = (r.data || []).map((s: any) => ({
          ...s,
          mac: s.station_mac || s.mac || "",
        }));
        setNodeStationsBy(p => ({ ...p, [nodeId]: rows }));
      } catch { setNodeStationsBy(p => ({ ...p, [nodeId]: [] })); }
    }
  };

  // G-03: toggle per-entry (SSID) device panel — aggregates stations by SSID
  const toggleEntryDevices = async (meshId: number, entryId: number, ssid: string) => {
    const isOpen = entryDevicesOpen[entryId];
    setEntryDevicesOpen(p => ({ ...p, [entryId]: !isOpen }));
    if (!isOpen && !entryDevicesBy[entryId]) {
      try {
        // Aggregate from all nodes in this mesh that have a station on this SSID
        const nodes = nodesBy[meshId] || [];
        const all: NodeStation[] = [];
        await Promise.all(nodes.map(async node => {
          if (!nodeStationsBy[node.id]) {
            try {
              const r = await apiFetch(`/admin/meshdesk/nodes/${node.id}/stations`);
              const rows: NodeStation[] = (r.data || []).map((s: any) => ({ ...s, mac: s.station_mac || s.mac || "" }));
              setNodeStationsBy(p => ({ ...p, [node.id]: rows }));
              all.push(...rows.filter(s => !ssid || s.ssid === ssid));
            } catch { /* skip */ }
          } else {
            all.push(...(nodeStationsBy[node.id] || []).filter(s => !ssid || s.ssid === ssid));
          }
        }));
        setEntryDevicesBy(p => ({ ...p, [entryId]: all }));
      } catch { setEntryDevicesBy(p => ({ ...p, [entryId]: [] })); }
    }
  };

  // G-05: toggle nearby nodes (scan) panel
  const toggleNearbyNodes = async (nodeId: number) => {
    const isOpen = nodeScansOpen[nodeId];
    setNodeScansOpen(p => ({ ...p, [nodeId]: !isOpen }));
    if (!isOpen) {
      try {
        const [scanRes, trustRes] = await Promise.all([
          apiFetch(`/admin/meshdesk/nodes/${nodeId}/scans`),
          apiFetch(`/admin/meshdesk/trusted-aps`),
        ]);
        setNodeScansBy(p => ({ ...p, [nodeId]: scanRes.data || [] }));
        setTrustedAps(trustRes.data || []);
      } catch { setNodeScansBy(p => ({ ...p, [nodeId]: [] })); }
    }
  };

  const triggerScan = async (nodeId: number) => {
    setScanLoading(p => ({ ...p, [nodeId]: true }));
    try {
      await apiFetch(`/admin/meshdesk/nodes/${nodeId}/scans`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "Scan queued — results appear on next node check-in" });
      // Refresh scan results
      const r = await apiFetch(`/admin/meshdesk/nodes/${nodeId}/scans`);
      setNodeScansBy(p => ({ ...p, [nodeId]: r.data || [] }));
    } catch (err) { toast({ title: "Scan failed", description: String(err), variant: "destructive" }); }
    finally { setScanLoading(p => ({ ...p, [nodeId]: false })); }
  };

  const trustBssid = async (bssid: string, ssid: string) => {
    try {
      await apiFetch(`/admin/meshdesk/trusted-aps`, { method: "POST", body: JSON.stringify({ bssid, ssid, description: "Trusted via MESHdesk" }) });
      const r = await apiFetch(`/admin/meshdesk/trusted-aps`);
      setTrustedAps(r.data || []);
      toast({ title: `${bssid} added to trusted APs` });
    } catch (err) { toast({ title: "Failed", description: String(err), variant: "destructive" }); }
  };

  const untrustBssid = async (id: number) => {
    try {
      await apiFetch(`/admin/meshdesk/trusted-aps/${id}`, { method: "DELETE" });
      setTrustedAps(p => p.filter(t => t.id !== id));
      toast({ title: "Removed from trusted APs" });
    } catch (err) { toast({ title: "Failed", description: String(err), variant: "destructive" }); }
  };

  // G-04/G-03: bytes formatter
  const fmtBytes = (b: number) => {
    if (!b) return "0 B";
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`;
    return `${(b/1073741824).toFixed(2)} GB`;
  };

  const toggleMesh = async (id: number) => {
    if (expandedMesh === id) { setExpandedMesh(null); return; }
    setExpandedMesh(id);
    await fetchTab(id, meshSubTab[id] || "nodes");
  };

  const switchSubTab = async (meshId: number, t: string) => {
    setMeshSubTab(p => ({ ...p, [meshId]: t }));
    await fetchTab(meshId, t);
  };

  // ── Load settings into dialog ────────────────────────────────────────────────

  const openSettings = async (mesh: Mesh, tab: "batman"|"nodes" = "batman") => {
    // Load batman settings
    setBatmanForm({
      enable_alerts: mesh.enable_alerts,
      enable_overviews: mesh.enable_overviews,
      routing_algo: mesh.routing_algo || "BATMAN_IV",
      encryption: mesh.encryption || "none",
      encryption_key: mesh.encryption_key || "",
      orig_interval: mesh.orig_interval || 1000,
      aggregated_ogms: true, ap_isolation: mesh.ap_isolation || false,
      bonding: mesh.bonding || false, fragmentation: true,
      bridge_loop_avoidance: true, distributed_arp_table: true,
    });
    // Load full batman settings from API (has all fields)
    try {
      const r = await apiFetch(`/admin/meshdesk/meshes/${mesh.id}/settings`);
      if (r.data) setBatmanForm({ ...DEFAULT_BATMAN, ...r.data, enable_alerts: mesh.enable_alerts, enable_overviews: mesh.enable_overviews });
    } catch { /* use defaults */ }

    // Load node settings
    try {
      const r = await apiFetch(`/admin/meshdesk/meshes/${mesh.id}/node-settings`);
      if (r.data) setNodeSettingsForm({ ...DEFAULT_NODESETTINGS, ...r.data });
    } catch { setNodeSettingsForm(DEFAULT_NODESETTINGS); }

    setSettingsDlg({ open: true, mesh, settingsTab: tab });
  };

  // ── CRUD helpers ────────────────────────────────────────────────────────────

  // v3.15.4: When router changes, fetch a safe CIDR suggestion
  const onRouterChange = async (routerId: string) => {
    setMeshForm(p => ({ ...p, router_id: routerId, ip_pool_cidr: "" }));
    if (!routerId) { setCidrConflict({ conflict: false, reason: null }); return; }
    try {
      setCidrChecking(true);
      const r = await apiFetch(`/admin/meshdesk/safe-cidr?router_id=${routerId}`);
      setMeshForm(p => ({ ...p, ip_pool_cidr: r.suggested_cidr || "" }));
      setCidrConflict({ conflict: false, reason: null });
    } catch { /* non-fatal */ } finally { setCidrChecking(false); }
  };

  const checkCidrConflict = async (cidr: string, routerId: string) => {
    if (!cidr || !routerId) { setCidrConflict({ conflict: false, reason: null }); return; }
    try {
      const r = await apiFetch("/admin/meshdesk/check-conflict", { method: "POST", body: JSON.stringify({ ip_pool_cidr: cidr, router_id: Number(routerId) }) });
      setCidrConflict({ conflict: r.conflict, reason: r.reason || null });
    } catch { setCidrConflict({ conflict: false, reason: null }); }
  };

  const saveMesh = async () => {
    if (cidrConflict.conflict) {
      toast({ title: "IP Conflict", description: cidrConflict.reason || "Backbone CIDR overlaps router DHCP pool. Change ip_pool_cidr.", variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        name: meshForm.name,
        description: meshForm.description,
        cloud_id: meshForm.cloud_id || null,
        network_id: meshForm.network_id || null,
        router_id: meshForm.router_id ? Number(meshForm.router_id) : null,
      };
      // Only send ip_pool_cidr if explicitly set; backend auto-suggests a safe one if omitted
      if (meshForm.ip_pool_cidr) payload.ip_pool_cidr = meshForm.ip_pool_cidr;
      if (meshDlg.mode === "add") {
        await apiFetch("/admin/meshdesk/meshes", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Mesh created" });
      } else {
        await apiFetch(`/admin/meshdesk/meshes/${meshDlg.mesh!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Mesh updated" });
      }
      setMeshDlg({ open: false, mode: "add" }); await load();
    } catch (err: any) {
      const msg = err?.message || String(err);
      toast({ title: "Save failed", description: msg.includes("IP_CONFLICT") ? "Backbone CIDR overlaps router DHCP pool — change ip_pool_cidr." : msg, variant: "destructive" });
    }
  };

  const deleteMesh = async (id: number) => {
    if (!confirm("Delete this mesh and all its nodes?")) return;
    try { await apiFetch(`/admin/meshdesk/meshes/${id}`, { method: "DELETE" }); toast({ title: "Mesh deleted" }); await load(); }
    catch (err) { toast({ title: "Delete failed", description: String(err), variant: "destructive" }); }
  };

  const saveBatmanSettings = async () => {
    const mesh = settingsDlg.mesh!;
    try {
      // Save batman-adv settings via dedicated endpoint
      await apiFetch(`/admin/meshdesk/meshes/${mesh.id}/settings`, {
        method: "PUT",
        body: JSON.stringify(batmanForm),
      });
      // Also patch mesh table for enable_alerts / enable_overviews
      await apiFetch(`/admin/meshdesk/meshes/${mesh.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enable_alerts: batmanForm.enable_alerts, enable_overviews: batmanForm.enable_overviews }),
      });
      toast({ title: "batman-adv settings saved" }); await load();
    } catch (err) { toast({ title: "Save failed", description: String(err), variant: "destructive" }); }
  };

  const saveNodeSettings = async () => {
    const mesh = settingsDlg.mesh!;
    setNodeSettingsSaving(true);
    try {
      await apiFetch(`/admin/meshdesk/meshes/${mesh.id}/node-settings`, {
        method: "PUT",
        body: JSON.stringify({
          ...nodeSettingsForm,
          power: Number(nodeSettingsForm.power),
          channel_2ghz: Number(nodeSettingsForm.channel_2ghz),
          channel_5ghz: Number(nodeSettingsForm.channel_5ghz),
          heartbeat_dead_after: Number(nodeSettingsForm.heartbeat_dead_after),
          timezone_id: nodeSettingsForm.timezone_id || null,
        }),
      });
      toast({ title: "Node settings saved" });
    } catch (err) { toast({ title: "Save failed", description: String(err), variant: "destructive" }); }
    finally { setNodeSettingsSaving(false); }
  };

  const saveNode = async () => {
    const mid = nodeDlg.meshId!;
    const payload: any = {
      name: nodeForm.name, mac: nodeForm.mac,
      hardware: nodeForm.hardware || undefined,
      ip: nodeForm.ip || undefined,
      is_gateway: nodeForm.is_gateway,
      contact_phone: nodeForm.contact_phone,
      lat: nodeForm.lat ? parseFloat(nodeForm.lat) : null,
      lon: nodeForm.lon ? parseFloat(nodeForm.lon) : null,
      gateway: nodeForm.gateway,
      // v3.15.5: gateway nodes declare their MikroTik router uplink
      router_id: (nodeForm.is_gateway && nodeForm.router_id) ? Number(nodeForm.router_id) : null,
      gateway_priority: nodeForm.is_gateway ? (parseInt(nodeForm.gateway_priority) || 1) : null,
    };
    if (nodeForm.gateway === "wan_static")  Object.assign(payload, { wan_static_ipaddr: nodeForm.wan_static_ipaddr, wan_static_netmask: nodeForm.wan_static_netmask, wan_static_gateway: nodeForm.wan_static_gateway, wan_static_dns_1: nodeForm.wan_static_dns_1, wan_static_dns_2: nodeForm.wan_static_dns_2 });
    if (nodeForm.gateway === "wan_pppoe")   Object.assign(payload, { wan_pppoe_username: nodeForm.wan_pppoe_username, wan_pppoe_password: nodeForm.wan_pppoe_password, wan_pppoe_dns_1: nodeForm.wan_pppoe_dns_1, wan_pppoe_mac: nodeForm.wan_pppoe_mac, wan_pppoe_mtu: nodeForm.wan_pppoe_mtu });
    if (["wifi","wifi_pppoe","wifi_static"].includes(nodeForm.gateway)) {
      Object.assign(payload, { wbw_ssid: nodeForm.wbw_ssid, wbw_password: nodeForm.wbw_password });
      if (nodeForm.gateway === "wifi_static") Object.assign(payload, { wifi_static_ipaddr: nodeForm.wifi_static_ipaddr, wifi_static_netmask: nodeForm.wifi_static_netmask, wifi_static_gateway: nodeForm.wifi_static_gateway });
    }
    try {
      if (nodeDlg.mode === "add") {
        await apiFetch(`/admin/meshdesk/meshes/${mid}/nodes`, { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Node added" });
      } else {
        await apiFetch(`/admin/meshdesk/nodes/${nodeDlg.node!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "Node updated" });
      }
      setNodeDlg({ open: false, mode: "add", meshId: null }); await fetchTab(mid, "nodes", true);
    } catch (err) { toast({ title: "Save failed", description: String(err), variant: "destructive" }); }
  };

  const deleteNode = async (meshId: number, nodeId: number) => {
    if (!confirm("Delete this node?")) return;
    try { await apiFetch(`/admin/meshdesk/nodes/${nodeId}`, { method: "DELETE" }); toast({ title: "Node deleted" }); await fetchTab(meshId, "nodes", true); }
    catch (err) { toast({ title: "Delete failed", description: String(err), variant: "destructive" }); }
  };

  const queueAction = async (nodeId: number, action: string) => {
    try { await apiFetch(`/admin/meshdesk/nodes/${nodeId}/actions`, { method: "POST", body: JSON.stringify({ action }) }); toast({ title: `Queued: ${action}` }); }
    catch (err) { toast({ title: "Failed", description: String(err), variant: "destructive" }); }
  };

  const saveEntry = async () => {
    const mid = entryDlg.meshId!;
    try {
      if (entryDlg.mode === "add") { await apiFetch(`/admin/meshdesk/meshes/${mid}/entries`, { method: "POST", body: JSON.stringify(entryForm) }); toast({ title: "Entry added" }); }
      else { await apiFetch(`/admin/meshdesk/entries/${entryDlg.entry!.id}`, { method: "PATCH", body: JSON.stringify(entryForm) }); toast({ title: "Entry updated" }); }
      setEntryDlg({ open: false, mode: "add", meshId: null }); await fetchTab(mid, "entries", true);
    } catch (err) { toast({ title: "Save failed", description: String(err), variant: "destructive" }); }
  };

  const deleteEntry = async (meshId: number, id: number) => {
    if (!confirm("Remove this entry point?")) return;
    try { await apiFetch(`/admin/meshdesk/entries/${id}`, { method: "DELETE" }); toast({ title: "Entry removed" }); await fetchTab(meshId, "entries", true); }
    catch (err) { toast({ title: "Delete failed", description: String(err), variant: "destructive" }); }
  };

  const saveExit = async () => {
    const mid = exitDlg.meshId!;
    const payload = {
      ...exitForm,
      vlan: Number(exitForm.vlan),
      vlan_start: Number(exitForm.vlan_start),
      vlan_end: Number(exitForm.vlan_end),
      openvpn_server_id: exitForm.openvpn_server_id || null,
    };
    try {
      if (exitDlg.mode === "add") { await apiFetch(`/admin/meshdesk/meshes/${mid}/exits`, { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Exit added" }); }
      else { await apiFetch(`/admin/meshdesk/exits/${exitDlg.exitData!.id}`, { method: "PATCH", body: JSON.stringify(payload) }); toast({ title: "Exit updated" }); }
      setExitDlg({ open: false, mode: "add", meshId: null }); await fetchTab(mid, "exits", true);
    } catch (err) { toast({ title: "Save failed", description: String(err), variant: "destructive" }); }
  };

  const deleteExit = async (meshId: number, id: number) => {
    if (!confirm("Remove this exit point?")) return;
    try { await apiFetch(`/admin/meshdesk/exits/${id}`, { method: "DELETE" }); toast({ title: "Exit removed" }); await fetchTab(meshId, "exits", true); }
    catch (err) { toast({ title: "Delete failed", description: String(err), variant: "destructive" }); }
  };

  const claimNode = async () => {
    if (!claimDlg.node || !claimForm.mesh_id) return;
    try {
      await apiFetch(`/admin/meshdesk/unknown-nodes/${claimDlg.node.mac}/claim`, { method: "POST", body: JSON.stringify({ mesh_id: parseInt(claimForm.mesh_id), name: claimForm.name || claimDlg.node.mac }) });
      toast({ title: "Node claimed" }); setClaimDlg({ open: false }); await load();
    } catch (err) { toast({ title: "Claim failed", description: String(err), variant: "destructive" }); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <AdminLayout><div className="flex items-center justify-center h-64"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div></AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Radio className="h-6 w-6 text-primary" /> MESHdesk</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage mesh networks, OpenWrt nodes, batman-adv backhaul and captive portal exits</p>
          </div>
          <Button size="sm" onClick={load} variant="outline"><RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh</Button>
        </div>

        {/* Overview cards */}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Meshes",  total: overview.total_meshes,  up: overview.meshes_up,  icon: Network,       warn: false },
              { label: "Nodes",   total: overview.total_nodes,   up: overview.nodes_up,   icon: Radio,         warn: false },
              { label: "APs",     total: overview.total_aps,     up: overview.aps_up,     icon: Wifi,          warn: false },
              { label: "Unknown", total: overview.unknown_nodes, up: 0,                   icon: AlertTriangle, warn: true  },
            ].map(s => (
              <div key={s.label} className={`glass-card p-4 ${s.warn && s.total > 0 ? "border-yellow-500/40" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <s.icon className={`h-4 w-4 ${s.warn && s.total > 0 ? "text-yellow-500" : "text-primary"}`} />
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-2xl font-bold">{s.total}</p>
                {!s.warn && <p className="text-[10px] text-muted-foreground mt-1"><span className="text-green-500">{s.up} online</span>{" · "}<span className="text-red-400">{s.total - s.up} offline</span></p>}
              </div>
            ))}
          </div>
        )}

        {/* Top tabs */}
        <div className="flex border-b border-border/40 gap-1">
          {[
            { id: "meshes",  label: "Mesh Networks" },
            { id: "unknown", label: `Unknown Nodes${unknowns.length > 0 ? ` (${unknowns.length})` : ""}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── MESHES tab ──────────────────────────────────────────────────────── */}
        {tab === "meshes" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setMeshForm({ name: "", description: "", cloud_id: "", network_id: "", router_id: "", ip_pool_cidr: "" }); setCidrConflict({ conflict: false, reason: null }); setMeshDlg({ open: true, mode: "add" }); }}>
                <Plus className="h-3.5 w-3.5 mr-2" /> New Mesh
              </Button>
            </div>

            {meshes.length === 0 && (
              <div className="glass-card p-12 text-center text-muted-foreground">
                <Network className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No mesh networks yet.</p>
              </div>
            )}

            {meshes.map(mesh => {
              const isExpanded = expandedMesh === mesh.id;
              const isOnline   = mesh.last_contact ? Date.now() - new Date(mesh.last_contact).getTime() < 900_000 : false;
              const activeSub  = meshSubTab[mesh.id] || "nodes";

              return (
                <div key={mesh.id} className="glass-card overflow-hidden">
                  {/* Mesh row */}
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleMesh(mesh.id)}>
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Dot on={isOnline} />
                      <div>
                        <p className="text-sm font-semibold">{mesh.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">SSID: {mesh.ssid} · BSSID: {mesh.bssid}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-center hidden md:block"><p className="font-bold">{mesh.node_count}</p><p className="text-[10px] text-muted-foreground">Nodes</p></div>
                      <div className="text-center hidden md:block"><p className="font-bold text-green-500">{mesh.nodes_up}</p><p className="text-[10px] text-muted-foreground">Online</p></div>
                      <div className="text-center hidden md:block"><p className="font-bold text-red-400">{mesh.nodes_down}</p><p className="text-[10px] text-muted-foreground">Offline</p></div>
                      <Badge variant={isOnline ? "default" : "secondary"} className="text-[10px]">{isOnline ? "ACTIVE" : ago(mesh.last_contact)}</Badge>
                      {(mesh.linked_router_names?.length ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-1 hidden md:flex">
                          <Router className="h-2.5 w-2.5" />{mesh.linked_router_names!.join(" + ")}
                        </Badge>
                      )}
                      {mesh.ip_conflict && (
                        <Badge variant="destructive" className="text-[10px] gap-1" title={mesh.ip_conflict_reason || "IP conflict"}>
                          <AlertTriangle className="h-2.5 w-2.5" />IP CONFLICT
                        </Badge>
                      )}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-7 px-2" title="Settings" onClick={() => openSettings(mesh)}>
                          <Settings className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2"
                          onClick={() => { setMeshForm({ name: mesh.name, description: mesh.description, cloud_id: mesh.cloud_id?.toString() || "", network_id: (mesh as any).network_id?.toString() || "", router_id: mesh.router_id?.toString() || "", ip_pool_cidr: mesh.ip_pool_cidr || "" }); setCidrConflict({ conflict: false, reason: null }); setMeshDlg({ open: true, mode: "edit", mesh }); }}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteMesh(mesh.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="border-t border-border/40">

                      {/* v3.15.4: Router integration summary bar */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 bg-muted/20 border-b border-border/20 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Network className="h-3 w-3" />
                          <span className="font-mono">{mesh.ip_pool_cidr || <span className="italic">no backbone CIDR</span>}</span>
                        </span>
                        {(mesh.linked_router_names?.length ?? 0) > 0 ? (
                          <span className="flex items-center gap-1 text-green-500">
                            <Link className="h-3 w-3" />
                            {mesh.linked_router_names!.map((rn, i) => (
                              <span key={i}><strong>{rn}</strong>{mesh.linked_router_dhcp_pools?.[i] ? ` (pool: ${mesh.linked_router_dhcp_pools[i]})` : ""}{i < mesh.linked_router_names!.length - 1 ? " + " : ""}</span>
                            ))}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Unlink className="h-3 w-3" />No gateway nodes linked to a router
                          </span>
                        )}
                        {mesh.ap_dhcp_reserved_start && (
                          <span className="flex items-center gap-1 text-blue-400">
                            AP static leases reserved: {mesh.ap_dhcp_reserved_start}–{mesh.ap_dhcp_reserved_end}
                          </span>
                        )}
                        {mesh.ip_conflict && (
                          <span className="flex items-center gap-1 text-destructive font-semibold">
                            <AlertTriangle className="h-3 w-3" />{mesh.ip_conflict_reason}
                          </span>
                        )}
                      </div>

                      {/* Sub-tab bar */}
                      <div className="flex gap-0 border-b border-border/20 bg-muted/10 px-4 overflow-x-auto">
                        {[
                          { id: "nodes",    label: "Nodes",        Icon: Server  },
                          { id: "entries",  label: "Entry Points", Icon: Wifi    },
                          { id: "exits",    label: "Exit Points",  Icon: Globe   },
                          { id: "topology", label: "Node↔Node",   Icon: Share2  },
                          { id: "map",      label: "Map",          Icon: Map     },
                        ].map(t => (
                          <button key={t.id} onClick={() => switchSubTab(mesh.id, t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeSub === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                            <t.Icon className="h-3 w-3" />{t.label}
                          </button>
                        ))}
                      </div>

                      {/* ── Nodes ──────────────────────────────────────────── */}
                      {activeSub === "nodes" && (
                        <div>
                          <div className="p-3 bg-muted/10 flex items-center justify-between gap-2">
                            {/* G-06: search/filter input */}
                            <Input
                              className="h-7 text-xs w-48"
                              placeholder="Filter by name or MAC…"
                              value={nodeFilter[mesh.id] || ""}
                              onChange={e => setNodeFilter(p => ({ ...p, [mesh.id]: e.target.value }))}
                            />
                            <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0"
                              onClick={() => { setNodeForm(blankNodeForm()); setNodeDlg({ open: true, mode: "add", meshId: mesh.id }); }}>
                              <Plus className="h-3 w-3 mr-1" /> Add Node
                            </Button>
                          </div>
                          {(() => {
                            const filter = (nodeFilter[mesh.id] || "").toLowerCase();
                            const filtered = (nodesBy[mesh.id] || []).filter(n =>
                              !filter || n.name.toLowerCase().includes(filter) || n.mac.toLowerCase().includes(filter)
                            );
                            if ((nodesBy[mesh.id] || []).length === 0)
                              return <div className="p-6 text-center text-muted-foreground text-sm">No nodes registered yet.</div>;
                            if (filtered.length === 0)
                              return <div className="p-4 text-center text-muted-foreground text-sm">No nodes match "{nodeFilter[mesh.id]}".</div>;
                            return filtered.map(node => (
                              <div key={node.id} className="border-b border-border/20 last:border-0">
                                {/* Node row */}
                                <div className="flex items-start justify-between px-4 py-3">
                                  <div className="flex items-start gap-3">
                                    <Dot on={node.status === "online"} />
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-sm font-medium">{node.name}</p>
                                        {node.is_gateway && <Badge variant="outline" className="text-[9px] h-4 px-1">GW{node.gateway_priority && node.gateway_priority > 1 ? ` P${node.gateway_priority}` : ""}</Badge>}
                                        {node.is_gateway && node.router_id && (() => {
                                          const r = routers.find(r => r.id === node.router_id);
                                          return r ? <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5"><Router className="h-2 w-2" />{r.name}</Badge> : null;
                                        })()}
                                        {node.gateway && node.gateway !== "none" && <Badge variant="secondary" className="text-[9px] h-4 px-1">{node.gateway}</Badge>}
                                      </div>
                                      <p className="text-[10px] text-muted-foreground font-mono">{node.mac} · {node.ip || "—"} · {node.hardware || "unknown hw"}</p>
                                      <p className="text-[10px] text-muted-foreground">Last: {ago(node.last_contact)} · {node.station_count} stations</p>
                                      {(node.lat || node.contact_phone) && (
                                        <p className="text-[10px] text-muted-foreground">
                                          {node.lat && <><MapPin className="inline h-2.5 w-2.5 mr-0.5" />{node.lat?.toFixed(4)}, {node.lon?.toFixed(4)}</>}
                                          {node.lat && node.contact_phone && " · "}
                                          {node.contact_phone && <><Phone className="inline h-2.5 w-2.5 mr-0.5" />{node.contact_phone}</>}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                                    {/* G-04: Devices toggle */}
                                    <Button size="sm" variant={nodeStationsOpen[node.id] ? "default" : "outline"} className="h-7 px-2 text-[10px]"
                                      title="Connected Devices" onClick={() => toggleNodeStations(node.id)}>
                                      📶 Devices
                                    </Button>
                                    {/* G-05: Nearby Nodes toggle */}
                                    <Button size="sm" variant={nodeScansOpen[node.id] ? "default" : "outline"} className="h-7 px-2 text-[10px]"
                                      title="Nearby Nodes / WiFi Scan" onClick={() => toggleNearbyNodes(node.id)}>
                                      📡 Nearby
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Reboot" onClick={() => queueAction(node.id, "reboot")}><RefreshCw className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Reconfigure" onClick={() => queueAction(node.id, "reconfigure")}><Settings className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={async () => {
                                      const base = {
                                        name: node.name, mac: node.mac, hardware: node.hardware || "", ip: node.ip || "",
                                        is_gateway: node.is_gateway, contact_phone: node.contact_phone || "",
                                        lat: node.lat?.toString() || "", lon: node.lon?.toString() || "",
                                        gateway: node.gateway || "none",
                                        router_id: node.router_id?.toString() || "",
                                        gateway_priority: node.gateway_priority?.toString() || "1",
                                        wan_static_ipaddr: "", wan_static_netmask: "255.255.255.0",
                                        wan_static_gateway: "", wan_static_dns_1: "", wan_static_dns_2: "",
                                        wan_pppoe_username: "", wan_pppoe_password: "",
                                        wan_pppoe_dns_1: "", wan_pppoe_mac: "", wan_pppoe_mtu: "",
                                        wbw_ssid: "", wbw_password: "",
                                        wifi_static_ipaddr: "", wifi_static_netmask: "255.255.255.0", wifi_static_gateway: "",
                                      };
                                      try {
                                        const r = await apiFetch(`/admin/meshdesk/nodes/${node.id}/connection-settings`);
                                        const rows: { grouping: string; name: string; value: string }[] = r.data || [];
                                        const idx: Record<string, Record<string, string>> = {};
                                        rows.forEach(row => { (idx[row.grouping] ??= {})[row.name] = row.value; });
                                        const ws  = idx["wan_static_setting"]   || {};
                                        const wp  = idx["wan_pppoe_setting"]    || {};
                                        const wbw = idx["wbw_setting"]          || {};
                                        const wfs = idx["wifi_static_setting"]  || {};
                                        Object.assign(base, {
                                          wan_static_ipaddr:  ws.ipaddr  || "", wan_static_netmask: ws.netmask || "255.255.255.0",
                                          wan_static_gateway: ws.gateway || "", wan_static_dns_1:   ws.dns_1  || "", wan_static_dns_2: ws.dns_2 || "",
                                          wan_pppoe_username: wp.username || "", wan_pppoe_password: wp.password || "",
                                          wan_pppoe_dns_1: wp.dns_1 || "", wan_pppoe_mac: wp.mac || "", wan_pppoe_mtu: wp.mtu || "",
                                          wbw_ssid: wbw.ssid || "", wbw_password: wbw.password || "",
                                          wifi_static_ipaddr: wfs.ipaddr || "", wifi_static_netmask: wfs.netmask || "255.255.255.0",
                                          wifi_static_gateway: wfs.gateway || "",
                                        });
                                      } catch { /* proceed with base defaults */ }
                                      setNodeForm(base);
                                      setNodeDlg({ open: true, mode: "edit", meshId: mesh.id, node });
                                    }}><Edit className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteNode(mesh.id, node.id)}><Trash2 className="h-3 w-3" /></Button>
                                  </div>
                                </div>

                                {/* G-04: Node ↔ Devices panel */}
                                {nodeStationsOpen[node.id] && (
                                  <div className="mx-4 mb-3 rounded-md border border-border/40 bg-muted/10">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">📶 Connected Devices</span>
                                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => {
                                        setNodeStationsBy(p => { const c = {...p}; delete c[node.id]; return c; });
                                        toggleNodeStations(node.id);
                                      }}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
                                    </div>
                                    {!nodeStationsBy[node.id]
                                      ? <div className="p-4 text-center text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 mx-auto mb-1 animate-spin opacity-40" />Loading…</div>
                                      : (nodeStationsBy[node.id] || []).length === 0
                                        ? <div className="p-4 text-center text-xs text-muted-foreground">No devices currently connected.</div>
                                        : (() => {
                                            const stations = nodeStationsBy[node.id] || [];
                                            const sorted = [...stations].sort((a,b) => (b.rx_bytes+b.tx_bytes) - (a.rx_bytes+a.tx_bytes));
                                            const totalRx = stations.reduce((s,d) => s + d.rx_bytes, 0);
                                            const totalTx = stations.reduce((s,d) => s + d.tx_bytes, 0);
                                            return (
                                              <div className="overflow-x-auto">
                                                <table className="w-full text-[11px]">
                                                  <thead className="bg-muted/30">
                                                    <tr>
                                                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">MAC / Device</th>
                                                      <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">SSID</th>
                                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">↓ In (Rx)</th>
                                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">↑ Out (Tx)</th>
                                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Total</th>
                                                      <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Signal</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-border/20">
                                                    {sorted.map((st, i) => {
                                                      const total = st.rx_bytes + st.tx_bytes;
                                                      const sig = st.signal || 0;
                                                      const sigPct = Math.max(0, Math.min(100, ((sig + 100) / 70) * 100));
                                                      const sigCls = sigPct >= 60 ? "bg-green-500" : sigPct >= 35 ? "bg-yellow-400" : "bg-red-500";
                                                      return (
                                                        <tr key={i} className="hover:bg-muted/20">
                                                          <td className="px-3 py-1.5 font-mono">{st.mac}</td>
                                                          <td className="px-2 py-1.5 text-muted-foreground">{st.ssid || "—"}</td>
                                                          <td className="px-2 py-1.5 text-right text-blue-600">{fmtBytes(st.rx_bytes)}</td>
                                                          <td className="px-2 py-1.5 text-right text-orange-600">{fmtBytes(st.tx_bytes)}</td>
                                                          <td className="px-2 py-1.5 text-right font-medium">{fmtBytes(total)}</td>
                                                          <td className="px-2 py-1.5">
                                                            <div className="flex items-center gap-1 justify-center">
                                                              <div className="w-12 bg-muted rounded-full h-1.5"><div className={`h-1.5 rounded-full ${sigCls}`} style={{ width: `${sigPct}%` }} /></div>
                                                              <span className="text-[9px] text-muted-foreground">{sig} dBm</span>
                                                            </div>
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                  {/* Summary row */}
                                                  <tfoot>
                                                    <tr className="bg-muted/20 font-semibold">
                                                      <td className="px-3 py-1.5" colSpan={2}>{stations.length} device{stations.length !== 1 ? "s" : ""} total</td>
                                                      <td className="px-2 py-1.5 text-right text-blue-600">{fmtBytes(totalRx)}</td>
                                                      <td className="px-2 py-1.5 text-right text-orange-600">{fmtBytes(totalTx)}</td>
                                                      <td className="px-2 py-1.5 text-right">{fmtBytes(totalRx+totalTx)}</td>
                                                      <td />
                                                    </tr>
                                                  </tfoot>
                                                </table>
                                                {/* Top 10 */}
                                                {sorted.length > 3 && (
                                                  <div className="border-t border-border/30 px-3 py-2">
                                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">🏆 Top 10 by Traffic</p>
                                                    <div className="flex flex-col gap-0.5">
                                                      {sorted.slice(0, 10).map((st, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-[10px]">
                                                          <span className="w-4 text-muted-foreground font-mono">{i+1}.</span>
                                                          <span className="font-mono flex-1">{st.mac}</span>
                                                          <span className="text-muted-foreground">{st.ssid || "—"}</span>
                                                          <span className="font-medium">{fmtBytes(st.rx_bytes + st.tx_bytes)}</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })()
                                    }
                                  </div>
                                )}

                                {/* G-05: Nearby Nodes / WiFi Scan panel */}
                                {nodeScansOpen[node.id] && (
                                  <div className="mx-4 mb-3 rounded-md border border-border/40 bg-muted/10">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">📡 Nearby Nodes / WiFi Scan</span>
                                      <Button size="sm" variant="outline" className="h-6 text-[10px]"
                                        disabled={scanLoading[node.id]}
                                        onClick={() => triggerScan(node.id)}>
                                        {scanLoading[node.id] ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Scanning…</> : "🔍 Scan Now"}
                                      </Button>
                                    </div>
                                    {!nodeScansBy[node.id]
                                      ? <div className="p-4 text-center text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 mx-auto mb-1 animate-spin opacity-40" />Loading…</div>
                                      : (nodeScansBy[node.id] || []).length === 0
                                        ? (
                                          <div className="p-4 text-center text-xs text-muted-foreground">
                                            No scan results yet. Click "Scan Now" to queue a WiFi scan — results appear on next node check-in.
                                          </div>
                                        )
                                        : (nodeScansBy[node.id] || []).map((scan, si) => {
                                            const results: ScanResult[] = Array.isArray(scan.results)
                                              ? scan.results
                                              : (typeof scan.results === "string" ? JSON.parse(scan.results) : []);
                                            const trustedBssids = new Set(trustedAps.map(t => t.bssid.toLowerCase()));
                                            return (
                                              <div key={si}>
                                                <p className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border/20">
                                                  Scan at {new Date(scan.scan_time).toLocaleString()} — {results.length} APs detected
                                                </p>
                                                <div className="overflow-x-auto">
                                                  <table className="w-full text-[11px]">
                                                    <thead className="bg-muted/30">
                                                      <tr>
                                                        <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">BSSID</th>
                                                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">SSID</th>
                                                        <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Ch</th>
                                                        <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Signal</th>
                                                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Enc</th>
                                                        <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Trust</th>
                                                        <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Action</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/20">
                                                      {results.map((ap, ai) => {
                                                        const bssidNorm = ap.bssid.toLowerCase();
                                                        const isTrusted = trustedBssids.has(bssidNorm);
                                                        const trustedEntry = trustedAps.find(t => t.bssid.toLowerCase() === bssidNorm);
                                                        const sigPct = Math.max(0, Math.min(100, ((ap.signal + 100) / 70) * 100));
                                                        const sigCls = sigPct >= 60 ? "bg-green-500" : sigPct >= 35 ? "bg-yellow-400" : "bg-red-500";
                                                        return (
                                                          <tr key={ai} className={`hover:bg-muted/20 ${!isTrusted ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                                                            <td className="px-3 py-1.5 font-mono text-[10px]">{ap.bssid}</td>
                                                            <td className="px-2 py-1.5">{ap.ssid || <span className="text-muted-foreground italic">hidden</span>}</td>
                                                            <td className="px-2 py-1.5 text-center">{ap.channel}</td>
                                                            <td className="px-2 py-1.5">
                                                              <div className="flex items-center gap-1 justify-center">
                                                                <div className="w-10 bg-muted rounded-full h-1.5"><div className={`h-1.5 rounded-full ${sigCls}`} style={{ width: `${sigPct}%` }} /></div>
                                                                <span className="text-[9px]">{ap.signal}</span>
                                                              </div>
                                                            </td>
                                                            <td className="px-2 py-1.5 text-muted-foreground">{ap.encryption || "—"}</td>
                                                            <td className="px-2 py-1.5 text-center">
                                                              {isTrusted
                                                                ? <span className="text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-medium">✓ Trusted</span>
                                                                : <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-medium">⚠ Rogue</span>}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center">
                                                              {isTrusted
                                                                ? <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1 text-destructive"
                                                                    onClick={() => trustedEntry && untrustBssid(trustedEntry.id)}>Untrust</Button>
                                                                : <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1 text-green-700"
                                                                    onClick={() => trustBssid(ap.bssid, ap.ssid)}>Trust</Button>}
                                                            </td>
                                                          </tr>
                                                        );
                                                      })}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            );
                                          })
                                    }
                                  </div>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                      )}

                      {/* ── Entry Points ───────────────────────────────────── */}
                      {activeSub === "entries" && (
                        <div>
                          <div className="p-3 bg-muted/10 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entry Points (SSIDs)</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => { setEntryForm(blankEntryForm()); setEntryDlg({ open: true, mode: "add", meshId: mesh.id }); }}>
                              <Plus className="h-3 w-3 mr-1" /> Add Entry

                            </Button>
                          </div>
                          {(entriesBy[mesh.id] || []).length === 0
                            ? <div className="p-6 text-center text-muted-foreground text-sm">No entry points configured.</div>
                            : (entriesBy[mesh.id] || []).map(entry => (
                              <div key={entry.id} className="border-b border-border/20 last:border-0">
                                <div className="flex items-center justify-between px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <Wifi className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-medium">{entry.ssid || entry.name}</p>
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        <Badge variant="secondary" className="text-[9px] h-4 px-1">{entry.encryption}</Badge>
                                        <Badge variant="secondary" className="text-[9px] h-4 px-1">
                                          {BANDS.find(b => b.value === entry.frequency_band)?.label || entry.frequency_band}
                                        </Badge>
                                        {entry.hidden   && <Badge variant="outline" className="text-[9px] h-4 px-1 flex gap-0.5"><EyeOff className="h-2 w-2" /> Hidden</Badge>}
                                        {entry.isolate  && <Badge variant="outline" className="text-[9px] h-4 px-1 flex gap-0.5"><Shield className="h-2 w-2" /> Isolated</Badge>}
                                        {entry.apply_to_all && <Badge variant="outline" className="text-[9px] h-4 px-1">All nodes</Badge>}
                                        {entry.disabled && <Badge variant="destructive" className="text-[9px] h-4 px-1">Disabled</Badge>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    {/* G-03: Devices toggle */}
                                    <Button size="sm" variant={entryDevicesOpen[entry.id] ? "default" : "outline"} className="h-7 px-2 text-[10px]"
                                      title="Devices on this SSID"
                                      onClick={() => toggleEntryDevices(mesh.id, entry.id, entry.ssid || entry.name)}>
                                      📶 Devices
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEntryForm({ name: entry.name, ssid: entry.ssid, encryption: entry.encryption, special_key: entry.special_key, hidden: entry.hidden, isolate: entry.isolate, apply_to_all: entry.apply_to_all, frequency_band: entry.frequency_band, exitIds: (entry as any).exit_ids ?? [] }); setEntryDlg({ open: true, mode: "edit", meshId: mesh.id, entry }); }}><Edit className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteEntry(mesh.id, entry.id)}><Trash2 className="h-3 w-3" /></Button>
                                  </div>
                                </div>

                                {/* G-03: SSID ↔ Devices panel */}
                                {entryDevicesOpen[entry.id] && (
                                  <div className="mx-4 mb-3 rounded-md border border-border/40 bg-muted/10">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">📶 Devices on "{entry.ssid || entry.name}"</span>
                                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => {
                                        setEntryDevicesBy(p => { const c = {...p}; delete c[entry.id]; return c; });
                                        setEntryDevicesOpen(p => ({ ...p, [entry.id]: false }));
                                        setTimeout(() => toggleEntryDevices(mesh.id, entry.id, entry.ssid || entry.name), 0);
                                      }}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
                                    </div>
                                    {!entryDevicesBy[entry.id]
                                      ? <div className="p-4 text-center text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 mx-auto mb-1 animate-spin opacity-40" />Loading…</div>
                                      : (entryDevicesBy[entry.id] || []).length === 0
                                        ? <div className="p-4 text-center text-xs text-muted-foreground">No devices currently connected to this SSID.</div>
                                        : (() => {
                                            const devices = entryDevicesBy[entry.id] || [];
                                            const sorted = [...devices].sort((a,b) => (b.rx_bytes+b.tx_bytes) - (a.rx_bytes+a.tx_bytes));
                                            const totalRx = devices.reduce((s,d) => s + d.rx_bytes, 0);
                                            const totalTx = devices.reduce((s,d) => s + d.tx_bytes, 0);
                                            return (
                                              <div className="overflow-x-auto">
                                                <table className="w-full text-[11px]">
                                                  <thead className="bg-muted/30">
                                                    <tr>
                                                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">MAC</th>
                                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">↓ In (Rx)</th>
                                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">↑ Out (Tx)</th>
                                                      <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Total</th>
                                                      <th className="text-center px-2 py-1.5 font-medium text-muted-foreground">Signal</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-border/20">
                                                    {sorted.map((dev, i) => {
                                                      const total = dev.rx_bytes + dev.tx_bytes;
                                                      const sig = dev.signal || 0;
                                                      const sigPct = Math.max(0, Math.min(100, ((sig + 100) / 70) * 100));
                                                      const sigCls = sigPct >= 60 ? "bg-green-500" : sigPct >= 35 ? "bg-yellow-400" : "bg-red-500";
                                                      return (
                                                        <tr key={i} className="hover:bg-muted/20">
                                                          <td className="px-3 py-1.5 font-mono">{dev.mac}</td>
                                                          <td className="px-2 py-1.5 text-right text-blue-600">{fmtBytes(dev.rx_bytes)}</td>
                                                          <td className="px-2 py-1.5 text-right text-orange-600">{fmtBytes(dev.tx_bytes)}</td>
                                                          <td className="px-2 py-1.5 text-right font-medium">{fmtBytes(total)}</td>
                                                          <td className="px-2 py-1.5">
                                                            <div className="flex items-center gap-1 justify-center">
                                                              <div className="w-12 bg-muted rounded-full h-1.5"><div className={`h-1.5 rounded-full ${sigCls}`} style={{ width: `${sigPct}%` }} /></div>
                                                              <span className="text-[9px] text-muted-foreground">{sig} dBm</span>
                                                            </div>
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                  <tfoot>
                                                    <tr className="bg-muted/20 font-semibold">
                                                      <td className="px-3 py-1.5">{devices.length} device{devices.length !== 1 ? "s" : ""}</td>
                                                      <td className="px-2 py-1.5 text-right text-blue-600">{fmtBytes(totalRx)}</td>
                                                      <td className="px-2 py-1.5 text-right text-orange-600">{fmtBytes(totalTx)}</td>
                                                      <td className="px-2 py-1.5 text-right">{fmtBytes(totalRx+totalTx)}</td>
                                                      <td />
                                                    </tr>
                                                  </tfoot>
                                                </table>
                                                {/* Top 10 */}
                                                {sorted.length > 3 && (
                                                  <div className="border-t border-border/30 px-3 py-2">
                                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">🏆 Top 10 by Traffic</p>
                                                    <div className="flex flex-col gap-0.5">
                                                      {sorted.slice(0, 10).map((dev, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-[10px]">
                                                          <span className="w-4 text-muted-foreground font-mono">{i+1}.</span>
                                                          <span className="font-mono flex-1">{dev.mac}</span>
                                                          <span className="font-medium">{fmtBytes(dev.rx_bytes + dev.tx_bytes)}</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })()
                                    }
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      )}

                      {/* ── Exit Points ────────────────────────────────────── */}
                      {activeSub === "exits" && (
                        <div>
                          <div className="p-3 bg-muted/10 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Exit Points</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => { setExitForm(blankExitForm()); fetchTab(mesh.id, "entries"); setExitDlg({ open: true, mode: "add", meshId: mesh.id }); }}>
                              <Plus className="h-3 w-3 mr-1" /> Add Exit
                            </Button>
                          </div>
                          {(exitsBy[mesh.id] || []).length === 0
                            ? <div className="p-6 text-center text-muted-foreground text-sm">No exit points configured.</div>
                            : (exitsBy[mesh.id] || []).map(ex => {
                              const colors: Record<string,string> = { nat:"bg-purple-100 text-purple-700", nat_specific:"bg-violet-100 text-violet-700", captive_portal:"bg-orange-100 text-orange-700", bridge_l2:"bg-green-100 text-green-700", bridge_l3:"bg-teal-100 text-teal-700", openvpn_bridge:"bg-blue-100 text-blue-700", pppoe_server:"bg-pink-100 text-pink-700" };
                              return (
                                <div key={ex.id} className="flex items-center justify-between px-4 py-3 border-b border-border/20 last:border-0">
                                  <div className="flex items-center gap-3">
                                    <Globe className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-medium">{ex.name}</p>
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${colors[ex.type]||"bg-gray-100 text-gray-700"}`}>{ex.type}</span>
                                        {ex.vlan > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1">VLAN {ex.vlan}</Badge>}{(ex as any).apply_sqm_profile && (ex as any).cake_bandwidth && <Badge variant="outline" className="text-[9px] h-4 px-1 bg-cyan-500/10 text-cyan-400 border-cyan-500/30">⧖ {(ex as any).cake_bandwidth}</Badge>}
                                        {ex.radius_1 && <Badge variant="secondary" className="text-[9px] h-4 px-1">RADIUS: {ex.radius_1}</Badge>}
                                        {ex.uam_url  && <Badge variant="secondary" className="text-[9px] h-4 px-1 max-w-[140px] truncate">UAM</Badge>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setExitForm({ name: ex.name, type: ex.type, vlan: String(ex.vlan||0), proto: ex.proto||"dhcp", ipaddr: ex.ipaddr||"", netmask: ex.netmask||"", gateway: ex.gateway||"", radius_1: ex.radius_1||"", radius_2: ex.radius_2||"", radius_secret: ex.radius_secret||"testing123", uam_url: ex.uam_url||"", uam_secret: ex.uam_secret||"greatsecret", walled_garden: ex.walled_garden||"", openvpn_server_id: ex.openvpn_server_id?.toString()||"", entryIds: (ex as any).entry_ids ?? [], auto_detect: (ex as any).auto_detect ?? true, vlan_range_or_list: (ex as any).vlan_range_or_list || "range", vlan_start: String((ex as any).vlan_start||10), vlan_end: String((ex as any).vlan_end||20), vlan_list: (ex as any).vlan_list||"", apply_sqm_profile: (ex as any).apply_sqm_profile ?? false, cake_bandwidth: (ex as any).cake_bandwidth||"", cake_options: (ex as any).cake_options||"besteffort triple-isolate nat" }); setExitDlg({ open: true, mode: "edit", meshId: mesh.id, exitData: ex }); }}><Edit className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteExit(mesh.id, ex.id)}><Trash2 className="h-3 w-3" /></Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* ── Node↔Node Topology ─────────────────────────────── */}
                      {activeSub === "topology" && (
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Node ↔ Node Topology (batman-adv)</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fetchTab(mesh.id, "topology", true)}><RefreshCw className="h-3 w-3 mr-1" /> Refresh</Button>
                          </div>
                          {!topoBy[mesh.id]
                            ? <div className="p-6 text-center text-muted-foreground text-sm"><RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin opacity-40" />Loading…</div>
                            : (topoBy[mesh.id].neighbors||[]).length === 0
                              ? (
                                <div className="p-6 text-center text-muted-foreground text-sm">
                                  <Share2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                  No topology data yet. Nodes report their batman-adv originator table on each check-in.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap gap-2">
                                    {topoBy[mesh.id].nodes.map(n => (
                                      <div key={n.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] border ${n.status === "online" ? "border-green-500/40 bg-green-50 dark:bg-green-950/20" : "border-red-400/40 bg-red-50 dark:bg-red-950/20"}`}>
                                        <Dot on={n.status === "online"} />
                                        <span className="font-medium">{n.name}</span>
                                        <span className="font-mono text-muted-foreground">{n.ip || n.mac.slice(-5)}</span>
                                        {n.is_gateway && <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">GW</span>}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="rounded-md border border-border/40 overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead className="bg-muted/30">
                                        <tr>
                                          <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">From Node</th>
                                          <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Neighbour</th>
                                          <th className="text-right px-3 py-2 text-[10px] font-medium text-muted-foreground">TQ</th>
                                          <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground">Link Quality</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/20">
                                        {topoBy[mesh.id].neighbors.slice(0,60).map((edge, i) => {
                                          const pct = Math.round((edge.tq / 255) * 100);
                                          const bar = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-500";
                                          return (
                                            <tr key={i} className="hover:bg-muted/20">
                                              <td className="px-3 py-2 font-medium">{edge.from_name || edge.from_mac}</td>
                                              <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{edge.to_name || edge.neighbour_mac}</td>
                                              <td className="px-3 py-2 text-right font-mono">{edge.tq}</td>
                                              <td className="px-3 py-2">
                                                <div className="flex items-center gap-1.5">
                                                  <div className="w-16 bg-muted rounded-full h-1.5"><div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
                                                  <span className="text-[9px] text-muted-foreground">{pct}%</span>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                        </div>
                      )}

                      {/* ── Map ──────────────────────────────────────────────── */}
                      {activeSub === "map" && (
                        <MeshMapView nodes={nodesBy[mesh.id] || []} topology={topoBy[mesh.id]} />
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── UNKNOWN NODES tab ───────────────────────────────────────────────── */}
        {tab === "unknown" && (
          <div className="space-y-3">
            {unknowns.length === 0
              ? <div className="glass-card p-12 text-center text-muted-foreground"><CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" /><p className="text-sm">All devices are registered.</p></div>
              : <div className="glass-card divide-y divide-border/30">
                {unknowns.map(node => (
                  <div key={node.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-mono font-medium">{node.mac}</p>
                      <p className="text-[10px] text-muted-foreground">From: {node.from_ip} · {node.vendor||"unknown vendor"} · FW: {node.firmware_version||"—"} · {node.is_gateway?"Gateway":"Node"} · Mode: {node.new_mode||"mesh"}</p>
                      <p className="text-[10px] text-muted-foreground">Last seen: {ago(node.last_contact)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        onClick={() => { setClaimForm({ mesh_id: "", name: node.mac }); setClaimDlg({ open: true, node }); }}>
                        Assign to Mesh
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                        onClick={async () => { try { await apiFetch(`/admin/meshdesk/unknown-nodes/${node.id}`, { method: "DELETE" }); setUnknowns(p => p.filter(n => n.id !== node.id)); } catch(err) { console.error("[MeshDesk] delete unknown node:", err); } }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        )}
      </div>

      {/* ════════════════════ DIALOGS ════════════════════ */}

      {/* Add/Edit Mesh */}
      <Dialog open={meshDlg.open} onOpenChange={o => setMeshDlg(p => ({ ...p, open: o }))}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0"><DialogTitle>{meshDlg.mode === "add" ? "Create Mesh Network" : "Edit Mesh"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 flex-1 overflow-y-auto pr-1">
            <div><Label className="text-xs">Name *</Label><Input className="mt-1" placeholder="e.g. Nairobi CBD Mesh" value={meshForm.name} onChange={e => setMeshForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Description</Label><Input className="mt-1" placeholder="Optional" value={meshForm.description} onChange={e => setMeshForm(p => ({ ...p, description: e.target.value }))} /></div>

            {/* v3.15.4: MikroTik Router Link */}
            <div>
              <Label className="text-xs flex items-center gap-1"><Router className="h-3 w-3" /> Linked MikroTik Router <span className="text-muted-foreground">(optional)</span></Label>
              <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={meshForm.router_id}
                onChange={e => onRouterChange(e.target.value)}>
                <option value="">— Not linked to a router —</option>
                {routers.map(r => (
                  <option key={r.id} value={r.id}>{r.name}{r.dhcp_pool ? ` (${r.dhcp_pool})` : ""}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Links this mesh to a MikroTik router. MikroBill will generate static DHCP leases for AP nodes and validate there are no IP conflicts.
              </p>
            </div>

            {/* v3.15.4: Backbone IP Pool CIDR */}
            <div>
              <Label className="text-xs flex items-center gap-1">Backbone IP Pool (CIDR)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder={cidrChecking ? "Calculating safe CIDR…" : "e.g. 10.50.0.0/24"}
                  value={meshForm.ip_pool_cidr}
                  onChange={e => { setMeshForm(p => ({ ...p, ip_pool_cidr: e.target.value })); checkCidrConflict(e.target.value, meshForm.router_id); }}
                  className={cidrConflict.conflict ? "border-destructive" : ""}
                />
              </div>
              {cidrConflict.conflict ? (
                <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{cidrConflict.reason}
                </p>
              ) : meshForm.ip_pool_cidr ? (
                <p className="text-[10px] text-green-500 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />No conflict detected — safe to use.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  batman-adv management IPs for AP nodes (br-one). Must not overlap the router DHCP pool. Leave blank to auto-assign a safe range.
                </p>
              )}
            </div>

            {clouds.length > 0 && (
              <div>
                <Label className="text-xs">Cloud (optional)</Label>
                <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={meshForm.cloud_id}
                  onChange={e => setMeshForm(p => ({ ...p, cloud_id: e.target.value, network_id: "" }))}>
                  <option value="">— No cloud —</option>
                  {clouds.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {networks.length > 0 && (
              <div>
                <Label className="text-xs">Network (optional)</Label>
                <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={meshForm.network_id}
                  onChange={e => setMeshForm(p => ({ ...p, network_id: e.target.value }))}>
                  <option value="">— No network —</option>
                  {networks
                    .filter(n => !meshForm.cloud_id || n.cloud_id === Number(meshForm.cloud_id))
                    .map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">BSSID and SSID are auto-generated from the mesh ID. Use the Settings button to configure batman-adv parameters.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMeshDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveMesh} disabled={!meshForm.name || cidrConflict.conflict}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mesh Settings (batman-adv + Node Settings) ─────────────────────── */}
      <Dialog open={settingsDlg.open} onOpenChange={o => setSettingsDlg(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Mesh Settings — {settingsDlg.mesh?.name}</DialogTitle></DialogHeader>

          {/* Settings sub-tabs */}
          <div className="flex border-b border-border/40 -mx-6 px-6 gap-4">
            {[
              { id: "batman", label: "batman-adv" },
              { id: "nodes",  label: "Node Defaults" },
            ].map(t => (
              <button key={t.id} onClick={() => setSettingsDlg(p => ({ ...p, settingsTab: t.id as any }))}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${settingsDlg.settingsTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* batman-adv tab */}
          {settingsDlg.settingsTab === "batman" && (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="rounded-lg border border-border/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">General</p>
                <Toggle label="Enable Alerts" checked={batmanForm.enable_alerts} onChange={v => setBatmanForm(p => ({ ...p, enable_alerts: v }))} />
                <Toggle label="Enable Stats Collection / Overviews" checked={batmanForm.enable_overviews} onChange={v => setBatmanForm(p => ({ ...p, enable_overviews: v }))} />
              </div>

              <div className="rounded-lg border border-border/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">batman-adv Protocol</p>
                <Sel label="Routing Algorithm" value={batmanForm.routing_algo}
                  onChange={v => setBatmanForm(p => ({ ...p, routing_algo: v }))} options={ROUTING_ALGOS} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Sel label="Encryption" value={batmanForm.encryption}
                    onChange={v => setBatmanForm(p => ({ ...p, encryption: v }))}
                    options={[{value:"none",label:"None"},{value:"gcmp",label:"GCMP (batman-adv)"}]} />
                  <div><Label className="text-xs">OGM Interval (ms)</Label>
                    <Input className="mt-1" type="number" min={100} max={10000}
                      value={batmanForm.orig_interval}
                      onChange={e => setBatmanForm(p => ({ ...p, orig_interval: parseInt(e.target.value)||1000 }))} />
                  </div>
                </div>
                {batmanForm.encryption !== "none" && (
                  <div><Label className="text-xs">Encryption Key</Label>
                    <Input className="mt-1" type="password" value={batmanForm.encryption_key}
                      onChange={e => setBatmanForm(p => ({ ...p, encryption_key: e.target.value }))} />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">batman-adv Features</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                  <Toggle label="Aggregated OGMs"           checked={batmanForm.aggregated_ogms}       onChange={v => setBatmanForm(p => ({ ...p, aggregated_ogms: v }))} />
                  <Toggle label="AP Isolation"              checked={batmanForm.ap_isolation}           onChange={v => setBatmanForm(p => ({ ...p, ap_isolation: v }))} />
                  <Toggle label="Bonding Mode"              checked={batmanForm.bonding}                onChange={v => setBatmanForm(p => ({ ...p, bonding: v }))} />
                  <Toggle label="Fragmentation"             checked={batmanForm.fragmentation}          onChange={v => setBatmanForm(p => ({ ...p, fragmentation: v }))} />
                  <Toggle label="Bridge Loop Avoidance"     checked={batmanForm.bridge_loop_avoidance}  onChange={v => setBatmanForm(p => ({ ...p, bridge_loop_avoidance: v }))} />
                  <Toggle label="Distributed ARP Table"     checked={batmanForm.distributed_arp_table}  onChange={v => setBatmanForm(p => ({ ...p, distributed_arp_table: v }))} />
                </div>
              </div>
            </div>
          )}

          {/* Node Defaults tab */}
          {settingsDlg.settingsTab === "nodes" && (
            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="rounded-lg border border-border/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Authentication</p>
                <div><Label className="text-xs">Node Root Password</Label>
                  <Input className="mt-1" type="password" placeholder="admin"
                    value={nodeSettingsForm.node_password}
                    onChange={e => setNodeSettingsForm(p => ({ ...p, node_password: e.target.value }))} />
                </div>
              </div>

              <div className="rounded-lg border border-border/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transmit Power</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label className="text-xs">TX Power (%)</Label>
                    <Input className="mt-1" type="number" min={0} max={100}
                      value={nodeSettingsForm.power}
                      onChange={e => setNodeSettingsForm(p => ({ ...p, power: parseInt(e.target.value)||100 }))} />
                  </div>
                  <div className="flex items-end pb-1">
                    <Toggle label="Apply to all nodes" checked={nodeSettingsForm.apply_power_to_all}
                      onChange={v => setNodeSettingsForm(p => ({ ...p, apply_power_to_all: v }))} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Radio Channels</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Sel label="2.4 GHz Channel" value={String(nodeSettingsForm.channel_2ghz)}
                    onChange={v => setNodeSettingsForm(p => ({ ...p, channel_2ghz: parseInt(v) }))}
                    options={CHANNELS_2GHZ} />
                  <Sel label="5 GHz Channel" value={String(nodeSettingsForm.channel_5ghz)}
                    onChange={v => setNodeSettingsForm(p => ({ ...p, channel_5ghz: parseInt(v) }))}
                    options={CHANNELS_5GHZ} />
                </div>
              </div>

              <div className="rounded-lg border border-border/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ethernet Bridge</p>
                <Toggle label="Enable Ethernet Bridge on non-gateway nodes"
                  checked={nodeSettingsForm.eth_bridge_enabled}
                  onChange={v => setNodeSettingsForm(p => ({ ...p, eth_bridge_enabled: v }))} />
                {nodeSettingsForm.eth_bridge_enabled && (
                  <Toggle label="Apply bridge to all nodes"
                    checked={nodeSettingsForm.eth_bridge_for_all}
                    onChange={v => setNodeSettingsForm(p => ({ ...p, eth_bridge_for_all: v }))} />
                )}
              </div>

              <div className="rounded-lg border border-border/40 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Locale &amp; Monitoring</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label className="text-xs">Country Code</Label>
                    <Input className="mt-1" maxLength={4} placeholder="US"
                      value={nodeSettingsForm.country_code}
                      onChange={e => setNodeSettingsForm(p => ({ ...p, country_code: e.target.value.toUpperCase() }))} />
                  </div>
                  <div><Label className="text-xs">Heartbeat Dead After (s)</Label>
                    <Input className="mt-1" type="number" min={60}
                      value={nodeSettingsForm.heartbeat_dead_after}
                      onChange={e => setNodeSettingsForm(p => ({ ...p, heartbeat_dead_after: parseInt(e.target.value)||300 }))} />
                  </div>
                </div>
                {timezones.length > 0 && (
                  <Sel label="Timezone" value={String(nodeSettingsForm.timezone_id || "")}
                    onChange={v => setNodeSettingsForm(p => ({ ...p, timezone_id: v ? parseInt(v) : null }))}
                    options={[{ value: "", label: "— Use system default —" }, ...timezones.map(tz => ({ value: String(tz.id), label: tz.name }))]} />
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSettingsDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            {settingsDlg.settingsTab === "batman" && (
              <Button onClick={saveBatmanSettings}>Save batman-adv Settings</Button>
            )}
            {settingsDlg.settingsTab === "nodes" && (
              <Button onClick={saveNodeSettings} disabled={nodeSettingsSaving}>
                {nodeSettingsSaving ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" />Saving…</> : "Save Node Defaults"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Node */}
      <Dialog open={nodeDlg.open} onOpenChange={o => setNodeDlg(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{nodeDlg.mode === "add" ? "Add Node to Mesh" : `Edit Node — ${nodeDlg.node?.name}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[72vh] overflow-y-auto pr-1">

            {/* Basic info */}
            <div className="rounded-lg border border-border/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node Info</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">Node Name *</Label><Input className="mt-1" placeholder="e.g. Rooftop-01" value={nodeForm.name} onChange={e => setNodeForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div><Label className="text-xs">MAC Address *</Label><Input className="mt-1" placeholder="AA:BB:CC:DD:EE:FF" maxLength={17} value={nodeForm.mac} onChange={e => setNodeForm(p => ({ ...p, mac: e.target.value }))} /></div>
                <div>
                  <Label className="text-xs">Hardware Model</Label>
                  {hardwares.length > 0 ? (
                    <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={nodeForm.hardware} onChange={e => setNodeForm(p => ({ ...p, hardware: e.target.value }))}>
                      <option value="">— Select hardware —</option>
                      {hardwares.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
                    </select>
                  ) : (
                    <Input className="mt-1" placeholder="e.g. gl-mt3000" value={nodeForm.hardware} onChange={e => setNodeForm(p => ({ ...p, hardware: e.target.value }))} />
                  )}
                </div>
                <div><Label className="text-xs">Static IP (blank = auto)</Label><Input className="mt-1" placeholder="10.50.50.2" value={nodeForm.ip} onChange={e => setNodeForm(p => ({ ...p, ip: e.target.value }))} /></div>
              </div>
              <Toggle label="This node is a gateway (has WAN / internet uplink)" checked={nodeForm.is_gateway} onChange={v => setNodeForm(p => ({ ...p, is_gateway: v, router_id: v ? p.router_id : "", gateway_priority: "1" }))} />

              {/* v3.15.5: Gateway router linkage — only shown when is_gateway=true */}
              {nodeForm.is_gateway && (
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1">
                    <Router className="h-3 w-3" /> Gateway MikroTik Uplink
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Linked MikroTik Router</Label>
                      <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={nodeForm.router_id}
                        onChange={e => setNodeForm(p => ({ ...p, router_id: e.target.value }))}>
                        <option value="">— Not linked —</option>
                        {routers.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}{r.dhcp_pool ? ` (${r.dhcp_pool})` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        The MikroTik this node's WAN/LAN port physically plugs into.
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">Gateway Priority</Label>
                      <input type="number" min={1} max={10}
                        className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={nodeForm.gateway_priority}
                        onChange={e => setNodeForm(p => ({ ...p, gateway_priority: e.target.value }))} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        1 = primary gateway. Higher = fallback (batman-adv selects best).
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Contact & Location */}
            <div className="rounded-lg border border-border/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact &amp; Location</p>
              <div>
                <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Contact Phone</Label>
                <Input className="mt-1" placeholder="+254 700 000 000" value={nodeForm.contact_phone} onChange={e => setNodeForm(p => ({ ...p, contact_phone: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground mt-0.5">Phone number of person responsible at this AP location</p>
              </div>
              <LocationPicker lat={nodeForm.lat} lon={nodeForm.lon} onChange={(lat, lon) => setNodeForm(p => ({ ...p, lat, lon }))} />
            </div>

            {/* Internet Connect */}
            <div className="rounded-lg border border-border/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Internet Connect</p>
              <Sel label="Connection Type" value={nodeForm.gateway} onChange={v => setNodeForm(p => ({ ...p, gateway: v }))} options={INET_TYPES} />

              {nodeForm.gateway === "wan_static" && (
                <div className="pl-3 border-l-2 border-primary/30 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="col-span-2"><Label className="text-xs">IP Address</Label><Input className="mt-1 h-8 text-sm" placeholder="192.168.1.100" value={nodeForm.wan_static_ipaddr} onChange={e => setNodeForm(p => ({ ...p, wan_static_ipaddr: e.target.value }))} /></div>
                  <div><Label className="text-xs">Netmask</Label><Input className="mt-1 h-8 text-sm" value={nodeForm.wan_static_netmask} onChange={e => setNodeForm(p => ({ ...p, wan_static_netmask: e.target.value }))} /></div>
                  <div><Label className="text-xs">Gateway</Label><Input className="mt-1 h-8 text-sm" placeholder="192.168.1.1" value={nodeForm.wan_static_gateway} onChange={e => setNodeForm(p => ({ ...p, wan_static_gateway: e.target.value }))} /></div>
                  <div><Label className="text-xs">DNS 1</Label><Input className="mt-1 h-8 text-sm" placeholder="8.8.8.8" value={nodeForm.wan_static_dns_1} onChange={e => setNodeForm(p => ({ ...p, wan_static_dns_1: e.target.value }))} /></div>
                  <div><Label className="text-xs">DNS 2</Label><Input className="mt-1 h-8 text-sm" placeholder="8.8.4.4" value={nodeForm.wan_static_dns_2} onChange={e => setNodeForm(p => ({ ...p, wan_static_dns_2: e.target.value }))} /></div>
                </div>
              )}

              {nodeForm.gateway === "wan_pppoe" && (
                <div className="pl-3 border-l-2 border-primary/30 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><Label className="text-xs">PPPoE Username</Label><Input className="mt-1 h-8 text-sm" placeholder="user@isp.net" value={nodeForm.wan_pppoe_username} onChange={e => setNodeForm(p => ({ ...p, wan_pppoe_username: e.target.value }))} /></div>
                  <div><Label className="text-xs">PPPoE Password</Label><Input className="mt-1 h-8 text-sm" type="password" value={nodeForm.wan_pppoe_password} onChange={e => setNodeForm(p => ({ ...p, wan_pppoe_password: e.target.value }))} /></div>
                  <div><Label className="text-xs">DNS Primary</Label><Input className="mt-1 h-8 text-sm" placeholder="8.8.8.8" value={nodeForm.wan_pppoe_dns_1} onChange={e => setNodeForm(p => ({ ...p, wan_pppoe_dns_1: e.target.value }))} /></div>
                  <div><Label className="text-xs">Custom MAC (optional)</Label><Input className="mt-1 h-8 text-sm" placeholder="AA:BB:CC:DD:EE:FF" value={nodeForm.wan_pppoe_mac} onChange={e => setNodeForm(p => ({ ...p, wan_pppoe_mac: e.target.value.toUpperCase() }))} /></div>
                  <div><Label className="text-xs">MTU (optional)</Label><Input className="mt-1 h-8 text-sm" placeholder="1492" value={nodeForm.wan_pppoe_mtu} onChange={e => setNodeForm(p => ({ ...p, wan_pppoe_mtu: e.target.value }))} /></div>
                </div>
              )}

              {["wifi","wifi_pppoe","wifi_static"].includes(nodeForm.gateway) && (
                <div className="pl-3 border-l-2 border-primary/30 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><Label className="text-xs">Upstream WiFi SSID</Label><Input className="mt-1 h-8 text-sm" placeholder="UpstreamWifi" value={nodeForm.wbw_ssid} onChange={e => setNodeForm(p => ({ ...p, wbw_ssid: e.target.value }))} /></div>
                    <div><Label className="text-xs">WiFi Password</Label><Input className="mt-1 h-8 text-sm" type="password" value={nodeForm.wbw_password} onChange={e => setNodeForm(p => ({ ...p, wbw_password: e.target.value }))} /></div>
                  </div>
                  {nodeForm.gateway === "wifi_static" && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div><Label className="text-xs">IP Address</Label><Input className="mt-1 h-8 text-sm" value={nodeForm.wifi_static_ipaddr} onChange={e => setNodeForm(p => ({ ...p, wifi_static_ipaddr: e.target.value }))} /></div>
                      <div><Label className="text-xs">Netmask</Label><Input className="mt-1 h-8 text-sm" value={nodeForm.wifi_static_netmask} onChange={e => setNodeForm(p => ({ ...p, wifi_static_netmask: e.target.value }))} /></div>
                      <div><Label className="text-xs">Gateway</Label><Input className="mt-1 h-8 text-sm" value={nodeForm.wifi_static_gateway} onChange={e => setNodeForm(p => ({ ...p, wifi_static_gateway: e.target.value }))} /></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNodeDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveNode} disabled={!nodeForm.name || !nodeForm.mac}>{nodeDlg.mode === "add" ? "Add Node" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Entry */}
      <Dialog open={entryDlg.open} onOpenChange={o => setEntryDlg(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{entryDlg.mode === "add" ? "Add Entry Point (SSID)" : "Edit Entry Point"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">Entry Name *</Label><Input className="mt-1" placeholder="e.g. Main WiFi" value={entryForm.name} onChange={e => setEntryForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label className="text-xs">SSID (broadcasted)</Label><Input className="mt-1" placeholder="Same as name if blank" value={entryForm.ssid} onChange={e => setEntryForm(p => ({ ...p, ssid: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Sel label="Encryption" value={entryForm.encryption} onChange={v => setEntryForm(p => ({ ...p, encryption: v }))} options={ENCRYPTIONS.map(e => ({ value: e, label: e }))} />
              <Sel label="Frequency Band" value={entryForm.frequency_band} onChange={v => setEntryForm(p => ({ ...p, frequency_band: v }))} options={BANDS} />
            </div>
            {entryForm.encryption !== "none" && (
              <div><Label className="text-xs">PSK / Key</Label><Input className="mt-1" type="password" placeholder="WiFi password" value={entryForm.special_key} onChange={e => setEntryForm(p => ({ ...p, special_key: e.target.value }))} /></div>
            )}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={entryForm.hidden} onChange={e => setEntryForm(p => ({ ...p, hidden: e.target.checked }))} /><EyeOff className="h-3 w-3" /> Hidden SSID</label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={entryForm.isolate} onChange={e => setEntryForm(p => ({ ...p, isolate: e.target.checked }))} /><Shield className="h-3 w-3" /> Client Isolation</label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={entryForm.apply_to_all} onChange={e => setEntryForm(p => ({ ...p, apply_to_all: e.target.checked }))} />Apply to all nodes</label>
            </div>
            {entryDlg.meshId && (exitsBy[entryDlg.meshId]?.length ?? 0) > 0 && (
              <div className="rounded-md border border-border/40 p-3">
                <Label className="text-xs font-semibold">Assign to Exit Points</Label>
                <p className="text-[10px] text-muted-foreground mb-2">Leave all unchecked to apply to every exit.</p>
                <div className="space-y-1.5">
                  {exitsBy[entryDlg.meshId!].map(exit => {
                    const checked = entryForm.exitIds.includes(exit.id);
                    return (
                      <label key={exit.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={checked}
                          onChange={e => setEntryForm(p => ({
                            ...p,
                            exitIds: e.target.checked
                              ? [...p.exitIds, exit.id]
                              : p.exitIds.filter(id => id !== exit.id),
                          }))} />
                        <span className="font-medium">{exit.name}</span>
                        <span className="text-[10px] text-muted-foreground">{exit.type}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEntryDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveEntry} disabled={!entryForm.name}>{entryDlg.mode === "add" ? "Add Entry" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Exit */}
      <Dialog open={exitDlg.open} onOpenChange={o => setExitDlg(p => ({ ...p, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{exitDlg.mode === "add" ? "Add Exit Point" : "Edit Exit Point"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2"><Label className="text-xs">Exit Name *</Label><Input className="mt-1" placeholder="e.g. Main Gateway" value={exitForm.name} onChange={e => setExitForm(p => ({ ...p, name: e.target.value }))} /></div>
              <Sel label="Exit Type" value={exitForm.type} onChange={v => setExitForm(p => ({ ...p, type: v }))} options={EXIT_TYPES} />
              <div><Label className="text-xs">VLAN ID (0 = untagged)</Label><Input className="mt-1" type="number" min={0} max={4094} value={exitForm.vlan} onChange={e => setExitForm(p => ({ ...p, vlan: e.target.value }))} /></div>
            </div>
            {/* G-02: Common Settings — shown for tagged_bridge / bridge_l2 types */}
            {(exitForm.type === "tagged_bridge" || exitForm.type === "bridge") && (
              <div className="rounded border border-border/40 p-3 space-y-2 bg-muted/10">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Common Settings</p>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="h-3.5 w-3.5"
                    checked={exitForm.auto_detect}
                    onChange={e => setExitForm(p => ({ ...p, auto_detect: e.target.checked }))} />
                  <span className="text-xs">Auto-detect VLAN (recommended)</span>
                </label>
                {!exitForm.auto_detect && (
                  <div className="space-y-2 pt-1">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input type="radio" name={`vrl_${exitDlg.meshId}`} value="range"
                          checked={exitForm.vlan_range_or_list === "range"}
                          onChange={() => setExitForm(p => ({ ...p, vlan_range_or_list: "range" }))} />
                        VLAN Range
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input type="radio" name={`vrl_${exitDlg.meshId}`} value="list"
                          checked={exitForm.vlan_range_or_list === "list"}
                          onChange={() => setExitForm(p => ({ ...p, vlan_range_or_list: "list" }))} />
                        VLAN List
                      </label>
                    </div>
                    {exitForm.vlan_range_or_list === "range" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div><Label className="text-xs">Start VLAN</Label><Input className="mt-1 h-8 text-sm" type="number" min={1} max={4094} value={exitForm.vlan_start} onChange={e => setExitForm(p => ({ ...p, vlan_start: e.target.value }))} /></div>
                        <div><Label className="text-xs">End VLAN</Label><Input className="mt-1 h-8 text-sm" type="number" min={1} max={4094} value={exitForm.vlan_end} onChange={e => setExitForm(p => ({ ...p, vlan_end: e.target.value }))} /></div>
                      </div>
                    ) : (
                      <div><Label className="text-xs">VLAN IDs (comma-separated)</Label><Input className="mt-1 h-8 text-sm" placeholder="10,20,30,100" value={exitForm.vlan_list} onChange={e => setExitForm(p => ({ ...p, vlan_list: e.target.value }))} /></div>
                    )}
                  </div>
                )}
              </div>
            )}
            {["nat","nat_specific","bridge_l3"].includes(exitForm.type) && (
              <div className="rounded border border-border/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">IP Settings</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Sel label="Protocol" value={exitForm.proto} onChange={v => setExitForm(p => ({ ...p, proto: v }))} options={[{value:"dhcp",label:"DHCP"},{value:"static",label:"Static"}]} />
                  <div><Label className="text-xs">IP Address (if static)</Label><Input className="mt-1 h-8 text-sm" placeholder="10.1.0.1" value={exitForm.ipaddr} onChange={e => setExitForm(p => ({ ...p, ipaddr: e.target.value }))} /></div>
                  <div><Label className="text-xs">Netmask</Label><Input className="mt-1 h-8 text-sm" value={exitForm.netmask} onChange={e => setExitForm(p => ({ ...p, netmask: e.target.value }))} /></div>
                  <div><Label className="text-xs">Gateway</Label><Input className="mt-1 h-8 text-sm" value={exitForm.gateway} onChange={e => setExitForm(p => ({ ...p, gateway: e.target.value }))} /></div>
                </div>
              </div>
            )}
            {exitForm.type === "captive_portal" && (
              <div className="rounded border border-border/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Captive Portal / RADIUS</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><Label className="text-xs">RADIUS Primary</Label><Input className="mt-1 h-8 text-sm" placeholder="192.168.1.10" value={exitForm.radius_1} onChange={e => setExitForm(p => ({ ...p, radius_1: e.target.value }))} /></div>
                  <div><Label className="text-xs">RADIUS Secondary</Label><Input className="mt-1 h-8 text-sm" placeholder="192.168.1.11" value={exitForm.radius_2} onChange={e => setExitForm(p => ({ ...p, radius_2: e.target.value }))} /></div>
                  <div className="col-span-2"><Label className="text-xs">RADIUS Secret</Label><Input className="mt-1 h-8 text-sm" type="password" value={exitForm.radius_secret} onChange={e => setExitForm(p => ({ ...p, radius_secret: e.target.value }))} /></div>
                  <div className="col-span-2"><Label className="text-xs">UAM URL</Label><Input className="mt-1 h-8 text-sm" placeholder="https://portal.example.com" value={exitForm.uam_url} onChange={e => setExitForm(p => ({ ...p, uam_url: e.target.value }))} /></div>
                  <div><Label className="text-xs">UAM Secret</Label><Input className="mt-1 h-8 text-sm" type="password" value={exitForm.uam_secret} onChange={e => setExitForm(p => ({ ...p, uam_secret: e.target.value }))} /></div>
                  <div><Label className="text-xs">Walled Garden (CSV)</Label><Input className="mt-1 h-8 text-sm" placeholder="google.com,safaricom.co.ke" value={exitForm.walled_garden} onChange={e => setExitForm(p => ({ ...p, walled_garden: e.target.value }))} /></div>
                </div>
              </div>
            )}
            {exitForm.type === "openvpn_bridge" && (
              <div className="rounded border border-border/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">OpenVPN Bridge</p>
                <div><Label className="text-xs">OpenVPN Server ID</Label><Input className="mt-1 h-8 text-sm" placeholder="Server numeric ID" value={exitForm.openvpn_server_id} onChange={e => setExitForm(p => ({ ...p, openvpn_server_id: e.target.value }))} /></div>
                <p className="text-[10px] text-muted-foreground">A client IP is auto-allocated from the server pool (mirrors rdcore).</p>
              </div>
            )}
            {/* v3.15.6: CAKE QoS section — shown for nat_specific exits (VLAN tier shaping) */}
            {(exitForm.type === "nat_specific" || exitForm.type === "nat") && (
              <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-3">
                <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  CAKE QoS / SQM
                </p>
                <div className="flex items-center gap-2">
                  <input
                    id="apply_sqm_profile"
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-cyan-500"
                    checked={exitForm.apply_sqm_profile}
                    onChange={e => setExitForm(p => ({ ...p, apply_sqm_profile: e.target.checked }))}
                  />
                  <label htmlFor="apply_sqm_profile" className="text-xs cursor-pointer select-none">
                    Enable CAKE shaping on this exit (<code className="text-[10px]">br-ex_v{exitForm.vlan || "N"}</code>)
                  </label>
                </div>
                {exitForm.apply_sqm_profile && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">CAKE Bandwidth</Label>
                      <Input
                        className="mt-1 h-8 text-sm font-mono"
                        placeholder="e.g. 5mbit, 10mbit, 512kbit"
                        value={exitForm.cake_bandwidth}
                        onChange={e => setExitForm(p => ({ ...p, cake_bandwidth: e.target.value }))}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Match to package speed. Format: <code>5mbit</code> / <code>512kbit</code>
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">CAKE Options</Label>
                      <Input
                        className="mt-1 h-8 text-sm font-mono"
                        value={exitForm.cake_options}
                        onChange={e => setExitForm(p => ({ ...p, cake_options: e.target.value }))}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Default: <code>besteffort triple-isolate nat</code>
                      </p>
                    </div>
                    <div className="col-span-2 p-2 rounded bg-muted/40 text-[10px] text-muted-foreground space-y-0.5">
                      <p>Generated command on each AP node:</p>
                      <p className="font-mono text-cyan-300">
                        tc qdisc replace dev br-ex_v{exitForm.vlan||"N"} root cake bandwidth {exitForm.cake_bandwidth||"?mbit"} {exitForm.cake_options}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Gap 4: SSID ↔ Exit linking from the exit side (mirrors rdcore tagMeshEntryPoints) */}
            {exitDlg.meshId && (entriesBy[exitDlg.meshId]?.length ?? 0) > 0 && (
              <div className="rounded border border-border/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Linked SSIDs</p>
                <p className="text-[10px] text-muted-foreground">Select which entry points (SSIDs) use this exit. Leave all unchecked to apply to all.</p>
                <div className="space-y-1.5">
                  {entriesBy[exitDlg.meshId!].map(entry => {
                    const checked = exitForm.entryIds.includes(entry.id);
                    return (
                      <label key={entry.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={checked}
                          onChange={e => setExitForm(p => ({
                            ...p,
                            entryIds: e.target.checked
                              ? [...p.entryIds, entry.id]
                              : p.entryIds.filter(id => id !== entry.id),
                          }))} />
                        <span className="font-medium">{entry.ssid || entry.name}</span>
                        <span className="text-[10px] text-muted-foreground">{entry.frequency_band} · {entry.encryption}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExitDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveExit} disabled={!exitForm.name}>{exitDlg.mode === "add" ? "Add Exit" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Unknown Node */}
      <Dialog open={claimDlg.open} onOpenChange={o => setClaimDlg(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Unknown Node to Mesh</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-muted/40 text-xs font-mono">{claimDlg.node?.mac} · from {claimDlg.node?.from_ip}</div>
            <div><Label className="text-xs">Node Name</Label><Input className="mt-1" value={claimForm.name} onChange={e => setClaimForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Target Mesh *</Label>
              <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" value={claimForm.mesh_id} onChange={e => setClaimForm(p => ({ ...p, mesh_id: e.target.value }))}>
                <option value="">Select mesh…</option>
                {meshes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setClaimDlg(p => ({ ...p, open: false }))}>Cancel</Button><Button onClick={claimNode} disabled={!claimForm.mesh_id}>Assign</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
