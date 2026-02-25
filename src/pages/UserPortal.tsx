import { useState } from "react";
import { Wifi, User, Smartphone, BarChart3, CreditCard, Ticket, Tv, FileText, LogOut, Home, Bell, Settings } from "lucide-react";
import { packages, users, transactions, connectedDevices, tickets, formatKES, formatBytes } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import PriorityBadge from "@/components/PriorityBadge";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type PortalTab = "dashboard" | "devices" | "payments" | "usage" | "tickets" | "tv" | "settings";

const portalUser = users[0]; // Demo user: James Mwangi
const userDevices = connectedDevices.filter(d => d.user_id === portalUser.id);
const userTransactions = transactions.filter(t => t.user_id === portalUser.id);
const userPkg = packages.find(p => p.id === portalUser.package_id)!;

const usageData = [
  { day: "Mon", usage: 1.2 },
  { day: "Tue", usage: 2.5 },
  { day: "Wed", usage: 1.8 },
  { day: "Thu", usage: 3.1 },
  { day: "Fri", usage: 2.7 },
  { day: "Sat", usage: 4.2 },
  { day: "Sun", usage: 3.8 },
];

const navItems: { tab: PortalTab; label: string; icon: React.ElementType }[] = [
  { tab: "dashboard", label: "Home", icon: Home },
  { tab: "devices", label: "Devices", icon: Smartphone },
  { tab: "payments", label: "Pay", icon: CreditCard },
  { tab: "usage", label: "Usage", icon: BarChart3 },
  { tab: "tickets", label: "Support", icon: Ticket },
  { tab: "tv", label: "TV Bind", icon: Tv },
  { tab: "settings", label: "Settings", icon: Settings },
];

const UserPortal = () => {
  const [activeTab, setActiveTab] = useState<PortalTab>("dashboard");
  const [tvIp, setTvIp] = useState("");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");

  const expiresIn = Math.max(0, Math.ceil((new Date(portalUser.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const dataPercent = Math.min(100, (portalUser.data_used_gb / 50) * 100);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-md border-b border-border/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Wifi className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold">WiFi Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8"><Bell className="h-4 w-4" /></Button>
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5 pb-24">
        {activeTab === "dashboard" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold">Hi, {portalUser.full_name.split(" ")[0]} 👋</p>
              <p className="text-xs text-muted-foreground">Account: {portalUser.username}</p>
            </div>

            {/* Package Card */}
            <div className="glass-card p-5 border-l-4 border-l-primary">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Current Package</p>
                  <p className="text-xl font-bold text-primary">{userPkg.name}</p>
                </div>
                <StatusBadge status={portalUser.status} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                <div>
                  <p className="text-sm font-bold">{userPkg.speed_down}</p>
                  <p className="text-[10px] text-muted-foreground">Speed</p>
                </div>
                <div>
                  <p className="text-sm font-bold">{expiresIn}d</p>
                  <p className="text-[10px] text-muted-foreground">Remaining</p>
                </div>
                <div>
                  <p className="text-sm font-bold">{portalUser.devices_count}/{userPkg.max_devices}</p>
                  <p className="text-[10px] text-muted-foreground">Devices</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Data Used</span>
                  <span className="font-semibold">{portalUser.data_used_gb} GB</span>
                </div>
                <Progress value={dataPercent} className="h-1.5" />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setActiveTab("payments")} className="glass-card p-3 text-center hover:border-primary/50 transition-colors">
                <CreditCard className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-[10px] font-medium">Renew</p>
              </button>
              <button onClick={() => setActiveTab("devices")} className="glass-card p-3 text-center hover:border-primary/50 transition-colors">
                <Smartphone className="h-5 w-5 text-info mx-auto mb-1" />
                <p className="text-[10px] font-medium">Devices</p>
              </button>
              <button onClick={() => setActiveTab("tickets")} className="glass-card p-3 text-center hover:border-primary/50 transition-colors">
                <Ticket className="h-5 w-5 text-warning mx-auto mb-1" />
                <p className="text-[10px] font-medium">Support</p>
              </button>
            </div>

            {/* Weekly Usage */}
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold mb-3">This Week's Usage</h3>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={usageData}>
                  <defs>
                    <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={9} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))", fontSize: "11px" }} formatter={(v: number) => [`${v} GB`]} />
                  <Area type="monotone" dataKey="usage" stroke="hsl(var(--primary))" fill="url(#usageGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "devices" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Connected Devices</h2>
            <p className="text-xs text-muted-foreground">{userDevices.length} devices on your account</p>
            {userDevices.map((d) => (
              <div key={d.id} className="glass-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{d.hostname}</span>
                  </div>
                  <Button variant={d.blocked ? "default" : "ghost"} size="sm" className="h-7 text-[10px]">
                    {d.blocked ? "Unblock" : "Block"}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                  <div>
                    <span className="font-mono">{d.ip_address}</span>
                    <p className="text-[9px]">IP Address</p>
                  </div>
                  <div>
                    <span className="font-mono">{d.mac_address.slice(0, 8)}...</span>
                    <p className="text-[9px]">MAC</p>
                  </div>
                  <div>
                    <span className="font-semibold">{formatBytes(d.bytes_total)}</span>
                    <p className="text-[9px]">Total Data</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "payments" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Pay / Renew</h2>
            <div className="space-y-2">
              {packages.map((pkg) => (
                <button key={pkg.id} className={`w-full glass-card p-4 text-left transition-all hover:border-primary/50 ${pkg.id === portalUser.package_id ? "border-primary/50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{pkg.name}</h3>
                      <p className="text-[10px] text-muted-foreground">{pkg.speed_down} · {pkg.duration_days}d · {pkg.max_devices} devices</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold text-primary">{formatKES(pkg.price)}</p>
                      {pkg.id === portalUser.package_id && <Badge variant="outline" className="text-[9px] bg-primary/15 text-primary border-primary/30">Current</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <h3 className="text-sm font-semibold mt-4">Payment History</h3>
            {userTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/30">
                <div>
                  <p className="text-xs font-mono text-primary">{t.mpesa_ref}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatKES(t.amount)}</p>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "usage" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Usage Analytics</h2>
            <div className="glass-card p-4">
              <h3 className="text-xs font-semibold mb-3">Daily Data Usage</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} formatter={(v: number) => [`${v} GB`]} />
                  <Area type="monotone" dataKey="usage" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold text-primary">{portalUser.data_used_gb}</p>
                <p className="text-[10px] text-muted-foreground">GB Used (Total)</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-2xl font-bold">{(portalUser.data_used_gb / 7).toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">GB/Day Average</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "tickets" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Support Tickets</h2>
            {/* New Ticket */}
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold">Create New Ticket</h3>
              <Input placeholder="Issue title..." value={ticketTitle} onChange={(e) => setTicketTitle(e.target.value)} className="bg-muted/50 border-border text-sm" />
              <textarea placeholder="Describe the issue..." value={ticketDesc} onChange={(e) => setTicketDesc(e.target.value)} className="w-full rounded-md border border-border bg-muted/50 p-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              <p className="text-[10px] text-muted-foreground">📍 GPS location will be attached automatically</p>
              <Button className="w-full" size="sm">Submit Ticket</Button>
            </div>
            {/* Existing */}
            {tickets.filter(t => t.user_name === portalUser.full_name || t.user_name === "James Mwangi").map((t) => (
              <div key={t.id} className="glass-card p-4">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="flex gap-2 mt-2">
                  <StatusBadge status={t.status} />
                  <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "tv" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">TV Device Binding</h2>
            <div className="glass-card p-4 border-l-4 border-l-info">
              <p className="text-xs text-muted-foreground">Smart TVs can't display captive portals. Enter your TV's IP address to grant it internet access directly through your account.</p>
            </div>
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold">Bind New TV</h3>
              <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Go to your TV's network settings</li>
                <li>Find the IP address (e.g., 192.168.88.150)</li>
                <li>Enter it below and click Bind</li>
              </ol>
              <Input placeholder="TV IP Address (e.g., 192.168.88.150)" value={tvIp} onChange={(e) => setTvIp(e.target.value)} className="bg-muted/50 border-border font-mono" />
              <Button className="w-full" size="sm" disabled={!tvIp}>Bind TV to My Account</Button>
            </div>
            {/* Bound TV */}
            {userDevices.filter(d => d.device_type === "tv").map((d) => (
              <div key={d.id} className="glass-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tv className="h-4 w-4 text-info" />
                  <div>
                    <p className="text-sm font-semibold">{d.hostname}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{d.ip_address}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive">Unbind</Button>
              </div>
            ))}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Account Settings</h2>
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold">Change Hotspot Password</h3>
              <Input type="password" placeholder="New password" className="bg-muted/50 border-border" />
              <Input type="password" placeholder="Confirm password" className="bg-muted/50 border-border" />
              <p className="text-[10px] text-muted-foreground">Updates RADIUS immediately. New password works on next login.</p>
              <Button size="sm" className="w-full">Update Password</Button>
            </div>
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-xs font-semibold">KYC Documents</h3>
              <p className="text-[10px] text-muted-foreground">Upload your ID document to comply with Kenya ICT Act requirements.</p>
              <Button variant="outline" size="sm" className="w-full gap-2">
                <FileText className="h-3.5 w-3.5" />
                Upload ID Document
              </Button>
              <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">KYC Verified ✓</Badge>
            </div>
            <Button variant="ghost" className="w-full text-destructive gap-2">
              <LogOut className="h-4 w-4" />
              Log Out
            </Button>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-md border-t border-border/50 z-50">
        <div className="max-w-lg mx-auto flex justify-around py-2">
          {navItems.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${activeTab === tab ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[9px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default UserPortal;
