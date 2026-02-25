import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, Wifi, Server, Shield, Globe, Bell, Database, Save } from "lucide-react";

const SettingsPage = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Global configuration for WiFi Billing System v2.0</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* DLNA Configuration */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Server className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold">DLNA Media Server</h3>
              <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px] ml-auto">Online</Badge>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">DLNA Server IP</label>
                <Input defaultValue="192.168.88.200" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">DLNA Port</label>
                <Input defaultValue="8200" className="mt-1 bg-muted/50 border-border" />
              </div>
              <p className="text-[10px] text-muted-foreground">Server IP is pushed to all MikroTik routers via DHCP option 212. Changes sync automatically.</p>
              <Button size="sm" className="gap-2">
                <Save className="h-3.5 w-3.5" />
                Update DLNA
              </Button>
            </div>
          </div>

          {/* M-Pesa Configuration */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="h-5 w-5 text-success" />
              <h3 className="text-sm font-semibold">M-Pesa Daraja API</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Paybill Number</label>
                <Input defaultValue="174379" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Confirmation URL</label>
                <Input defaultValue="https://api.example.com/mpesa/c2b/confirmation" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Validation URL</label>
                <Input defaultValue="https://api.example.com/mpesa/c2b/validation" className="mt-1 bg-muted/50 border-border" />
              </div>
              <Button size="sm" className="gap-2">
                <Save className="h-3.5 w-3.5" />
                Save M-Pesa Config
              </Button>
            </div>
          </div>

          {/* Tax Configuration */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-warning" />
              <h3 className="text-sm font-semibold">Tax & Compliance</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">VAT Rate (%)</label>
                <Input defaultValue="16" type="number" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">KRA PIN</label>
                <Input defaultValue="P*********" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Session Log Retention (days)</label>
                <Input defaultValue="90" type="number" className="mt-1 bg-muted/50 border-border" />
              </div>
              <Button size="sm" className="gap-2">
                <Save className="h-3.5 w-3.5" />
                Save Tax Settings
              </Button>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-info" />
              <h3 className="text-sm font-semibold">Notifications</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Africa's Talking Username</label>
                <Input defaultValue="sandbox" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">FCM Server Key</label>
                <Input defaultValue="••••••••••••" type="password" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Admin Alert Email</label>
                <Input defaultValue="admin@isp.co.ke" className="mt-1 bg-muted/50 border-border" />
              </div>
              <Button size="sm" className="gap-2">
                <Save className="h-3.5 w-3.5" />
                Save Notification Settings
              </Button>
            </div>
          </div>

          {/* IP Pool Management */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold">IP Pool Management</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Active Pool Range</label>
                <Input defaultValue="192.168.10.1-192.168.10.200" className="mt-1 bg-muted/50 border-border" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Expired Pool Range</label>
                <Input defaultValue="192.168.20.1-192.168.20.200" className="mt-1 bg-muted/50 border-border" />
              </div>
              <p className="text-[10px] text-muted-foreground">Expired users are moved to the expired pool and redirected to the payment portal.</p>
              <Button size="sm" className="gap-2">
                <Save className="h-3.5 w-3.5" />
                Update Pools
              </Button>
            </div>
          </div>

          {/* Database & System */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-5 w-5 text-chart-3" />
              <h3 className="text-sm font-semibold">System & Database</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">Database</span>
                <span className="text-xs font-mono">PostgreSQL 15</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">Cache</span>
                <span className="text-xs font-mono">Redis 7</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">RADIUS</span>
                <span className="text-xs font-mono">FreeRADIUS 3.x</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">AI Health Monitor</span>
                <span className="text-xs font-mono">Every 5 min</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-muted/30">
                <span className="text-xs text-muted-foreground">Version</span>
                <span className="text-xs font-mono text-primary">v2.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SettingsPage;
