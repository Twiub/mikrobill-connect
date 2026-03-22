// @ts-nocheck
/**
 * src/pages/CoverageMapPage.tsx  — v3.4.0
 *
 * Admin coverage map — enhanced with live subscriber pins showing
 * router-measured throughput colour coding and click-through contact info.
 *
 * Pin colour = throughput utilisation relative to package allocation.
 * Source: qosMonitor byte-delta on MikroTik queue tree — no speed test,
 * zero bandwidth consumed, data already collected every 30 seconds.
 *
 *   green  — using ≥20% of package speed (actively downloading)
 *   yellow — using 5–20% (light use, browsing, background sync)
 *   red    — using <5%   (near-zero despite being connected — possible issue)
 *   grey   — no throughput data in window (idle or no queue data yet)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Wifi, AlertTriangle, RefreshCw, Radio, Users, Activity, Phone, ArrowDown, ArrowUp } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface HeatPoint  { lat: number; lng: number; weight: number }
interface RouterPin  { id: number; name: string; ip_address: string; lat: number | null; lng: number | null; status: string; active_users: number; cpu_load: number }
interface APPin      { mac: string; name: string; lat: number; lng: number; online: boolean; active_clients: number; last_contact: string }
interface OutageZone { lat: number; lng: number; historical_count: number }

interface SubscriberPin {
  subscriber_id: string;
  lat: number; lng: number;
  accuracy_m: number | null;
  recorded_at: string;
  username: string;
  full_name: string | null;
  phone: string;
  subscriber_status: string;
  expires_at: string | null;
  package_name: string | null;
  package_speed_down: string | null;
  package_speed_up: string | null;
  router_name: string | null;
  // Router-measured throughput (from qosMonitor byte-delta, no speed test)
  peak_down_mbps: number | null;
  peak_up_mbps: number | null;
  throughput_zone: "good" | "average" | "poor" | "unknown";
}

interface CoverageData { locations: HeatPoint[]; routers: RouterPin[]; aps: APPin[]; outageZones: OutageZone[] }
interface PinsData { pins: SubscriberPin[]; count: number; windowMins: number }

// ── Constants ────────────────────────────────────────────────────────────────

const HOUR_OPTIONS = [1, 6, 24, 72, 168] as const;
const PIN_WINDOWS  = [5, 15, 30, 60] as const;

const ZONE_COLOUR: Record<string, string> = {
  good:    "#22c55e",
  average: "#f59e0b",
  poor:    "#ef4444",
  unknown: "#94a3b8",
};

const ZONE_LABEL: Record<string, string> = {
  good:    "Active  (≥20% of package)",
  average: "Light use  (5–20%)",
  poor:    "Near-zero  (<5%)",
  unknown: "Idle / no data",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtPhone(phone: string): string {
  const c = phone.replace(/\D/g, "");
  if (c.startsWith("0") && c.length === 10) return "+254" + c.slice(1);
  if (c.startsWith("254") && c.length === 12) return "+" + c;
  return phone;
}

function fmtMbps(mbps: number | null): string {
  if (mbps === null || mbps === 0) return "—";
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbps`;
  return `${mbps.toFixed(1)} Mbps`;
}

// ── Component ────────────────────────────────────────────────────────────────

const CoverageMapPage = () => {
  const mapRef      = useRef<HTMLDivElement>(null);
  const leafletMap  = useRef<any>(null);
  const heatLayer   = useRef<any>(null);
  const markerGroup = useRef<any>(null);
  const pinGroup    = useRef<any>(null);

  const [data,        setData]        = useState<CoverageData | null>(null);
  const [pinsData,    setPinsData]    = useState<PinsData | null>(null);
  const [hours,       setHours]       = useState(24);
  const [pinWindow,   setPinWindow]   = useState(30);
  const [loading,     setLoading]     = useState(false);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [lastFetch,   setLastFetch]   = useState<Date | null>(null);
  const [layers,      setLayers]      = useState({ heatmap: true, routers: true, aps: true, outages: true, pins: true });
  const [selected,    setSelected]    = useState<SubscriberPin | null>(null);

  // ── Load Leaflet ──────────────────────────────────────────────────────────
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
      .then(() => loadScript("https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js", "leaflet-heat-js"))
      .then(() => initMap())
      .catch(e => console.error("Leaflet load failed", e));
    return () => { leafletMap.current?.remove(); leafletMap.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initMap() {
    const L = (window as any).L;
    if (!mapRef.current || !L || leafletMap.current) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([-1.2921, 36.8219], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19,
    }).addTo(map);
    markerGroup.current = L.layerGroup().addTo(map);
    pinGroup.current    = L.layerGroup().addTo(map);
    leafletMap.current  = map;
    fetchData(); fetchPins();
  }

  // ── Data fetchers ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/coverage-map?hours=${hours}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const j: CoverageData = await r.json();
      setData(j); setLastFetch(new Date()); renderStatic(j);
    } catch (err) { console.error("[CoverageMap] fetchData error:", err); } finally { setLoading(false); }
  }, [hours]); // eslint-disable-line

  const fetchPins = useCallback(async () => {
    setPinsLoading(true);
    try {
      const r = await fetch(`/api/admin/subscriber-pins?minutes=${pinWindow}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const j: PinsData = await r.json();
      setPinsData(j); renderPins(j.pins);
    } catch (err) { console.error("[CoverageMap] fetchPins error:", err); } finally { setPinsLoading(false); }
  }, [pinWindow]); // eslint-disable-line

  useEffect(() => { if (leafletMap.current) fetchData(); }, [hours]);    // eslint-disable-line
  useEffect(() => { if (leafletMap.current) fetchPins(); }, [pinWindow]); // eslint-disable-line

  // Auto-refresh pins every 2 min
  useEffect(() => {
    const id = setInterval(() => { if (leafletMap.current && layers.pins) fetchPins(); }, 120_000);
    return () => clearInterval(id);
  }, [layers.pins, fetchPins]);

  // ── Render heatmap + router/AP/outage ─────────────────────────────────────
  function renderStatic(d: CoverageData) {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    heatLayer.current?.remove();
    markerGroup.current?.clearLayers();
    if (layers.heatmap && d.locations.length) {
      const pts = d.locations.map(p => [p.lat, p.lng, Math.min(p.weight / 10, 1)]);
      heatLayer.current = (L as any).heatLayer(pts, {
        radius: 25, blur: 15, maxZoom: 17, max: 1.0,
        gradient: { 0.2: "#3b82f6", 0.5: "#22c55e", 0.8: "#f59e0b", 1.0: "#ef4444" },
      }).addTo(leafletMap.current);
    }
    if (layers.routers) {
      d.routers.filter(r => r.lat && r.lng).forEach(r => {
        const c = r.status === "online" ? "#22c55e" : "#ef4444";
        L.circleMarker([r.lat, r.lng], { radius: 14, color: c, fillColor: c, fillOpacity: 0.85, weight: 2 })
          .bindPopup(`<b>🔴 ${r.name}</b><br>IP: ${r.ip_address}<br>Status: <b>${r.status}</b><br>Active: ${r.active_users} | CPU: ${r.cpu_load}%`)
          .addTo(markerGroup.current);
      });
    }
    if (layers.aps) {
      d.aps.forEach(ap => {
        const c = ap.online ? "#8b5cf6" : "#6b7280";
        L.circleMarker([ap.lat, ap.lng], { radius: 9, color: c, fillColor: c, fillOpacity: 0.75, weight: 2 })
          .bindPopup(`<b>📡 ${ap.name}</b><br>MAC: <code>${ap.mac}</code><br>${ap.online ? "Online" : "Offline"} · ${ap.active_clients} clients`)
          .addTo(markerGroup.current);
      });
    }
    if (layers.outages) {
      d.outageZones.forEach(z => {
        L.circle([z.lat, z.lng], { radius: 200, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.2, weight: 1, dashArray: "4" })
          .bindPopup(`<b>⚠️ Possible Outage Zone</b><br>Historical: ${z.historical_count} connections<br>No recent activity (2h+)`)
          .addTo(markerGroup.current);
      });
    }
  }

  // ── Render subscriber live pins ───────────────────────────────────────────
  function renderPins(pins: SubscriberPin[]) {
    const L = (window as any).L;
    if (!L || !leafletMap.current) return;
    pinGroup.current?.clearLayers();
    if (!layers.pins) return;

    pins.forEach(pin => {
      const col   = ZONE_COLOUR[pin.throughput_zone];
      const phone = fmtPhone(pin.phone);
      const name  = pin.full_name || pin.username;
      const downTxt = fmtMbps(pin.peak_down_mbps);
      const upTxt   = fmtMbps(pin.peak_up_mbps);

      const popup = `
        <div style="font-family:system-ui,sans-serif;min-width:200px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <span style="width:10px;height:10px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0"></span>
            <b>${name}</b>
          </div>
          <div style="overflow-x:auto"><table style="font-size:11px;border-collapse:collapse;width:100%">
            <tr><td style="color:#64748b;padding:2px 8px 2px 0">Phone</td>
                <td><a href="tel:${phone}" style="color:#3b82f6">${phone}</a>
                    &nbsp;·&nbsp;
                    <a href="https://wa.me/${phone.replace("+","")}" target="_blank" style="color:#25d366">WA</a>
                </td></tr>
            <tr><td style="color:#64748b;padding:2px 8px 2px 0">Package</td><td>${pin.package_name ?? "—"}</td></tr>
            <tr><td style="color:#64748b;padding:2px 8px 2px 0">↓ Peak down</td>
                <td><b style="color:${col}">${downTxt}</b></td></tr>
            <tr><td style="color:#64748b;padding:2px 8px 2px 0">↑ Peak up</td>
                <td><b style="color:${col}">${upTxt}</b></td></tr>
            <tr><td style="color:#64748b;padding:2px 8px 2px 0">Router</td><td>${pin.router_name ?? "—"}</td></tr>
            <tr><td style="color:#64748b;padding:2px 8px 2px 0">Seen</td><td>${relativeTime(pin.recorded_at)}</td></tr>
          </table></div>
          <p style="font-size:10px;color:#94a3b8;margin-top:6px">
            Speed from router queue measurement — no speed test
          </p>
        </div>`;

      L.circleMarker([pin.lat, pin.lng], {
        radius: 9, color: col, weight: 3, fillColor: "#ffffff", fillOpacity: 0.95,
      })
        .bindPopup(popup, { maxWidth: 280 })
        .on("click", () => setSelected(pin))
        .addTo(pinGroup.current);
    });
  }

  useEffect(() => { if (data)     renderStatic(data);       }, [layers.heatmap, layers.routers, layers.aps, layers.outages]); // eslint-disable-line
  useEffect(() => { if (pinsData) renderPins(pinsData.pins); }, [layers.pins]); // eslint-disable-line

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalReports  = data?.locations.reduce((s, p) => s + p.weight, 0) ?? 0;
  const onlineRouters = data?.routers.filter(r => r.status === "online").length ?? 0;
  const onlineAPs     = data?.aps.filter(a => a.online).length ?? 0;
  const outageCount   = data?.outageZones.length ?? 0;
  const pinCount      = pinsData?.count ?? 0;
  const poorPins      = pinsData?.pins.filter(p => p.throughput_zone === "poor").length ?? 0;

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Coverage Map</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live subscriber pins · Heatmap · Routers & APs · Outage detection
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Heatmap:</span>
              {HOUR_OPTIONS.map(h => (
                <Button key={h} variant={hours === h ? "default" : "outline"} size="sm"
                  className="text-xs h-7 px-2" onClick={() => setHours(h)}>
                  {h < 24 ? `${h}h` : `${h / 24}d`}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Pins:</span>
              {PIN_WINDOWS.map(m => (
                <Button key={m} variant={pinWindow === m ? "default" : "outline"} size="sm"
                  className="text-xs h-7 px-2" onClick={() => setPinWindow(m)}>
                  {m}m
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs"
              onClick={() => { fetchData(); fetchPins(); }} disabled={loading || pinsLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${(loading || pinsLoading) ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap gap-3">
          <div className="glass-card px-4 py-2.5 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-500" />
            <span className="text-xs text-muted-foreground">Live pins</span>
            <span className="text-sm font-bold">{pinCount}</span>
            {poorPins > 0 && <Badge variant="destructive" className="text-xs">{poorPins} poor</Badge>}
          </div>
          <div className="glass-card px-4 py-2.5 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Heat reports</span>
            <span className="text-sm font-bold">{totalReports.toLocaleString()}</span>
          </div>
          <div className="glass-card px-4 py-2.5 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground">Routers</span>
            <span className="text-sm font-bold">{onlineRouters}/{data?.routers.length ?? 0}</span>
          </div>
          <div className="glass-card px-4 py-2.5 flex items-center gap-2">
            <Radio className="h-4 w-4 text-violet-500" />
            <span className="text-xs text-muted-foreground">APs</span>
            <span className="text-sm font-bold">{onlineAPs}/{data?.aps.length ?? 0}</span>
          </div>
          {outageCount > 0 && (
            <div className="glass-card px-4 py-2.5 flex items-center gap-2 border-destructive/30">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Outage zones</span>
              <Badge variant="destructive" className="text-xs">{outageCount}</Badge>
            </div>
          )}
          {lastFetch && (
            <div className="glass-card px-4 py-2.5 text-xs text-muted-foreground">
              Updated {lastFetch.toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Layer toggles */}
        <div className="flex flex-wrap gap-2">
          {([
            { k: "pins" as const,    label: "📍 Live Pins" },
            { k: "heatmap" as const, label: "🔥 Heatmap" },
            { k: "routers" as const, label: "🔴 Routers" },
            { k: "aps" as const,     label: "📡 Access Points" },
            { k: "outages" as const, label: "⚠️ Outage Zones" },
          ]).map(({ k, label }) => (
            <Button key={k} size="sm" variant={layers[k] ? "default" : "outline"}
              className="text-xs h-7"
              onClick={() => setLayers(l => ({ ...l, [k]: !l[k] }))}>
              {label}
            </Button>
          ))}
        </div>

        {/* Map + contact panel */}
        <div className="flex gap-4">
          <div className={`glass-card overflow-hidden ${selected ? "flex-1" : "w-full"}`}
            style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
            <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
          </div>

          {selected && (
            <div className="glass-card p-5 w-72 flex-shrink-0 space-y-4 overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 320px)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-base">{selected.full_name || selected.username}</h3>
                  <p className="text-xs text-muted-foreground">{selected.username}</p>
                </div>
                <button onClick={() => setSelected(null)}
                  className="text-muted-foreground hover:text-foreground text-xl leading-none px-1">×
                </button>
              </div>

              {/* Throughput card */}
              <div className="rounded-xl border border-border/50 p-3 space-y-2"
                style={{ background: ZONE_COLOUR[selected.throughput_zone] + "12" }}>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 flex-shrink-0"
                    style={{ color: ZONE_COLOUR[selected.throughput_zone] }} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Router-measured throughput
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-bold" style={{ color: ZONE_COLOUR[selected.throughput_zone] }}>
                      {fmtMbps(selected.peak_down_mbps)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-bold" style={{ color: ZONE_COLOUR[selected.throughput_zone] }}>
                      {fmtMbps(selected.peak_up_mbps)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {ZONE_LABEL[selected.throughput_zone]}
                  {selected.package_speed_down && (
                    <> · Package: {selected.package_speed_down}/{selected.package_speed_up}</>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  Peak in last {pinWindow}min · from queue byte-delta · no speed test
                </p>
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm">
                {([
                  ["Package",  selected.package_name ?? "—"],
                  ["Router",   selected.router_name ?? "—"],
                  ["Status",   selected.subscriber_status],
                  ["Expires",  selected.expires_at ? new Date(selected.expires_at).toLocaleDateString("en-KE") : "—"],
                  ["Last seen", relativeTime(selected.recorded_at)],
                  ["Accuracy", selected.accuracy_m ? `±${Math.round(selected.accuracy_m)} m` : "—"],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{val}</span>
                  </div>
                ))}
              </div>

              {/* Contact */}
              <div className="border-t border-border/40 pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
                <p className="text-sm font-mono">{fmtPhone(selected.phone)}</p>
                <div className="flex gap-2">
                  <a href={`tel:${fmtPhone(selected.phone)}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg
                               border border-border py-2 text-xs font-medium hover:bg-muted transition-colors">
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                  <a href={`https://wa.me/${fmtPhone(selected.phone).replace("+","")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg
                               bg-[#25d366] text-white py-2 text-xs font-medium hover:bg-[#1ebe5d] transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.558 4.115 1.535 5.838L.057 23.885l6.22-1.633A11.947 11.947 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.373l-.36-.214-3.712.976.989-3.622-.234-.371A9.818 9.818 0 012.182 12C2.182 6.576 6.576 2.182 12 2.182S21.818 6.576 21.818 12 17.424 21.818 12 21.818z"/>
                    </svg>
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pin colour — router-measured throughput (no speed test)</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {Object.entries(ZONE_COLOUR).map(([zone, color]) => (
              <div key={zone} className="flex items-center gap-1.5">
                <span style={{ display:"inline-block", width:12, height:12, borderRadius:"50%", border:`3px solid ${color}`, background:"white" }} />
                {ZONE_LABEL[zone]}
              </div>
            ))}
            <span className="text-border self-center">|</span>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-[#22c55e] opacity-80" />Router online</div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-[#ef4444] opacity-80" />Router offline</div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-full bg-[#8b5cf6] opacity-80" />AP online</div>
          </div>
          <p className="text-xs text-muted-foreground">
            📍 Pins auto-refresh every 2 min · Throughput = peak in selected window · Click any pin for contact
          </p>
        </div>
      </div>
    </AdminLayout>
  );
};

export default CoverageMapPage;
