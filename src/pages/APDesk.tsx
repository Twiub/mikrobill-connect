/**
 * frontend/src/pages/APDesk.jsx  — MikroBill Connect v3.10.21
 *
 * APdesk management UI — full rdcore feature parity:
 *  - AP Profile list with timezone / dead-after settings
 *  - Profile detail tabs:
 *      APs        — list APs, add (with contact phone + GPS/map/coord location + Internet Connect), reboot/reconfigure
 *      SSIDs      — add/remove SSID entries (hidden, client isolation, encryption, band)
 *      Exits      — add/remove exits (bridge_l2, bridge_l3, tagged_bridge, nat, captive_portal, pppoe_server)
 *      SSID↔Device — per-AP SSID override/disable (entry overrides)
 *      Node↔Device — assign hardware profile (node model) to each AP
 *      Node↔Node   — batman-adv mesh node associations for mesh-backed APs (real data)
 *  - Unknown AP claiming
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getToken } from "@/lib/authClient";

const API  = "/api/admin/apdesk";
const MESH = "/api/admin/meshdesk";

function _getAuthHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
async function apiFetch(base, url, opts = {}) {
  const h = await _getAuthHeader();
  return fetch(`${base}${url}`, { headers: { ...h }, ...opts });
}
async function apiJson(base, url, method, body) {
  const h = await _getAuthHeader();
  return fetch(`${base}${url}`, { method, headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status === "online" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>{status}</span>
);

const Card = ({ title, children, action }) => (
  <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
      <h3 className="font-semibold text-gray-700 text-sm">{title}</h3>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const Table = ({ cols, rows, onRow }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100">
          {cols.map(c => <th key={c.key} className="text-left py-2 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? i} onClick={() => onRow?.(row)} className={`border-b border-gray-50 hover:bg-blue-50 ${onRow ? "cursor-pointer" : ""}`}>
            {cols.map(c => <td key={c.key} className="py-2 px-3 text-gray-700">{c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "")}</td>)}
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={cols.length} className="py-6 text-center text-gray-400 text-xs">No records</td></tr>}
      </tbody>
    </table>
  </div>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} mx-4 max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
        <h2 className="font-bold text-gray-800">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const Field = ({ label, name, value, onChange, type = "text", options, placeholder, required, hint }) => (
  <div className="mb-4">
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && " *"}</label>
    {options ? (
      <select name={name} value={value ?? ""} onChange={onChange} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input type={type} name={name} value={value ?? ""} onChange={onChange} placeholder={placeholder} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
    )}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

// ── Location Picker — Manual / GPS / Map ──────────────────────────────────────

function LocationPicker({ lat, lon, onChange }) {
  const [method,   setMethod]   = useState("manual");
  const [gpsState, setGpsState] = useState("idle");   // idle|loading|done|error
  const [gpsError, setGpsError] = useState("");
  const mapRef     = useRef(null);
  const leafletMap = useRef(null);
  const markerRef  = useRef(null);

  const getGPS = () => {
    if (!navigator.geolocation) { setGpsError("Geolocation not supported by this browser"); return; }
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
      if (!window.L) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
          s.onload = res; s.onerror = rej; document.body.appendChild(s);
        });
      }
      const L = window.L;
      const iLat = lat ? parseFloat(lat) : -1.2921;
      const iLon = lon ? parseFloat(lon) : 36.8219;
      leafletMap.current = L.map(mapRef.current).setView([iLat, iLon], lat ? 15 : 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(leafletMap.current);
      if (lat && lon) {
        markerRef.current = L.marker([iLat, iLon], { draggable: true }).addTo(leafletMap.current);
        markerRef.current.on("dragend", () => { const p = markerRef.current.getLatLng(); onChange(p.lat.toFixed(6), p.lng.toFixed(6)); });
      }
      leafletMap.current.on("click", e => {
        const { lat: la, lng: lo } = e.latlng;
        onChange(la.toFixed(6), lo.toFixed(6));
        if (markerRef.current) { markerRef.current.setLatLng([la, lo]); }
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
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-600 mb-2">📍 Location</label>
      <div className="flex gap-1 mb-3">
        {["manual", "gps", "map"].map(m => (
          <button key={m} type="button" onClick={() => setMethod(m)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${method === m ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {m === "manual" && "✏ Manual"}{m === "gps" && "📍 GPS"}{m === "map" && "🗺 Map"}
          </button>
        ))}
      </div>

      {method === "manual" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Latitude</label>
            <input type="number" step="0.000001" placeholder="-1.292100" value={lat ?? ""} onChange={e => onChange(e.target.value, lon)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Longitude</label>
            <input type="number" step="0.000001" placeholder="36.821900" value={lon ?? ""} onChange={e => onChange(lat, e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
      )}

      {method === "gps" && (
        <div className="space-y-2">
          <button type="button" onClick={getGPS} disabled={gpsState === "loading"}
            className="w-full py-2 px-4 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 disabled:opacity-60 transition-colors">
            {gpsState === "loading" ? "⏳ Getting location…" : "📍 Use my current location"}
          </button>
          {gpsState === "done" && lat && (
            <p className="text-xs text-green-600 font-mono bg-green-50 px-3 py-1.5 rounded-lg">✓ {lat}, {lon}</p>
          )}
          {gpsState === "error" && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">Error: {gpsError}</p>
          )}
        </div>
      )}

      {method === "map" && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Click on the map to place a pin. Drag to adjust position.</p>
          <div ref={mapRef} style={{ height: 240, borderRadius: 8, border: "1px solid #e5e7eb" }} />
          {lat && lon && (
            <p className="text-xs text-gray-500 font-mono mt-1.5 bg-gray-50 px-3 py-1 rounded">📍 {lat}, {lon}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Internet connect fields ───────────────────────────────────────────────────

const GATEWAY_OPTIONS = [
  { value: "none",        label: "Auto Detect (default)" },
  { value: "wan_static",  label: "WAN — Static IP" },
  { value: "wan_pppoe",   label: "WAN — PPPoE" },
  { value: "wifi",        label: "WiFi Client (DHCP)" },
  { value: "wifi_pppoe",  label: "WiFi Client — PPPoE" },
  { value: "wifi_static", label: "WiFi Client — Static IP" },
  { value: "wifi_ent",    label: "WiFi Client — WPA-Enterprise" },
  { value: "qmi",         label: "LTE / 4G (QMI)" },
  { value: "mwan",        label: "Multi-WAN" },
];

function InternetConnectFields({ form, onChange }) {
  const fld = e => onChange(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const gw  = form.gateway || "none";
  return (
    <>
      <Field label="Internet Connection" name="gateway" value={gw} onChange={fld} options={GATEWAY_OPTIONS} />
      {gw === "wan_static" && (
        <div className="pl-4 border-l-2 border-blue-200">
          <Field label="WAN IP"      name="wan_static_ipaddr"  value={form.wan_static_ipaddr}  onChange={fld} placeholder="203.0.113.10" />
          <Field label="WAN Netmask" name="wan_static_netmask" value={form.wan_static_netmask || "255.255.255.0"} onChange={fld} />
          <Field label="WAN Gateway" name="wan_static_gateway" value={form.wan_static_gateway} onChange={fld} />
          <Field label="DNS 1"       name="wan_static_dns_1"   value={form.wan_static_dns_1}   onChange={fld} placeholder="8.8.8.8" />
        </div>
      )}
      {gw === "wan_pppoe" && (
        <div className="pl-4 border-l-2 border-blue-200">
          <Field label="PPPoE Username" name="wan_pppoe_username" value={form.wan_pppoe_username} onChange={fld} />
          <Field label="PPPoE Password" name="wan_pppoe_password" value={form.wan_pppoe_password} onChange={fld} type="password" />
        </div>
      )}
      {(gw === "wifi" || gw === "wifi_static" || gw === "wifi_pppoe" || gw === "wifi_ent") && (
        <div className="pl-4 border-l-2 border-blue-200">
          <Field label="Upstream SSID"     name="wbw_ssid"     value={form.wbw_ssid}     onChange={fld} />
          <Field label="Upstream Password" name="wbw_password" value={form.wbw_password} onChange={fld} type="password" />
          {gw === "wifi_static" && (
            <>
              <Field label="Static IP" name="wifi_static_ipaddr"  value={form.wifi_static_ipaddr}  onChange={fld} />
              <Field label="Netmask"   name="wifi_static_netmask" value={form.wifi_static_netmask || "255.255.255.0"} onChange={fld} />
              <Field label="Gateway"   name="wifi_static_gateway" value={form.wifi_static_gateway} onChange={fld} />
            </>
          )}
        </div>
      )}
      {gw === "qmi" && (
        <div className="pl-4 border-l-2 border-blue-200">
          <Field label="APN"      name="qmi_apn"     value={form.qmi_apn}     onChange={fld} placeholder="internet" />
          <Field label="PIN Code" name="qmi_pincode" value={form.qmi_pincode} onChange={fld} />
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SSID ↔ DEVICE  (per-AP entry overrides)
// ═══════════════════════════════════════════════════════════════════════════

function SsidDeviceTab({ profile }) {
  const aps     = profile.aps     || [];
  const entries = profile.entries || [];
  const [overrides, setOverrides] = useState({});
  const [loading,   setLoading]   = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const map = {};
    await Promise.all(aps.map(async ap => {
      const r = await apiFetch(API, `/aps/${ap.id}/entry-overrides`);
      const d = await r.json();
      map[ap.id] = {};
      (d.data || []).forEach(o => { map[ap.id][o.entry_id] = o; });
    }));
    setOverrides(map);
    setLoading(false);
  }, [aps]);

  useEffect(() => { if (aps.length) loadAll(); else setLoading(false); }, [loadAll]);

  const toggle = async (apId, entryId, currentlyDisabled) => {
    await apiJson(API, `/aps/${apId}/entry-overrides/${entryId}`, "PUT", { disabled: !currentlyDisabled });
    loadAll();
  };

  if (loading) return <div className="text-gray-400 text-sm py-4">Loading…</div>;
  if (!aps.length) return <div className="text-gray-400 text-sm py-4">No APs in this profile yet.</div>;
  if (!entries.length) return <div className="text-gray-400 text-sm py-4">No SSID entries yet. Add SSIDs first.</div>;

  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-gray-500 mb-3">Toggle which SSIDs are active on each AP. Green = active; Grey = disabled on this AP only.</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 border-b">AP</th>
            {entries.map(e => (
              <th key={e.id} className="py-2 px-3 text-xs font-medium text-gray-500 border-b text-center">{e.ssid || e.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aps.map(ap => (
            <tr key={ap.id} className="border-b border-gray-50 hover:bg-blue-50">
              <td className="py-2 px-3">
                <div className="font-medium text-gray-800 text-xs">{ap.name}</div>
                <div className="text-gray-400 text-xs font-mono">{ap.mac}</div>
              </td>
              {entries.map(entry => {
                const ov     = (overrides[ap.id] || {})[entry.id];
                const active = !(ov?.disabled);
                return (
                  <td key={entry.id} className="py-2 px-3 text-center">
                    <button onClick={() => toggle(ap.id, entry.id, !active)}
                      className={`w-10 h-5 rounded-full transition-colors ${active ? "bg-green-500" : "bg-gray-300"}`}
                      title={active ? "Active — click to disable" : "Disabled — click to enable"}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${active ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE ↔ DEVICE  (assign hardware model to AP)
// ═══════════════════════════════════════════════════════════════════════════

function NodeDeviceTab({ profile }) {
  const aps = profile.aps || [];
  const [hardwares, setHardwares] = useState([]);
  const [saving,    setSaving]    = useState({});

  useEffect(() => {
    apiFetch(MESH, "/hardwares").then(r => r.json()).then(d => setHardwares(d.data || []));
  }, []);

  const assignHardware = async (apId, hardwareId) => {
    setSaving(s => ({ ...s, [apId]: true }));
    await apiJson(API, `/aps/${apId}`, "PATCH", { hardware: hardwareId || null });
    setSaving(s => ({ ...s, [apId]: false }));
  };

  if (!aps.length) return <div className="text-gray-400 text-sm py-4">No APs in this profile yet.</div>;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">Assign a hardware model to each AP. The firmware config builder uses this to set correct radio capabilities, TX power limits, and channel widths.</p>
      <div className="space-y-2">
        {aps.map(ap => (
          <div key={ap.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-800">{ap.name}</div>
              <div className="text-xs text-gray-400 font-mono">{ap.mac}</div>
            </div>
            <div className="w-64">
              <select defaultValue={ap.hardware || ""} onChange={e => assignHardware(ap.id, e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">— Generic (no hardware profile) —</option>
                {hardwares.map(hw => <option key={hw.id} value={hw.id}>{hw.name}</option>)}
              </select>
            </div>
            {saving[ap.id] && <span className="text-xs text-blue-500">Saving…</span>}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">Hardware models are managed in <strong>Networks → Hardware Models</strong>.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE ↔ NODE  (link APs to mesh nodes — real data, live topology badges)
// ═══════════════════════════════════════════════════════════════════════════

function NodeNodeTab({ profile }) {
  const aps = profile.aps || [];
  const [meshNodes, setMeshNodes] = useState([]);
  const [assoc,     setAssoc]     = useState({});   // apId → mesh_node_id
  const [saving,    setSaving]    = useState({});
  const [meshes,    setMeshes]    = useState([]);
  const [topo,      setTopo]      = useState({});   // meshId → { nodes, neighbors }

  useEffect(() => {
    apiFetch(MESH, "/meshes").then(r => r.json()).then(d => {
      const ms = d.data || [];
      setMeshes(ms);
      // Load all nodes from all meshes
      Promise.all(ms.map(m =>
        apiFetch(MESH, `/meshes/${m.id}/nodes`).then(r => r.json()).then(d =>
          (d.data || []).map(n => ({ ...n, mesh_name: m.name }))
        )
      )).then(arrays => setMeshNodes(arrays.flat()));
      // Load topology for each mesh
      ms.forEach(m => {
        apiFetch(MESH, `/meshes/${m.id}/topology`).then(r => r.json()).then(d => {
          if (d.data) setTopo(t => ({ ...t, [m.id]: d.data }));
        }).catch(() => {});
      });
    });
    // Seed current associations from AP data
    const seed = {};
    aps.forEach(ap => { if (ap.mesh_node_id) seed[ap.id] = ap.mesh_node_id; });
    setAssoc(seed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async (apId, meshNodeId) => {
    setSaving(s => ({ ...s, [apId]: true }));
    await apiJson(API, `/aps/${apId}`, "PATCH", { mesh_node_id: meshNodeId ? parseInt(meshNodeId) : null });
    setAssoc(a => ({ ...a, [apId]: meshNodeId }));
    setSaving(s => ({ ...s, [apId]: false }));
  };

  const getTQ = (apId) => {
    // Find the mesh node linked to this AP and get its best TQ from topology
    const nodeId = assoc[apId];
    if (!nodeId) return null;
    const node = meshNodes.find(n => n.id === parseInt(nodeId));
    if (!node) return null;
    let bestTQ = null;
    Object.values(topo).forEach(t => {
      (t.neighbors || []).forEach(e => {
        if (e.node_id === node.id) {
          if (bestTQ === null || e.tq > bestTQ) bestTQ = e.tq;
        }
      });
    });
    return bestTQ;
  };

  if (!aps.length) return <div className="text-gray-400 text-sm py-4">No APs in this profile yet.</div>;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Link each AP to a specific mesh node. Use this when APs are co-located with or connected to a MESHdesk
        mesh node — enables combined status monitoring and batman-adv TQ link quality display.
      </p>
      <div className="space-y-2">
        {aps.map(ap => {
          const tq = getTQ(ap.id);
          const tqPct = tq !== null ? Math.round((tq / 255) * 100) : null;
          const tqColor = tqPct === null ? "" : tqPct >= 70 ? "text-green-600" : tqPct >= 40 ? "text-yellow-600" : "text-red-600";
          return (
            <div key={ap.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-sm text-gray-800">{ap.name}</div>
                  <StatusBadge status={ap.status || "offline"} />
                  {tqPct !== null && (
                    <span className={`text-xs font-mono font-semibold ${tqColor}`} title="batman-adv TQ link quality">
                      TQ {tq} ({tqPct}%)
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 font-mono">{ap.mac}</div>
                {ap.contact_phone && <div className="text-xs text-gray-500 mt-0.5">📞 {ap.contact_phone}</div>}
                {ap.lat && <div className="text-xs text-gray-500 font-mono mt-0.5">📍 {ap.lat?.toFixed(4)}, {ap.lon?.toFixed(4)}</div>}
              </div>
              <div className="w-72">
                <select value={assoc[ap.id] || ""} onChange={e => link(ap.id, e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— Not linked to a mesh node —</option>
                  {meshes.map(m => (
                    <optgroup key={m.id} label={`Mesh: ${m.name}`}>
                      {meshNodes.filter(n => n.mesh_id === m.id).map(n => (
                        <option key={n.id} value={n.id}>{n.name} ({n.mac})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {saving[ap.id] && <span className="text-xs text-blue-500">Saving…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AP PROFILE DETAIL
// ═══════════════════════════════════════════════════════════════════════════

function ProfileDetail({ profile: initialProfile, onBack }) {
  const [profile,       setProfile]       = useState(initialProfile);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showExitForm,  setShowExitForm]  = useState(false);
  const [showApForm,    setShowApForm]    = useState(false);
  const [form,          setForm]          = useState({});
  const [tab,           setTab]           = useState("aps");
  // AP location picker state stored in form as form.lat / form.lon

  const reload = useCallback(() => {
    apiFetch(API, `/profiles/${initialProfile.id}`)
      .then(r => r.json()).then(d => { if (d.data) setProfile(d.data); });
  }, [initialProfile.id]);

  useEffect(() => { reload(); }, [reload]);

  const fld = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const saveEntry = async () => {
    await apiJson(API, `/profiles/${profile.id}/entries`, "POST", form);
    setShowEntryForm(false); setForm({}); reload();
  };
  const saveExit = async () => {
    await apiJson(API, `/profiles/${profile.id}/exits`, "POST", form);
    setShowExitForm(false); setForm({}); reload();
  };
  const saveAp = async () => {
    await apiJson(API, "/aps", "POST", {
      ...form,
      ap_profile_id: profile.id,
      lat: form.lat ? parseFloat(form.lat) : null,
      lon: form.lon ? parseFloat(form.lon) : null,
    });
    setShowApForm(false); setForm({}); reload();
  };

  const deleteEntry = async id => { if (!confirm("Delete this SSID entry?")) return; await apiFetch(API, `/entries/${id}`, { method: "DELETE" }); reload(); };
  const deleteExit  = async id => { if (!confirm("Delete this exit?")) return;       await apiFetch(API, `/exits/${id}`,   { method: "DELETE" }); reload(); };
  const deleteAp    = async id => { if (!confirm("Delete this AP?")) return;         await apiFetch(API, `/aps/${id}`,     { method: "DELETE" }); reload(); };
  const queueAction = async (apId, action) => {
    await apiJson(API, `/aps/${apId}/actions`, "POST", { action });
    alert(`Action '${action}' queued — AP will execute on next heartbeat (~120s)`);
  };

  const TABS = [
    { id: "aps",         label: "APs",           count: (profile.aps     || []).length },
    { id: "entries",     label: "SSIDs",          count: (profile.entries || []).length },
    { id: "exits",       label: "Exits" },
    { id: "ssid_device", label: "SSID ↔ Device" },
    { id: "node_device", label: "Node ↔ Device" },
    { id: "node_node",   label: "Node ↔ Node" },
  ];

  const ago = dt => {
    if (!dt) return "Never";
    const s = Math.floor((Date.now() - new Date(dt).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
  };

  return (
    <div>
      <button onClick={onBack} className="text-blue-600 text-sm mb-4 hover:underline">← All Profiles</button>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-bold text-gray-800">{profile.name}</h2>
        <span className="text-xs text-gray-400">{profile.ap_count} APs · {profile.aps_up} online</span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{profile.timezone}</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px ${tab === t.id ? "bg-white border-l border-r border-t text-blue-600 border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
            {t.count !== undefined && <span className="ml-1 bg-gray-100 text-gray-600 rounded-full px-1.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── APs tab ── */}
      {tab === "aps" && (
        <Card title="Access Points in this Profile"
          action={<button onClick={() => { setShowApForm(true); setForm({}); }} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-blue-700">+ Add AP</button>}>
          <Table cols={[
            { key: "name",   label: "Name" },
            { key: "mac",    label: "MAC",    render: v => <span className="font-mono text-xs">{v}</span> },
            { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            { key: "contact_phone", label: "Contact", render: v => v ? <span className="text-xs">📞 {v}</span> : <span className="text-gray-300 text-xs">—</span> },
            { key: "lat",    label: "Location", render: (v, row) => v ? <span className="font-mono text-xs text-gray-500">📍 {parseFloat(v).toFixed(3)},{parseFloat(row.lon).toFixed(3)}</span> : <span className="text-gray-300 text-xs">—</span> },
            { key: "last_contact", label: "Last Contact", render: v => <span className="text-xs">{ago(v)}</span> },
            { key: "id", label: "", render: (_, row) => (
              <div className="flex gap-1 whitespace-nowrap">
                <button onClick={e => { e.stopPropagation(); queueAction(row.id, "reboot"); }}       className="text-xs text-orange-500 hover:underline">Reboot</button>
                <button onClick={e => { e.stopPropagation(); queueAction(row.id, "reconfigure"); }} className="text-xs text-blue-500 hover:underline ml-2">Reconfig</button>
                <button onClick={e => { e.stopPropagation(); deleteAp(row.id); }}                   className="text-xs text-red-500 hover:underline ml-2">Delete</button>
              </div>
            )},
          ]} rows={profile.aps || []} />
        </Card>
      )}

      {/* ── SSIDs (entries) tab ── */}
      {tab === "entries" && (
        <Card title="SSID Entries — Wireless Networks Broadcast by APs"
          action={<button onClick={() => { setShowEntryForm(true); setForm({}); }} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-blue-700">+ Add SSID</button>}>
          <Table cols={[
            { key: "ssid",           label: "SSID" },
            { key: "encryption",     label: "Encryption" },
            { key: "frequency_band", label: "Band" },
            { key: "hidden",         label: "Hidden",  render: v => v ? "✓" : "" },
            { key: "isolate",        label: "Isolate", render: v => v ? "✓" : "" },
            { key: "accounting",     label: "Acct.",   render: v => v ? "Yes" : "No" },
            { key: "auth_server",    label: "RADIUS IP", render: v => v || <span className="text-gray-400 text-xs italic">System default</span> },
            { key: "id", label: "", render: (_, row) => <button onClick={() => deleteEntry(row.id)} className="text-xs text-red-500 hover:underline">Delete</button> },
          ]} rows={profile.entries || []} />
        </Card>
      )}

      {/* ── Exits tab ── */}
      {tab === "exits" && (
        <Card title="Exits — How APs Connect SSIDs to the Network"
          action={<button onClick={() => { setShowExitForm(true); setForm({}); }} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-blue-700">+ Add Exit</button>}>
          <Table cols={[
            { key: "name",  label: "Name" },
            { key: "type",  label: "Type", render: v => {
              const c = { bridge: "bg-green-100 text-green-700", bridge_l2: "bg-green-100 text-green-700", bridge_l3: "bg-teal-100 text-teal-700", tagged_bridge: "bg-emerald-100 text-emerald-700", captive_portal: "bg-orange-100 text-orange-700", nat: "bg-purple-100 text-purple-700", pppoe_server: "bg-pink-100 text-pink-700" };
              return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c[v] || "bg-gray-100 text-gray-600"}`}>{v}</span>;
            }},
            { key: "proto",  label: "Proto" },
            { key: "id",     label: "", render: (_, row) => <button onClick={() => deleteExit(row.id)} className="text-xs text-red-500 hover:underline">Delete</button> },
          ]} rows={profile.exits || []} />
          <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-800 space-y-1">
            <p><strong>Bridge L2:</strong> APs bridge SSID traffic to LAN — DLNA works across all devices.</p>
            <p><strong>Bridge L3:</strong> Routed bridge — separate subnet, inter-VLAN routing.</p>
            <p><strong>Captive Portal:</strong> CoovaChilli authenticates via mikrobill FreeRADIUS.</p>
            <p><strong>NAT:</strong> AP shares its uplink via NAT — clients get private IPs.</p>
          </div>
        </Card>
      )}

      {/* ── SSID ↔ Device ── */}
      {tab === "ssid_device" && (
        <Card title="SSID ↔ Device — Per-AP SSID Assignment">
          <SsidDeviceTab profile={profile} />
        </Card>
      )}

      {/* ── Node ↔ Device ── */}
      {tab === "node_device" && (
        <Card title="Node ↔ Device — Hardware Model Assignment">
          <NodeDeviceTab profile={profile} />
        </Card>
      )}

      {/* ── Node ↔ Node ── */}
      {tab === "node_node" && (
        <Card title="Node ↔ Node — Mesh Node Association (live batman-adv TQ)">
          <NodeNodeTab profile={profile} />
        </Card>
      )}

      {/* ── Add SSID modal ── */}
      {showEntryForm && (
        <Modal title="Add SSID Entry" onClose={() => { setShowEntryForm(false); setForm({}); }}>
          <Field label="SSID (network name)" name="ssid" value={form.ssid} onChange={fld} required />
          <Field label="Display Name / Label" name="name" value={form.name} onChange={fld} />
          <Field label="Encryption" name="encryption" value={form.encryption || "none"} onChange={fld}
            options={[
              { value: "none",  label: "Open (no password)" },
              { value: "psk",   label: "WPA-PSK" },
              { value: "psk2",  label: "WPA2-PSK" },
              { value: "psk2+ccmp", label: "WPA2-PSK + CCMP" },
              { value: "wpa",   label: "WPA-Enterprise (RADIUS)" },
              { value: "wpa2",  label: "WPA2-Enterprise (RADIUS)" },
            ]} />
          {(form.encryption === "psk" || form.encryption === "psk2" || form.encryption === "psk2+ccmp") && (
            <Field label="WiFi Password" name="key" value={form.key} onChange={fld} />
          )}
          {(form.encryption === "wpa" || form.encryption === "wpa2") && (
            <>
              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 mb-3">Leave RADIUS IP blank to auto-use mikrobill's built-in FreeRADIUS server.</div>
              <Field label="RADIUS IP (blank = auto)" name="auth_server" value={form.auth_server} onChange={fld} placeholder="e.g. 192.168.1.10" />
              <Field label="RADIUS Secret" name="auth_secret" value={form.auth_secret || "testing123"} onChange={fld} />
            </>
          )}
          <Field label="Frequency Band" name="frequency_band" value={form.frequency_band || "both"} onChange={fld}
            options={[
              { value: "both",       label: "Both 2.4 GHz + 5 GHz" },
              { value: "two",        label: "2.4 GHz only" },
              { value: "five",       label: "5 GHz only" },
              { value: "five_upper", label: "5 GHz upper band" },
              { value: "five_lower", label: "5 GHz lower band" },
            ]} />
          <div className="flex flex-wrap gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.hidden || false} onChange={e => setForm(p => ({ ...p, hidden: e.target.checked }))} />
              Hidden SSID
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isolate || false} onChange={e => setForm(p => ({ ...p, isolate: e.target.checked }))} />
              Client Isolation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.accounting !== false} onChange={e => setForm(p => ({ ...p, accounting: e.target.checked }))} />
              RADIUS Accounting
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setShowEntryForm(false); setForm({}); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={saveEntry} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add SSID</button>
          </div>
        </Modal>
      )}

      {/* ── Add Exit modal ── */}
      {showExitForm && (
        <Modal title="Add Exit" onClose={() => { setShowExitForm(false); setForm({}); }}>
          <Field label="Exit Name" name="name" value={form.name || "exit1"} onChange={fld} />
          <Field label="Exit Type" name="type" value={form.type || "bridge_l2"} onChange={fld}
            options={[
              { value: "bridge_l2",      label: "Bridge L2 — Layer 2 (DLNA-friendly, recommended)" },
              { value: "bridge_l3",      label: "Bridge L3 — Layer 3 (routed bridge)" },
              { value: "tagged_bridge",  label: "Tagged Bridge (VLAN trunk)" },
              { value: "nat",            label: "NAT — share uplink" },
              { value: "captive_portal", label: "Captive Portal — mikrobill RADIUS" },
              { value: "pppoe_server",   label: "PPPoE Server" },
            ]} />

          {(form.type === "bridge_l2" || !form.type) && (
            <div className="p-3 bg-green-50 rounded-lg text-xs text-green-700 mb-3">
              <strong>Bridge L2</strong> connects the SSID directly to the wired LAN. MikroTik, APs, and all clients share the same L2 — DLNA works across everything.
            </div>
          )}
          {form.type === "bridge_l3" && (
            <div className="p-3 bg-teal-50 rounded-lg text-xs text-teal-700 mb-3">
              <strong>Bridge L3</strong> creates a routed bridge on a separate subnet. Clients get a separate IP pool. Inter-VLAN routing is handled upstream.
            </div>
          )}

          {form.type === "captive_portal" && (
            <>
              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 mb-3">
                Captive portal uses <strong>mikrobill's FreeRADIUS</strong>. Leave the RADIUS IP blank to auto-use the system setting.
              </div>
              <Field label="RADIUS IP (blank = system default)" name="radius_1"      value={form.radius_1}     onChange={fld} placeholder="auto" />
              <Field label="RADIUS Secret"                      name="radius_secret" value={form.radius_secret || "testing123"} onChange={fld} />
              <Field label="UAM URL (blank = system default)"   name="uam_url"       value={form.uam_url}      onChange={fld} />
              <Field label="UAM Secret"                         name="uam_secret"    value={form.uam_secret || "greatsecret"} onChange={fld} />
              <Field label="Walled Garden (comma-separated)"   name="walled_garden" value={form.walled_garden} onChange={fld} placeholder="mpesa.safaricom.com" />
              <Field label="MAC Authentication" name="mac_auth" value={form.mac_auth || "false"} onChange={fld}
                options={[{ value: "false", label: "Disabled" }, { value: "true", label: "Enabled" }]} />
            </>
          )}

          <Field label="WAN Protocol" name="proto" value={form.proto || "dhcp"} onChange={fld}
            options={[{ value: "dhcp", label: "DHCP" }, { value: "static", label: "Static IP" }, { value: "dhcpv6", label: "DHCPv6" }]} />
          {form.proto === "static" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Field label="IP Address" name="ipaddr"  value={form.ipaddr}  onChange={fld} placeholder="192.168.1.2" />
              <Field label="Netmask"    name="netmask" value={form.netmask} onChange={fld} placeholder="255.255.255.0" />
              <Field label="Gateway"    name="gateway" value={form.gateway} onChange={fld} placeholder="192.168.1.1" />
              <Field label="DNS 1"      name="dns_1"   value={form.dns_1}   onChange={fld} placeholder="8.8.8.8" />
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setShowExitForm(false); setForm({}); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={saveExit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Exit</button>
          </div>
        </Modal>
      )}

      {/* ── Add AP modal — with contact phone + location picker + internet connect ── */}
      {showApForm && (
        <Modal title="Add Access Point" onClose={() => { setShowApForm(false); setForm({}); }} wide>
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field label="AP Name"     name="name"     value={form.name}     onChange={fld} required />
            <Field label="MAC Address" name="mac"      value={form.mac}      onChange={fld} required placeholder="AA:BB:CC:DD:EE:FF" />
            <Field label="Hardware Profile" name="hardware" value={form.hardware} onChange={fld} placeholder="e.g. gl-inet-b1300" />
          </div>

          {/* Contact info */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Contact</p>
            <Field label="📞 Contact Phone (person at this AP location)" name="contact_phone" value={form.contact_phone}
              onChange={fld} placeholder="+254 700 000 000"
              hint="Phone number of the person responsible for / physically at this AP location" />
          </div>

          {/* Location */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Location</p>
            <LocationPicker
              lat={form.lat}
              lon={form.lon}
              onChange={(lat, lon) => setForm(f => ({ ...f, lat, lon }))}
            />
          </div>

          {/* Internet Connect */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Internet Connection</p>
            <InternetConnectFields form={form} onChange={setForm} />
          </div>

          {/* LAN */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">LAN</p>
            <Field label="LAN Protocol" name="lan_proto" value={form.lan_proto || "dhcp"} onChange={fld}
              options={[{ value: "dhcp", label: "DHCP" }, { value: "static", label: "Static" }]} />
            {form.lan_proto === "static" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Field label="LAN IP"      name="lan_ip" value={form.lan_ip} onChange={fld} />
                <Field label="LAN Gateway" name="lan_gw" value={form.lan_gw} onChange={fld} />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setShowApForm(false); setForm({}); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={saveAp} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add AP</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APDESK PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function APDesk() {
  const [profiles,   setProfiles]   = useState([]);
  const [unknown,    setUnknown]    = useState([]);
  const [selProfile, setSelProfile] = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState({});
  const [tab,        setTab]        = useState("profiles");

  const load = useCallback(() => {
    apiFetch(API, "/profiles").then(r => r.json()).then(d => setProfiles(d.data || []));
    apiFetch(API, "/unknown-aps").then(r => r.json()).then(d => setUnknown(d.data || []));
  }, []);

  useEffect(() => { load(); }, [load]);

  const fld = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const saveProfile = async () => {
    await apiJson(API, "/profiles", "POST", form);
    setShowForm(false); setForm({}); load();
  };
  const deleteProfile = async id => {
    if (!confirm("Delete this AP profile and all its APs?")) return;
    await apiFetch(API, `/profiles/${id}`, { method: "DELETE" });
    load();
  };
  const claimAp = async mac => {
    const profileId = prompt("Enter AP Profile ID to assign this AP to:");
    if (!profileId) return;
    const name = prompt("Name for this AP:", mac);
    await apiJson(API, `/unknown-aps/${mac}/claim`, "POST", { profile_id: parseInt(profileId), name });
    load();
  };
  const dismissUnknown = async id => {
    if (!confirm("Dismiss this unknown AP?")) return;
    await apiFetch(API, `/unknown-aps/${id}`, { method: "DELETE" });
    load();
  };

  if (selProfile) {
    return (
      <AdminLayout>
        <ProfileDetail profile={selProfile} onBack={() => { setSelProfile(null); load(); }} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">APdesk</h1>
          <p className="text-gray-500 text-sm">Access Point profiles — hotspot &amp; PPPoE via mikrobill FreeRADIUS</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 shadow">
          + New Profile
        </button>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <strong>Architecture:</strong> MikroTik → Internet → MikroTik LAN → APdesk APs (OpenWrt) → Hotspot/PPPoE subscribers.
        Bridge mode keeps all devices on the same L2 segment, enabling DLNA. Captive portal uses mikrobill's own FreeRADIUS.
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {["profiles", "unknown"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px ${tab === t ? "bg-white border-l border-r border-t text-blue-600 border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "unknown" ? `Unknown APs${unknown.length ? ` (${unknown.length})` : ""}` : "AP Profiles"}
          </button>
        ))}
      </div>

      {tab === "profiles" && (
        <Card title="AP Profiles">
          <Table cols={[
            { key: "name",       label: "Profile Name" },
            { key: "ap_count",   label: "APs",         render: (v, row) => `${v} (${row.aps_up} online)` },
            { key: "timezone",   label: "Timezone" },
            { key: "dead_after", label: "Dead After",  render: v => `${v}s` },
            { key: "id", label: "", render: (_, row) => (
              <div className="flex gap-2">
                <button onClick={() => setSelProfile(row)} className="text-xs text-blue-600 hover:underline">Manage</button>
                <button onClick={() => deleteProfile(row.id)} className="text-xs text-red-500 hover:underline">Delete</button>
              </div>
            )},
          ]} rows={profiles} onRow={row => setSelProfile(row)} />
        </Card>
      )}

      {tab === "unknown" && (
        <Card title="Unknown APs — checked in but not registered">
          <Table cols={[
            { key: "mac",              label: "MAC",       render: v => <span className="font-mono text-xs">{v}</span> },
            { key: "from_ip",          label: "From IP" },
            { key: "firmware_version", label: "Firmware" },
            { key: "hardware_hint",    label: "Hardware" },
            { key: "last_contact",     label: "Last Seen", render: v => new Date(v).toLocaleString() },
            { key: "id", label: "", render: (_, row) => (
              <div className="flex gap-2">
                <button onClick={() => claimAp(row.mac)}     className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600">Claim</button>
                <button onClick={() => dismissUnknown(row.id)} className="text-xs text-red-500 hover:underline">Dismiss</button>
              </div>
            )},
          ]} rows={unknown} />
          <p className="text-xs text-gray-400 mt-3">
            APs appear here when OpenWrt firmware checks in but the MAC isn't in any profile. Click <strong>Claim</strong> to assign to a profile.
          </p>
        </Card>
      )}

      {/* Create Profile modal */}
      {showForm && (
        <Modal title="New AP Profile" onClose={() => { setShowForm(false); setForm({}); }}>
          <Field label="Profile Name" name="name"        value={form.name}        onChange={fld} required />
          <Field label="Description"  name="description" value={form.description} onChange={fld} />
          <Field label="Timezone" name="timezone" value={form.timezone || "Africa/Nairobi"} onChange={fld}
            options={[
              { value: "Africa/Nairobi",     label: "Africa/Nairobi (EAT +3)" },
              { value: "Africa/Lagos",        label: "Africa/Lagos (WAT +1)" },
              { value: "Africa/Johannesburg", label: "Africa/Johannesburg (SAST +2)" },
              { value: "Africa/Cairo",        label: "Africa/Cairo (EET +2)" },
              { value: "UTC",                 label: "UTC" },
            ]} />
          <Field label="Dead After (seconds)" name="dead_after" type="number" value={form.dead_after || "600"} onChange={fld}
            hint="Mark an AP offline if no heartbeat received in this many seconds." />
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setShowForm(false); setForm({}); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={saveProfile} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Profile</button>
          </div>
        </Modal>
      )}
    </div>
    </AdminLayout>
  );
}
