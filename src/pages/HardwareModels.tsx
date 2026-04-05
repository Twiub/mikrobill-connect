/**
 * frontend/src/pages/HardwareModels.tsx  — MikroBill Connect v3.19.4
 *
 * FIX-1: Renamed .jsx → .tsx to resolve ESLint parse errors.
 * FIX-2: Auth migrated from raw localStorage.getItem("token") →
 *         supabase.auth.getSession() to match every other admin page.
 *
 * Hardware Models management — defines per-device radio capabilities.
 * Used by the firmware config builder to set correct hwmode, htmode, txpower,
 * channel width, and beacon interval for each AP / mesh node model.
 *
 * Backend: GET/POST/PUT/DELETE /api/admin/meshdesk/hardwares
 */

import { useState, useEffect, useCallback } from "react";
import { getToken } from "@/lib/authClient";

const API = "/api/admin/meshdesk/hardwares";

function _getAuthHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const h = await _getAuthHeader();
  return fetch(`${API}${url}`, { headers: { ...h }, ...opts });
}

async function apiJson(url: string, method: string, body?: unknown): Promise<Response> {
  const h = await _getAuthHeader();
  return fetch(`${API}${url}`, {
    method,
    headers: { ...h, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Primitives ────────────────────────────────────────────────────────────

const Card = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
      <h3 className="font-semibold text-gray-700 text-sm">{title}</h3>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[92vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
        <h2 className="font-bold text-gray-800">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const Field = ({
  label, name, value, onChange, type = "text", options, placeholder, hint, required,
}: {
  label: string; name: string; value: string | number; onChange: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
  type?: string; options?: { value: string; label: string }[]; placeholder?: string; hint?: string; required?: boolean;
}) => (
  <div className="mb-3">
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && " *"}</label>
    {options ? (
      <select name={name} value={value ?? ""} onChange={onChange}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input type={type} name={name} value={value ?? ""} onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
    )}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const Chk = ({ label, name, checked, onChange }: {
  label: string; name: string; checked: boolean; onChange: React.ChangeEventHandler<HTMLInputElement>;
}) => (
  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
    <input type="checkbox" name={name} checked={!!checked} onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
    {label}
  </label>
);

// ── Radio editor ──────────────────────────────────────────────────────────

const HWMODE_OPTIONS = [
  { value: "11g",  label: "802.11g (2.4 GHz)" },
  { value: "11n",  label: "802.11n (2.4/5 GHz)" },
  { value: "11a",  label: "802.11a (5 GHz)" },
  { value: "11ac", label: "802.11ac / Wave 2 (5 GHz)" },
  { value: "11ax", label: "802.11ax / WiFi 6" },
];
const HTMODE_OPTIONS = [
  { value: "HT20",  label: "HT20 — 20 MHz" },
  { value: "HT40",  label: "HT40 — 40 MHz" },
  { value: "VHT20", label: "VHT20 — 20 MHz (AC)" },
  { value: "VHT40", label: "VHT40 — 40 MHz (AC)" },
  { value: "VHT80", label: "VHT80 — 80 MHz (AC)" },
  { value: "HE20",  label: "HE20 — 20 MHz (AX)" },
  { value: "HE40",  label: "HE40 — 40 MHz (AX)" },
  { value: "HE80",  label: "HE80 — 80 MHz (AX)" },
  { value: "HE160", label: "HE160 — 160 MHz (AX)" },
];
const BAND_OPTIONS = [
  { value: "2g",  label: "2.4 GHz" },
  { value: "5g",  label: "5 GHz" },
  { value: "6g",  label: "6 GHz (WiFi 6E)" },
  { value: "60g", label: "60 GHz (WiGig)" },
];
const CELL_DENSITY_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Normal" },
  { value: "2", label: "High" },
  { value: "3", label: "Very High" },
];

interface RadioConfig {
  disabled: boolean; hwmode: string; htmode: string; band: string; txpower: number;
  mode: string; width: string; cell_density: string; include_beacon_int: boolean;
  beacon_int: number; include_distance: boolean; distance: number;
  mesh: boolean; ap: boolean; config: boolean; ht_capab: string;
}

const DEFAULT_RADIO: RadioConfig = {
  disabled: false, hwmode: "11n", htmode: "HT20", band: "2g", txpower: 17,
  mode: "HT", width: "20", cell_density: "0", include_beacon_int: false,
  beacon_int: 100, include_distance: false, distance: 0,
  mesh: true, ap: true, config: false, ht_capab: "",
};

function RadioEditor({ index, radio, onChange }: {
  index: number; radio: RadioConfig; onChange: (i: number, r: RadioConfig) => void;
}) {
  const fld = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange(index, { ...radio, [e.target.name]: e.target.value });
  const tog = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(index, { ...radio, [e.target.name]: e.target.checked });
  const num = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(index, { ...radio, [e.target.name]: parseInt(e.target.value) || 0 });

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm text-gray-700">Radio {index} (radio{index})</h4>
        <Chk label="Enabled" name="disabled" checked={!radio.disabled}
          onChange={e => onChange(index, { ...radio, disabled: !e.target.checked })} />
      </div>

      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${radio.disabled ? "opacity-40 pointer-events-none" : ""}`}>
        <Field label="Band" name="band" value={radio.band} onChange={fld} options={BAND_OPTIONS} />
        <Field label="HW Mode" name="hwmode" value={radio.hwmode} onChange={fld} options={HWMODE_OPTIONS} />
        <Field label="HT Mode" name="htmode" value={radio.htmode} onChange={fld} options={HTMODE_OPTIONS} />
        <Field label="TX Power (dBm)" name="txpower" value={radio.txpower} onChange={num} type="number"
          hint="Max TX power. Firmware clips to regulatory limit." />
        <Field label="Channel Width (MHz)" name="width" value={radio.width} onChange={fld}
          options={[{ value: "20", label: "20" }, { value: "40", label: "40" }, { value: "80", label: "80" }, { value: "160", label: "160" }]} />
        <Field label="Cell Density" name="cell_density" value={radio.cell_density} onChange={fld}
          options={CELL_DENSITY_OPTIONS}
          hint="Adjusts DTIM, RTS, fragmentation for dense deployments." />
      </div>

      <div className={`space-y-2 ${radio.disabled ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-4">
          <Chk label="Custom Beacon Interval" name="include_beacon_int" checked={radio.include_beacon_int} onChange={tog} />
          {radio.include_beacon_int && (
            <div className="w-32">
              <input type="number" name="beacon_int" value={radio.beacon_int} onChange={num} placeholder="100"
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          )}
          {radio.include_beacon_int && <span className="text-xs text-gray-400">ms</span>}
        </div>

        <div className="flex items-center gap-4">
          <Chk label="Custom Distance" name="include_distance" checked={radio.include_distance} onChange={tog} />
          {radio.include_distance && (
            <div className="w-32">
              <input type="number" name="distance" value={radio.distance} onChange={num} placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          )}
          {radio.include_distance && <span className="text-xs text-gray-400">m</span>}
        </div>

        <div className="flex flex-wrap gap-4 pt-1">
          <Chk label="Used for Mesh (backhaul)"         name="mesh"   checked={radio.mesh}   onChange={tog} />
          <Chk label="Used for AP (client SSIDs)"       name="ap"     checked={radio.ap}     onChange={tog} />
          <Chk label="Use Custom Config (UCI override)" name="config" checked={radio.config} onChange={tog} />
        </div>

        <Field label="HT Capabilities String (optional)" name="ht_capab" value={radio.ht_capab || ""}
          onChange={fld} placeholder="e.g. SHORT-GI-20 SHORT-GI-40 TX-STBC RX-STBC1"
          hint="Space-separated 802.11n/ac capability flags. Leave blank to use firmware defaults." />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE FORM  (add / edit)
// ═══════════════════════════════════════════════════════════════════════════

interface HardwareItem {
  id: number;
  name: string;
  description: string;
  radio_count: number;
  [key: string]: unknown;
}

function HardwareForm({ initial, onSave, onCancel }: {
  initial: HardwareItem | null; onSave: () => void; onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState(initial ? { ...initial } : { name: "", description: "", radio_count: 1 });
  const [radios, setRadios] = useState<RadioConfig[]>(() => {
    if (initial) {
      const count = initial.radio_count || 1;
      return Array.from({ length: count }, (_, i) => ({
        ...DEFAULT_RADIO,
        disabled:           (initial[`radio_${i}_disabled`]           as boolean)  ?? false,
        hwmode:             (initial[`radio_${i}_hwmode`]             as string)   || DEFAULT_RADIO.hwmode,
        htmode:             (initial[`radio_${i}_htmode`]             as string)   || DEFAULT_RADIO.htmode,
        band:               (initial[`radio_${i}_band`]               as string)   || DEFAULT_RADIO.band,
        txpower:            (initial[`radio_${i}_txpower`]            as number)   ?? DEFAULT_RADIO.txpower,
        mode:               (initial[`radio_${i}_mode`]               as string)   || DEFAULT_RADIO.mode,
        width:              (initial[`radio_${i}_width`]               as string)   || DEFAULT_RADIO.width,
        cell_density:  String(initial[`radio_${i}_cell_density`]      ?? DEFAULT_RADIO.cell_density),
        include_beacon_int: (initial[`radio_${i}_include_beacon_int`] as boolean)  ?? false,
        beacon_int:         (initial[`radio_${i}_beacon_int`]         as number)   ?? DEFAULT_RADIO.beacon_int,
        include_distance:   (initial[`radio_${i}_include_distance`]   as boolean)  ?? false,
        distance:           (initial[`radio_${i}_distance`]           as number)   ?? 0,
        mesh:               (initial[`radio_${i}_mesh`]               as boolean)  ?? true,
        ap:                 (initial[`radio_${i}_ap`]                 as boolean)  ?? true,
        config:             (initial[`radio_${i}_config`]             as boolean)  ?? false,
        ht_capab:           (initial[`radio_${i}_ht_capab`]           as string)   || "",
      }));
    }
    return [{ ...DEFAULT_RADIO, band: "2g", hwmode: "11n" }];
  });
  const [saving, setSaving] = useState(false);

  const fld = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const setRadioCount = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const n = Math.max(1, Math.min(4, parseInt(e.target.value) || 1));
    setForm(f => ({ ...f, radio_count: n }));
    setRadios(prev => {
      if (n > prev.length) {
        const extra = Array.from({ length: n - prev.length }, (_, i) => ({
          ...DEFAULT_RADIO,
          band:   i === 0 ? "2g" : "5g",
          hwmode: i === 0 ? "11n" : "11ac",
          htmode: i === 0 ? "HT20" : "VHT80",
        }));
        return [...prev, ...extra];
      }
      return prev.slice(0, n);
    });
  };

  const updateRadio = (i: number, updated: RadioConfig) => {
    setRadios(prev => prev.map((r, idx) => idx === i ? updated : r));
  };

  const submit = async () => {
    if (!(form as { name?: string }).name?.trim()) { alert("Hardware name is required."); return; }
    setSaving(true);
    const payload: Record<string, unknown> = { ...form, radio_count: radios.length };
    radios.forEach((r, i) => {
      Object.entries(r).forEach(([k, v]) => { payload[`radio_${i}_${k}`] = v; });
    });
    try {
      if (isEdit && initial) {
        await apiJson(`/${initial.id}`, "PUT", payload);
      } else {
        await apiJson("", "POST", payload);
      }
      onSave();
    } catch (err) {
      alert("Save failed: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="Hardware Name" name="name" value={(form as { name: string }).name} onChange={fld} required
          placeholder="e.g. GL.iNet B1300" />
        <Field label="Description / Notes" name="description" value={(form as { description: string }).description} onChange={fld}
          placeholder="e.g. Dual-band 802.11ac, 2+1 radio" />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">Number of Radios</label>
        <select value={radios.length} onChange={setRadioCount}
          className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
          {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} radio{n > 1 ? "s" : ""}</option>)}
        </select>
        <p className="text-xs text-gray-400 mt-1">Most dual-band APs have 2 radios (radio0 = 2.4 GHz, radio1 = 5 GHz).</p>
      </div>

      <div className="space-y-3">
        {radios.map((r, i) => (
          <RadioEditor key={i} index={i} radio={r} onChange={updateRadio} />
        ))}
      </div>

      <div className="flex gap-3 justify-end pt-4 mt-2 border-t border-gray-100">
        <button onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Hardware Model"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function HardwareModels() {
  const [items,   setItems]   = useState<HardwareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<null | "add" | HardwareItem>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch("").then(r => r.json()).then(d => { setItems(d.data || []); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id: number) => {
    if (!confirm("Delete this hardware model?")) return;
    await apiJson(`/${id}`, "DELETE");
    load();
  };

  const saved = () => { setModal(null); load(); };

  const radioSummary = (hw: HardwareItem) => {
    const count = hw.radio_count || 0;
    if (!count) return "No radios";
    return Array.from({ length: count }, (_, i) =>
      [(hw[`radio_${i}_band`] as string)?.toUpperCase(), hw[`radio_${i}_hwmode`] as string].filter(Boolean).join(" ") || `Radio ${i}`
    ).join(" / ");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hardware Models</h1>
          <p className="text-gray-500 text-sm">Define radio capabilities for OpenWrt mesh nodes and access points</p>
        </div>
        <button onClick={() => setModal("add")}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 shadow">
          + Add Model
        </button>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <strong>Usage:</strong> Hardware models are assigned to mesh nodes (Networks → MESHdesk → Node Settings)
        and access points (Networks → APdesk → Node ↔ Device). The firmware config builder uses them to set
        correct radio parameters — without a model, generic OpenWrt defaults are used.
      </div>

      <Card title="Hardware Models">
        {loading ? (
          <div className="text-gray-400 text-sm py-6 text-center">Loading…</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Name", "Description", "Radios", "Radio Summary", ""].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-gray-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(hw => (
                    <tr key={hw.id} className="border-b border-gray-50 hover:bg-blue-50">
                      <td className="py-3 px-3 font-medium text-gray-800">{hw.name}</td>
                      <td className="py-3 px-3 text-gray-500 text-xs">{hw.description || "—"}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs font-semibold">
                          {hw.radio_count || 0}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-500 text-xs font-mono">{radioSummary(hw)}</td>
                      <td className="py-3 px-3">
                        <div className="flex gap-2">
                          <button onClick={() => setModal(hw)} className="text-xs text-blue-600 hover:underline">Edit</button>
                          <button onClick={() => del(hw.id)}   className="text-xs text-red-500 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                      No hardware models yet. Add one to unlock per-device radio tuning.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {!items.length && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-2">Common Models to Add</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: "GL.iNet B1300",    description: "802.11ac dual-band",   radio_count: 2 },
                    { name: "GL.iNet MT300N",   description: "802.11n single-band",  radio_count: 1 },
                    { name: "Linksys WRT1900",  description: "802.11ac dual-band",   radio_count: 2 },
                    { name: "TP-Link EAP225",   description: "802.11ac dual-band",   radio_count: 2 },
                    { name: "Generic (1-radio)", description: "Single 2.4 GHz",      radio_count: 1 },
                    { name: "Generic (2-radio)", description: "Dual-band 2.4+5 GHz", radio_count: 2 },
                  ].map(tpl => (
                    <button key={tpl.name}
                      onClick={async () => { await apiJson("", "POST", { ...tpl }); load(); }}
                      className="text-xs bg-white border border-gray-200 hover:border-blue-400 hover:text-blue-600 px-3 py-1.5 rounded-lg transition-colors">
                      + {tpl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {modal && (
        <Modal
          title={modal === "add" ? "Add Hardware Model" : `Edit: ${(modal as HardwareItem).name}`}
          onClose={() => setModal(null)}>
          <HardwareForm
            initial={modal === "add" ? null : modal as HardwareItem}
            onSave={saved}
            onCancel={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
