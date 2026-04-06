/**
 * frontend/src/pages/NotificationsPage.tsx — v2.0.0 (v3.16.0)
 *
 * SMS + FCM notification management, templates, and delivery success rate dashboard.
 *
 * v3.16.0:
 *   - Real delivery tracking: reads provider, status, failed_reason from DB
 *   - Success rate cards per provider (Africa's Talking, Android Gateway, FCM)
 *   - 7-day / 30-day / all-time toggle
 *   - History table shows provider badge + failed reason tooltip
 */

import { useState, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscribers, useNotifications as useNotificationsHook, useNotificationTemplates } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Bell, Send, MessageSquare, Smartphone, Loader2, Save, Pencil,
  CheckCircle2, XCircle, Clock, AlertTriangle, TrendingUp, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const useNotifications = useNotificationsHook;
const useTemplates = useNotificationTemplates;

// ── Static maps ───────────────────────────────────────────────────────────────

const typeStyles: Record<string, string> = {
  expiry:    "bg-warning/15 text-warning border-warning/30",
  payment:   "bg-success/15 text-success border-success/30",
  outage:    "bg-destructive/15 text-destructive border-destructive/30",
  ticket:    "bg-info/15 text-info border-info/30",
  broadcast: "bg-primary/15 text-primary border-primary/30",
  system:    "bg-muted text-muted-foreground border-border",
};

const providerLabel: Record<string, string> = {
  africastalking:  "Africa's Talking",
  android_gateway: "Android GW",
  fcm:             "FCM Push",
  none:            "None",
};

const providerBadgeClass: Record<string, string> = {
  africastalking:  "bg-blue-500/15 text-blue-500 border-blue-500/30",
  android_gateway: "bg-green-500/15 text-green-500 border-green-500/30",
  fcm:             "bg-orange-500/15 text-orange-500 border-orange-500/30",
  none:            "bg-muted text-muted-foreground",
};

const TEMPLATE_VARS: Record<string, string[]> = {
  expiry_24h:        ["{{name}}", "{{package}}", "{{expires}}"],
  expiry_1h:         ["{{name}}", "{{package}}"],
  payment_received:  ["{{name}}", "{{amount}}", "{{package}}", "{{expires}}"],
  account_suspended: ["{{name}}"],
  outage:            ["{{name}}"],
  outage_resolved:   ["{{name}}"],
  ticket_updated:    ["{{name}}", "{{ticket_id}}", "{{status}}"],
  broadcast:         ["{{message}}"],
  welcome:           ["{{name}}", "{{username}}", "{{password}}"],
};

// ── RateCard component ────────────────────────────────────────────────────────

type RateCardProps = {
  label: string;
  sent: number;
  failed: number;
  pending: number;
  icon: React.ElementType;
  iconClass: string;
};

const RateCard = ({ label, sent, failed, pending, icon: Icon, iconClass }: RateCardProps) => {
  const total     = sent + failed + pending;
  const attempted = sent + failed;
  const rate      = attempted > 0 ? Math.round((sent / attempted) * 100) : null;
  const rateColor = rate === null ? "text-muted-foreground"
    : rate >= 95 ? "text-success"
    : rate >= 80 ? "text-warning"
    : "text-destructive";

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold">{label}</span>
        </div>
        <span className={`text-xl font-bold ${rateColor}`}>
          {rate !== null ? `${rate}%` : total === 0 ? "—" : "…"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <p className="text-base font-bold text-success">{sent}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Sent</p>
        </div>
        <div>
          <p className="text-base font-bold text-destructive">{failed}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Failed</p>
        </div>
        <div>
          <p className="text-base font-bold text-muted-foreground">{pending}</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Pending</p>
        </div>
      </div>
      {total > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
          <div className="bg-success transition-all" style={{ width: `${(sent / total) * 100}%` }} />
          <div className="bg-destructive transition-all" style={{ width: `${(failed / total) * 100}%` }} />
        </div>
      )}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const NotificationsPage = () => {
  const [statRange, setStatRange] = useState<"7d" | "30d" | "all">("7d");

  const since7d  = new Date(Date.now() -  7 * 86400_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
  const sinceStat = statRange === "7d" ? since7d : statRange === "30d" ? since30d : undefined;

  // Stats query uses the range filter; history table always loads latest 500
  const { data: statNotifs = [], refetch: refetchStats } = useNotifications(sinceStat);
  const { data: allNotifs  = [], refetch: refetchAll   } = useNotifications();
  const { data: templates  = [] } = useTemplates();
  const { data: subscribers = [] } = useSubscribers();
  const queryClient = useQueryClient();
  const { toast }   = useToast();

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [templateOpen,  setTemplateOpen]  = useState(false);
  const [sending,    setSending]    = useState(false);
  const [savingTpl,  setSavingTpl]  = useState(false);
  const [editTplId,  setEditTplId]  = useState<string | null>(null);

  const [broadcast, setBroadcast] = useState({ title: "", message: "", channel: "both", target: "all" });
  const [tplForm,   setTplForm]   = useState({ type: "", title: "", body: "", channel: "both", enabled: true });

  const sTpl = (k: keyof typeof tplForm) => (v: any) => setTplForm((f) => ({ ...f, [k]: v }));
  const sBc  = (k: keyof typeof broadcast) => (v: any) => setBroadcast((f) => ({ ...f, [k]: v }));

  const openEditTpl = (tpl: any) => {
    setEditTplId(tpl.id);
    setTplForm({ type: tpl.type, title: tpl.title, body: tpl.body, channel: tpl.channel, enabled: tpl.enabled });
    setTemplateOpen(true);
  };

  // ── Compute stats ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const empty = () => ({ sent: 0, failed: 0, pending: 0 });
    const acc: Record<string, ReturnType<typeof empty>> = {
      overall: empty(), africastalking: empty(), android_gateway: empty(), fcm: empty(),
    };
    for (const n of statNotifs as any[]) {
      const p  = n.provider && acc[n.provider] ? n.provider : null;
      const inc = (k: string) => {
        if (n.status === "sent")    acc[k].sent++;
        if (n.status === "failed")  acc[k].failed++;
        if (n.status === "pending") acc[k].pending++;
      };
      inc("overall");
      if (p) inc(p);
    }
    return acc;
  }, [statNotifs]);

  // ── Broadcast ───────────────────────────────────────────────────────────
  const handleSendBroadcast = async () => {
    if (!broadcast.title.trim() || !broadcast.message.trim()) {
      toast({ title: "Validation Error", description: "Title and message are required.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("notifications").insert({
        type: "broadcast" as any, title: broadcast.title, message: broadcast.message,
        channel: broadcast.channel as any, target: broadcast.target as any,
        status: "pending" as any, sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast({ title: "Broadcast Queued" });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setBroadcastOpen(false);
      setBroadcast({ title: "", message: "", channel: "both", target: "all" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  // ── Template save ────────────────────────────────────────────────────────
  const handleSaveTemplate = async () => {
    if (!tplForm.title.trim() || !tplForm.body.trim()) {
      toast({ title: "Validation Error", description: "Title and body are required.", variant: "destructive" });
      return;
    }
    setSavingTpl(true);
    try {
      if (editTplId) {
        const { error } = await supabase.from("notification_templates").update({
          title: tplForm.title, body: tplForm.body, type: tplForm.channel ?? "sms",
        }).eq("id", editTplId);
        if (error) throw error;
        toast({ title: "Template Updated" });
      }
      queryClient.invalidateQueries({ queryKey: ["notification_templates"] });
      setTemplateOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingTpl(false); }
  };

  const targetCount = (subscribers as any[]).filter((s: any) =>
    broadcast.target === "all" ? true :
    broadcast.target === "active" ? s.status === "active" : s.status === "expired"
  ).length;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <TooltipProvider>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-1">SMS + FCM push — delivery success rates &amp; templates</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => { refetchStats(); refetchAll(); }}>
              <RefreshCw className="h-3.5 w-3.5" />Refresh
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setBroadcastOpen(true)}>
              <Send className="h-4 w-4" />Send Broadcast
            </Button>
          </div>
        </div>

        {/* Success rate dashboard */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />Delivery Success Rate
            </h2>
            <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
              {(["7d", "30d", "all"] as const).map((r) => (
                <button key={r} onClick={() => setStatRange(r)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${statRange === r ? "bg-background shadow text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                  {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "All time"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 sm:grid-cols-4 gap-4">
            <RateCard label="Overall"           sent={stats.overall.sent}          failed={stats.overall.failed}          pending={stats.overall.pending}          icon={Bell}          iconClass="bg-primary/10 text-primary" />
            <RateCard label="Africa's Talking"  sent={stats.africastalking.sent}   failed={stats.africastalking.failed}   pending={stats.africastalking.pending}   icon={MessageSquare} iconClass="bg-blue-500/10 text-blue-500" />
            <RateCard label="Android Gateway"   sent={stats.android_gateway.sent}  failed={stats.android_gateway.failed}  pending={stats.android_gateway.pending}  icon={Smartphone}    iconClass="bg-green-500/10 text-green-500" />
            <RateCard label="FCM Push"          sent={stats.fcm.sent}              failed={stats.fcm.failed}              pending={stats.fcm.pending}              icon={Bell}          iconClass="bg-orange-500/10 text-orange-500" />
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="templates">Message Templates</TabsTrigger>
          </TabsList>

          {/* History */}
          <TabsContent value="history" className="mt-4">
            <div className="glass-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="text-xs whitespace-nowrap">Type</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Title</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Message</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Channel</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Provider</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(allNotifs as any[]).map((n) => (
                    <TableRow key={n.id} className="border-border/30">
                      <TableCell>
                        <Badge variant="outline" className={`${typeStyles[n.type] ?? ""} text-[10px] capitalize`}>{n.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{n.title}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{n.message}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {n.channel === "sms" ? <MessageSquare className="h-3.5 w-3.5" />
                            : n.channel === "push" ? <Smartphone className="h-3.5 w-3.5" />
                            : <Bell className="h-3.5 w-3.5" />}
                          <span className="capitalize">{n.channel}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {n.provider ? (
                          <Badge variant="outline" className={`text-[10px] ${providerBadgeClass[n.provider] ?? ""}`}>
                            {providerLabel[n.provider] ?? n.provider}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {n.status === "failed" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 cursor-help w-fit">
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                                <span className="text-xs text-destructive">Failed</span>
                                {n.failed_reason && <AlertTriangle className="h-3 w-3 text-destructive/60" />}
                              </div>
                            </TooltipTrigger>
                            {n.failed_reason && (
                              <TooltipContent side="top" className="max-w-xs text-xs break-words">
                                <p className="font-semibold mb-1">Failure reason:</p>
                                <p>{n.failed_reason}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ) : n.status === "sent" ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            <span className="text-xs text-success">Sent</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground capitalize">{n.status}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {new Date(n.sent_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(allNotifs as any[]).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No notifications yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Templates */}
          <TabsContent value="templates" className="mt-4">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                These templates are used when automatic notifications are triggered. Variables in {"{{double_braces}}"} are replaced automatically.
              </p>
              <div className="grid grid-cols-1 gap-3">
                {(templates as any[]).map((tpl) => (
                  <div key={tpl.id} className="glass-card p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] font-mono">{tpl.type}</Badge>
                          <Badge variant="outline" className={`text-[10px] capitalize ${tpl.channel === "sms" ? "bg-warning/10 text-warning border-warning/30" : tpl.channel === "push" ? "bg-info/10 text-info border-info/30" : "bg-primary/10 text-primary border-primary/30"}`}>
                            {tpl.channel}
                          </Badge>
                          {!tpl.enabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">Disabled</Badge>}
                        </div>
                        <p className="text-sm font-semibold">{tpl.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tpl.body}</p>
                        {TEMPLATE_VARS[tpl.type] && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {TEMPLATE_VARS[tpl.type].map((v) => (
                              <code key={v} className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">{v}</code>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-primary ml-4 shrink-0" onClick={() => openEditTpl(tpl)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                    </div>
                  </div>
                ))}
                {(templates as any[]).length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No templates found. Run migration to seed defaults.</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Broadcast Dialog */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send Broadcast Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input placeholder="e.g. Network Maintenance Tonight" value={broadcast.title} onChange={(e) => sBc("title")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Message *</Label>
              <Textarea placeholder="Your message to subscribers..." value={broadcast.message} onChange={(e) => sBc("message")(e.target.value)} rows={4} />
              <p className="text-[10px] text-muted-foreground">SMS limit: 160 chars. Longer messages will be split.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select value={broadcast.channel} onValueChange={sBc("channel")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">SMS + Push</SelectItem>
                    <SelectItem value="sms">SMS Only</SelectItem>
                    <SelectItem value="push">Push Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Target Audience</Label>
                <Select value={broadcast.target} onValueChange={sBc("target")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subscribers</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="expired">Expired Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning">
              This will send to <strong>{targetCount}</strong> subscriber(s). SMS costs apply.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
            <Button onClick={handleSendBroadcast} disabled={sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Notification Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              Template: <code className="font-mono bg-muted px-1 rounded">{tplForm.type}</code>
              {TEMPLATE_VARS[tplForm.type] && (
                <div className="mt-2">Available variables: {TEMPLATE_VARS[tplForm.type].map((v) => <code key={v} className="bg-muted px-1 rounded mr-1">{v}</code>)}</div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notification Title</Label>
              <Input value={tplForm.title} onChange={(e) => sTpl("title")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Message Body</Label>
              <Textarea value={tplForm.body} onChange={(e) => sTpl("body")(e.target.value)} rows={4} />
              <p className="text-[10px] text-muted-foreground">Use {"{{variable}}"} placeholders — replaced with real values when sent.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={tplForm.channel} onValueChange={sTpl("channel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">SMS + Push</SelectItem>
                  <SelectItem value="sms">SMS Only</SelectItem>
                  <SelectItem value="push">Push Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={tplForm.enabled} onCheckedChange={sTpl("enabled")} />
              <Label>Enabled (auto-send when triggered)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={savingTpl} className="gap-2">
              {savingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </TooltipProvider>
    </AdminLayout>
  );
};

export default NotificationsPage;
