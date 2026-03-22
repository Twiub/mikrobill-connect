/**
 * MeshPlannerPage.tsx — v2.1.0 (v3.15.1)
 *
 * NEW in v2.1.0:
 *   - Map provider toggle: OSM (default, free) ↔ Google Maps satellite/roadmap
 *   - Google Maps API key stored in system_settings (key: google_maps_api_key)
 *   - "Navigate Here" button in slot panel: opens Google Maps turn-by-turn
 *     directions from installer GPS → selected slot in new tab (zero API cost)
 *   - Straight-line bearing line drawn on map from GPS → selected slot
 *     (L.polyline, no routing API needed)
 *
 * Mesh Node Placement Planner — Proximity-based Grid Reveal
 *
 * NEW DESIGN:
 *   The hex grid is infinite and virtual. Points are NOT pre-generated.
 *   Instead, as the installer moves around:
 *     1. Their GPS position is shown on the map
 *     2. They click "Reveal Near Me" (or it auto-reveals) → backend computes
 *        which hex grid points fall within the reveal radius of their location
 *        and persists only the new ones
 *     3. The map shows those points plus any already-revealed points nearby
 *     4. As they walk to a new area, they reveal again → more points appear
 *
 *   GLOBAL CONSISTENCY: Because the grid is purely mathematical (anchor + spacing),
 *   the same point always has the same (ring, index) key. If admin A reveals a
 *   point from the north and admin B reveals the same point from the south, they
 *   get the same DB record. Placed/blocked status is shared across all admins.
 *
 * Usage flow:
 *   1. Admin sets anchor once (first/reference node location)
 *   2. Installer goes to field, enables GPS tracking
 *   3. Taps "Reveal Near Me" → grid points appear within radius (default 1km)
 *   4. Walks to a blue pin → "Mark Placed" with live GPS, or "Mark Blocked"
 *   5. Moves to next area → reveals again → new points appear, old ones stay
 */

import { useEffect, useRef, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Navigation, Wifi, CheckCircle2, Eye, EyeOff,
  RefreshCw, Loader2, Settings2, Grid3x3, Trash2, Flag, X,
  Crosshair, ChevronDown, ChevronUp, Info, Radar, Map, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  spacing_m: number; deviation_m: number;
  reveal_radius_m: number;
  show_recommended: boolean;
}
interface MeshNode { id: number; name: string; mac: string; lat: number; lon: number; last_contact: string | null; is_gateway: boolean; }
interface Mesh { id: number; name: string; }
interface MyLoc { lat: number; lng: number; accuracy: number; }

const STATUS_COLOR = {
  recommended: "#3b82f6",
  placed:      "#22c55e",
  blocked:     "#ef4444",
  skipped:     "#94a3b8",
} as const;

const STATUS_LABEL = {
  recommended: "Empty slot",
  placed:      "Node placed",
  blocked:     "Blocked",
  skipped:     "Skipped",
} as const;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MeshPlannerPage = () => {
  const { toast } = useToast();

  const mapRef       = useRef<HTMLDivElement>(null);
  const leafletMap   = useRef<any>(null);
  const slotLayer    = useRef<any>(null);
  const nodeLayer    = useRef<any>(null);
  const myLocMarker  = useRef<any>(null);
  const radiusCircle = useRef<any>(null);
  const clickListener = useRef<any>(null);
  const bearingLine  = useRef<any>(null);   // straight line GPS → selected slot
  const tileLayer    = useRef<any>(null);   // current tile layer (swap on provider change)

  const [meshes, setMeshes]           = useState<Mesh[]>([]);
  const [selectedMesh, setSelectedMesh] = useState<string>("");
  const [config, setConfig]           = useState<PlannerConfig | null>(null);
  const [slots, setSlots]             = useState<Slot[]>([]);
  const [nodes, setNodes]             = useState<MeshNode[]>([]);
  const [myLoc, setMyLoc]             = useState<MyLoc | null>(null);
  const [locWatchId, setLocWatchId]   = useState<number | null>(null);
  const [mapReady, setMapReady]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [revealing, setRevealing]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecommended, setShowRecommended] = useState(true);
  const [settingAnchor, setSettingAnchor] = useState(false);

  // Map provider
  type MapProvider = "osm" | "google_roadmap" | "google_satellite";
  const [mapProvider, setMapProvider] = useState<MapProvider>("osm");
  const [googleMapsKey, setGoogleMapsKey] = useState<string>("");

  // Config form
  const [anchorLat, setAnchorLat]     = useState("");
  const [anchorLng, setAnchorLng]     = useState("");
  const [spacingM, setSpacingM]       = useState("200");
  const [deviationM, setDeviationM]   = useState("50");
  const [revealRadiusM, setRevealRadiusM] = useState("1000");

  // Selected slot panel
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slotNotes, setSlotNotes]     = useState("");
  const [savingSlot, setSavingSlot]   = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // ── Leaflet init ────────────────────────────────────────────────────────────
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
      .then(() => initMap())
      .catch(e => console.error("Leaflet failed", e));
    return () => { leafletMap.current?.remove(); leafletMap.current = null; };
  }, []);

  // GPS cleanup on unmount — clears watchPosition if user navigates away without stopping
  useEffect(() => {
    return () => {
      if (locWatchId !== null) {
        navigator.geolocation.clearWatch(locWatchId);
      }
    };
  }, [locWatchId]);

  function initMap() {
    const L = (window as any).L;
    if (!mapRef.current || !L || leafletMap.current) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([-1.2921, 36.8219], 14);
    // Default: OSM
    tileLayer.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19,
    }).addTo(map);
    slotLayer.current = L.layerGroup().addTo(map);
    nodeLayer.current = L.layerGroup().addTo(map);
    leafletMap.current = map;
    setMapReady(true);
  }

  // ── Switch tile layer (OSM ↔ Google) ────────────────────────────────────────
  function switchTileLayer(provider: "osm" | "google_roadmap" | "google_satellite") {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;

    if (tileLayer.current) {
      leafletMap.current.removeLayer(tileLayer.current);
      tileLayer.current = null;
    }

    let layer: any;
    if (provider === "osm") {
      layer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      });
    } else if (provider === "google_roadmap") {
      // Google Maps tile URL — requires API key loaded via script tag
      // We use the Maps Static tiles approach via Leaflet for roadmap
      layer = L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${googleMapsKey}`,
        { subdomains: "0123", maxZoom: 21, attribution: "© Google Maps" }
      );
    } else {
      // Satellite + labels hybrid
      layer = L.tileLayer(
        `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${googleMapsKey}`,
        { subdomains: "0123", maxZoom: 21, attribution: "© Google Maps" }
      );
    }

    // Insert below slot/node layers so markers stay on top
    layer.addTo(leafletMap.current);
    layer.bringToBack();
    tileLayer.current = layer;
    setMapProvider(provider);
  }

  // ── Load meshes ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("meshes").select("id, name").order("name").then(({ data }) => {
      setMeshes(data ?? []);
      if (data?.length) setSelectedMesh(String(data[0].id));
    });
    // Load Google Maps API key from system_settings via admin API
    adminApi("GET", "/admin/system-settings").then(d => {
      if (d.success && d.settings?.google_maps_api_key) {
        setGoogleMapsKey(d.settings.google_maps_api_key);
      }
    }).catch(() => {});
  }, []);

  // ── Load config + slots when mesh changes ────────────────────────────────────
  // Load slots near a location from DB (no new reveal, just fetch what's already there)
  const loadSlotsNear = useCallback(async (meshId: string, lat: number, lng: number, radius: number) => {
    const d = await adminApi("GET",
      `/admin/mesh-planner/${meshId}/slots-near?lat=${lat}&lng=${lng}&radius_m=${radius}`
    );
    if (d.success) setSlots(d.slots ?? []);
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
        setConfig(cfgRes.config);
        setShowRecommended(cfgRes.config.show_recommended ?? true);
        setAnchorLat(String(cfgRes.config.anchor_lat));
        setAnchorLng(String(cfgRes.config.anchor_lng));
        setSpacingM(String(cfgRes.config.spacing_m));
        setDeviationM(String(cfgRes.config.deviation_m));
        setRevealRadiusM(String(cfgRes.config.reveal_radius_m ?? 1000));
      }
      if (nodeRes.success) setNodes(nodeRes.nodes ?? []);

      // If GPS is active, load slots near current location
      if (myLoc && cfgRes.config) {
        await loadSlotsNear(meshId, myLoc.lat, myLoc.lng, cfgRes.config.reveal_radius_m ?? 1000);
      }
    } finally { setLoading(false); }
  }, [myLoc, loadSlotsNear]);

  useEffect(() => { if (selectedMesh) loadConfig(selectedMesh); }, [selectedMesh, loadConfig]);

  // ── Render map ──────────────────────────────────────────────────────────────
  const renderSlots = useCallback(() => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    slotLayer.current?.clearLayers();
    slots.forEach(slot => {
      if (!showRecommended && slot.status === "recommended" && slot.grid_ring !== 0) return;
      const icon = makeSlotIcon(slot);
      const marker = L.marker([slot.lat, slot.lng], { icon })
        .bindPopup(
          `<div style="font-family:system-ui;min-width:160px">
            <b style="color:${STATUS_COLOR[slot.status]}">${STATUS_LABEL[slot.status]}</b>
            <br><span style="font-size:11px;color:#64748b">Ring ${slot.grid_ring} · #${slot.grid_index}</span>
            <br><span style="font-size:10px;font-family:monospace">${slot.lat.toFixed(6)}, ${slot.lng.toFixed(6)}</span>
            ${slot.notes ? `<br><em style="font-size:11px">${slot.notes}</em>` : ""}
          </div>`, { maxWidth: 220 }
        )
        .on("click", () => {
            setSelectedSlot(slot);
            setSlotNotes(slot.notes ?? "");
            setMobilePanelOpen(true);
            if (myLoc) drawBearingLine(slot);
          });
      marker.addTo(slotLayer.current);
      // Deviation tolerance circle for recommended slots
      if (showRecommended && slot.status === "recommended" && config) {
        L.circle([slot.lat, slot.lng], {
          radius: config.deviation_m,
          color: "#3b82f6", weight: 1,
          fillColor: "#3b82f6", fillOpacity: 0.06, dashArray: "4",
        }).addTo(slotLayer.current);
      }
    });
  }, [slots, showRecommended, config, myLoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderNodes = useCallback(() => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    nodeLayer.current?.clearLayers();
    nodes.forEach(node => {
      const isOnline = node.last_contact && (Date.now() - new Date(node.last_contact).getTime()) < 5 * 60 * 1000;
      const col = node.is_gateway ? "#f59e0b" : isOnline ? "#22c55e" : "#6b7280";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="11" fill="${col}" stroke="white" stroke-width="2"/>
        <text x="12" y="17" text-anchor="middle" font-size="11" fill="white">📡</text></svg>`;
      const icon = L.divIcon({ html: svg, className: "", iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([node.lat, node.lon], { icon })
        .bindPopup(`<b>📡 ${node.name}</b><br>MAC: ${node.mac}<br>${isOnline ? "🟢 Online" : "⚫ Offline"}${node.is_gateway ? "<br>🌐 Gateway" : ""}`)
        .addTo(nodeLayer.current);
    });
  }, [nodes]);

  useEffect(() => {
    if (!mapReady) return;
    renderSlots();
    renderNodes();
  }, [renderSlots, renderNodes, mapReady]);

  function makeSlotIcon(slot: Slot) {
    const L = (window as any).L;
    const col = STATUS_COLOR[slot.status];
    const isAnchor = slot.grid_ring === 0;
    const size = isAnchor ? 32 : 26;
    const inner = isAnchor
      ? `<text x="12" y="17" text-anchor="middle" font-size="11" fill="white">⚓</text>`
      : slot.status === "placed"
        ? `<polyline points="7,12 10,15 17,8" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
        : slot.status === "blocked"
          ? `<line x1="7" y1="7" x2="17" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="17" y1="7" x2="7" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`
          : slot.status === "skipped"
            ? `<line x1="7" y1="12" x2="17" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`
            : `<circle cx="12" cy="12" r="3" fill="white"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="${col}" stroke="white" stroke-width="2"/>${inner}</svg>`;
    return L.divIcon({ html: svg, className: "", iconSize: [size, size], iconAnchor: [size/2, size/2] });
  }

  // ── GPS tracking ─────────────────────────────────────────────────────────────
  const startTracking = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" }); return;
    }
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
    toast({ title: "📍 GPS tracking started", description: "Move to the area you want to install nodes, then tap Reveal Near Me" });
  };

  const stopTracking = () => {
    if (locWatchId !== null) { navigator.geolocation.clearWatch(locWatchId); setLocWatchId(null); }
    myLocMarker.current?.remove(); myLocMarker.current = null;
    radiusCircle.current?.remove(); radiusCircle.current = null;
    setMyLoc(null);
  };

  function updateGpsMarker(lat: number, lng: number, accuracy: number) {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    const icon = L.divIcon({
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,.35)"></div>`,
      className: "", iconSize: [16, 16], iconAnchor: [8, 8],
    });
    if (myLocMarker.current) {
      myLocMarker.current.setLatLng([lat, lng]);
    } else {
      myLocMarker.current = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
        .bindPopup(`<b>📍 Your Location</b><br>Accuracy: ±${Math.round(accuracy)}m`)
        .addTo(leafletMap.current);
      leafletMap.current.setView([lat, lng], 16);
    }
    // Show reveal radius circle
    const radius = parseInt(revealRadiusM) || (config?.reveal_radius_m ?? 1000);
    if (radiusCircle.current) {
      radiusCircle.current.setLatLng([lat, lng]).setRadius(radius);
    } else {
      radiusCircle.current = L.circle([lat, lng], {
        radius, color: "#3b82f6", weight: 1.5,
        fillColor: "#3b82f6", fillOpacity: 0.04, dashArray: "6 4",
      }).addTo(leafletMap.current);
    }
  }

  // ── Bearing line: GPS → selected slot ───────────────────────────────────────
  // Draws a dashed polyline from installer position to the selected slot.
  // No routing API — straight line only. Cleared when slot is deselected.
  function drawBearingLine(slot: Slot) {
    const L = (window as any).L;
    if (!L || !leafletMap.current || !myLoc) return;
    clearBearingLine();
    bearingLine.current = L.polyline(
      [[myLoc.lat, myLoc.lng], [slot.lat, slot.lng]],
      { color: "#3b82f6", weight: 2, dashArray: "6 5", opacity: 0.7 }
    ).addTo(leafletMap.current);
  }

  function clearBearingLine() {
    if (bearingLine.current) {
      bearingLine.current.remove();
      bearingLine.current = null;
    }
  }

  // ── Navigate Here — opens Google Maps turn-by-turn in new tab ───────────────
  // Zero API cost: just constructs a google.com/maps/dir URL.
  // Works on Android (opens Google Maps app) and desktop (opens in browser).
  function navigateToSlot(slot: Slot) {
    const origin = myLoc ? `${myLoc.lat},${myLoc.lng}` : "";
    const dest   = `${slot.lat},${slot.lng}`;
    const url    = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${dest}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
  const revealNearMe = async () => {
    if (!selectedMesh || !config) {
      toast({ title: "Set anchor first", variant: "destructive" }); return;
    }
    const center = myLoc ?? { lat: config.anchor_lat, lng: config.anchor_lng };
    const radius = parseInt(revealRadiusM) || config.reveal_radius_m;

    setRevealing(true);
    try {
      const d = await adminApi("POST", `/admin/mesh-planner/${selectedMesh}/reveal`, {
        lat:      center.lat,
        lng:      center.lng,
        radius_m: radius,
      });
      if (d.success) {
        setSlots(d.slots ?? []);
        if (d.newly_revealed > 0) {
          toast({
            title: `✅ ${d.newly_revealed} new slot${d.newly_revealed !== 1 ? "s" : ""} revealed`,
            description: `${d.computed} total points within ${radius}m · ${d.slots?.length} loaded`,
          });
        } else {
          toast({
            title: "Area already fully revealed",
            description: `${d.slots?.length} slots visible — no new points in this area`,
          });
        }
        // Pan to centre
        if (myLoc) leafletMap.current?.panTo([myLoc.lat, myLoc.lng]);
      } else {
        toast({ title: "Reveal failed", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setRevealing(false);
    }
  };

  // ── Anchor setting ──────────────────────────────────────────────────────────
  const startAnchorPick = () => {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    setSettingAnchor(true);
    leafletMap.current.getContainer().style.cursor = "crosshair";
    toast({ title: "Click the map to set anchor", description: "The anchor is permanent — all grid points derive from it" });
    const handler = (e: any) => {
      setAnchorLat(e.latlng.lat.toFixed(7));
      setAnchorLng(e.latlng.lng.toFixed(7));
      leafletMap.current.getContainer().style.cursor = "";
      leafletMap.current.off("click", handler);
      clickListener.current = null;
      setSettingAnchor(false);
      toast({ title: "⚓ Anchor set", description: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)} — save settings to confirm` });
    };
    clickListener.current = handler;
    leafletMap.current.on("click", handler);
  };

  const cancelAnchorPick = () => {
    if (clickListener.current && leafletMap.current) {
      leafletMap.current.off("click", clickListener.current);
      leafletMap.current.getContainer().style.cursor = "";
    }
    setSettingAnchor(false);
  };

  // ── Save config ─────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    if (!selectedMesh || !anchorLat || !anchorLng) {
      toast({ title: "Set anchor coordinates first", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const d = await adminApi("POST", `/admin/mesh-planner/${selectedMesh}/config`, {
        anchor_lat:      parseFloat(anchorLat),
        anchor_lng:      parseFloat(anchorLng),
        spacing_m:       parseInt(spacingM),
        deviation_m:     parseInt(deviationM),
        reveal_radius_m: parseInt(revealRadiusM),
        show_recommended: showRecommended,
      });
      if (d.success) {
        setConfig(d.config);
        setShowSettings(false);
        toast({ title: "Settings saved ✅", description: "Now go to the field, enable GPS and tap Reveal Near Me" });
      } else {
        toast({ title: "Save failed", description: d.error, variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  const toggleRecommended = async () => {
    const next = !showRecommended;
    setShowRecommended(next);
    if (selectedMesh) await adminApi("PATCH", `/admin/mesh-planner/${selectedMesh}/show-recommended`, { show_recommended: next });
  };

  // ── Update slot ─────────────────────────────────────────────────────────────
  const updateSlot = async (slotId: string, status: Slot["status"], useLiveGps = false) => {
    setSavingSlot(true);
    const body: any = { status, notes: slotNotes || undefined };
    if (useLiveGps && myLoc && status === "placed") {
      body.placed_lat = myLoc.lat;
      body.placed_lng = myLoc.lng;
      body.placed_by  = "installer";
    }
    try {
      const d = await adminApi("PUT", `/admin/mesh-planner/slots/${slotId}`, body);
      if (d.success) {
        setSlots(prev => prev.map(s => s.id === slotId ? d.slot : s));
        setSelectedSlot(d.slot);
        toast({ title: status === "placed" ? "✅ Marked placed!" : status === "blocked" ? "🚫 Marked blocked" : "Updated" });
      } else {
        toast({ title: "Update failed", description: d.error, variant: "destructive" });
      }
    } finally { setSavingSlot(false); }
  };

  const resetRecommended = async () => {
    if (!confirm("Clear all recommended (empty) slots from DB? Placed/blocked slots are kept.")) return;
    const d = await adminApi("DELETE", `/admin/mesh-planner/${selectedMesh}/slots`);
    if (d.success) { setSlots(prev => prev.filter(s => s.status !== "recommended")); toast({ title: "Cleared" }); }
  };

  // ── Stats ───────────────────────────────────────────────────────────────────
  const recommended = slots.filter(s => s.status === "recommended").length;
  const placed      = slots.filter(s => s.status === "placed").length;
  const blocked     = slots.filter(s => s.status === "blocked").length;
  const distToSelected = selectedSlot && myLoc
    ? haversineM(myLoc.lat, myLoc.lng, selectedSlot.lat, selectedSlot.lng)
    : null;

  return (
    <AdminLayout>
      <div className="flex flex-col h-full space-y-0" style={{ height: "calc(100vh - 52px)" }}>

        {/* ── Top toolbar ── */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-info/15 flex items-center justify-center">
              <Grid3x3 className="h-5 w-5 text-info" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Mesh Node Planner</h1>
              <p className="text-[11px] text-muted-foreground">Move to an area → Reveal Near Me → place nodes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {meshes.length > 1 && (
              <Select value={selectedMesh} onValueChange={v => { setSelectedMesh(v); }}>
                <SelectTrigger className="w-44 h-8 text-xs bg-muted/50"><SelectValue placeholder="Select mesh"/></SelectTrigger>
                <SelectContent>{meshes.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {/* Map provider toggle */}
            <div className="flex items-center h-8 rounded-md border border-border overflow-hidden text-[11px]">
              <button
                onClick={() => switchTileLayer("osm")}
                className={`px-2.5 h-full flex items-center gap-1 transition-colors ${mapProvider === "osm" ? "bg-primary text-white" : "hover:bg-muted/50 text-muted-foreground"}`}>
                <Map className="h-3 w-3" />OSM
              </button>
              <button
                onClick={() => { if (!googleMapsKey) { toast({ title: "No Google Maps API key", description: "Add key in Settings → google_maps_api_key", variant: "destructive" }); return; } switchTileLayer("google_roadmap"); }}
                className={`px-2.5 h-full flex items-center gap-1 border-l border-border transition-colors ${mapProvider === "google_roadmap" ? "bg-primary text-white" : "hover:bg-muted/50 text-muted-foreground"}`}>
                Road
              </button>
              <button
                onClick={() => { if (!googleMapsKey) { toast({ title: "No Google Maps API key", description: "Add key in Settings → google_maps_api_key", variant: "destructive" }); return; } switchTileLayer("google_satellite"); }}
                className={`px-2.5 h-full flex items-center gap-1 border-l border-border transition-colors ${mapProvider === "google_satellite" ? "bg-primary text-white" : "hover:bg-muted/50 text-muted-foreground"}`}>
                Satellite
              </button>
            </div>
            <Button size="sm" variant={locWatchId !== null ? "default" : "outline"}
              onClick={locWatchId !== null ? stopTracking : startTracking} className="h-8 gap-1.5 text-xs">
              <Navigation className={`h-3.5 w-3.5 ${locWatchId !== null ? "animate-pulse" : ""}`} />
              {locWatchId !== null ? "Stop GPS" : "Enable GPS"}
            </Button>
          </div>
        </div>

        {/* ── Stat pills ── */}
        <div className="flex-shrink-0 px-6 py-2 border-b border-border flex gap-2 flex-wrap items-center">
          {[
            { color: "#3b82f6", label: "Revealed", value: recommended },
            { color: "#22c55e", label: "Placed",   value: placed },
            { color: "#ef4444", label: "Blocked",  value: blocked },
          ].map(s => (
            <div key={s.label} className="glass-card px-3 py-1.5 flex items-center gap-1.5 rounded-full text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-bold">{s.value}</span>
            </div>
          ))}
          {nodes.length > 0 && (
            <div className="glass-card px-3 py-1.5 flex items-center gap-1.5 rounded-full text-xs">
              <Wifi className="h-3 w-3 text-amber-500" />
              <span className="text-muted-foreground">Nodes</span>
              <span className="font-bold">{nodes.length}</span>
            </div>
          )}
          {myLoc && (
            <div className="glass-card px-3 py-1.5 flex items-center gap-1.5 rounded-full text-xs border-blue-500/30">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-muted-foreground">GPS</span>
              <span className="font-mono text-[10px]">{myLoc.lat.toFixed(4)}, {myLoc.lng.toFixed(4)} ±{Math.round(myLoc.accuracy)}m</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => loadConfig(selectedMesh)} className="h-7" disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── Action toolbar ── */}
        <div className="flex-shrink-0 px-6 py-2 border-b border-border flex gap-2 flex-wrap items-center">
          <Button size="sm" variant={showSettings ? "default" : "outline"}
            onClick={() => setShowSettings(p => !p)} className="h-8 gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            {config ? "Settings" : "Set Up Anchor"}
            {showSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>

          {config && (
            <>
              {/* Main CTA */}
              <Button size="sm"
                className="h-8 gap-1.5 text-xs bg-info hover:bg-info/90 text-white"
                disabled={revealing} onClick={revealNearMe}>
                {revealing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Revealing…</> :
                  <><Radar className="h-3.5 w-3.5" />Reveal Near Me</>}
              </Button>

              <Button size="sm" variant={showRecommended ? "outline" : "ghost"}
                onClick={toggleRecommended} className="h-8 gap-1.5 text-xs">
                {showRecommended ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {showRecommended ? "Slots On" : "Slots Off"}
              </Button>

              {recommended > 0 && (
                <Button size="sm" variant="ghost"
                  onClick={resetRecommended}
                  className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />Clear Empty
                </Button>
              )}

              <span className="text-xs text-muted-foreground ml-1">
                Spacing: <strong>{config.spacing_m}m</strong> · Radius: <strong>{config.reveal_radius_m}m</strong> · Tolerance: <strong>±{config.deviation_m}m</strong>
              </span>
            </>
          )}
        </div>

        {/* ── Settings panel ── */}
        {showSettings && (
          <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-primary/3">
            <div className="glass-card p-5 space-y-4 border-primary/20 max-w-3xl">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Planner Configuration</h3>
                {config && <Badge variant="outline" className="text-[9px] bg-success/15 text-success border-success/30">⚓ Anchor Set</Badge>}
              </div>

              <div className="glass-card p-3 bg-info/5 border-info/15 text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-info" />How the grid works</p>
                <p>Set the <strong>anchor</strong> once (your first/reference node). The entire hex grid — millions of points — is computed from this single coordinate. You don't generate the grid upfront; instead, tap <strong>Reveal Near Me</strong> when you're in the field to load only the points near your current position. Same anchor = same grid everywhere, always.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-1 space-y-3">
                  <div>
                    <Label className="text-[10px]">Anchor Point <span className="text-success font-medium">(permanent once set)</span></Label>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <Button size="sm" variant={settingAnchor ? "default" : "outline"}
                        onClick={settingAnchor ? cancelAnchorPick : startAnchorPick} className="gap-1 text-xs h-7">
                        <Crosshair className="h-3 w-3" />{settingAnchor ? "Cancel" : "Click Map"}
                      </Button>
                      {myLoc && (
                        <Button size="sm" variant="outline"
                          onClick={() => { setAnchorLat(myLoc.lat.toFixed(7)); setAnchorLng(myLoc.lng.toFixed(7)); toast({ title: "📍 GPS set as anchor" }); }}
                          className="gap-1 text-xs h-7">
                          <Navigation className="h-3 w-3" />My GPS
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[10px]">Latitude</Label><Input value={anchorLat} onChange={e => setAnchorLat(e.target.value)} placeholder="-1.2921" className="font-mono text-[11px] h-8 bg-muted/50 mt-1" /></div>
                    <div><Label className="text-[10px]">Longitude</Label><Input value={anchorLng} onChange={e => setAnchorLng(e.target.value)} placeholder="36.8219" className="font-mono text-[11px] h-8 bg-muted/50 mt-1" /></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Node Spacing (m)</Label>
                      <Input type="number" min={50} max={2000} value={spacingM} onChange={e => setSpacingM(e.target.value)} className="h-8 bg-muted/50 mt-1" />
                      <p className="text-[9px] text-muted-foreground mt-1">Distance between grid points</p>
                    </div>
                    <div>
                      <Label className="text-[10px]">Deviation (m)</Label>
                      <Input type="number" min={10} max={500} value={deviationM} onChange={e => setDeviationM(e.target.value)} className="h-8 bg-muted/50 mt-1" />
                      <p className="text-[9px] text-muted-foreground mt-1">Max install offset</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px]">Reveal Radius (m)</Label>
                    <Input type="number" min={100} max={10000} value={revealRadiusM} onChange={e => setRevealRadiusM(e.target.value)} className="h-8 bg-muted/50 mt-1" />
                    <p className="text-[9px] text-muted-foreground mt-1">How far "Reveal Near Me" reaches from your position</p>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    Google Maps API key is configured in{" "}
                    <a href="/settings" className="underline text-primary hover:text-primary/80">System Settings → Maps &amp; Location</a>
                  </p>
                  <Button size="sm" onClick={saveConfig} disabled={loading || !anchorLat} className="w-full gap-1.5">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Save Settings
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── No config yet ── */}
        {!config && !showSettings && (
          <div className="flex-shrink-0 px-6 py-3">
            <div className="glass-card p-6 text-center space-y-3 max-w-lg">
              <Grid3x3 className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="font-medium">No anchor set for this mesh</p>
              <p className="text-xs text-muted-foreground">Set the anchor point once to define the global grid. You can then reveal nearby points from anywhere in the field.</p>
              <Button size="sm" onClick={() => setShowSettings(true)} className="gap-1.5"><Settings2 className="h-3.5 w-3.5" />Set Up Anchor</Button>
            </div>
          </div>
        )}

        {/* ── Map + slot panel ── */}
        <div className="flex-1 flex gap-4 px-6 py-3 min-h-0 overflow-hidden relative">
          <div className={`glass-card overflow-hidden flex-1 ${selectedSlot ? "min-w-0" : ""}`}>
            <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
            {/* Mobile: floating button to open slot panel when a slot is selected */}
            {selectedSlot && (
              <button
                onClick={() => setMobilePanelOpen(v => !v)}
                className="lg:hidden absolute bottom-4 right-4 z-[500] bg-primary text-primary-foreground rounded-full px-4 py-2 text-xs font-semibold shadow-lg flex items-center gap-1.5"
              >
                <MapPin className="h-3.5 w-3.5" />
                {mobilePanelOpen ? "Hide details" : "Slot details"}
              </button>
            )}
          </div>

          {selectedSlot && (
            <div className={[
              "glass-card p-4 flex-shrink-0 flex flex-col gap-3 overflow-y-auto",
              // Desktop: always visible at fixed width
              "lg:w-72 lg:relative lg:translate-x-0",
              // Mobile: full-width bottom sheet overlay
              "max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:z-[600] max-lg:rounded-t-2xl max-lg:max-h-[70vh] max-lg:shadow-2xl",
              mobilePanelOpen ? "max-lg:translate-y-0" : "max-lg:translate-y-full",
              "transition-transform duration-200",
            ].join(" ")}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm" style={{ color: STATUS_COLOR[selectedSlot.status] }}>
                      {STATUS_LABEL[selectedSlot.status]}
                    </h3>
                    {selectedSlot.grid_ring === 0 && <Badge variant="outline" className="text-[9px]">⚓ Anchor</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Ring {selectedSlot.grid_ring} · #{selectedSlot.grid_index}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{selectedSlot.lat.toFixed(6)}, {selectedSlot.lng.toFixed(6)}</p>
                </div>
                <button onClick={() => { setSelectedSlot(null); setMobilePanelOpen(false); clearBearingLine(); }} className="text-muted-foreground hover:text-foreground text-xl leading-none px-1">×</button>
              </div>

              {distToSelected !== null && (
                <div className={`rounded-lg p-3 text-center ${distToSelected <= (config?.deviation_m ?? 50) ? "bg-success/10 border border-success/25" : "bg-muted/50"}`}>
                  <p className="text-xl sm:text-2xl font-bold">{distToSelected < 1000 ? `${Math.round(distToSelected)}m` : `${(distToSelected / 1000).toFixed(2)}km`}</p>
                  <p className="text-[10px] text-muted-foreground">from your location</p>
                  {distToSelected <= (config?.deviation_m ?? 50) && (
                    <p className="text-[10px] text-success font-semibold mt-0.5">✓ Within tolerance — place here!</p>
                  )}
                  {!myLoc && <p className="text-[10px] text-muted-foreground mt-0.5">Enable GPS to see distance</p>}
                </div>
              )}

              {/* Navigate Here — opens Google Maps turn-by-turn, zero API cost */}
              <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs"
                onClick={() => navigateToSlot(selectedSlot)}>
                <ExternalLink className="h-3.5 w-3.5" />
                {myLoc ? "Navigate Here (Google Maps)" : "Open in Google Maps"}
              </Button>

              <div className="space-y-1">
                <Label className="text-[10px]">Notes</Label>
                <textarea
                  className="w-full rounded-lg border border-border bg-muted/50 p-2 text-xs min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. On rooftop of shop. Blocked by 3-storey building."
                  value={slotNotes} onChange={e => setSlotNotes(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {selectedSlot.status !== "placed" && (
                  <Button size="sm" className="w-full gap-1.5 bg-success hover:bg-success/90" disabled={savingSlot}
                    onClick={() => updateSlot(selectedSlot.id, "placed", true)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {myLoc ? "Mark Placed (record GPS)" : "Mark Placed"}
                  </Button>
                )}
                {selectedSlot.status !== "blocked" && (
                  <Button size="sm" variant="outline" disabled={savingSlot}
                    className="w-full gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => updateSlot(selectedSlot.id, "blocked")}>
                    <X className="h-3.5 w-3.5" />Mark Blocked
                  </Button>
                )}
                {selectedSlot.status !== "skipped" && selectedSlot.status !== "placed" && (
                  <Button size="sm" variant="ghost" className="w-full gap-1.5 text-xs" disabled={savingSlot}
                    onClick={() => updateSlot(selectedSlot.id, "skipped")}>
                    <Flag className="h-3.5 w-3.5" />Skip
                  </Button>
                )}
                {(selectedSlot.status === "blocked" || selectedSlot.status === "skipped" || selectedSlot.status === "placed") && (
                  <Button size="sm" variant="ghost" className="w-full text-xs" disabled={savingSlot}
                    onClick={() => updateSlot(selectedSlot.id, "recommended")}>
                    Reset to Empty
                  </Button>
                )}
                {savingSlot && <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}
              </div>

              {selectedSlot.status === "placed" && (
                <div className="rounded-lg border border-success/25 bg-success/5 p-3 space-y-1">
                  <p className="text-[10px] font-semibold text-success">Placed ✓</p>
                  {selectedSlot.placed_lat && (
                    <p className="text-[10px] font-mono text-muted-foreground">GPS: {selectedSlot.placed_lat.toFixed(6)}, {selectedSlot.placed_lng?.toFixed(6)}</p>
                  )}
                  {selectedSlot.placed_at && <p className="text-[10px] text-muted-foreground">{new Date(selectedSlot.placed_at).toLocaleString()}</p>}
                  {selectedSlot.placed_lat && config && (
                    <p className="text-[10px] text-muted-foreground">
                      Offset: {Math.round(haversineM(selectedSlot.lat, selectedSlot.lng, selectedSlot.placed_lat!, selectedSlot.placed_lng!))}m from recommended
                    </p>
                  )}
                  {selectedSlot.notes && <p className="text-[10px] italic text-muted-foreground">"{selectedSlot.notes}"</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Legend ── */}
        <div className="flex-shrink-0 px-6 py-2 border-t border-border">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground items-center">
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full border-2 border-white/50 inline-block" style={{ background: c }} />
                {STATUS_LABEL[s as keyof typeof STATUS_LABEL]}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />Gateway node</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse inline-block" />Your GPS</span>
            <span className="text-muted-foreground/50">· Dashed circle = deviation tolerance · Dashed ring = reveal radius</span>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default MeshPlannerPage;
