// Mock data for WiFi Billing System

export interface Package {
  id: string;
  name: string;
  tier: "basic" | "standard" | "premium" | "unlimited";
  price: number;
  speed_down: string;
  speed_up: string;
  duration_days: number;
  max_devices: number;
  type: "hotspot" | "pppoe" | "both";
  active: boolean;
}

export interface User {
  id: string;
  username: string;
  phone: string;
  full_name: string;
  type: "hotspot" | "pppoe";
  status: "active" | "expired" | "suspended";
  package_id: string;
  package_name: string;
  expires_at: string;
  created_at: string;
  mikrotik_id: string;
  devices_count: number;
  data_used_gb: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  user_name: string;
  amount: number;
  type: "hotspot_purchase" | "pppoe_renewal" | "package_upgrade";
  mpesa_ref: string;
  phone: string;
  status: "success" | "failed" | "pending";
  created_at: string;
}

export interface ActiveSession {
  id: string;
  username: string;
  ip_address: string;
  mac_address: string;
  uptime: string;
  bytes_in: number;
  bytes_out: number;
  mikrotik_name: string;
  package_tier: string;
}

export interface Ticket {
  id: string;
  user_name: string;
  title: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "critical";
  created_at: string;
  assigned_to: string | null;
}

export interface MikroTikRouter {
  id: string;
  name: string;
  ip_address: string;
  status: "online" | "offline";
  cpu_load: number;
  memory_used: number;
  active_users: number;
  uptime: string;
}

export const packages: Package[] = [
  { id: "1", name: "Basic", tier: "basic", price: 50, speed_down: "5 Mbps", speed_up: "2 Mbps", duration_days: 1, max_devices: 5, type: "both", active: true },
  { id: "2", name: "Standard", tier: "standard", price: 150, speed_down: "10 Mbps", speed_up: "4 Mbps", duration_days: 3, max_devices: 10, type: "both", active: true },
  { id: "3", name: "Premium", tier: "premium", price: 500, speed_down: "20 Mbps", speed_up: "8 Mbps", duration_days: 7, max_devices: 20, type: "both", active: true },
  { id: "4", name: "Unlimited", tier: "unlimited", price: 1500, speed_down: "50 Mbps", speed_up: "20 Mbps", duration_days: 30, max_devices: 50, type: "both", active: true },
];

export const users: User[] = [
  { id: "1", username: "user001", phone: "+254712345678", full_name: "James Mwangi", type: "hotspot", status: "active", package_id: "2", package_name: "Standard", expires_at: "2026-03-15T10:00:00Z", created_at: "2026-01-10T08:00:00Z", mikrotik_id: "rt1", devices_count: 3, data_used_gb: 12.4 },
  { id: "2", username: "user002", phone: "+254723456789", full_name: "Mary Wanjiku", type: "pppoe", status: "active", package_id: "3", package_name: "Premium", expires_at: "2026-03-20T10:00:00Z", created_at: "2026-01-05T08:00:00Z", mikrotik_id: "rt1", devices_count: 8, data_used_gb: 45.2 },
  { id: "3", username: "user003", phone: "+254734567890", full_name: "Peter Ochieng", type: "hotspot", status: "expired", package_id: "1", package_name: "Basic", expires_at: "2026-02-20T10:00:00Z", created_at: "2026-02-01T08:00:00Z", mikrotik_id: "rt2", devices_count: 1, data_used_gb: 2.1 },
  { id: "4", username: "user004", phone: "+254745678901", full_name: "Grace Akinyi", type: "pppoe", status: "active", package_id: "4", package_name: "Unlimited", expires_at: "2026-04-01T10:00:00Z", created_at: "2025-12-15T08:00:00Z", mikrotik_id: "rt1", devices_count: 15, data_used_gb: 120.8 },
  { id: "5", username: "user005", phone: "+254756789012", full_name: "David Kimani", type: "hotspot", status: "suspended", package_id: "2", package_name: "Standard", expires_at: "2026-03-01T10:00:00Z", created_at: "2026-01-20T08:00:00Z", mikrotik_id: "rt2", devices_count: 0, data_used_gb: 8.9 },
  { id: "6", username: "user006", phone: "+254767890123", full_name: "Faith Njeri", type: "hotspot", status: "active", package_id: "1", package_name: "Basic", expires_at: "2026-02-26T10:00:00Z", created_at: "2026-02-20T08:00:00Z", mikrotik_id: "rt1", devices_count: 2, data_used_gb: 1.5 },
  { id: "7", username: "user007", phone: "+254778901234", full_name: "John Otieno", type: "pppoe", status: "active", package_id: "3", package_name: "Premium", expires_at: "2026-03-10T10:00:00Z", created_at: "2026-01-15T08:00:00Z", mikrotik_id: "rt2", devices_count: 6, data_used_gb: 34.7 },
  { id: "8", username: "user008", phone: "+254789012345", full_name: "Ann Muthoni", type: "hotspot", status: "active", package_id: "2", package_name: "Standard", expires_at: "2026-02-28T10:00:00Z", created_at: "2026-02-10T08:00:00Z", mikrotik_id: "rt1", devices_count: 4, data_used_gb: 6.3 },
];

export const transactions: Transaction[] = [
  { id: "t1", user_id: "1", user_name: "James Mwangi", amount: 150, type: "hotspot_purchase", mpesa_ref: "SBK1234ABC", phone: "+254712345678", status: "success", created_at: "2026-02-25T14:30:00Z" },
  { id: "t2", user_id: "2", user_name: "Mary Wanjiku", amount: 500, type: "pppoe_renewal", mpesa_ref: "SBK5678DEF", phone: "+254723456789", status: "success", created_at: "2026-02-25T13:15:00Z" },
  { id: "t3", user_id: "4", user_name: "Grace Akinyi", amount: 1500, type: "pppoe_renewal", mpesa_ref: "SBK9012GHI", phone: "+254745678901", status: "success", created_at: "2026-02-25T11:00:00Z" },
  { id: "t4", user_id: "6", user_name: "Faith Njeri", amount: 50, type: "hotspot_purchase", mpesa_ref: "SBK3456JKL", phone: "+254767890123", status: "success", created_at: "2026-02-25T09:45:00Z" },
  { id: "t5", user_id: "8", user_name: "Ann Muthoni", amount: 150, type: "hotspot_purchase", mpesa_ref: "SBK7890MNO", phone: "+254789012345", status: "failed", created_at: "2026-02-25T08:20:00Z" },
  { id: "t6", user_id: "7", user_name: "John Otieno", amount: 500, type: "package_upgrade", mpesa_ref: "SBK2345PQR", phone: "+254778901234", status: "success", created_at: "2026-02-24T16:00:00Z" },
  { id: "t7", user_id: "3", user_name: "Peter Ochieng", amount: 50, type: "hotspot_purchase", mpesa_ref: "SBK6789STU", phone: "+254734567890", status: "pending", created_at: "2026-02-24T14:30:00Z" },
];

export const activeSessions: ActiveSession[] = [
  { id: "s1", username: "user001", ip_address: "192.168.88.101", mac_address: "AA:BB:CC:11:22:33", uptime: "2h 15m", bytes_in: 524288000, bytes_out: 104857600, mikrotik_name: "Router-Site1", package_tier: "standard" },
  { id: "s2", username: "user002", ip_address: "192.168.88.102", mac_address: "AA:BB:CC:44:55:66", uptime: "5h 42m", bytes_in: 2147483648, bytes_out: 536870912, mikrotik_name: "Router-Site1", package_tier: "premium" },
  { id: "s3", username: "user004", ip_address: "192.168.88.103", mac_address: "AA:BB:CC:77:88:99", uptime: "12h 30m", bytes_in: 5368709120, bytes_out: 1073741824, mikrotik_name: "Router-Site1", package_tier: "unlimited" },
  { id: "s4", username: "user006", ip_address: "192.168.88.104", mac_address: "DD:EE:FF:11:22:33", uptime: "0h 45m", bytes_in: 52428800, bytes_out: 10485760, mikrotik_name: "Router-Site1", package_tier: "basic" },
  { id: "s5", username: "user007", ip_address: "192.168.89.101", mac_address: "DD:EE:FF:44:55:66", uptime: "3h 20m", bytes_in: 1073741824, bytes_out: 268435456, mikrotik_name: "Router-Site2", package_tier: "premium" },
  { id: "s6", username: "user008", ip_address: "192.168.88.105", mac_address: "DD:EE:FF:77:88:99", uptime: "1h 10m", bytes_in: 209715200, bytes_out: 52428800, mikrotik_name: "Router-Site1", package_tier: "standard" },
];

export const tickets: Ticket[] = [
  { id: "tk1", user_name: "Peter Ochieng", title: "Cannot connect to WiFi", status: "open", priority: "high", created_at: "2026-02-25T15:00:00Z", assigned_to: null },
  { id: "tk2", user_name: "James Mwangi", title: "Slow internet speed", status: "in_progress", priority: "normal", created_at: "2026-02-25T10:00:00Z", assigned_to: "Tech-Brian" },
  { id: "tk3", user_name: "Grace Akinyi", title: "TV not connecting", status: "open", priority: "normal", created_at: "2026-02-24T18:00:00Z", assigned_to: null },
  { id: "tk4", user_name: "Mary Wanjiku", title: "M-Pesa payment not reflected", status: "resolved", priority: "high", created_at: "2026-02-24T09:00:00Z", assigned_to: "Support-Jane" },
  { id: "tk5", user_name: "David Kimani", title: "Account suspended wrongly", status: "open", priority: "critical", created_at: "2026-02-25T16:00:00Z", assigned_to: null },
];

export const routers: MikroTikRouter[] = [
  { id: "rt1", name: "Router-Site1", ip_address: "192.168.1.1", status: "online", cpu_load: 42, memory_used: 58, active_users: 45, uptime: "15d 8h 30m" },
  { id: "rt2", name: "Router-Site2", ip_address: "192.168.2.1", status: "online", cpu_load: 67, memory_used: 72, active_users: 32, uptime: "8d 12h 15m" },
  { id: "rt3", name: "Router-Site3", ip_address: "192.168.3.1", status: "offline", cpu_load: 0, memory_used: 0, active_users: 0, uptime: "0" },
];

export const revenueData = [
  { date: "Feb 1", revenue: 12500, transactions: 45 },
  { date: "Feb 5", revenue: 18200, transactions: 62 },
  { date: "Feb 9", revenue: 15800, transactions: 53 },
  { date: "Feb 13", revenue: 22400, transactions: 78 },
  { date: "Feb 17", revenue: 19600, transactions: 67 },
  { date: "Feb 21", revenue: 25100, transactions: 85 },
  { date: "Feb 25", revenue: 21300, transactions: 72 },
];

export const packageDistribution = [
  { name: "Basic", users: 120, revenue: 6000, fill: "hsl(var(--chart-4))" },
  { name: "Standard", users: 85, revenue: 12750, fill: "hsl(var(--chart-1))" },
  { name: "Premium", users: 42, revenue: 21000, fill: "hsl(var(--chart-2))" },
  { name: "Unlimited", users: 18, revenue: 27000, fill: "hsl(var(--chart-3))" },
];

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString()}`;
}
