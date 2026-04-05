/**
 * MeshPlannerPage.tsx — v3.0.0 (mbconnect v3.21.0)
 *
 * FULL OVERHAUL — Mesh Node Placement Planner
 *
 * NEW in v3.0.0 (over v2.1.0):
 *   ── UI/UX ──
 *   • Split-panel layout: collapsible left Settings panel + map + right Slot Detail panel
 *   • Coverage progress bar: placed / remaining / blocked / skipped stats at a glance
 *   • AP Hardware Profile presets (hAP ac², SXT Lite5, OmniTIK, LHG 60G)
 *     → auto-fills spacing / radius / deviation on one click
 *   • Location search (Nominatim geocoder) → fly to any address
 *   • Signal strength estimator in slot detail (hop-distance from anchor)
 *   • Nearby nodes list in slot detail (neighbours within 1.5× spacing)
 *   • Navigate Here (Google Maps turn-by-turn) ← retained from v2.1.0
 *
 *   ── Grid / Planning ──
 *   • Coverage Fence: draw polygon on map → Fill Fence fills ALL slots inside
 *     (new POST /fill-fence backend endpoint)
 *   • Reveal Near Me: retained — proximity-based incremental reveal from GPS
 *   • Signal Heatmap overlay: shows estimated coverage from placed APs (canvas)
 *
 *   ── Slot Management ──
 *   • Bulk Select mode: click multiple slots → batch Mark Placed / Block / Skip / Reset
 *   • Undo: single-level undo for last slot status change
 *   • Import CSV: restore slot statuses from previously exported CSV
 *   • Export CSV / JSON: download current plan
 *   • Mark Placed with live GPS: retained from v2.1.0
 *   • Show/hide recommended + clear empty slots: retained
 *
 *   ── Map ──
 *   • Four tile sources: Dark (CARTO), OSM, Satellite (ESRI), Google (Hybrid/Road/Sat/Terrain)
 *   • Fullscreen map toggle: retained from v2.1.0
 *   • Bearing line (GPS → selected slot): retained from v2.1.0
 *   • Deviation circles and grid lines: toggleable
 *   • Fence overlay with vertex dots and dashed polygon
 */

import { useEffect, useRef, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Navigation, CheckCircle2, Eye, EyeOff, RefreshCw, Loader2, Grid3x3,
  Trash2, Flag, X, Crosshair, Info, Radar, ExternalLink, Maximize, Minimize,
  Undo2, Download, Upload, Layers, Thermometer, BoxSelect,
  PanelLeftOpen, PanelLeftClose, MapPin,
} from "lucide-react";
import { getToken } from "@/lib/authClient";

const API = (window as any).__MIKROBILL_API__ ?? (import.meta.env.VITE_BACKEND_URL ?? "/api");
async function adminApi(method: string, path: string, body?: object) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface Slot {
  id: string; mesh_id: number; config_id: string;
  lat: number; lng: number;
  grid_ring: number; grid_index: number;
  status: "recommended" | "placed" | "blocked" | "skipped";
  placed_lat?: number | null; placed_lng?: number | null;
  node_id?: number | null; notes?: string | null;
  placed_by?: string | null; placed_at?: string | null;
}
interface PlannerConfig {
  id: string; mesh_id: number;
  anchor_lat: number; anchor_lng: number;
  spacing_m: number; deviation_m: number; reveal_radius_m: number;
  show_recommended: boolean; fence?: [number, number][] | null;
}
interface MeshNode {
  id: number; name: string; mac: string;
  lat: number; lon: number; last_contact: string | null; is_gateway: boolean;
}
interface Mesh { id: number; name: string; }
interface MyLoc { lat: number; lng: number; accuracy: number; }

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  recommended: "#38bdf8",
  placed:      "#22c55e",
  blocked:     "#ef4444",
  skipped:     "#64748b",
} as const;

const STATUS_LABEL = {
  recommended: "Recommended",
  placed:      "Placed",
  blocked:     "Blocked",
  skipped:     "Skipped",
} as const;

const HW_PROFILES = {
  hap:     { label: "hAP ac²",   sub: "Indoor · 200m",  spacing: 200,  radius: 800,  devtol: 30  },
  sxt:     { label: "SXT Lite5", sub: "CPE · 500m",     spacing: 500,  radius: 2000, devtol: 80  },
  omnitik: { label: "OmniTIK",   sub: "Omni · 300m",    spacing: 300,  radius: 1200, devtol: 50  },
  lhg:     { label: "LHG 60G",   sub: "60GHz · 1km",    spacing: 1000, radius: 5000, devtol: 150 },
} as const;

type HwKey = keyof typeof HW_PROFILES;
type TileId = "carto" | "osm" | "satellite" | "google";
type GoogleType = "hybrid" | "satellite" | "roadmap" | "terrain";

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Component ──────────────────────────────────────────────────────────────────
const MeshPlannerPage = () => {
  const { toast } = useToast();

  // Map refs
  const mapRef        = useRef<HTMLDivElement>(null);
  const leafletMap    = useRef<any>(null);
  const slotLayer     = useRef<any>(null);
  const nodeLayer     = useRef<any>(null);
  const fenceLayer    = useRef<any>(null);
  const lineLayer     = useRef<any>(null);
  const circleLayer   = useRef<any>(null);
  const myLocMarker   = useRef<any>(null);
  const radiusCircle  = useRef<any>(null);
  const bearingLine   = useRef<any>(null);
  const tileLayer     = useRef<any>(null);
  const heatCanvas    = useRef<HTMLCanvasElement>(null);
  const clickListener = useRef<any>(null);
  const fenceClickCb  = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Data
  const [meshes, setMeshes]               = useState<Mesh[]>([]);
  const [selectedMesh, setSelectedMesh]   = useState<string>("");
  const [config, setConfig]               = useState<PlannerConfig | null>(null);
  const [slots, setSlots]                 = useState<Slot[]>([]);
  const [nodes, setNodes]                 = useState<MeshNode[]>([]);
  const [myLoc, setMyLoc]                 = useState<MyLoc | null>(null);
  const [locWatchId, setLocWatchId]       = useState<number | null>(null);

  // UI
  const [mapReady, setMapReady]             = useState(false);
  const [loading, setLoading]               = useState(false);
  const [revealing, setRevealing]           = useState(false);
  const [filling, setFilling]               = useState(false);
  const [showRecommended, setShowRecommended] = useState(true);
  const [settingAnchor, setSettingAnchor]   = useState(false);
  const [drawingFence, setDrawingFence]     = useState(false);
  const [showCircles, setShowCircles]       = useState(true);
  const [showLines, setShowLines]           = useState(true);
  const [showFenceOverlay, setShowFenceOverlay] = useState(true);
  const [heatmapOn, setHeatmapOn]           = useState(false);
  const [bulkMode, setBulkMode]             = useState(false);
  const [bulkSelected, setBulkSelected]     = useState<Set<string>>(new Set());
  const [selectedSlot, setSelectedSlot]     = useState<Slot | null>(null);
  const [slotNotes, setSlotNotes]           = useState("");
  const [savingSlot, setSavingSlot]         = useState(false);
  const [mapFullscreen, setMapFullscreen]   = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen]   = useState(true);
  const [tileId, setTileId]                 = useState<TileId>("carto");
  const [googleType, setGoogleType]         = useState<GoogleType>("hybrid");

  // Config form
  const [anchorLat, setAnchorLat]         = useState("");
  const [anchorLng, setAnchorLng]         = useState("");
  const [spacingM, setSpacingM]           = useState("200");
  const [deviationM, setDeviationM]       = useState("50");
  const [revealRadiusM, setRevealRadiusM] = useState("1000");
  const [activeHw, setActiveHw]           = useState<HwKey | null>(null);
  const [savedFence, setSavedFence]       = useState<[number, number][] | null>(null);
  const [locQuery, setLocQuery]           = useState("");
  const [searching, setSearching]         = useState(false);

  // Undo
  const undoRef = useRef<{ slotId: string; prev: Slot } | null>(null);
  const [canUndo, setCanUndo]             = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ── Leaflet init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadScript = (src: string, id: string): Promise<void> =>
      new Promise((res, rej) => {
        if (document.getElementById(id)) { res(); return; }
        const s = document.createElement("script");
        s.id = id; s.src = src; s.onload = () => res(); s.onerror = rej;
        document.head.appendChild(s);
      });
    const loadLink = (href: string, id: string) => {
      if (document.getElementById(id)) return;
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet"; l.href = href;
      document.head.appendChild(l);
    };
    loadLink("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "leaflet-css");
    loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "leaflet-js")
      .then(() => initMap()).catch(console.error);
    return () => { leafletMap.current?.remove(); leafletMap.current = null; };
  }, []);

  useEffect(() => {
    return () => { if (locWatchId !== null) navigator.geolocation.clearWatch(locWatchId); };
  }, [locWatchId]);

  function initMap() {
    const L = (window as any).L;
    if (!mapRef.current || !L || leafletMap.current) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([-1.2921, 36.8219], 14);
    tileLayer.current = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO", maxZoom: 20, subdomains: "abcd" }
    ).addTo(map);
    slotLayer.current   = L.layerGroup().addTo(map);
    nodeLayer.current   = L.layerGroup().addTo(map);
    fenceLayer.current  = L.layerGroup().addTo(map);
    lineLayer.current   = L.layerGroup().addTo(map);
    circleLayer.current = L.layerGroup().addTo(map);
    leafletMap.current  = map;
    setMapReady(true);
  }

  // ── Tile switching ────────────────────────────────────────────────────────────
  function applyTile(id: TileId, gType?: GoogleType) {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    if (tileLayer.current) { leafletMap.current.removeLayer(tileLayer.current); tileLayer.current = null; }
    const gt = gType ?? googleType;
    const urls: Record<TileId, string> = {
      carto:     "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      osm:       "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      google:    { hybrid: "https://mt.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", satellite: "https://mt.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", roadmap: "https://mt.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", terrain: "https://mt.google.com/vt/lyrs=p&x={x}&y={y}&z={z}" }[gt],
    };
    const opts: Record<TileId, object> = {
      carto:     { attribution: "© OpenStreetMap © CARTO", maxZoom: 20, subdomains: "abcd" },
      osm:       { attribution: "© OpenStreetMap", maxZoom: 19 },
      satellite: { attribution: "© ESRI", maxZoom: 20 },
      google:    { attribution: "© Google Maps", maxZoom: 21, subdomains: ["mt0","mt1","mt2","mt3"] },
    };
    tileLayer.current = L.tileLayer(urls[id], opts[id]).addTo(leafletMap.current);
    tileLayer.current.bringToBack();
    setTileId(id); if (gType) setGoogleType(gType);
  }

  // ── Load data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    adminApi("GET", "/api/admin/data/meshes").then((data: Mesh[]) => {
      const list = Array.isArray(data) ? data : [];
      setMeshes(list); if (list.length) setSelectedMesh(String(list[0].id));
    }).catch(() => {});
  }, []);

  const loadConfig = useCallback(async (meshId: string) => {
    if (!meshId) return;
    setLoading(true);
    try {
      const [cfgRes, nodeRes] = await Promise.all([
        adminApi("GET", `/admin/mesh-planner/${meshId}/config`),
        adminApi("GET", `/admin/mesh-planner/${meshId}/nodes`),
      ]);
      if (cfgRes.success && cfgRes.config) {
        const c: PlannerConfig = cfgRes.config;
        setConfig(c); setShowRecommended(c.show_recommended ?? true);
        setAnchorLat(String(c.anchor_lat)); setAnchorLng(String(c.anchor_lng));
        setSpacingM(String(c.spacing_m)); setDeviationM(String(c.deviation_m));
        setRevealRadiusM(String(c.reveal_radius_m ?? 1000));
        if (c.fence && c.fence.length >= 3) setSavedFence(c.fence);
        else setSavedFence(null);
      } else { setConfig(null); setSavedFence(null); }
      if (nodeRes.success) setNodes(nodeRes.nodes ?? []);
      const slotRes = await adminApi("GET", `/admin/mesh-planner/${meshId}/all-slots`);
      if (slotRes.success) setSlots(slotRes.slots ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selectedMesh) loadConfig(selectedMesh); }, [selectedMesh, loadConfig]);

  // ── Render slots ──────────────────────────────────────────────────────────────
  const renderSlots = useCallback(() => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    slotLayer.current?.clearLayers();
    circleLayer.current?.clearLayers();
    lineLayer.current?.clearLayers();
    const visible = showRecommended ? slots : slots.filter(s => s.status !== "recommended");
    if (showLines && visible.length > 1) {
      const sp = parseFloat(spacingM) || 200; const drawn = new Set<string>();
      visible.forEach((a, i) => { visible.forEach((b, j) => {
        if (i >= j) return; const k = `${Math.min(i,j)}-${Math.max(i,j)}`;
        if (drawn.has(k)) return;
        if (haversineM(a.lat, a.lng, b.lat, b.lng) <= sp * 1.25) {
          L.polyline([[a.lat,a.lng],[b.lat,b.lng]], { color:"#38bdf8", weight:0.5, opacity:0.13, dashArray:"3,5" }).addTo(lineLayer.current);
          drawn.add(k);
        }
      }); });
    }
    visible.forEach(slot => {
      const icon = makeSlotIcon(slot, bulkSelected.has(slot.id));
      L.marker([slot.lat, slot.lng], { icon }).on("click", () => onSlotClick(slot)).addTo(slotLayer.current);
      if (showCircles && config && slot.status === "recommended") {
        L.circle([slot.lat, slot.lng], { radius: config.deviation_m, color: STATUS_COLOR.recommended, weight: 1, fillColor: STATUS_COLOR.recommended, fillOpacity: 0.05, dashArray: "4" }).addTo(circleLayer.current);
      }
    });
  }, [slots, showRecommended, config, bulkSelected, showCircles, showLines, spacingM]);

  const renderNodes = useCallback(() => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    nodeLayer.current?.clearLayers();
    nodes.forEach(node => {
      const online = node.last_contact && (Date.now() - new Date(node.last_contact).getTime()) < 300_000;
      const col = node.is_gateway ? "#f59e0b" : online ? "#22c55e" : "#6b7280";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${col}" stroke="white" stroke-width="2"/><text x="12" y="17" text-anchor="middle" font-size="11" fill="white">📡</text></svg>`;
      L.marker([node.lat, node.lon], { icon: L.divIcon({ html: svg, className: "", iconSize: [30,30], iconAnchor: [15,15] }) })
        .bindPopup(`<b>📡 ${node.name}</b><br>MAC: ${node.mac}<br>${online ? "🟢 Online" : "⚫ Offline"}${node.is_gateway ? "<br>🌐 Gateway" : ""}`)
        .addTo(nodeLayer.current);
    });
  }, [nodes]);

  const renderFence = useCallback(() => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    fenceLayer.current?.clearLayers();
    if (!savedFence || savedFence.length < 3 || !showFenceOverlay) return;
    L.polygon(savedFence, { color: "#a78bfa", weight: 2, opacity: 0.8, fillColor: "#a78bfa", fillOpacity: 0.07, dashArray: "6,4" }).addTo(fenceLayer.current);
    savedFence.forEach((p, i) => {
      L.circleMarker(p, { radius: i===0?7:5, color:"#a78bfa", fillColor:i===0?"#7c3aed":"#a78bfa", fillOpacity:1, weight:2 })
        .addTo(fenceLayer.current).bindTooltip(i===0?"Origin":`P${i+1}`, { permanent:false, direction:"top" });
    });
  }, [savedFence, showFenceOverlay]);

  useEffect(() => { if (!mapReady) return; renderSlots(); renderNodes(); renderFence(); }, [renderSlots, renderNodes, renderFence, mapReady]);

  // ── Heatmap ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!heatmapOn || !heatCanvas.current || !leafletMap.current) {
      if (heatCanvas.current) heatCanvas.current.style.opacity = "0"; return;
    }
    drawHeatmap();
  }, [heatmapOn, slots, spacingM]);

  useEffect(() => {
    const fn = () => { if (heatmapOn) drawHeatmap(); };
    leafletMap.current?.on("moveend zoomend resize", fn);
    return () => leafletMap.current?.off("moveend zoomend resize", fn);
  }, [heatmapOn]);

  function drawHeatmap() {
    const canvas = heatCanvas.current; const mapEl = mapRef.current;
    if (!canvas || !mapEl || !leafletMap.current) return;
    canvas.width = mapEl.clientWidth; canvas.height = mapEl.clientHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sp = parseFloat(spacingM)||200;
    slots.filter(s => s.status==="placed").forEach(slot => {
      const pt = leafletMap.current.latLngToContainerPoint([slot.lat, slot.lng]);
      const r = sp * 2.5;
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
      g.addColorStop(0, "rgba(52,211,153,0.38)"); g.addColorStop(0.35, "rgba(56,189,248,0.18)");
      g.addColorStop(0.72, "rgba(245,158,11,0.07)"); g.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI*2); ctx.fill();
    });
    canvas.style.opacity = "1"; canvas.style.transition = "opacity 0.4s";
  }

  // ── Slot icon ─────────────────────────────────────────────────────────────────
  function makeSlotIcon(slot: Slot, selected = false) {
    const L = (window as any).L;
    const col = STATUS_COLOR[slot.status];
    const isAnchor = slot.grid_ring === 0;
    const size = isAnchor ? 32 : 26;
    const inner = isAnchor
      ? `<text x="12" y="17" text-anchor="middle" font-size="11" fill="white">⚓</text>`
      : slot.status==="placed"
        ? `<polyline points="7,12 10,15 17,8" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
        : slot.status==="blocked"
          ? `<line x1="7" y1="7" x2="17" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="17" y1="7" x2="7" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`
          : slot.status==="skipped"
            ? `<line x1="7" y1="12" x2="17" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`
            : `<circle cx="12" cy="12" r="3" fill="white"/>`;
    const selRing = selected ? `stroke-width="4" stroke="#fb923c"` : `stroke-width="2" stroke="white"`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${col}" ${selRing}/>${inner}</svg>`;
    return L.divIcon({ html: svg, className: "", iconSize: [size,size], iconAnchor: [size/2,size/2] });
  }

  // ── Slot click ────────────────────────────────────────────────────────────────
  function onSlotClick(slot: Slot) {
    if (bulkMode) {
      setBulkSelected(prev => { const n=new Set(prev); n.has(slot.id)?n.delete(slot.id):n.add(slot.id); return n; });
      return;
    }
    setSelectedSlot(slot); setSlotNotes(slot.notes??""); setMobilePanelOpen(true);
    if (myLoc) drawBearingLine(slot);
  }

  // ── GPS ───────────────────────────────────────────────────────────────────────
  const startTracking = () => {
    if (!navigator.geolocation) { toast({ title:"Geolocation not supported", variant:"destructive" }); return; }
    const id = navigator.geolocation.watchPosition(
      pos => { const{latitude:lat,longitude:lng,accuracy}=pos.coords; setMyLoc({lat,lng,accuracy}); updateGpsMarker(lat,lng,accuracy); },
      err => toast({ title:"GPS error", description:err.message, variant:"destructive" }),
      { enableHighAccuracy:true, maximumAge:3000 }
    );
    setLocWatchId(id); toast({ title:"📍 GPS tracking started" });
  };
  const stopTracking = () => {
    if (locWatchId!==null) { navigator.geolocation.clearWatch(locWatchId); setLocWatchId(null); }
    myLocMarker.current?.remove(); myLocMarker.current=null;
    radiusCircle.current?.remove(); radiusCircle.current=null; setMyLoc(null);
  };
  function updateGpsMarker(lat:number,lng:number,acc:number) {
    const L=(window as any).L; if(!L||!leafletMap.current) return;
    const icon=L.divIcon({ html:`<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,.35)"></div>`, className:"", iconSize:[16,16], iconAnchor:[8,8] });
    if (myLocMarker.current) { myLocMarker.current.setLatLng([lat,lng]); }
    else { myLocMarker.current=L.marker([lat,lng],{icon,zIndexOffset:1000}).bindPopup(`<b>📍 You</b><br>±${Math.round(acc)}m`).addTo(leafletMap.current); leafletMap.current.setView([lat,lng],16); }
    const r=parseInt(revealRadiusM)||(config?.reveal_radius_m??1000);
    if (radiusCircle.current) { radiusCircle.current.setLatLng([lat,lng]).setRadius(r); }
    else { radiusCircle.current=L.circle([lat,lng],{radius:r,color:"#3b82f6",weight:1.5,fillColor:"#3b82f6",fillOpacity:0.04,dashArray:"6 4"}).addTo(leafletMap.current); }
  }

  // ── Bearing line ──────────────────────────────────────────────────────────────
  function drawBearingLine(slot:Slot) {
    const L=(window as any).L; if(!L||!leafletMap.current||!myLoc) return;
    clearBearingLine();
    bearingLine.current=L.polyline([[myLoc.lat,myLoc.lng],[slot.lat,slot.lng]],{color:"#3b82f6",weight:2,dashArray:"6 5",opacity:0.7}).addTo(leafletMap.current);
  }
  function clearBearingLine() { if(bearingLine.current){bearingLine.current.remove();bearingLine.current=null;} }

  // ── Location search ───────────────────────────────────────────────────────────
  const searchLocation = async () => {
    if (!locQuery.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locQuery)}&limit=1`,{headers:{"Accept-Language":"en"}});
      const data = await r.json();
      if (!data?.length) { toast({title:"Location not found",variant:"destructive"}); return; }
      const{lat,lon,display_name}=data[0];
      leafletMap.current?.flyTo([+lat,+lon],15,{duration:1.5});
      toast({title:`📍 ${display_name.split(",").slice(0,2).join(",")}`});
    } catch { toast({title:"Search failed",variant:"destructive"}); }
    finally { setSearching(false); }
  };

  // ── Anchor pick ───────────────────────────────────────────────────────────────
  const startAnchorPick = () => {
    const L=(window as any).L; if(!L||!leafletMap.current) return;
    setSettingAnchor(true); leafletMap.current.getContainer().style.cursor="crosshair";
    toast({title:"Click the map to set anchor"});
    const handler=(e:any)=>{
      setAnchorLat(e.latlng.lat.toFixed(7)); setAnchorLng(e.latlng.lng.toFixed(7));
      leafletMap.current.getContainer().style.cursor=""; leafletMap.current.off("click",handler);
      clickListener.current=null; setSettingAnchor(false);
      toast({title:"⚓ Anchor set",description:`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)} — save settings to confirm`});
    };
    clickListener.current=handler; leafletMap.current.on("click",handler);
  };
  const cancelAnchorPick = () => {
    if(clickListener.current&&leafletMap.current){leafletMap.current.off("click",clickListener.current);leafletMap.current.getContainer().style.cursor="";}
    setSettingAnchor(false);
  };

  // ── Fence drawing ─────────────────────────────────────────────────────────────
  const startFenceDraw = () => {
    const L=(window as any).L; if(!L||!leafletMap.current) return;
    setDrawingFence(true); fenceLayer.current?.clearLayers();
    leafletMap.current.getContainer().style.cursor="cell";
    toast({title:"Click map to add fence vertices. Double-click or re-click first point to close."});
    let pts:[number,number][]=[]; let line:any=null; let dots:any[]=[];
    const onClick=(e:any)=>{
      const{lat,lng}=e.latlng;
      if(pts.length>=3&&haversineM(lat,lng,pts[0][0],pts[0][1])<40){close(pts);return;}
      pts=[...pts,[lat,lng]];
      dots.push(L.circleMarker([lat,lng],{radius:5,color:"#a78bfa",fillColor:"#a78bfa",fillOpacity:1,weight:2}).addTo(fenceLayer.current));
      if(line) fenceLayer.current.removeLayer(line);
      if(pts.length>=2) line=L.polyline(pts,{color:"#a78bfa",weight:1.5,dashArray:"5,4",opacity:0.6}).addTo(fenceLayer.current);
    };
    const onDbl=()=>{if(pts.length>=3)close(pts);};
    const close=(final:[number,number][])=>{
      leafletMap.current.off("click",onClick); leafletMap.current.off("dblclick",onDbl);
      leafletMap.current.getContainer().style.cursor=""; setDrawingFence(false); fenceClickCb.current=null;
      setSavedFence(final); renderFencePoints(final);
      toast({title:`✅ Fence closed — ${final.length} vertices. Click Fill Fence.`});
    };
    fenceClickCb.current=onClick;
    leafletMap.current.on("click",onClick); leafletMap.current.on("dblclick",onDbl);
  };

  const stopFenceDraw = () => {
    if(fenceClickCb.current&&leafletMap.current){leafletMap.current.off("click",fenceClickCb.current);fenceClickCb.current=null;}
    leafletMap.current?.getContainer()&&(leafletMap.current.getContainer().style.cursor="");
    setDrawingFence(false); fenceLayer.current?.clearLayers();
  };

  const clearFence = async () => {
    fenceLayer.current?.clearLayers(); setSavedFence(null);
    if(selectedMesh&&config) await adminApi("POST",`/admin/mesh-planner/${selectedMesh}/config`,{...config,fence:null});
    toast({title:"Fence cleared"});
  };

  function renderFencePoints(pts:[number,number][]) {
    const L=(window as any).L; if(!L||!fenceLayer.current) return;
    fenceLayer.current.clearLayers();
    if(!pts||pts.length<3) return;
    L.polygon(pts,{color:"#a78bfa",weight:2,opacity:0.8,fillColor:"#a78bfa",fillOpacity:0.07,dashArray:"6,4"}).addTo(fenceLayer.current);
    pts.forEach((p,i)=>L.circleMarker(p,{radius:i===0?7:5,color:"#a78bfa",fillColor:i===0?"#7c3aed":"#a78bfa",fillOpacity:1,weight:2}).addTo(fenceLayer.current).bindTooltip(i===0?"Origin":`P${i+1}`,{permanent:false,direction:"top"}));
  }

  // ── Save config ───────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    if(!selectedMesh||!anchorLat||!anchorLng){toast({title:"Set anchor first",variant:"destructive"});return;}
    setLoading(true);
    try {
      const d=await adminApi("POST",`/admin/mesh-planner/${selectedMesh}/config`,{
        anchor_lat:parseFloat(anchorLat), anchor_lng:parseFloat(anchorLng),
        spacing_m:parseInt(spacingM), deviation_m:parseInt(deviationM),
        reveal_radius_m:parseInt(revealRadiusM), show_recommended:showRecommended, fence:savedFence??null,
      });
      if(d.success){setConfig(d.config);toast({title:"Settings saved ✅"});}
      else toast({title:"Save failed",description:d.error,variant:"destructive"});
    } finally{setLoading(false);}
  };

  const toggleRecommended = async () => {
    const next=!showRecommended; setShowRecommended(next);
    if(selectedMesh) await adminApi("PATCH",`/admin/mesh-planner/${selectedMesh}/show-recommended`,{show_recommended:next});
  };

  // ── Reveal / Fill Fence ───────────────────────────────────────────────────────
  const revealNearMe = async () => {
    if(!selectedMesh||!config){toast({title:"Set anchor first",variant:"destructive"});return;}
    const center=myLoc??{lat:config.anchor_lat,lng:config.anchor_lng};
    const radius=parseInt(revealRadiusM)||config.reveal_radius_m;
    setRevealing(true);
    try {
      const d=await adminApi("POST",`/admin/mesh-planner/${selectedMesh}/reveal`,{lat:center.lat,lng:center.lng,radius_m:radius});
      if(d.success){setSlots(d.slots??[]);toast({title:d.newly_revealed>0?`✅ ${d.newly_revealed} new slots revealed`:"Already fully revealed",description:`${d.slots?.length} slots loaded`});if(myLoc)leafletMap.current?.panTo([myLoc.lat,myLoc.lng]);}
      else toast({title:"Reveal failed",description:d.error,variant:"destructive"});
    }catch{toast({title:"Network error",variant:"destructive"});}
    finally{setRevealing(false);}
  };

  const fillFence = async () => {
    if(!selectedMesh||!config){toast({title:"Set anchor first",variant:"destructive"});return;}
    if(!savedFence||savedFence.length<3){toast({title:"Draw a fence first",variant:"destructive"});return;}
    setFilling(true);
    try {
      const d=await adminApi("POST",`/admin/mesh-planner/${selectedMesh}/fill-fence`,{fence:savedFence,spacing_m:parseInt(spacingM)});
      if(d.success){
        setSlots(d.slots??[]);
        toast({title:`✅ Filled fence: ${d.slots?.length} slots (${d.newly_revealed} new)`});
        const lats=savedFence.map(p=>p[0]),lngs=savedFence.map(p=>p[1]);
        leafletMap.current?.fitBounds([[Math.min(...lats),Math.min(...lngs)],[Math.max(...lats),Math.max(...lngs)]],{padding:[30,30]});
      }else toast({title:"Fill failed",description:d.error,variant:"destructive"});
    }catch{toast({title:"Network error",variant:"destructive"});}
    finally{setFilling(false);}
  };

  // ── Update slot ───────────────────────────────────────────────────────────────
  const updateSlot = async (slotId:string, status:Slot["status"], useLiveGps=false) => {
    const prev=slots.find(s=>s.id===slotId);
    setSavingSlot(true);
    const body:any={status,notes:slotNotes||undefined};
    if(useLiveGps&&myLoc&&status==="placed"){body.placed_lat=myLoc.lat;body.placed_lng=myLoc.lng;body.placed_by="installer";}
    try {
      const d=await adminApi("PUT",`/admin/mesh-planner/slots/${slotId}`,body);
      if(d.success){
        if(prev){undoRef.current={slotId,prev};setCanUndo(true);}
        setSlots(s=>s.map(sl=>sl.id===slotId?d.slot:sl)); setSelectedSlot(d.slot);
        toast({title:status==="placed"?"✅ Placed!":status==="blocked"?"🚫 Blocked":"Updated"});
      }else toast({title:"Update failed",description:d.error,variant:"destructive"});
    }finally{setSavingSlot(false);}
  };

  const doUndo = async () => {
    if(!undoRef.current) return;
    const{slotId,prev}=undoRef.current; undoRef.current=null; setCanUndo(false);
    setSavingSlot(true);
    try {
      const d=await adminApi("PUT",`/admin/mesh-planner/slots/${slotId}`,{status:prev.status,notes:prev.notes??""});
      if(d.success){setSlots(s=>s.map(sl=>sl.id===slotId?d.slot:sl));if(selectedSlot?.id===slotId)setSelectedSlot(d.slot);toast({title:"↩ Undone"});}
    }finally{setSavingSlot(false);}
  };

  const bulkApply = async (status:Slot["status"]) => {
    if(!bulkSelected.size) return;
    const ids=[...bulkSelected]; setBulkMode(false); setBulkSelected(new Set());
    await Promise.all(ids.map(id=>adminApi("PUT",`/admin/mesh-planner/slots/${id}`,{status})));
    await loadConfig(selectedMesh);
    toast({title:`${ids.length} slots → ${status}`});
  };

  // ── Export / Import ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    let csv="Slot_ID,Lat,Lng,Status,Notes,Placed_Lat,Placed_Lng,Ring,Index,Placed_At\n";
    slots.forEach((s,i)=>{ csv+=`S${i+1},${s.lat},${s.lng},${s.status},"${(s.notes||"").replace(/"/g,'""')}",${s.placed_lat??""}, ${s.placed_lng??""},${s.grid_ring},${s.grid_index},${s.placed_at?new Date(s.placed_at).toISOString():""}\n`; });
    dl(csv,"text/csv",`meshplan_${selectedMesh}_${today()}.csv`);
  };
  const exportJSON = () => dl(JSON.stringify({mesh_id:selectedMesh,exported:new Date().toISOString(),config,fence:savedFence,slots},null,2),"application/json",`meshplan_${selectedMesh}_${today()}.json`);
  function dl(content:string,type:string,name:string){const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(new Blob([content],{type})),download:name});a.click();URL.revokeObjectURL(a.href);}
  function today(){return new Date().toISOString().slice(0,10);}

  const handleImport = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0]; if(!file) return;
    const text=await file.text();
    const lines=text.split("\n").filter(l=>l.trim()).slice(1);
    let imp=0;
    for(const line of lines){
      const cols=line.split(",");
      const status=cols[3] as Slot["status"]; const notes=(cols[4]||"").replace(/^"|"$/g,"");
      const ring=parseInt(cols[7]); const index=parseInt(cols[8]);
      if(!status||isNaN(ring)||isNaN(index)) continue;
      const slot=slots.find(s=>s.grid_ring===ring&&s.grid_index===index);
      if(slot){await adminApi("PUT",`/admin/mesh-planner/slots/${slot.id}`,{status,notes});imp++;}
    }
    await loadConfig(selectedMesh); toast({title:`Imported ${imp} slot statuses`}); e.target.value="";
  };

  const resetRecommended = async () => {
    if(!confirm("Clear all empty (recommended) slots? Placed/blocked kept.")) return;
    const d=await adminApi("DELETE",`/admin/mesh-planner/${selectedMesh}/slots`);
    if(d.success){setSlots(p=>p.filter(s=>s.status!=="recommended"));toast({title:"Cleared"});}
  };

  function navigateToSlot(slot:Slot){
    const origin=myLoc?`${myLoc.lat},${myLoc.lng}`:""; const dest=`${slot.lat},${slot.lng}`;
    window.open(origin?`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`:`https://www.google.com/maps/search/?api=1&query=${dest}`,"_blank","noopener,noreferrer");
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const total=slots.length, placed=slots.filter(s=>s.status==="placed").length;
  const blocked=slots.filter(s=>s.status==="blocked").length, skipped=slots.filter(s=>s.status==="skipped").length;
  const remaining=total-placed-blocked-skipped, pct=total>0?Math.round(placed/total*100):0;
  const distToSelected=selectedSlot&&myLoc?haversineM(myLoc.lat,myLoc.lng,selectedSlot.lat,selectedSlot.lng):null;
  const neighbors=selectedSlot
    ?slots.filter(s=>s.id!==selectedSlot.id&&haversineM(s.lat,s.lng,selectedSlot.lat,selectedSlot.lng)<=(parseFloat(spacingM)||200)*1.5)
        .sort((a,b)=>haversineM(a.lat,a.lng,selectedSlot.lat,selectedSlot.lng)-haversineM(b.lat,b.lng,selectedSlot.lat,selectedSlot.lng)).slice(0,6)
    :[];
  const sigBars=selectedSlot&&config?Math.max(1,Math.min(5,Math.round(5-(haversineM(config.anchor_lat,config.anchor_lng,selectedSlot.lat,selectedSlot.lng)/(parseFloat(spacingM)||200))*0.7))):null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="flex flex-col" style={{ height:"calc(100vh - 52px)" }}>

        {/* Topbar */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-background/95 backdrop-blur-sm z-10">
          <button onClick={()=>{setLeftPanelOpen(v=>!v);setTimeout(()=>leafletMap.current?.invalidateSize(),320);}}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
            {leftPanelOpen?<PanelLeftClose className="h-4 w-4"/>:<PanelLeftOpen className="h-4 w-4"/>}
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-info/15 flex items-center justify-center"><Grid3x3 className="h-4 w-4 text-info"/></div>
            <div><div className="text-sm font-bold">Mesh Node Planner</div><div className="text-[10px] text-muted-foreground">v3.0 · GPS reveal · fence fill · heatmap · bulk select</div></div>
          </div>
          {meshes.length>1&&(
            <Select value={selectedMesh} onValueChange={setSelectedMesh}>
              <SelectTrigger className="w-44 h-8 text-xs bg-muted/50"><SelectValue placeholder="Select mesh"/></SelectTrigger>
              <SelectContent>{meshes.map(m=><SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            {[{color:"#38bdf8",l:"Total",v:total},{color:"#22c55e",l:"Placed",v:placed},{color:"#ef4444",l:"Blocked",v:blocked},{color:"#64748b",l:"Skipped",v:skipped}].map(s=>(
              <div key={s.l} className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/60 border border-border text-xs">
                <div className="w-2 h-2 rounded-full" style={{background:s.color}}/><span className="text-muted-foreground">{s.l}</span><span className="font-bold">{s.v}</span>
              </div>
            ))}
            {myLoc&&<div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"/><span className="font-mono text-[10px]">GPS ±{Math.round(myLoc.accuracy)}m</span></div>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {canUndo&&<Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={doUndo}><Undo2 className="h-3.5 w-3.5"/>Undo</Button>}
            <Button size="sm" variant={locWatchId!==null?"default":"outline"} onClick={locWatchId!==null?stopTracking:startTracking} className="h-8 gap-1 text-xs">
              <Navigation className={`h-3.5 w-3.5 ${locWatchId!==null?"animate-pulse":""}`}/>{locWatchId!==null?"Stop GPS":"GPS"}
            </Button>
            {config&&<>
              <Button size="sm" className="h-8 gap-1 text-xs bg-info hover:bg-info/90 text-white" disabled={revealing} onClick={revealNearMe}>
                {revealing?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Radar className="h-3.5 w-3.5"/>}Reveal
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!savedFence||savedFence.length<3||filling} onClick={fillFence}>
                {filling?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Layers className="h-3.5 w-3.5"/>}Fill Fence
              </Button>
            </>}
            <Button size="sm" variant="ghost" onClick={()=>loadConfig(selectedMesh)} className="h-8 w-8 p-0" disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/>
            </Button>
          </div>
        </div>

        {/* Main */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left panel */}
          {leftPanelOpen&&(
            <div className="w-72 flex-shrink-0 border-r border-border bg-background flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">

                {/* Coverage */}
                {total>0&&(
                  <div className="glass-card p-3 space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground font-semibold">Deployment Progress</span><span className="font-bold font-mono text-success">{pct}%</span></div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-success to-info rounded-full transition-all duration-500" style={{width:`${pct}%`}}/></div>
                    <div className="grid grid-cols-4 gap-1">
                      {[{v:placed,l:"Placed",c:"text-success"},{v:blocked,l:"Blocked",c:"text-destructive"},{v:skipped,l:"Skipped",c:"text-muted-foreground"},{v:remaining,l:"Left",c:"text-amber-500"}].map(s=>(
                        <div key={s.l} className="text-center p-1 bg-muted/40 rounded-md">
                          <div className={`text-sm font-bold font-mono ${s.c}`}>{s.v}</div>
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location search */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Location Search</Label>
                  <div className="flex gap-1.5">
                    <Input value={locQuery} onChange={e=>setLocQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchLocation()} placeholder="Search address or place…" className="h-8 text-xs bg-muted/50"/>
                    <Button size="sm" className="h-8 px-2.5" onClick={searchLocation} disabled={searching}>
                      {searching?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<MapPin className="h-3.5 w-3.5"/>}
                    </Button>
                  </div>
                </div>

                {/* AP Profiles */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">AP Hardware Profile</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.entries(HW_PROFILES) as [HwKey, typeof HW_PROFILES[HwKey]][]).map(([key,p])=>(
                      <button key={key} onClick={()=>{setActiveHw(key);setSpacingM(String(p.spacing));setRevealRadiusM(String(p.radius));setDeviationM(String(p.devtol));}}
                        className={`p-2 rounded-lg border text-left transition-all text-xs ${activeHw===key?"border-orange-400 bg-orange-500/10":"border-border bg-muted/30 hover:border-muted-foreground/40"}`}>
                        <div className="font-bold text-foreground">{p.label}</div>
                        <div className="text-[9px] text-muted-foreground font-mono">{p.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Map source */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Map Source</Label>
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    {([{id:"carto",label:"Dark",sub:"CARTO · free"},{id:"osm",label:"Street",sub:"OpenStreetMap"},{id:"satellite",label:"Satellite",sub:"ESRI · free"},{id:"google",label:"Google",sub:"Hybrid/Road/Sat"}] as const).map(t=>(
                      <button key={t.id} onClick={()=>applyTile(t.id as TileId)}
                        className={`p-2 rounded-lg border text-center text-xs transition-all ${tileId===t.id?"border-info bg-info/10":"border-border bg-muted/30 hover:border-muted-foreground/40"}`}>
                        <div className="font-semibold">{t.label}</div><div className="text-[9px] text-muted-foreground">{t.sub}</div>
                      </button>
                    ))}
                  </div>
                  {tileId==="google"&&(
                    <div className="grid grid-cols-2 gap-1">
                      {(["hybrid","satellite","roadmap","terrain"] as GoogleType[]).map(gt=>(
                        <button key={gt} onClick={()=>applyTile("google",gt)}
                          className={`py-1 px-2 rounded-md border text-[10px] transition-all ${googleType===gt?"border-info bg-info/10":"border-border bg-muted/30"}`}>
                          {gt.charAt(0).toUpperCase()+gt.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Anchor */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    Anchor Point{config&&<Badge variant="outline" className="text-[8px] bg-success/10 text-success border-success/30">⚓ Set</Badge>}
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    <Button size="sm" variant={settingAnchor?"default":"outline"} onClick={settingAnchor?cancelAnchorPick:startAnchorPick} className="h-7 text-xs gap-1 flex-1">
                      <Crosshair className="h-3 w-3"/>{settingAnchor?"Cancel":"Click Map"}
                    </Button>
                    {myLoc&&<Button size="sm" variant="outline" onClick={()=>{setAnchorLat(myLoc.lat.toFixed(7));setAnchorLng(myLoc.lng.toFixed(7));toast({title:"📍 GPS set as anchor"});}} className="h-7 text-xs gap-1"><Navigation className="h-3 w-3"/>GPS</Button>}
                  </div>
                  <Input value={anchorLat} onChange={e=>setAnchorLat(e.target.value)} placeholder="Latitude" className="h-7 text-xs font-mono bg-muted/50 mb-1"/>
                  <Input value={anchorLng} onChange={e=>setAnchorLng(e.target.value)} placeholder="Longitude" className="h-7 text-xs font-mono bg-muted/50"/>
                </div>

                {/* Fence */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    Coverage Fence{savedFence&&savedFence.length>=3&&<Badge variant="outline" className="text-[8px] bg-purple-500/10 text-purple-400 border-purple-500/30">🔷 {savedFence.length}pts</Badge>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant={drawingFence?"default":"outline"} onClick={drawingFence?stopFenceDraw:startFenceDraw} className="h-7 text-xs gap-1 flex-1">
                      <Layers className="h-3 w-3"/>{drawingFence?"Stop Drawing":"Draw Fence"}
                    </Button>
                    {savedFence&&<Button size="sm" variant="ghost" onClick={clearFence} className="h-7 text-xs px-2"><X className="h-3 w-3"/></Button>}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">Click map to draw polygon. Double-click or re-click first point to close. Then tap <b className="text-purple-400">Fill Fence</b> to generate all nodes inside.</p>
                </div>

                {/* Grid */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Grid Settings</Label>
                  <div className="space-y-2">
                    {[{label:"Node Spacing",val:spacingM,set:setSpacingM,min:50,max:1000,step:25,unit:"m"},
                      {label:"Reveal Radius",val:revealRadiusM,set:setRevealRadiusM,min:100,max:5000,step:100,unit:"m"},
                      {label:"Deviation Tolerance",val:deviationM,set:setDeviationM,min:10,max:200,step:5,unit:"m"}].map(sl=>(
                      <div key={sl.label}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">{sl.label}</span>
                          <span className="font-bold font-mono text-success">{sl.val}{sl.unit}</span>
                        </div>
                        <input type="range" min={sl.min} max={sl.max} step={sl.step} value={sl.val}
                          onChange={e=>sl.set(e.target.value)}
                          className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-success"/>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Display toggles */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Display</Label>
                  <div className="space-y-0.5">
                    {[
                      {label:"Deviation Circles",v:showCircles,fn:()=>setShowCircles(x=>!x)},
                      {label:"Grid Lines",v:showLines,fn:()=>setShowLines(x=>!x)},
                      {label:"Fence Overlay",v:showFenceOverlay,fn:()=>setShowFenceOverlay(x=>!x)},
                      {label:"Signal Heatmap",v:heatmapOn,fn:()=>setHeatmapOn(x=>!x)},
                      {label:"Recommended Slots",v:showRecommended,fn:toggleRecommended},
                    ].map(t=>(
                      <div key={t.label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                        <span className="text-xs text-muted-foreground">{t.label}</span>
                        <button onClick={t.fn} className={`w-8 h-5 rounded-full transition-colors relative ${t.v?"bg-success":"bg-muted"}`}>
                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${t.v?"translate-x-4":"translate-x-0.5"}`}/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <Button size="sm" onClick={saveConfig} disabled={loading||!selectedMesh||!anchorLat||!anchorLng} className="w-full gap-1.5 h-8">
                  {loading?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<CheckCircle2 className="h-3.5 w-3.5"/>}Save Settings
                </Button>

                {/* Import/Export */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Import / Export</Label>
                  <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-lg py-3 cursor-pointer hover:border-info hover:bg-info/5 transition-colors text-xs text-muted-foreground mb-2">
                    <Upload className="h-4 w-4"/>Drop CSV or click to import
                    <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport}/>
                  </label>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={exportCSV}><Download className="h-3 w-3"/>CSV</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={exportJSON}><Download className="h-3 w-3"/>JSON</Button>
                  </div>
                </div>

                {slots.filter(s=>s.status==="recommended").length>0&&(
                  <Button size="sm" variant="ghost" onClick={resetRecommended} className="w-full h-7 text-xs text-destructive hover:bg-destructive/10 gap-1">
                    <Trash2 className="h-3.5 w-3.5"/>Clear Empty Slots
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Map + slot panel */}
          <div className={`flex flex-1 min-h-0 gap-3 overflow-hidden relative ${mapFullscreen?"fixed inset-0 z-[900] bg-background p-2":"p-3"}`}>
            <div ref={mapContainerRef} className="glass-card overflow-hidden flex-1 relative">
              <div ref={mapRef} style={{height:"100%",width:"100%"}}/>
              <canvas ref={heatCanvas} style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:350,opacity:0}}/>

              {/* Bulk banner */}
              {bulkMode&&(
                <div className="absolute top-0 left-0 right-0 z-[400] bg-orange-500/15 border-b border-orange-500/30 backdrop-blur-sm px-4 py-2 flex items-center gap-2 text-sm">
                  <BoxSelect className="h-4 w-4 text-orange-400"/>
                  <span className="text-orange-300 font-semibold">{bulkSelected.size} selected</span>
                  <div className="flex gap-1.5 ml-2">
                    <Button size="sm" className="h-7 text-xs bg-success hover:bg-success/90" onClick={()=>bulkApply("placed")}>✅ Placed</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30" onClick={()=>bulkApply("blocked")}>🚫 Block</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>bulkApply("skipped")}>⏭ Skip</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>bulkApply("recommended")}>↩ Reset</Button>
                  </div>
                  <div className="flex-1"/>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>{setBulkMode(false);setBulkSelected(new Set());}}>✕ Exit</Button>
                </div>
              )}

              {/* Map overlay buttons */}
              <div className="absolute top-2 left-2 z-[500] flex flex-col gap-1.5">
                {config&&<button onClick={()=>leafletMap.current?.flyTo([config.anchor_lat,config.anchor_lng],15,{duration:1})} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground transition-colors shadow">⚓ Anchor</button>}
                {myLoc&&<button onClick={()=>leafletMap.current?.flyTo([myLoc.lat,myLoc.lng],16,{duration:0.8})} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground transition-colors shadow">📍 My Location</button>}
              </div>

              <div className="absolute top-2 right-2 z-[500] flex flex-col gap-1.5">
                <button onClick={()=>{setMapFullscreen(f=>!f);setTimeout(()=>leafletMap.current?.invalidateSize(),100);}}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground transition-colors shadow">
                  {mapFullscreen?<Minimize className="h-3.5 w-3.5"/>:<Maximize className="h-3.5 w-3.5"/>}{mapFullscreen?"Exit":"Fullscreen"}
                </button>
                <button onClick={()=>setHeatmapOn(v=>!v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border backdrop-blur-sm text-xs transition-colors shadow ${heatmapOn?"border-red-500/40 bg-red-500/15 text-red-300":"border-border/40 bg-background/90 text-muted-foreground hover:text-foreground"}`}>
                  <Thermometer className="h-3.5 w-3.5"/>Heatmap
                </button>
                <button onClick={()=>{setBulkMode(v=>!v);if(bulkMode)setBulkSelected(new Set());}}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border backdrop-blur-sm text-xs transition-colors shadow ${bulkMode?"border-orange-500/40 bg-orange-500/15 text-orange-300":"border-border/40 bg-background/90 text-muted-foreground hover:text-foreground"}`}>
                  <BoxSelect className="h-3.5 w-3.5"/>Bulk Select
                </button>
              </div>

              {selectedSlot&&<button onClick={()=>setMobilePanelOpen(v=>!v)}
                className="lg:hidden absolute bottom-4 right-4 z-[500] bg-primary text-primary-foreground rounded-full px-4 py-2 text-xs font-semibold shadow-lg flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5"/>{mobilePanelOpen?"Hide details":"Slot details"}
              </button>}
            </div>

            {/* Slot detail panel */}
            {selectedSlot&&(
              <div className={["glass-card p-4 flex-shrink-0 flex flex-col gap-3 overflow-y-auto",
                "lg:w-72 lg:relative lg:translate-x-0",
                "max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:z-[600] max-lg:rounded-t-2xl max-lg:max-h-[75vh] max-lg:shadow-2xl",
                mobilePanelOpen?"max-lg:translate-y-0":"max-lg:translate-y-full","transition-transform duration-200"].join(" ")}>

                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm" style={{color:STATUS_COLOR[selectedSlot.status]}}>{STATUS_LABEL[selectedSlot.status]}</h3>
                      {selectedSlot.grid_ring===0&&<Badge variant="outline" className="text-[9px]">⚓ Anchor</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Ring {selectedSlot.grid_ring} · #{selectedSlot.grid_index}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{selectedSlot.lat.toFixed(6)}, {selectedSlot.lng.toFixed(6)}</p>
                  </div>
                  <button onClick={()=>{setSelectedSlot(null);setMobilePanelOpen(false);clearBearingLine();}} className="text-muted-foreground hover:text-foreground text-xl px-1">×</button>
                </div>

                {distToSelected!==null&&(
                  <div className={`rounded-lg p-3 text-center ${distToSelected<=(config?.deviation_m??50)?"bg-success/10 border border-success/25":"bg-muted/50"}`}>
                    <p className="text-2xl font-bold">{distToSelected<1000?`${Math.round(distToSelected)}m`:`${(distToSelected/1000).toFixed(2)}km`}</p>
                    <p className="text-[10px] text-muted-foreground">from your location</p>
                    {distToSelected<=(config?.deviation_m??50)&&<p className="text-[10px] text-success font-semibold mt-0.5">✓ Within tolerance — place here!</p>}
                  </div>
                )}

                {sigBars!==null&&(
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Est. Signal</div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-end gap-0.5 h-5">
                        {[1,2,3,4,5].map(i=>(
                          <div key={i} style={{width:7,height:4+i*3,background:i<=sigBars!?sigBars!>=4?"#22c55e":sigBars!>=3?"#f59e0b":"#ef4444":"var(--muted)",borderRadius:2}}/>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{sigBars>=4?"Excellent":sigBars>=3?"Good":sigBars>=2?"Fair":"Weak"} ({sigBars}/5)</span>
                    </div>
                  </div>
                )}

                <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={()=>navigateToSlot(selectedSlot)}>
                  <ExternalLink className="h-3.5 w-3.5"/>{myLoc?"Navigate Here (Google Maps)":"Open in Google Maps"}
                </Button>

                {neighbors.length>0&&(
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Nearby ({neighbors.length})</div>
                    <div className="space-y-0.5 max-h-20 overflow-y-auto scrollbar-thin">
                      {neighbors.map(n=>(
                        <div key={n.id} className="flex items-center justify-between text-[10px] py-0.5 border-b border-border/30 last:border-0">
                          <span style={{color:STATUS_COLOR[n.status]}} className="font-mono">R{n.grid_ring}#{n.grid_index}</span>
                          <span className="text-muted-foreground">{n.status}</span>
                          <span className="text-muted-foreground">{Math.round(haversineM(n.lat,n.lng,selectedSlot.lat,selectedSlot.lng))}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[10px]">Notes</Label>
                  <textarea className="w-full rounded-lg border border-border bg-muted/50 p-2 text-xs min-h-[56px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. On rooftop of Kamau's shop…" value={slotNotes} onChange={e=>setSlotNotes(e.target.value)}/>
                </div>

                <div className="space-y-1.5">
                  {selectedSlot.status!=="placed"&&(
                    <Button size="sm" className="w-full gap-1.5 bg-success hover:bg-success/90 text-xs" disabled={savingSlot} onClick={()=>updateSlot(selectedSlot.id,"placed",true)}>
                      <CheckCircle2 className="h-3.5 w-3.5"/>{myLoc?"Mark Placed (record GPS)":"Mark Placed"}
                    </Button>
                  )}
                  {selectedSlot.status!=="blocked"&&(
                    <Button size="sm" variant="outline" disabled={savingSlot} className="w-full gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={()=>updateSlot(selectedSlot.id,"blocked")}>
                      <X className="h-3.5 w-3.5"/>Mark Blocked
                    </Button>
                  )}
                  <div className="flex gap-1.5">
                    {selectedSlot.status!=="skipped"&&selectedSlot.status!=="placed"&&(
                      <Button size="sm" variant="ghost" className="flex-1 gap-1 text-xs" disabled={savingSlot} onClick={()=>updateSlot(selectedSlot.id,"skipped")}><Flag className="h-3.5 w-3.5"/>Skip</Button>
                    )}
                    {(selectedSlot.status==="blocked"||selectedSlot.status==="skipped"||selectedSlot.status==="placed")&&(
                      <Button size="sm" variant="ghost" className="flex-1 text-xs" disabled={savingSlot} onClick={()=>updateSlot(selectedSlot.id,"recommended")}>Reset</Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs px-2" onClick={()=>navigator.clipboard?.writeText(`${selectedSlot.lat.toFixed(6)}, ${selectedSlot.lng.toFixed(6)}`).then(()=>toast({title:"Coords copied!"}))}>📋</Button>
                  </div>
                  {savingSlot&&<div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary"/></div>}
                </div>

                {selectedSlot.status==="placed"&&(
                  <div className="rounded-lg border border-success/25 bg-success/5 p-3 space-y-1 text-[10px]">
                    <p className="font-semibold text-success">Placed ✓</p>
                    {selectedSlot.placed_lat&&<p className="font-mono text-muted-foreground">GPS: {selectedSlot.placed_lat.toFixed(6)}, {selectedSlot.placed_lng?.toFixed(6)}</p>}
                    {selectedSlot.placed_at&&<p className="text-muted-foreground">{new Date(selectedSlot.placed_at).toLocaleString()}</p>}
                    {selectedSlot.placed_lat&&config&&<p className="text-muted-foreground">Offset: {Math.round(haversineM(selectedSlot.lat,selectedSlot.lng,selectedSlot.placed_lat!,selectedSlot.placed_lng!))}m from recommended</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex-shrink-0 px-4 py-1.5 border-t border-border bg-background/80">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground items-center">
            {Object.entries(STATUS_COLOR).map(([s,c])=>(
              <span key={s} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-white/30 inline-block" style={{background:c}}/>{STATUS_LABEL[s as keyof typeof STATUS_LABEL]}</span>
            ))}
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"/>Gateway</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse inline-block"/>Your GPS</span>
            <span className="text-muted-foreground/40 ml-2">· dashed circle = deviation · ring = reveal radius · 🔥 heatmap = placed AP coverage</span>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
};

export default MeshPlannerPage;
