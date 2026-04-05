/**
 * MeshPlannerPage.tsx — v3.1.0 (mbconnect v3.21.1)
 *
 * Fully client-side Mesh Node Placement Planner with localStorage persistence.
 * Ported from mesh_planner_v3.html — no backend dependency.
 *
 * Features:
 *   • Multi-project support (create / delete / switch)
 *   • Client-side hex grid generation (reveal near + fill fence)
 *   • AP Hardware Profiles (hAP ac², SXT Lite5, OmniTIK, LHG 60G)
 *   • Coverage Fence polygon drawing
 *   • Signal Heatmap overlay
 *   • Bulk Select mode
 *   • Undo stack (30 levels)
 *   • Import CSV/JSON (drag-and-drop + click)
 *   • Export CSV/JSON
 *   • Location search (Nominatim)
 *   • Google Maps tile layer with API key
 *   • Slot labels toggle
 *   • GPS tracking + bearing line
 *   • Navigate Here (Google Maps)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Navigation, CheckCircle2, Eye, EyeOff, RefreshCw, Loader2, Grid3x3,
  Trash2, Flag, X, Crosshair, Info, Radar, ExternalLink, Maximize, Minimize,
  Undo2, Download, Upload, Layers, Thermometer, BoxSelect,
  PanelLeftOpen, PanelLeftClose, MapPin, Plus, FileText,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface SlotData {
  status: "recommended" | "placed" | "blocked" | "skipped";
  notes?: string;
  placedLat?: number;
  placedLng?: number;
  offset?: number;
  timestamp?: number;
}
interface ProjectDB {
  anchor?: { lat: number; lng: number; name: string };
  fence?: [number, number][];
  spacing: number;
  radius: number;
  devtol: number;
  tileId?: string;
  gtype?: string;
  gkey?: string;
  slots: Record<string, SlotData>;
}
interface ProjectMeta {
  projects: string[];
  active: string;
}
interface MyLoc { lat: number; lng: number; accuracy: number; }

// ── Constants ──────────────────────────────────────────────────────────────────
const META_KEY = "mbmesh_v3_meta";
const DB_PREFIX = "mbmesh_v3_proj_";

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

// ── Geometry helpers ───────────────────────────────────────────────────────────
const R_EARTH = 6_371_000;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function offsetPoint(lat: number, lng: number, dN: number, dE: number) {
  const dLat = dN / R_EARTH;
  const dLng = dE / (R_EARTH * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + (dLat * 180) / Math.PI, lng: lng + (dLng * 180) / Math.PI };
}

function pointInPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function slotKey(lat: number, lng: number): string {
  return `${lat.toFixed(7)}:${lng.toFixed(7)}`;
}

function generateSlots(
  ancLat: number, ancLng: number, spacing: number,
  centreLat: number, centreLng: number, revealR: number,
  fencePoly?: [number, number][] | null
) {
  const pts: { lat: number; lng: number; ring: number; idx: number }[] = [];
  const maxDist = haversineM(ancLat, ancLng, centreLat, centreLng) + revealR + spacing * 2;
  const maxRing = Math.ceil(maxDist / spacing) + 1;
  for (let ring = 0; ring <= maxRing; ring++) {
    if (ring === 0) {
      const inR = haversineM(centreLat, centreLng, ancLat, ancLng) <= revealR;
      const inF = !fencePoly || fencePoly.length < 3 || pointInPolygon(ancLat, ancLng, fencePoly);
      if (inR && inF) pts.push({ lat: ancLat, lng: ancLng, ring: 0, idx: 0 });
      continue;
    }
    const count = 6 * ring;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const dN = ring * spacing * Math.cos(angle), dE = ring * spacing * Math.sin(angle);
      const p = offsetPoint(ancLat, ancLng, dN, dE);
      const inR = haversineM(centreLat, centreLng, p.lat, p.lng) <= revealR;
      const inF = !fencePoly || fencePoly.length < 3 || pointInPolygon(p.lat, p.lng, fencePoly);
      if (inR && inF) pts.push({ ...p, ring, idx: i });
    }
  }
  return pts;
}

function generateSlotsFence(ancLat: number, ancLng: number, spacing: number, fencePoly: [number, number][]) {
  if (!fencePoly || fencePoly.length < 3) return [];
  const lats = fencePoly.map(p => p[0]), lngs = fencePoly.map(p => p[1]);
  const diagM = haversineM(Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs));
  const maxRing = Math.ceil(diagM / spacing) + 2;
  const pts: { lat: number; lng: number; ring: number; idx: number }[] = [];
  for (let ring = 0; ring <= maxRing; ring++) {
    if (ring === 0) {
      if (pointInPolygon(ancLat, ancLng, fencePoly)) pts.push({ lat: ancLat, lng: ancLng, ring: 0, idx: 0 });
      continue;
    }
    const count = 6 * ring;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const p = offsetPoint(ancLat, ancLng, ring * spacing * Math.cos(angle), ring * spacing * Math.sin(angle));
      if (pointInPolygon(p.lat, p.lng, fencePoly)) pts.push({ ...p, ring, idx: i });
    }
  }
  return pts;
}

// ── localStorage helpers ───────────────────────────────────────────────────────
function loadMeta(): ProjectMeta {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "") || { projects: ["Default"], active: "Default" }; }
  catch { return { projects: ["Default"], active: "Default" }; }
}
function saveMeta(meta: ProjectMeta) { localStorage.setItem(META_KEY, JSON.stringify(meta)); }
function loadDB(name: string): ProjectDB {
  try {
    const raw = JSON.parse(localStorage.getItem(DB_PREFIX + name) || "{}");
    return { spacing: 200, radius: 1000, devtol: 50, slots: {}, ...raw };
  } catch { return { spacing: 200, radius: 1000, devtol: 50, slots: {} }; }
}
function saveDB(name: string, db: ProjectDB) {
  try { localStorage.setItem(DB_PREFIX + name, JSON.stringify(db)); } catch (e) { console.warn(e); }
}

// ── Component ──────────────────────────────────────────────────────────────────
const MeshPlannerPage = () => {
  const { toast } = useToast();

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const layerSlots = useRef<any>(null);
  const layerLines = useRef<any>(null);
  const layerCircles = useRef<any>(null);
  const layerSpecial = useRef<any>(null);
  const layerFence = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const googleTileRef = useRef<any>(null);
  const heatCanvas = useRef<HTMLCanvasElement>(null);
  const myLocMarker = useRef<any>(null);
  const myAccCircle = useRef<any>(null);
  const anchorMarkerRef = useRef<any>(null);
  const bearingLineRef = useRef<any>(null);

  // Slot tracking
  const renderedKeysRef = useRef<Set<string>>(new Set());
  const slotMarkersRef = useRef<Record<string, { marker: any; circle?: any }>>({});

  // Project state
  const [meta, setMeta] = useState<ProjectMeta>(loadMeta);
  const [projName, setProjName] = useState(() => loadMeta().active || "Default");
  const [db, setDb] = useState<ProjectDB>(() => loadDB(loadMeta().active || "Default"));

  // UI
  const [mapReady, setMapReady] = useState(false);
  const [myLoc, setMyLoc] = useState<MyLoc | null>(null);
  const [locWatchId, setLocWatchId] = useState<number | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [slotNotes, setSlotNotes] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showCircles, setShowCircles] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showFenceOverlay, setShowFenceOverlay] = useState(true);
  const [slotsVisible, setSlotsVisible] = useState(true);
  const [drawingFence, setDrawingFence] = useState(false);
  const [settingAnchor, setSettingAnchor] = useState(false);
  const [tileId, setTileId] = useState<TileId>((db.tileId as TileId) || "carto");
  const [googleType, setGoogleType] = useState<GoogleType>((db.gtype as GoogleType) || "hybrid");
  const [activeHw, setActiveHw] = useState<HwKey | null>(null);
  const [locQuery, setLocQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [anchorLabel, setAnchorLabel] = useState(db.anchor?.name || "");
  const [anchorLat, setAnchorLat] = useState(db.anchor ? String(db.anchor.lat) : "");
  const [anchorLng, setAnchorLng] = useState(db.anchor ? String(db.anchor.lng) : "");
  const [spacingM, setSpacingM] = useState(String(db.spacing));
  const [radiusM, setRadiusM] = useState(String(db.radius));
  const [devtolM, setDevtolM] = useState(String(db.devtol));
  const [gmapKey, setGmapKey] = useState(db.gkey || "");
  const [dragOver, setDragOver] = useState(false);

  // Undo
  const undoStack = useRef<{ key: string; prev: SlotData | null }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Fence drawing refs
  const fencePointsRef = useRef<[number, number][]>([]);
  const fenceClickCb = useRef<any>(null);
  const anchorClickCb = useRef<any>(null);

  // ── Persist DB ───────────────────────────────────────────────────────────────
  const persistDb = useCallback((updated: ProjectDB) => {
    setDb(updated);
    saveDB(projName, updated);
  }, [projName]);

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
    const map = L.map(mapRef.current, { zoomControl: true }).setView([-1.2678, 36.8119], 14);
    tileLayerRef.current = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO", maxZoom: 20, subdomains: "abcd" }
    ).addTo(map);
    layerSlots.current = L.layerGroup().addTo(map);
    layerLines.current = L.layerGroup().addTo(map);
    layerCircles.current = L.layerGroup().addTo(map);
    layerSpecial.current = L.layerGroup().addTo(map);
    layerFence.current = L.layerGroup().addTo(map);
    leafletMap.current = map;
    setMapReady(true);
  }

  // ── Tile switching ───────────────────────────────────────────────────────────
  const applyTile = useCallback((id: TileId, gType?: GoogleType) => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    if (tileLayerRef.current) { leafletMap.current.removeLayer(tileLayerRef.current); tileLayerRef.current = null; }
    if (googleTileRef.current) { leafletMap.current.removeLayer(googleTileRef.current); googleTileRef.current = null; }
    const gt = gType || googleType;
    if (id === "google") {
      const lyrs: Record<GoogleType, string> = { hybrid: "y", satellite: "s", roadmap: "m", terrain: "p" };
      const url = `https://mt.google.com/vt/lyrs=${lyrs[gt]}&x={x}&y={y}&z={z}`;
      googleTileRef.current = L.tileLayer(url, { attribution: "© Google Maps", maxZoom: 21, subdomains: ["mt0", "mt1", "mt2", "mt3"] }).addTo(leafletMap.current);
      tileLayerRef.current = googleTileRef.current;
    } else {
      const urls: Record<string, string> = {
        carto: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        osm: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      };
      const opts: Record<string, any> = {
        carto: { attribution: "© OpenStreetMap © CARTO", maxZoom: 20, subdomains: "abcd" },
        osm: { attribution: "© OpenStreetMap", maxZoom: 19 },
        satellite: { attribution: "© ESRI", maxZoom: 20 },
      };
      tileLayerRef.current = L.tileLayer(urls[id], opts[id]).addTo(leafletMap.current);
    }
    setTileId(id);
    if (gType) setGoogleType(gType);
  }, [googleType]);

  // ── Reload from DB ───────────────────────────────────────────────────────────
  const reloadFromDB = useCallback((currentDb: ProjectDB) => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;

    // Clear everything
    layerSlots.current?.clearLayers();
    layerLines.current?.clearLayers();
    layerCircles.current?.clearLayers();
    layerSpecial.current?.clearLayers();
    layerFence.current?.clearLayers();
    renderedKeysRef.current.clear();
    Object.keys(slotMarkersRef.current).forEach(k => delete slotMarkersRef.current[k]);

    // Render anchor
    if (currentDb.anchor) {
      const { lat, lng, name } = currentDb.anchor;
      anchorMarkerRef.current = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "", iconSize: [42, 42], iconAnchor: [21, 21],
          html: `<div style="width:42px;height:42px;border-radius:50%;background:rgba(245,158,11,.15);border:2px solid #f59e0b;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px rgba(245,158,11,.45)">⚓</div>`
        }),
        zIndexOffset: 1000
      }).addTo(layerSpecial.current)
        .bindPopup(`<b style="color:#fcd34d">⚓ ${name}</b><br><small style="font-family:monospace">${lat.toFixed(6)}, ${lng.toFixed(6)}</small>`);
    }

    // Render fence
    if (currentDb.fence && currentDb.fence.length >= 3) {
      L.polygon(currentDb.fence, { color: "#a78bfa", weight: 2, opacity: 0.8, fillColor: "#a78bfa", fillOpacity: 0.07, dashArray: "6,4" }).addTo(layerFence.current);
      currentDb.fence.forEach((p, i) => {
        L.circleMarker(p, { radius: i === 0 ? 7 : 5, color: "#a78bfa", fillColor: i === 0 ? "#7c3aed" : "#a78bfa", fillOpacity: 1, weight: 2 })
          .addTo(layerFence.current).bindTooltip(i === 0 ? "Origin" : `P${i + 1}`, { permanent: false, direction: "top" });
      });
    }

    // Render saved slots
    if (Object.keys(currentDb.slots).length > 0) {
      Object.entries(currentDb.slots).forEach(([key, slot]) => {
        const [lS, gS] = key.split(":");
        renderedKeysRef.current.add(key);
        renderSlotMarker(key, +lS, +gS, slot.status || "recommended", currentDb.devtol);
      });
      if (currentDb.anchor) leafletMap.current.flyTo([currentDb.anchor.lat, currentDb.anchor.lng], 14, { animate: false });
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (mapReady) reloadFromDB(db);
  }, [mapReady]);

  // ── Slot rendering ───────────────────────────────────────────────────────────
  function makeSlotIcon(key: string, status: string, num: number, inTol: boolean, selected: boolean) {
    const L = (window as any).L;
    const c = STATUS_COLOR[status as keyof typeof STATUS_COLOR] || "#38bdf8";
    const gl = status === "placed" ? "rgba(34,197,94,.5)" : status === "blocked" ? "rgba(239,68,68,.4)" : "rgba(56,189,248,.4)";
    const sym = status === "placed" ? "✅" : status === "blocked" ? "🚫" : status === "skipped" ? "⏭" : "";
    const inner = sym ? `<div style="font-size:13px">${sym}</div>` : `<div style="width:7px;height:7px;border-radius:50%;background:${c}"></div>`;
    const selBorder = selected ? "outline:2px solid #fb923c;outline-offset:2px;" : "";
    const ring = inTol ? `box-shadow:0 0 0 3px rgba(34,197,94,.4),0 0 12px ${gl}` : `box-shadow:0 0 10px ${gl}`;
    const lbl = showLabels ? `<div style="position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);font-size:8px;color:${c};white-space:nowrap;pointer-events:none;font-family:monospace;text-shadow:0 1px 3px #000">S${num}</div>` : "";
    return L.divIcon({
      className: "", iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div style="position:relative;width:26px;height:26px;border-radius:50%;background:rgba(12,18,32,.92);border:2px solid ${c};${ring};${selBorder}display:flex;align-items:center;justify-content:center;cursor:pointer">${inner}${lbl}</div>`
    });
  }

  function renderSlotMarker(key: string, lat: number, lng: number, status: string, devtol: number) {
    const L = (window as any).L;
    if (!L || !layerSlots.current) return;
    const num = Array.from(renderedKeysRef.current).indexOf(key) + 1;
    const inTol = myLoc ? haversineM(myLoc.lat, myLoc.lng, lat, lng) <= devtol : false;
    if (slotMarkersRef.current[key]) {
      slotMarkersRef.current[key].marker.setIcon(makeSlotIcon(key, status, num, inTol, bulkSelected.has(key)));
      return;
    }
    const m = L.marker([lat, lng], { icon: makeSlotIcon(key, status, num, inTol, false), zIndexOffset: status === "placed" ? 200 : 0 })
      .addTo(layerSlots.current)
      .on("click", () => onSlotClick(key, lat, lng));
    slotMarkersRef.current[key] = { marker: m };
    if (showCircles && devtol > 0) {
      const circle = L.circle([lat, lng], { radius: devtol, color: STATUS_COLOR[status as keyof typeof STATUS_COLOR] || "#38bdf8", fillColor: STATUS_COLOR[status as keyof typeof STATUS_COLOR] || "#38bdf8", fillOpacity: 0.04, weight: 1, opacity: 0.22, dashArray: "4,3" }).addTo(layerCircles.current);
      slotMarkersRef.current[key].circle = circle;
    }
  }

  function refreshAllIcons() {
    const devtol = parseInt(devtolM) || 50;
    renderedKeysRef.current.forEach(key => {
      const sm = slotMarkersRef.current[key];
      if (!sm) return;
      const [lS, gS] = key.split(":");
      const status = (db.slots[key] || {}).status || "recommended";
      const num = Array.from(renderedKeysRef.current).indexOf(key) + 1;
      const inTol = myLoc ? haversineM(myLoc.lat, myLoc.lng, +lS, +gS) <= devtol : false;
      sm.marker.setIcon(makeSlotIcon(key, status, num, inTol, bulkSelected.has(key)));
    });
  }

  function renderGridLines() {
    const L = (window as any).L;
    if (!L || !layerLines.current) return;
    layerLines.current.clearLayers();
    if (!showLines) return;
    const spacing = parseInt(spacingM) || 200;
    const keys = Array.from(renderedKeysRef.current);
    const pts = keys.map(k => { const [l, g] = k.split(":"); return { lat: +l, lng: +g }; });
    const drawn = new Set<string>();
    pts.forEach((a, i) => {
      pts.forEach((b, j) => {
        if (i >= j) return;
        const k2 = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (drawn.has(k2)) return;
        if (haversineM(a.lat, a.lng, b.lat, b.lng) <= spacing * 1.25) {
          L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#38bdf8", weight: 0.5, opacity: 0.13, dashArray: "3,5" }).addTo(layerLines.current);
          drawn.add(k2);
        }
      });
    });
  }

  // ── Slot click ───────────────────────────────────────────────────────────────
  function onSlotClick(key: string, lat: number, lng: number) {
    if (bulkMode) {
      setBulkSelected(prev => {
        const n = new Set(prev);
        n.has(key) ? n.delete(key) : n.add(key);
        return n;
      });
      // Refresh icon
      const devtol = parseInt(devtolM) || 50;
      const status = (db.slots[key] || {}).status || "recommended";
      const num = Array.from(renderedKeysRef.current).indexOf(key) + 1;
      const inTol = myLoc ? haversineM(myLoc.lat, myLoc.lng, lat, lng) <= devtol : false;
      const sm = slotMarkersRef.current[key];
      if (sm) sm.marker.setIcon(makeSlotIcon(key, status, num, inTol, !bulkSelected.has(key)));
      return;
    }
    setSelectedKey(key);
    setSlotNotes((db.slots[key] || {}).notes || "");
    setMobilePanelOpen(true);
    // Bearing line
    if (myLoc) drawBearingLine(lat, lng);
  }

  // ── Update slot status ───────────────────────────────────────────────────────
  function updateSlotStatus(key: string, status: SlotData["status"]) {
    const [lS, gS] = key.split(":");
    const lat = +lS, lng = +gS;
    const prev = db.slots[key] ? { ...db.slots[key] } : null;
    undoStack.current.push({ key, prev });
    if (undoStack.current.length > 30) undoStack.current.shift();
    setCanUndo(true);

    const newSlots = { ...db.slots };
    if (!newSlots[key]) newSlots[key] = { status: "recommended" };
    newSlots[key] = { ...newSlots[key], status, timestamp: Date.now() };
    if (status === "placed" && myLoc) {
      newSlots[key].placedLat = myLoc.lat;
      newSlots[key].placedLng = myLoc.lng;
      newSlots[key].offset = haversineM(myLoc.lat, myLoc.lng, lat, lng);
    }
    const updated = { ...db, slots: newSlots };
    persistDb(updated);

    // Update marker
    const devtol = parseInt(devtolM) || 50;
    const num = Array.from(renderedKeysRef.current).indexOf(key) + 1;
    const inTol = myLoc ? haversineM(myLoc.lat, myLoc.lng, lat, lng) <= devtol : false;
    const sm = slotMarkersRef.current[key];
    if (sm) sm.marker.setIcon(makeSlotIcon(key, status, num, inTol, bulkSelected.has(key)));

    if (heatmapOn) drawHeatmap();
    const msgs: Record<string, string> = { placed: "✅ Marked placed!", blocked: "🚫 Blocked", skipped: "⏭ Skipped", recommended: "↩ Reset" };
    toast({ title: msgs[status] || "Updated" });
  }

  function saveSlotNotes() {
    if (!selectedKey) return;
    const newSlots = { ...db.slots };
    if (!newSlots[selectedKey]) newSlots[selectedKey] = { status: "recommended" };
    newSlots[selectedKey] = { ...newSlots[selectedKey], notes: slotNotes };
    persistDb({ ...db, slots: newSlots });
    toast({ title: "Notes saved" });
  }

  // ── Undo ─────────────────────────────────────────────────────────────────────
  function doUndo() {
    if (!undoStack.current.length) return;
    const { key, prev } = undoStack.current.pop()!;
    const newSlots = { ...db.slots };
    if (prev === null) delete newSlots[key];
    else newSlots[key] = prev;
    persistDb({ ...db, slots: newSlots });
    refreshAllIcons();
    if (!undoStack.current.length) setCanUndo(false);
    toast({ title: "↩ Undone" });
  }

  // ── Bulk apply ───────────────────────────────────────────────────────────────
  function bulkApply(status: SlotData["status"]) {
    if (!bulkSelected.size) return;
    const newSlots = { ...db.slots };
    bulkSelected.forEach(key => {
      if (!newSlots[key]) newSlots[key] = { status: "recommended" };
      newSlots[key] = { ...newSlots[key], status, timestamp: Date.now() };
      if (status === "placed" && myLoc) {
        const [lS, gS] = key.split(":");
        newSlots[key].placedLat = myLoc.lat;
        newSlots[key].placedLng = myLoc.lng;
        newSlots[key].offset = haversineM(myLoc.lat, myLoc.lng, +lS, +gS);
      }
    });
    const n = bulkSelected.size;
    persistDb({ ...db, slots: newSlots });
    setBulkMode(false);
    setBulkSelected(new Set());
    refreshAllIcons();
    if (heatmapOn) drawHeatmap();
    toast({ title: `${n} slots → ${status}` });
  }

  // ── GPS ──────────────────────────────────────────────────────────────────────
  const startTracking = () => {
    if (!navigator.geolocation) { toast({ title: "Geolocation not supported", variant: "destructive" }); return; }
    const id = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setMyLoc({ lat, lng, accuracy });
        updateGpsMarker(lat, lng, accuracy);
      },
      err => toast({ title: "GPS error", description: err.message, variant: "destructive" }),
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
    setLocWatchId(id);
    toast({ title: "📍 GPS tracking started" });
  };

  const stopTracking = () => {
    if (locWatchId !== null) { navigator.geolocation.clearWatch(locWatchId); setLocWatchId(null); }
    if (myLocMarker.current) { myLocMarker.current.remove(); myLocMarker.current = null; }
    if (myAccCircle.current) { myAccCircle.current.remove(); myAccCircle.current = null; }
    setMyLoc(null);
  };

  function updateGpsMarker(lat: number, lng: number, acc: number) {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    if (myLocMarker.current) {
      myLocMarker.current.setLatLng([lat, lng]);
      if (myAccCircle.current) { myAccCircle.current.setLatLng([lat, lng]); myAccCircle.current.setRadius(acc || 20); }
    } else {
      const icon = L.divIcon({
        className: "", iconSize: [20, 20], iconAnchor: [10, 10],
        html: `<div style="position:relative;width:20px;height:20px"><div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 10px rgba(59,130,246,.6)"></div><div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(59,130,246,.45);animation:gps-out 1.8s ease-out infinite"></div></div>`
      });
      myLocMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 2000 }).addTo(layerSpecial.current);
      if (acc) myAccCircle.current = L.circle([lat, lng], { radius: acc, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.05, weight: 1, opacity: 0.2 }).addTo(layerSpecial.current);
      leafletMap.current.flyTo([lat, lng], 16, { duration: 1 });
    }
  }

  function drawBearingLine(lat: number, lng: number) {
    const L = (window as any).L;
    if (!L || !leafletMap.current || !myLoc) return;
    if (bearingLineRef.current) { bearingLineRef.current.remove(); bearingLineRef.current = null; }
    bearingLineRef.current = L.polyline([[myLoc.lat, myLoc.lng], [lat, lng]], { color: "#3b82f6", weight: 2, dashArray: "6 5", opacity: 0.7 }).addTo(leafletMap.current);
  }

  // ── Location search ──────────────────────────────────────────────────────────
  const searchLocation = async () => {
    if (!locQuery.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locQuery)}&limit=1`, { headers: { "Accept-Language": "en" } });
      const data = await r.json();
      if (!data?.length) { toast({ title: "Location not found", variant: "destructive" }); return; }
      const { lat, lon, display_name } = data[0];
      leafletMap.current?.flyTo([+lat, +lon], 15, { duration: 1.5 });
      toast({ title: `📍 ${display_name.split(",").slice(0, 2).join(",")}` });
    } catch { toast({ title: "Search failed", variant: "destructive" }); }
    finally { setSearching(false); }
  };

  // ── Anchor ───────────────────────────────────────────────────────────────────
  function setAnchorFromCoords() {
    const lat = parseFloat(anchorLat), lng = parseFloat(anchorLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast({ title: "Invalid coordinates", variant: "destructive" }); return;
    }
    const name = anchorLabel.trim() || "Anchor Point";
    const updated = { ...db, anchor: { lat, lng, name } };
    persistDb(updated);
    setAnchorLabel(name);
    reloadFromDB(updated);
    leafletMap.current?.flyTo([lat, lng], 14, { duration: 1 });
    toast({ title: "⚓ Anchor set" });
  }

  function startAnchorPick() {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    setSettingAnchor(true);
    leafletMap.current.getContainer().style.cursor = "crosshair";
    toast({ title: "Click the map to set anchor" });
    const handler = (e: any) => {
      const { lat, lng } = e.latlng;
      setAnchorLat(lat.toFixed(7));
      setAnchorLng(lng.toFixed(7));
      const name = anchorLabel.trim() || "Anchor Point";
      const updated = { ...db, anchor: { lat, lng, name } };
      persistDb(updated);
      setAnchorLabel(name);
      reloadFromDB(updated);
      leafletMap.current.getContainer().style.cursor = "";
      leafletMap.current.off("click", handler);
      anchorClickCb.current = null;
      setSettingAnchor(false);
      toast({ title: `⚓ Anchor set at ${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    };
    anchorClickCb.current = handler;
    leafletMap.current.on("click", handler);
  }

  function stopAnchorPick() {
    if (anchorClickCb.current && leafletMap.current) {
      leafletMap.current.off("click", anchorClickCb.current);
      leafletMap.current.getContainer().style.cursor = "";
    }
    anchorClickCb.current = null;
    setSettingAnchor(false);
  }

  // ── Fence ────────────────────────────────────────────────────────────────────
  function startFenceDraw() {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    setDrawingFence(true);
    layerFence.current?.clearLayers();
    fencePointsRef.current = [];
    leafletMap.current.getContainer().style.cursor = "cell";
    toast({ title: "Click map to add fence vertices. Double-click or re-click first point to close." });

    let tempLine: any = null;
    const dots: any[] = [];

    const onClick = (e: any) => {
      const { lat, lng } = e.latlng;
      const pts = fencePointsRef.current;
      if (pts.length >= 3 && haversineM(lat, lng, pts[0][0], pts[0][1]) < 30) {
        closeFence();
        return;
      }
      pts.push([lat, lng]);
      dots.push(L.circleMarker([lat, lng], { radius: 5, color: "#a78bfa", fillColor: "#a78bfa", fillOpacity: 1, weight: 2 }).addTo(layerFence.current));
      if (tempLine) layerFence.current.removeLayer(tempLine);
      if (pts.length >= 2) tempLine = L.polyline(pts, { color: "#a78bfa", weight: 1.5, dashArray: "5,4", opacity: 0.6 }).addTo(layerFence.current);
      if (pts.length === 3) toast({ title: "Double-click or re-click first point to close" });
    };

    const onDbl = () => {
      if (fencePointsRef.current.length >= 3) closeFence();
    };

    const closeFence = () => {
      leafletMap.current.off("click", onClick);
      leafletMap.current.off("dblclick", onDbl);
      leafletMap.current.getContainer().style.cursor = "";
      setDrawingFence(false);
      fenceClickCb.current = null;

      const fence = [...fencePointsRef.current] as [number, number][];
      const updated = { ...db, fence };
      persistDb(updated);

      // Render fence
      layerFence.current?.clearLayers();
      L.polygon(fence, { color: "#a78bfa", weight: 2, opacity: 0.8, fillColor: "#a78bfa", fillOpacity: 0.07, dashArray: "6,4" }).addTo(layerFence.current);
      fence.forEach((p, i) => {
        L.circleMarker(p, { radius: i === 0 ? 7 : 5, color: "#a78bfa", fillColor: i === 0 ? "#7c3aed" : "#a78bfa", fillOpacity: 1, weight: 2 })
          .addTo(layerFence.current).bindTooltip(i === 0 ? "Origin" : `P${i + 1}`, { permanent: false, direction: "top" });
      });
      toast({ title: `✅ Fence closed — ${fence.length} vertices. Click Fill Fence.` });
    };

    fenceClickCb.current = onClick;
    leafletMap.current.on("click", onClick);
    leafletMap.current.on("dblclick", onDbl);
  }

  function stopFenceDraw() {
    if (fenceClickCb.current && leafletMap.current) {
      leafletMap.current.off("click", fenceClickCb.current);
    }
    leafletMap.current?.getContainer() && (leafletMap.current.getContainer().style.cursor = "");
    setDrawingFence(false);
    layerFence.current?.clearLayers();
    fenceClickCb.current = null;
  }

  function clearFence() {
    layerFence.current?.clearLayers();
    fencePointsRef.current = [];
    const updated = { ...db, fence: undefined };
    persistDb(updated);
    toast({ title: "Fence cleared" });
  }

  // ── Reveal Near ──────────────────────────────────────────────────────────────
  function revealNear() {
    if (!db.anchor) { toast({ title: "Set anchor first", variant: "destructive" }); return; }
    const spacing = parseInt(spacingM) || 200;
    const radius = parseInt(radiusM) || 1000;
    const devtol = parseInt(devtolM) || 50;
    const fence = db.fence && db.fence.length >= 3 ? db.fence : null;
    const centre = myLoc || { lat: db.anchor.lat, lng: db.anchor.lng };

    const pts = generateSlots(db.anchor.lat, db.anchor.lng, spacing, centre.lat, centre.lng, radius, fence);
    let added = 0;
    const newSlots = { ...db.slots };
    pts.forEach(p => {
      const key = slotKey(p.lat, p.lng);
      if (!renderedKeysRef.current.has(key)) {
        renderedKeysRef.current.add(key);
        added++;
      }
      if (!newSlots[key]) newSlots[key] = { status: "recommended" };
      renderSlotMarker(key, p.lat, p.lng, newSlots[key].status || "recommended", devtol);
    });

    const updated = { ...db, slots: newSlots, spacing, radius, devtol };
    persistDb(updated);
    if (showLines) renderGridLines();
    if (myLoc) leafletMap.current?.flyTo([myLoc.lat, myLoc.lng], Math.max(leafletMap.current.getZoom(), 14), { duration: 0.8 });
    toast({ title: `${added} new · ${pts.length} total${fence ? " (inside fence)" : ""}` });
    if (heatmapOn) setTimeout(drawHeatmap, 900);
  }

  function fillFence() {
    if (!db.anchor) { toast({ title: "Set anchor first", variant: "destructive" }); return; }
    if (!db.fence || db.fence.length < 3) { toast({ title: "Draw a fence first", variant: "destructive" }); return; }
    const spacing = parseInt(spacingM) || 200;
    const devtol = parseInt(devtolM) || 50;

    const pts = generateSlotsFence(db.anchor.lat, db.anchor.lng, spacing, db.fence);
    if (!pts.length) { toast({ title: "No slots inside fence", variant: "destructive" }); return; }

    let added = 0;
    const newSlots = { ...db.slots };
    pts.forEach(p => {
      const key = slotKey(p.lat, p.lng);
      if (!renderedKeysRef.current.has(key)) {
        renderedKeysRef.current.add(key);
        added++;
      }
      if (!newSlots[key]) newSlots[key] = { status: "recommended" };
      renderSlotMarker(key, p.lat, p.lng, newSlots[key].status || "recommended", devtol);
    });

    const updated = { ...db, slots: newSlots };
    persistDb(updated);
    if (showLines) renderGridLines();

    const lats = db.fence.map(p => p[0]), lngs = db.fence.map(p => p[1]);
    leafletMap.current?.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [30, 30] });
    toast({ title: `✅ Filled fence: ${pts.length} slots (${added} new)` });
    if (heatmapOn) setTimeout(drawHeatmap, 900);
  }

  // ── Clear nodes ──────────────────────────────────────────────────────────────
  function clearNodes() {
    if (!confirm("Remove all nodes from map?")) return;
    layerSlots.current?.clearLayers();
    layerLines.current?.clearLayers();
    layerCircles.current?.clearLayers();
    Object.keys(slotMarkersRef.current).forEach(k => delete slotMarkersRef.current[k]);
    renderedKeysRef.current.clear();
    setSelectedKey(null);
    if (heatmapOn) clearHeatmap();
    toast({ title: "Cleared nodes from map" });
  }

  function resetEverything() {
    if (!confirm("Reset EVERYTHING — anchor, fence, all slots?")) return;
    localStorage.removeItem(DB_PREFIX + projName);
    const fresh: ProjectDB = { spacing: 200, radius: 1000, devtol: 50, slots: {} };
    persistDb(fresh);
    setAnchorLabel("");
    setAnchorLat("");
    setAnchorLng("");
    setSpacingM("200");
    setRadiusM("1000");
    setDevtolM("50");
    setSelectedKey(null);
    reloadFromDB(fresh);
    toast({ title: "Reset complete" });
  }

  // ── Heatmap ──────────────────────────────────────────────────────────────────
  function drawHeatmap() {
    const canvas = heatCanvas.current;
    const mapEl = mapRef.current;
    if (!canvas || !mapEl || !leafletMap.current) return;
    canvas.width = mapEl.clientWidth;
    canvas.height = mapEl.clientHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const spacing = parseInt(spacingM) || 200;
    const sources: { x: number; y: number; r: number }[] = [];
    renderedKeysRef.current.forEach(key => {
      const s = (db.slots[key] || {}).status;
      if (s === "placed") {
        const [lS, gS] = key.split(":");
        const pt = leafletMap.current.latLngToContainerPoint([+lS, +gS]);
        sources.push({ x: pt.x, y: pt.y, r: spacing * 2.5 });
      }
    });
    if (!sources.length) { canvas.style.opacity = "0"; return; }
    sources.forEach(({ x, y, r }) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(52,211,153,0.4)");
      g.addColorStop(0.35, "rgba(56,189,248,0.2)");
      g.addColorStop(0.7, "rgba(245,158,11,0.07)");
      g.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    canvas.style.opacity = "1";
    canvas.style.transition = "opacity 0.4s";
  }

  function clearHeatmap() {
    const canvas = heatCanvas.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.opacity = "0";
  }

  useEffect(() => {
    if (heatmapOn) drawHeatmap(); else clearHeatmap();
  }, [heatmapOn]);

  useEffect(() => {
    const fn = () => { if (heatmapOn) drawHeatmap(); };
    leafletMap.current?.on("moveend zoomend resize", fn);
    return () => leafletMap.current?.off("moveend zoomend resize", fn);
  }, [heatmapOn]);

  // ── Export ───────────────────────────────────────────────────────────────────
  function dlFile(content: string, type: string, name: string) {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([content], { type })), download: name });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCSV() {
    let csv = "Slot_ID,Latitude,Longitude,Status,Notes,Placed_Lat,Placed_Lng,Offset_m,Timestamp\n";
    if (db.anchor) csv += `ANCHOR,${db.anchor.lat},${db.anchor.lng},anchor,"${db.anchor.name}",,,,\n`;
    let i = 1;
    renderedKeysRef.current.forEach(key => {
      const [lS, gS] = key.split(":");
      const s: SlotData = db.slots[key] || { status: "recommended" };
      csv += `S${i++},${lS},${gS},${s.status || "recommended"},"${(s.notes || "").replace(/"/g, '""')}",${s.placedLat || ""},${s.placedLng || ""},${s.offset != null ? s.offset.toFixed(0) : ""},${s.timestamp ? new Date(s.timestamp).toISOString() : ""}\n`;
    });
    dlFile(csv, "text/csv", `meshplan_${projName}_${new Date().toISOString().slice(0, 10)}.csv`);
    toast({ title: `Exported ${renderedKeysRef.current.size} slots (CSV)` });
  }

  function exportJSON() {
    const out: any = { project: projName, exported: new Date().toISOString(), anchor: db.anchor, fence: db.fence, spacing: db.spacing, radius: db.radius, devtol: db.devtol, slots: {} };
    renderedKeysRef.current.forEach(key => { out.slots[key] = db.slots[key] || { status: "recommended" }; });
    dlFile(JSON.stringify(out, null, 2), "application/json", `meshplan_${projName}_${new Date().toISOString().slice(0, 10)}.json`);
    toast({ title: `Exported ${renderedKeysRef.current.size} slots (JSON)` });
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  function handleImport(text: string, filename: string) {
    try {
      if (filename.endsWith(".json")) {
        const d = JSON.parse(text);
        const updated = { ...db };
        if (d.anchor) updated.anchor = d.anchor;
        if (d.fence) updated.fence = d.fence;
        if (d.spacing) updated.spacing = d.spacing;
        if (d.devtol) updated.devtol = d.devtol;
        if (d.slots) updated.slots = { ...updated.slots, ...d.slots };
        persistDb(updated);
        reloadFromDB(updated);
        toast({ title: `Imported JSON: ${Object.keys(d.slots || {}).length} slots` });
      } else {
        const lines = text.split("\n").filter(l => l.trim());
        let imp = 0;
        const newSlots = { ...db.slots };
        lines.slice(1).forEach(line => {
          const cols = line.split(",");
          if (!cols[0] || cols[0] === "ANCHOR") return;
          const lat = +cols[1], lng = +cols[2], status = (cols[3] || "recommended") as SlotData["status"];
          const notes = (cols[4] || "").replace(/^"|"$/g, "");
          if (isNaN(lat) || isNaN(lng)) return;
          const key = slotKey(lat, lng);
          if (!newSlots[key]) newSlots[key] = { status: "recommended" };
          newSlots[key].status = status;
          if (notes) newSlots[key].notes = notes;
          imp++;
        });
        persistDb({ ...db, slots: newSlots });
        refreshAllIcons();
        toast({ title: `Imported CSV: ${imp} slots` });
      }
    } catch (e) {
      toast({ title: "Import failed", variant: "destructive" });
      console.error(e);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => handleImport(ev.target?.result as string, f.name);
    reader.readAsText(f);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => handleImport(ev.target?.result as string, f.name);
    reader.readAsText(f);
  }

  // ── Project management ───────────────────────────────────────────────────────
  function switchProject(name: string) {
    const newDb = loadDB(name);
    setProjName(name);
    setDb(newDb);
    setAnchorLabel(newDb.anchor?.name || "");
    setAnchorLat(newDb.anchor ? String(newDb.anchor.lat) : "");
    setAnchorLng(newDb.anchor ? String(newDb.anchor.lng) : "");
    setSpacingM(String(newDb.spacing));
    setRadiusM(String(newDb.radius));
    setDevtolM(String(newDb.devtol));
    setGmapKey(newDb.gkey || "");
    setSelectedKey(null);
    const m = { ...meta, active: name };
    setMeta(m);
    saveMeta(m);
    reloadFromDB(newDb);
    toast({ title: `Project: ${name}` });
  }

  function newProject() {
    const name = (prompt("Project name:", "") || "").trim();
    if (!name) return;
    if (meta.projects.includes(name)) { toast({ title: "Already exists", variant: "destructive" }); return; }
    const m = { ...meta, projects: [...meta.projects, name] };
    setMeta(m);
    saveMeta(m);
    switchProject(name);
  }

  function deleteProject() {
    if (meta.projects.length <= 1) { toast({ title: "Cannot delete last project", variant: "destructive" }); return; }
    if (!confirm(`Delete project "${projName}" and all its data?`)) return;
    localStorage.removeItem(DB_PREFIX + projName);
    const projects = meta.projects.filter(p => p !== projName);
    const m = { projects, active: projects[0] };
    setMeta(m);
    saveMeta(m);
    switchProject(projects[0]);
    toast({ title: "Project deleted" });
  }

  // ── Navigate ─────────────────────────────────────────────────────────────────
  function navigateToSlot(key: string) {
    const [lS, gS] = key.split(":");
    const origin = myLoc ? `${myLoc.lat},${myLoc.lng}` : "";
    const dest = `${lS},${gS}`;
    window.open(
      origin
        ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
        : `https://www.google.com/maps/search/?api=1&query=${dest}`,
      "_blank", "noopener,noreferrer"
    );
  }

  // ── HW profile apply ────────────────────────────────────────────────────────
  function applyHwProfile(key: HwKey) {
    const p = HW_PROFILES[key];
    setActiveHw(key);
    setSpacingM(String(p.spacing));
    setRadiusM(String(p.radius));
    setDevtolM(String(p.devtol));
    persistDb({ ...db, spacing: p.spacing, radius: p.radius, devtol: p.devtol });
    toast({ title: `Profile: ${p.label} (${p.spacing}m spacing)` });
  }

  // ── Save grid settings ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = parseInt(spacingM), r = parseInt(radiusM), d = parseInt(devtolM);
    if (!isNaN(s) && !isNaN(r) && !isNaN(d)) {
      persistDb({ ...db, spacing: s, radius: r, devtol: d });
    }
  }, [spacingM, radiusM, devtolM]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const totalSlots = renderedKeysRef.current.size;
  let placedCount = 0, blockedCount = 0, skippedCount = 0;
  renderedKeysRef.current.forEach(k => {
    const st = (db.slots[k] || {}).status;
    if (st === "placed") placedCount++;
    else if (st === "blocked") blockedCount++;
    else if (st === "skipped") skippedCount++;
  });
  const remainingCount = totalSlots - placedCount - blockedCount - skippedCount;
  const pct = totalSlots > 0 ? Math.round(placedCount / totalSlots * 100) : 0;

  // Selected slot info
  const selectedSlotData = selectedKey ? (db.slots[selectedKey] || { status: "recommended" as const }) : null;
  const selectedLat = selectedKey ? +selectedKey.split(":")[0] : 0;
  const selectedLng = selectedKey ? +selectedKey.split(":")[1] : 0;
  const distToSelected = selectedKey && myLoc ? haversineM(myLoc.lat, myLoc.lng, selectedLat, selectedLng) : null;
  const ancDist = selectedKey && db.anchor ? haversineM(db.anchor.lat, db.anchor.lng, selectedLat, selectedLng) : null;
  const sigBars = ancDist !== null ? Math.max(1, Math.min(5, Math.round(5 - (ancDist / (parseInt(spacingM) || 200)) * 0.7))) : null;
  const devtolNum = parseInt(devtolM) || 50;
  const inTol = distToSelected !== null && distToSelected <= devtolNum;

  // Neighbors
  const neighbors = selectedKey
    ? Array.from(renderedKeysRef.current)
        .filter(k => k !== selectedKey)
        .map(k => {
          const [l, g] = k.split(":");
          return { key: k, dist: haversineM(selectedLat, selectedLng, +l, +g), status: (db.slots[k] || {}).status || "recommended" };
        })
        .filter(n => n.dist <= (parseInt(spacingM) || 200) * 1.5)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6)
    : [];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <style>{`@keyframes gps-out{0%{transform:scale(1);opacity:.6}100%{transform:scale(3);opacity:0}}`}</style>
      <div className="flex flex-col" style={{ height: "calc(100vh - 52px)" }}>

        {/* Topbar */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-background/95 backdrop-blur-sm z-10">
          <button onClick={() => { setLeftPanelOpen(v => !v); setTimeout(() => leafletMap.current?.invalidateSize(), 320); }}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
            {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-info/15 flex items-center justify-content:center"><Grid3x3 className="h-4 w-4 text-info" /></div>
            <div><div className="text-sm font-bold">Mesh Planner</div><div className="text-[10px] text-muted-foreground">v3.1 · local · {projName}</div></div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-1 flex-wrap">
            {[{ color: "#38bdf8", l: "Slots", v: totalSlots }, { color: "#22c55e", l: "✅", v: placedCount }, { color: "#ef4444", l: "🚫", v: blockedCount }, { color: "#64748b", l: "⏭", v: skippedCount }].map(s => (
              <div key={s.l} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 border border-border text-xs font-mono">
                <span className="text-muted-foreground">{s.l}</span><span className="font-bold">{s.v}</span>
              </div>
            ))}
            {myLoc && <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /><span className="font-mono text-[10px]">GPS ±{Math.round(myLoc.accuracy)}m</span></div>}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {canUndo && <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={doUndo}><Undo2 className="h-3.5 w-3.5" />Undo</Button>}
            <Button size="sm" variant={locWatchId !== null ? "default" : "outline"} onClick={locWatchId !== null ? stopTracking : startTracking} className="h-8 gap-1 text-xs">
              <Navigation className={`h-3.5 w-3.5 ${locWatchId !== null ? "animate-pulse" : ""}`} />{locWatchId !== null ? "Stop" : "Track Me"}
            </Button>
            <Button size="sm" className="h-8 gap-1 text-xs bg-info hover:bg-info/90 text-white" onClick={revealNear}>
              <Radar className="h-3.5 w-3.5" />Reveal
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!db.fence || db.fence.length < 3} onClick={fillFence}>
              <Layers className="h-3.5 w-3.5" />Fill Fence
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-destructive" onClick={clearNodes}>
              <Trash2 className="h-3.5 w-3.5" />Clear
            </Button>
          </div>
        </div>

        {/* Main */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left panel */}
          {leftPanelOpen && (
            <div className="w-72 flex-shrink-0 border-r border-border bg-background flex flex-col overflow-hidden max-lg:absolute max-lg:top-0 max-lg:left-0 max-lg:bottom-0 max-lg:z-[600]">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Grid3x3 className="h-3 w-3" /> Planner Settings
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: "thin" }}>

                {/* Project */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Project</Label>
                  <div className="flex gap-1.5">
                    <select value={projName} onChange={e => switchProject(e.target.value)}
                      className="flex-1 h-8 px-2 rounded-md border border-border bg-muted/50 text-xs text-foreground outline-none">
                      {meta.projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Button size="sm" className="h-8 w-8 p-0" onClick={newProject}><Plus className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive" onClick={deleteProject}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>

                {/* Coverage */}
                {totalSlots > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground font-semibold">Deployment Progress</span><span className="font-bold font-mono text-success">{pct}%</span></div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-success to-info rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
                    <div className="grid grid-cols-4 gap-1">
                      {[{ v: placedCount, l: "Placed", c: "text-success" }, { v: blockedCount, l: "Blocked", c: "text-destructive" }, { v: skippedCount, l: "Skipped", c: "text-muted-foreground" }, { v: remainingCount, l: "Remain", c: "text-amber-500" }].map(s => (
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
                    <Input value={locQuery} onChange={e => setLocQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchLocation()} placeholder="Search address or place…" className="h-8 text-xs bg-muted/50" />
                    <Button size="sm" className="h-8 px-2.5" onClick={searchLocation} disabled={searching}>
                      {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* AP Profiles */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">AP Hardware Profile</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.entries(HW_PROFILES) as [HwKey, typeof HW_PROFILES[HwKey]][]).map(([key, p]) => (
                      <button key={key} onClick={() => applyHwProfile(key)}
                        className={`p-2 rounded-lg border text-left transition-all text-xs ${activeHw === key ? "border-orange-400 bg-orange-500/10" : "border-border bg-muted/30 hover:border-muted-foreground/40"}`}>
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
                    {([{ id: "carto", label: "Dark", sub: "CARTO · free" }, { id: "osm", label: "Street", sub: "OpenStreetMap" }, { id: "satellite", label: "Satellite", sub: "ESRI · free" }, { id: "google", label: "Google", sub: "Hybrid · key req" }] as const).map(t => (
                      <button key={t.id} onClick={() => applyTile(t.id as TileId)}
                        className={`p-2 rounded-lg border text-center text-xs transition-all ${tileId === t.id ? "border-info bg-info/10" : "border-border bg-muted/30 hover:border-muted-foreground/40"}`}>
                        <div className="font-semibold">{t.label}</div><div className="text-[9px] text-muted-foreground">{t.sub}</div>
                      </button>
                    ))}
                  </div>
                  {tileId === "google" && (
                    <>
                      <div className="flex gap-1.5 mb-1.5">
                        <Input value={gmapKey} onChange={e => setGmapKey(e.target.value)} type="password" placeholder="Google Maps API Key" className="h-7 text-xs font-mono bg-muted/50" />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={() => { persistDb({ ...db, gkey: gmapKey }); applyTile("google"); toast({ title: "Google key saved" }); }}>Apply</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {(["hybrid", "satellite", "roadmap", "terrain"] as GoogleType[]).map(gt => (
                          <button key={gt} onClick={() => { setGoogleType(gt); persistDb({ ...db, gtype: gt }); applyTile("google", gt); }}
                            className={`py-1 px-2 rounded-md border text-[10px] transition-all ${googleType === gt ? "border-info bg-info/10" : "border-border bg-muted/30"}`}>
                            {gt.charAt(0).toUpperCase() + gt.slice(1)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Anchor */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    Anchor Point{db.anchor && <Badge variant="outline" className="text-[8px] bg-success/10 text-success border-success/30">⚓ Set</Badge>}
                  </div>
                  {db.anchor ? (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 mb-2">
                      <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">⚓ Anchor Set</div>
                      <div className="text-xs font-semibold text-amber-300">{db.anchor.name}</div>
                      <div className="text-[10px] font-mono text-amber-400/80">{db.anchor.lat.toFixed(6)}<br />{db.anchor.lng.toFixed(6)}</div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-muted-foreground/25 p-2 mb-2 text-center text-xs text-muted-foreground">
                      No anchor set. Use Set Anchor or GPS.
                    </div>
                  )}
                  <div className="flex gap-1.5 mb-2">
                    <Button size="sm" variant={settingAnchor ? "default" : "outline"} onClick={settingAnchor ? stopAnchorPick : startAnchorPick} className="h-7 text-xs gap-1 flex-1">
                      <Crosshair className="h-3 w-3" />{settingAnchor ? "Cancel" : "📍 Set Anchor"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      if (!navigator.geolocation) { toast({ title: "Geolocation unavailable", variant: "destructive" }); return; }
                      navigator.geolocation.getCurrentPosition(p => {
                        const name = anchorLabel.trim() || "My Location";
                        setAnchorLat(p.coords.latitude.toFixed(7));
                        setAnchorLng(p.coords.longitude.toFixed(7));
                        const updated = { ...db, anchor: { lat: p.coords.latitude, lng: p.coords.longitude, name } };
                        persistDb(updated);
                        setAnchorLabel(name);
                        reloadFromDB(updated);
                        leafletMap.current?.flyTo([p.coords.latitude, p.coords.longitude], 15, { duration: 1 });
                        toast({ title: "⚓ Anchor set from GPS" });
                      }, () => toast({ title: "GPS failed", variant: "destructive" }), { enableHighAccuracy: true, timeout: 8000 });
                    }} className="h-7 text-xs gap-1">🛰 GPS</Button>
                  </div>
                  <Input value={anchorLabel} onChange={e => setAnchorLabel(e.target.value)} placeholder="Label (e.g. Main Tower)" className="h-7 text-xs bg-muted/50 mb-1" />
                  <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                    <Input value={anchorLat} onChange={e => setAnchorLat(e.target.value)} placeholder="Latitude" className="h-7 text-xs font-mono bg-muted/50" />
                    <Input value={anchorLng} onChange={e => setAnchorLng(e.target.value)} placeholder="Longitude" className="h-7 text-xs font-mono bg-muted/50" />
                  </div>
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={setAnchorFromCoords}>Apply Coordinates</Button>
                </div>

                {/* Fence */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    Coverage Fence{db.fence && db.fence.length >= 3 && <Badge variant="outline" className="text-[8px] bg-purple-500/10 text-purple-400 border-purple-500/30">🔷 {db.fence.length}pts</Badge>}
                  </div>
                  {db.fence && db.fence.length >= 3 ? (
                    <div className="rounded-lg border border-purple-500/25 bg-purple-500/5 p-2 mb-2">
                      <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">🔷 Fence Active</div>
                      <div className="text-xs font-mono text-purple-300">{db.fence.length} vertices</div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-muted-foreground/25 p-2 mb-2 text-center text-xs text-muted-foreground">
                      No fence drawn.
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <Button size="sm" variant={drawingFence ? "default" : "outline"} onClick={drawingFence ? stopFenceDraw : startFenceDraw} className="h-7 text-xs gap-1 flex-1">
                      <Layers className="h-3 w-3" />{drawingFence ? "✕ Stop Drawing" : "⬡ Draw Fence"}
                    </Button>
                    {db.fence && <Button size="sm" variant="ghost" onClick={clearFence} className="h-7 text-xs px-2"><X className="h-3 w-3" /></Button>}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">Click map points to draw polygon. Double-click or re-click first point to close. Then tap <b className="text-purple-400">Fill Fence</b>.</p>
                </div>

                {/* Grid Settings */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Grid Settings</Label>
                  <div className="space-y-2">
                    {[{ label: "Node Spacing", val: spacingM, set: setSpacingM, min: 50, max: 1000, step: 25, unit: "m" },
                      { label: "Reveal Radius", val: radiusM, set: setRadiusM, min: 100, max: 5000, step: 100, unit: "m" },
                      { label: "Deviation Tolerance", val: devtolM, set: setDevtolM, min: 10, max: 200, step: 5, unit: "m" }].map(sl => (
                      <div key={sl.label}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span className="text-muted-foreground">{sl.label}</span>
                          <span className="font-bold font-mono text-success">{sl.val}{sl.unit}</span>
                        </div>
                        <input type="range" min={sl.min} max={sl.max} step={sl.step} value={sl.val}
                          onChange={e => sl.set(e.target.value)}
                          className="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-success" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Display toggles */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Display</Label>
                  <div className="space-y-0.5">
                    {[
                      { label: "Deviation Circles", v: showCircles, fn: () => setShowCircles(x => !x) },
                      { label: "Grid Lines", v: showLines, fn: () => setShowLines(x => !x) },
                      { label: "Slot Labels", v: showLabels, fn: () => { setShowLabels(x => !x); setTimeout(refreshAllIcons, 50); } },
                      { label: "Fence Overlay", v: showFenceOverlay, fn: () => setShowFenceOverlay(x => !x) },
                      { label: "Signal Heatmap", v: heatmapOn, fn: () => setHeatmapOn(x => !x) },
                    ].map(t => (
                      <div key={t.label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                        <span className="text-xs text-muted-foreground">{t.label}</span>
                        <button onClick={t.fn} className={`w-8 h-5 rounded-full transition-colors relative ${t.v ? "bg-success" : "bg-muted"}`}>
                          <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${t.v ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Import/Export */}
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Import / Export</Label>
                  <div
                    className={`flex items-center justify-center gap-2 border border-dashed rounded-lg py-3 cursor-pointer transition-colors text-xs text-muted-foreground mb-2 ${dragOver ? "border-info text-info bg-info/5" : "border-border hover:border-info"}`}
                    onClick={() => importRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <Upload className="h-4 w-4" />Drop CSV/JSON or click to import
                  </div>
                  <input ref={importRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileInput} />
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={exportCSV}><Download className="h-3 w-3" />CSV</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={exportJSON}><Download className="h-3 w-3" />JSON</Button>
                  </div>
                </div>

                <Button size="sm" variant="ghost" onClick={resetEverything} className="w-full h-7 text-xs text-destructive hover:bg-destructive/10 gap-1">
                  <Trash2 className="h-3.5 w-3.5" />↺ Reset Everything
                </Button>

              </div>
            </div>
          )}

          {/* Map + slot panel */}
          <div className={`flex flex-1 min-h-0 overflow-hidden relative ${mapFullscreen ? "fixed inset-0 z-[900] bg-background" : ""}`}>
            <div className="flex-1 relative">
              <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
              <canvas ref={heatCanvas} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 350, opacity: 0 }} />

              {/* Bulk banner */}
              {bulkMode && (
                <div className="absolute top-0 left-0 right-0 z-[400] bg-orange-500/15 border-b border-orange-500/30 backdrop-blur-sm px-4 py-2 flex items-center gap-2 text-sm">
                  <BoxSelect className="h-4 w-4 text-orange-400" />
                  <span className="text-orange-300 font-semibold">{bulkSelected.size} selected</span>
                  <div className="flex gap-1.5 ml-2">
                    <Button size="sm" className="h-7 text-xs bg-success hover:bg-success/90" onClick={() => bulkApply("placed")}>✅ Placed</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30" onClick={() => bulkApply("blocked")}>🚫 Block</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => bulkApply("skipped")}>⏭ Skip</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => bulkApply("recommended")}>↩ Reset</Button>
                  </div>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setBulkMode(false); setBulkSelected(new Set()); refreshAllIcons(); }}>✕ Exit</Button>
                </div>
              )}

              {/* Map overlay buttons */}
              <div className="absolute top-2 left-2 z-[500] flex flex-col gap-1.5">
                {db.anchor && <button onClick={() => leafletMap.current?.flyTo([db.anchor!.lat, db.anchor!.lng], 15, { duration: 1 })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground transition-colors shadow">⚓ Anchor</button>}
                <button onClick={() => {
                  if (myLoc) leafletMap.current?.flyTo([myLoc.lat, myLoc.lng], 16, { duration: 0.8 });
                  else navigator.geolocation?.getCurrentPosition(p => {
                    updateGpsMarker(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
                    setMyLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
                    leafletMap.current?.flyTo([p.coords.latitude, p.coords.longitude], 16, { duration: 1 });
                  }, () => toast({ title: "Location unavailable", variant: "destructive" }), { enableHighAccuracy: true });
                }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground transition-colors shadow">📍 My Location</button>
              </div>

              <div className="absolute top-2 right-2 z-[500] flex flex-col gap-1.5">
                <button onClick={() => { setMapFullscreen(f => !f); setTimeout(() => leafletMap.current?.invalidateSize(), 100); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground transition-colors shadow">
                  {mapFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}{mapFullscreen ? "Exit" : "Fullscreen"}
                </button>
                <button onClick={() => {
                  const next = !slotsVisible;
                  setSlotsVisible(next);
                  if (next) { leafletMap.current?.addLayer(layerSlots.current); leafletMap.current?.addLayer(layerCircles.current); leafletMap.current?.addLayer(layerLines.current); }
                  else { leafletMap.current?.removeLayer(layerSlots.current); leafletMap.current?.removeLayer(layerCircles.current); leafletMap.current?.removeLayer(layerLines.current); }
                }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border backdrop-blur-sm text-xs transition-colors shadow ${slotsVisible ? "border-info/40 bg-info/15 text-info" : "border-border/40 bg-background/90 text-muted-foreground"}`}>
                  {slotsVisible ? "◉ Slots Visible" : "○ Slots Hidden"}
                </button>
                <button onClick={() => setHeatmapOn(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border backdrop-blur-sm text-xs transition-colors shadow ${heatmapOn ? "border-red-500/40 bg-red-500/15 text-red-300" : "border-border/40 bg-background/90 text-muted-foreground hover:text-foreground"}`}>
                  <Thermometer className="h-3.5 w-3.5" />Heatmap
                </button>
                <button onClick={() => { setBulkMode(v => !v); if (bulkMode) { setBulkSelected(new Set()); refreshAllIcons(); } }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border backdrop-blur-sm text-xs transition-colors shadow ${bulkMode ? "border-orange-500/40 bg-orange-500/15 text-orange-300" : "border-border/40 bg-background/90 text-muted-foreground hover:text-foreground"}`}>
                  <BoxSelect className="h-3.5 w-3.5" />Bulk Select
                </button>
              </div>

              {selectedKey && <button onClick={() => setMobilePanelOpen(v => !v)}
                className="lg:hidden absolute bottom-4 right-4 z-[500] bg-primary text-primary-foreground rounded-full px-4 py-2 text-xs font-semibold shadow-lg flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />{mobilePanelOpen ? "Hide details" : "Slot details"}
              </button>}
            </div>

            {/* Slot detail panel */}
            {selectedKey && selectedSlotData && (
              <div className={[
                "border-l border-border bg-background p-4 flex-shrink-0 flex flex-col gap-3 overflow-y-auto",
                "lg:w-72 lg:relative lg:translate-x-0",
                "max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:z-[600] max-lg:rounded-t-2xl max-lg:max-h-[75vh] max-lg:shadow-2xl",
                mobilePanelOpen ? "max-lg:translate-y-0" : "max-lg:translate-y-full", "transition-transform duration-200"
              ].join(" ")}>

                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge style={{ background: STATUS_COLOR[selectedSlotData.status] + "22", color: STATUS_COLOR[selectedSlotData.status], borderColor: STATUS_COLOR[selectedSlotData.status] + "55" }}>
                        {STATUS_LABEL[selectedSlotData.status]}
                      </Badge>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">{selectedLat.toFixed(6)}, {selectedLng.toFixed(6)}</p>
                  </div>
                  <button onClick={() => { setSelectedKey(null); setMobilePanelOpen(false); if (bearingLineRef.current) { bearingLineRef.current.remove(); bearingLineRef.current = null; } }} className="text-muted-foreground hover:text-foreground text-xl px-1">×</button>
                </div>

                {ancDist !== null && (
                  <div className="flex justify-between text-xs py-1 border-b border-border/40">
                    <span className="text-muted-foreground">From Anchor</span>
                    <span className="font-mono">{ancDist >= 1000 ? (ancDist / 1000).toFixed(2) + "km" : ancDist.toFixed(0) + "m"}</span>
                  </div>
                )}

                {distToSelected !== null && (
                  <div className={`rounded-lg p-3 text-center ${inTol ? "bg-success/10 border border-success/25" : "bg-muted/50"}`}>
                    <p className="text-2xl font-bold">{distToSelected < 1000 ? `${Math.round(distToSelected)}m` : `${(distToSelected / 1000).toFixed(2)}km`}</p>
                    <p className="text-[10px] text-muted-foreground">from your location</p>
                    {inTol && <p className="text-[10px] text-success font-semibold mt-0.5">✓ Within tolerance — place here!</p>}
                  </div>
                )}

                {sigBars !== null && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Est. Signal</div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-end gap-0.5 h-5">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{ width: 8, height: 5 + i * 3, background: i <= sigBars! ? (sigBars! >= 4 ? "#22c55e" : sigBars! >= 3 ? "#f59e0b" : "#ef4444") : "var(--muted)", borderRadius: 2 }} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{sigBars >= 4 ? "Excellent" : sigBars >= 3 ? "Good" : sigBars >= 2 ? "Fair" : "Weak"} ({sigBars}/5)</span>
                    </div>
                  </div>
                )}

                {selectedSlotData.status === "placed" && selectedSlotData.placedLat && (
                  <div className="rounded-lg border border-success/25 bg-success/5 p-3 space-y-1 text-[10px]">
                    <p className="font-semibold text-success">Placed ✓</p>
                    <p className="font-mono text-muted-foreground">GPS: {selectedSlotData.placedLat.toFixed(6)}, {selectedSlotData.placedLng?.toFixed(6)}</p>
                    {selectedSlotData.offset != null && <p className="text-muted-foreground">Offset: {selectedSlotData.offset.toFixed(0)}m</p>}
                    {selectedSlotData.timestamp && <p className="text-muted-foreground">{new Date(selectedSlotData.timestamp).toLocaleString()}</p>}
                  </div>
                )}

                {neighbors.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Nearby ({neighbors.length})</div>
                    <div className="space-y-0.5 max-h-20 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                      {neighbors.map(n => (
                        <div key={n.key} className="flex items-center justify-between text-[10px] py-0.5 border-b border-border/30 last:border-0">
                          <span style={{ color: STATUS_COLOR[n.status as keyof typeof STATUS_COLOR] }} className="font-mono">{n.key.split(":")[0].slice(-4)}</span>
                          <span className="text-muted-foreground">{n.status}</span>
                          <span className="text-muted-foreground">{n.dist.toFixed(0)}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[10px]">Notes</Label>
                  <textarea className="w-full rounded-lg border border-border bg-muted/50 p-2 text-xs min-h-[56px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. Mounted on Kamau's rooftop…" value={slotNotes} onChange={e => setSlotNotes(e.target.value)} />
                </div>

                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => navigateToSlot(selectedKey)}>
                    <ExternalLink className="h-3 w-3" />Navigate
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs px-2" onClick={() => navigator.clipboard?.writeText(`${selectedLat.toFixed(6)}, ${selectedLng.toFixed(6)}`).then(() => toast({ title: "Coords copied!" }))}>📋</Button>
                  <Button size="sm" className="text-xs px-3" onClick={saveSlotNotes}>Save</Button>
                </div>

                <div className="space-y-1.5">
                  {selectedSlotData.status !== "placed" && (
                    <Button size="sm" className="w-full gap-1.5 bg-success hover:bg-success/90 text-xs" onClick={() => updateSlotStatus(selectedKey, "placed")}>
                      <CheckCircle2 className="h-3.5 w-3.5" />{myLoc ? "✅ Placed (record GPS)" : "✅ Placed"}
                    </Button>
                  )}
                  {selectedSlotData.status !== "blocked" && (
                    <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => updateSlotStatus(selectedKey, "blocked")}>
                      <X className="h-3.5 w-3.5" />🚫 Block
                    </Button>
                  )}
                  <div className="flex gap-1.5">
                    {selectedSlotData.status !== "skipped" && (
                      <Button size="sm" variant="ghost" className="flex-1 gap-1 text-xs" onClick={() => updateSlotStatus(selectedKey, "skipped")}><Flag className="h-3.5 w-3.5" />⏭ Skip</Button>
                    )}
                    {selectedSlotData.status !== "recommended" && (
                      <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => updateSlotStatus(selectedKey, "recommended")}>↩ Reset</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex-shrink-0 px-4 py-1.5 border-t border-border bg-background/80">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground items-center">
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-white/30 inline-block" style={{ background: c }} />{STATUS_LABEL[s as keyof typeof STATUS_LABEL]}</span>
            ))}
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Anchor</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse inline-block" />Your GPS</span>
            <span className="text-muted-foreground/40 ml-2">· 🔥 heatmap = placed AP coverage · local storage</span>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
};

export default MeshPlannerPage;
