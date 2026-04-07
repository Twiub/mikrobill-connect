/**
 * src/pages/NetworkHierarchyPage.tsx — v3.6.0
 *
 * Network → Site → Cloud hierarchy management
 * Port of rdcore Networks/Sites/Clouds management.
 * Used to organise meshes and AP profiles by geographic/logical grouping.
 */

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Globe, Plus, Trash2, RefreshCw, ChevronRight, ChevronDown, Cloud, MapPin, Edit,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
/api");
async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ,
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Network { id: number; name: string; description: string; created_at: string; }
interface Site    { id: number; network_id: number; name: string; description: string; }
interface CloudItem { id: number; site_id: number; name: string; description: string; site_name: string; network_name: string; }

export default function NetworkHierarchyPage() {
  const { toast } = useToast();
  const [networks, setNetworks] = useState<Network[]>([]);
  const [sites,    setSites]    = useState<Record<number, Site[]>>({});
  const [clouds,   setClouds]   = useState<Record<number, CloudItem[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [netDlg, setNetDlg] = useState<{ open: boolean; mode: "add"|"edit"; item?: Network }>({ open: false, mode: "add" });
  const [siteDlg, setSiteDlg] = useState<{ open: boolean; networkId: number | null }>({ open: false, networkId: null });
  const [cloudDlg, setCloudDlg] = useState<{ open: boolean; siteId: number | null }>({ open: false, siteId: null });

  const [form, setForm] = useState({ name: "", description: "" });

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/apdesk/networks");
      setNetworks(res.data || []);
    } catch (err) {
      toast({ title: "Load failed", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadSites = async (networkId: number) => {
    const res = await apiFetch(`/admin/apdesk/networks/${networkId}/sites`);
    setSites(prev => ({ ...prev, [networkId]: res.data || [] }));
  };

  const loadClouds = async (siteId: number) => {
    const res = await apiFetch(`/admin/apdesk/sites/${siteId}/clouds`);
    setClouds(prev => ({ ...prev, [siteId]: res.data || [] }));
  };

  const toggle = async (key: string, load: () => Promise<void>) => {
    const wasOpen = expanded[key];
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
    if (!wasOpen) await load();
  };

  const saveNetwork = async () => {
    try {
      if (netDlg.mode === "add") {
        await apiFetch("/admin/apdesk/networks", {
          method: "POST", body: JSON.stringify(form),
        });
      } else if (netDlg.item) {
        await apiFetch(`/admin/apdesk/networks/${netDlg.item.id}`, {
          method: "PATCH", body: JSON.stringify(form),
        });
      }
      setNetDlg({ open: false, mode: "add" });
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    }
  };

  const deleteNetwork = async (id: number) => {
    if (!confirm("Delete network and all sites/clouds?")) return;
    try {
      await apiFetch(`/admin/apdesk/networks/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  const saveSite = async () => {
    if (!siteDlg.networkId) return;
    try {
      await apiFetch(`/admin/apdesk/networks/${siteDlg.networkId}/sites`, {
        method: "POST", body: JSON.stringify(form),
      });
      setSiteDlg({ open: false, networkId: null });
      await loadSites(siteDlg.networkId);
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    }
  };

  const saveCloud = async () => {
    if (!cloudDlg.siteId) return;
    try {
      await apiFetch(`/admin/apdesk/sites/${cloudDlg.siteId}/clouds`, {
        method: "POST", body: JSON.stringify(form),
      });
      setCloudDlg({ open: false, siteId: null });
      await loadClouds(cloudDlg.siteId);
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    }
  };

  const deleteCloud = async (id: number, siteId: number) => {
    try {
      await apiFetch(`/admin/apdesk/clouds/${id}`, { method: "DELETE" });
      await loadClouds(siteId);
    } catch (err) {
      toast({ title: "Delete failed", description: String(err), variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" /> Network Hierarchy
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organise your networks into Networks → Sites → Clouds for AP and Mesh grouping
            </p>
          </div>
          <Button size="sm" onClick={() => { setForm({ name: "", description: "" }); setNetDlg({ open: true, mode: "add" }); }}>
            <Plus className="h-3.5 w-3.5 mr-2" /> New Network
          </Button>
        </div>

        {networks.length === 0 && (
          <div className="glass-card p-12 text-center text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No networks yet. Create a network to start organising your infrastructure.</p>
          </div>
        )}

        {networks.map(net => {
          const netKey    = `net-${net.id}`;
          const netOpen   = expanded[netKey];
          const netSites  = sites[net.id] || [];

          return (
            <div key={net.id} className="glass-card overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                onClick={() => toggle(netKey, () => loadSites(net.id))}>
                <div className="flex items-center gap-3">
                  {netOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Globe className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-semibold">{net.name}</p>
                    <p className="text-[10px] text-muted-foreground">{net.description || "No description"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 px-2"
                    onClick={() => { setForm({ name: net.name, description: net.description }); setNetDlg({ open: true, mode: "edit", item: net }); }}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                    onClick={() => deleteNetwork(net.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {netOpen && (
                <div className="border-t border-border/40 pl-8">
                  <div className="p-3 bg-muted/10 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Sites in {net.name}</span>
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                      onClick={() => { setForm({ name: "", description: "" }); setSiteDlg({ open: true, networkId: net.id }); }}>
                      <Plus className="h-3 w-3 mr-1" /> Add Site
                    </Button>
                  </div>

                  {netSites.map(site => {
                    const siteKey   = `site-${site.id}`;
                    const siteOpen  = expanded[siteKey];
                    const siteClouds = clouds[site.id] || [];

                    return (
                      <div key={site.id} className="border-t border-border/20">
                        <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/20"
                          onClick={() => toggle(siteKey, () => loadClouds(site.id))}>
                          <div className="flex items-center gap-2">
                            {siteOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <MapPin className="h-3.5 w-3.5 text-orange-400" />
                            <p className="text-xs font-medium">{site.name}</p>
                            <span className="text-[10px] text-muted-foreground">{site.description}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-destructive"
                            onClick={async e => {
                              e.stopPropagation();
                              if (!confirm("Delete site?")) return;
                              // No delete endpoint for sites yet, handled by cascade
                              toast({ title: "Delete via network delete for now" });
                            }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {siteOpen && (
                          <div className="border-t border-border/10 pl-8 pb-2">
                            <div className="flex items-center justify-between px-4 py-2">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase">Clouds</span>
                              <Button size="sm" variant="outline" className="h-5 text-[10px] px-2"
                                onClick={() => { setForm({ name: "", description: "" }); setCloudDlg({ open: true, siteId: site.id }); }}>
                                <Plus className="h-2.5 w-2.5 mr-1" /> Add Cloud
                              </Button>
                            </div>
                            {siteClouds.length === 0 && (
                              <p className="text-[10px] text-muted-foreground px-4 py-1">No clouds in this site.</p>
                            )}
                            {siteClouds.map(cloud => (
                              <div key={cloud.id} className="flex items-center justify-between px-4 py-1.5">
                                <div className="flex items-center gap-2">
                                  <Cloud className="h-3 w-3 text-sky-400" />
                                  <p className="text-xs whitespace-nowrap">{cloud.name}</p>
                                  <span className="text-[10px] text-muted-foreground">{cloud.description}</span>
                                </div>
                                <Button size="sm" variant="ghost" className="h-5 px-1.5 text-destructive"
                                  onClick={() => deleteCloud(cloud.id, site.id)}>
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {netSites.length === 0 && (
                    <p className="text-xs text-muted-foreground px-4 py-3">No sites yet.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Network dialog */}
      <Dialog open={netDlg.open} onOpenChange={o => setNetDlg(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{netDlg.mode === "add" ? "Create Network" : "Edit Network"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs whitespace-nowrap">Name *</Label>
              <Input className="mt-1" placeholder="e.g. Nairobi Metro"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs whitespace-nowrap">Description</Label>
              <Input className="mt-1" placeholder="Optional"
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNetDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveNetwork} disabled={!form.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site dialog */}
      <Dialog open={siteDlg.open} onOpenChange={o => setSiteDlg(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Site</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs whitespace-nowrap">Name *</Label>
              <Input className="mt-1" placeholder="e.g. Westlands"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs whitespace-nowrap">Description</Label>
              <Input className="mt-1"
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSiteDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveSite} disabled={!form.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cloud dialog */}
      <Dialog open={cloudDlg.open} onOpenChange={o => setCloudDlg(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Cloud</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs whitespace-nowrap">Cloud Name *</Label>
              <Input className="mt-1" placeholder="e.g. Hotel Block A"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs whitespace-nowrap">Description</Label>
              <Input className="mt-1"
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloudDlg(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button onClick={saveCloud} disabled={!form.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
