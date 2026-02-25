// Mock data for WiFi Billing System v2.0

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
  mac_binding?: string;
  static_ip?: string;
  kyc_verified?: boolean;
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
  description?: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "critical";
  created_at: string;
  assigned_to: string | null;
  lat?: number;
  lng?: number;
  gps_accuracy?: number;
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
  model?: string;
  firmware?: string;
  interfaces?: RouterInterface[];
}

export interface RouterInterface {
  name: string;
  type: string;
  tx_rate: number;
  rx_rate: number;
  status: "up" | "down";
}

export interface KYCRecord {
  id: string;
  user_id: string;
  user_name: string;
  full_name: string;
  id_number: string;
  id_type: "national_id" | "passport" | "military_id";
  phone: string;
  address: string;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface ErrorLog {
  id: string;
  level: "error" | "warn" | "info";
  message: string;
  stack?: string;
  service: "api" | "radius" | "mikrotik" | "mpesa" | "sms";
  context?: Record<string, string>;
  resolved: boolean;
  resolved_by?: string;
  created_at: string;
}

export interface Expenditure {
  id: string;
  category: "bandwidth" | "equipment" | "salary" | "power" | "office" | "other";
  description: string;
  amount: number;
  expense_date: string;
  receipt_url?: string;
  added_by: string;
  created_at: string;
}

export interface BandwidthSchedule {
  id: string;
  package_id: string;
  package_name: string;
  day_of_week: number[] | null;
  start_time: string;
  end_time: string;
  rate_down: string;
  rate_up: string;
  label: string;
}

export interface Notification {
  id: string;
  type: "expiry" | "payment" | "outage" | "ticket" | "broadcast" | "system";
  title: string;
  message: string;
  channel: "sms" | "push" | "both";
  target: "all" | "segment" | "individual";
  target_name?: string;
  sent_at: string;
  status: "sent" | "failed" | "pending";
}

export interface AIHealthReport {
  id: string;
  timestamp: string;
  overall_status: "healthy" | "warning" | "critical";
  summary: string;
  checks: AIHealthCheck[];
  recommendations: string[];
}

export interface AIHealthCheck {
  component: string;
  status: "ok" | "warning" | "critical";
  metric: string;
  value: string;
  threshold: string;
}

export interface ConnectedDevice {
  id: string;
  user_id: string;
  mac_address: string;
  ip_address: string;
  hostname: string;
  device_type: "phone" | "laptop" | "tv" | "tablet" | "other";
  last_seen: string;
  blocked: boolean;
  bytes_total: number;
}

export interface SharingViolation {
  id: string;
  user_id: string;
  username: string;
  detection_method: "device_count" | "ttl_analysis" | "user_agent" | "traffic_pattern";
  device_count: number;
  max_devices: number;
  action_taken: "throttled" | "disconnected" | "warned";
  created_at: string;
}

// ==================== DATA ====================

export const packages: Package[] = [
  { id: "1", name: "Basic", tier: "basic", price: 50, speed_down: "5 Mbps", speed_up: "2 Mbps", duration_days: 1, max_devices: 5, type: "both", active: true },
  { id: "2", name: "Standard", tier: "standard", price: 150, speed_down: "10 Mbps", speed_up: "4 Mbps", duration_days: 3, max_devices: 10, type: "both", active: true },
  { id: "3", name: "Premium", tier: "premium", price: 500, speed_down: "20 Mbps", speed_up: "8 Mbps", duration_days: 7, max_devices: 20, type: "both", active: true },
  { id: "4", name: "Unlimited", tier: "unlimited", price: 1500, speed_down: "50 Mbps", speed_up: "20 Mbps", duration_days: 30, max_devices: 50, type: "both", active: true },
];

export const users: User[] = [
  { id: "1", username: "user001", phone: "+254712345678", full_name: "James Mwangi", type: "hotspot", status: "active", package_id: "2", package_name: "Standard", expires_at: "2026-03-15T10:00:00Z", created_at: "2026-01-10T08:00:00Z", mikrotik_id: "rt1", devices_count: 3, data_used_gb: 12.4, kyc_verified: true },
  { id: "2", username: "user002", phone: "+254723456789", full_name: "Mary Wanjiku", type: "pppoe", status: "active", package_id: "3", package_name: "Premium", expires_at: "2026-03-20T10:00:00Z", created_at: "2026-01-05T08:00:00Z", mikrotik_id: "rt1", devices_count: 8, data_used_gb: 45.2, mac_binding: "AA:BB:CC:44:55:66", static_ip: "192.168.100.50", kyc_verified: true },
  { id: "3", username: "user003", phone: "+254734567890", full_name: "Peter Ochieng", type: "hotspot", status: "expired", package_id: "1", package_name: "Basic", expires_at: "2026-02-20T10:00:00Z", created_at: "2026-02-01T08:00:00Z", mikrotik_id: "rt2", devices_count: 1, data_used_gb: 2.1, kyc_verified: false },
  { id: "4", username: "user004", phone: "+254745678901", full_name: "Grace Akinyi", type: "pppoe", status: "active", package_id: "4", package_name: "Unlimited", expires_at: "2026-04-01T10:00:00Z", created_at: "2025-12-15T08:00:00Z", mikrotik_id: "rt1", devices_count: 15, data_used_gb: 120.8, mac_binding: "AA:BB:CC:77:88:99", static_ip: "192.168.100.51", kyc_verified: true },
  { id: "5", username: "user005", phone: "+254756789012", full_name: "David Kimani", type: "hotspot", status: "suspended", package_id: "2", package_name: "Standard", expires_at: "2026-03-01T10:00:00Z", created_at: "2026-01-20T08:00:00Z", mikrotik_id: "rt2", devices_count: 0, data_used_gb: 8.9, kyc_verified: true },
  { id: "6", username: "user006", phone: "+254767890123", full_name: "Faith Njeri", type: "hotspot", status: "active", package_id: "1", package_name: "Basic", expires_at: "2026-02-26T10:00:00Z", created_at: "2026-02-20T08:00:00Z", mikrotik_id: "rt1", devices_count: 2, data_used_gb: 1.5, kyc_verified: false },
  { id: "7", username: "user007", phone: "+254778901234", full_name: "John Otieno", type: "pppoe", status: "active", package_id: "3", package_name: "Premium", expires_at: "2026-03-10T10:00:00Z", created_at: "2026-01-15T08:00:00Z", mikrotik_id: "rt2", devices_count: 6, data_used_gb: 34.7, kyc_verified: true },
  { id: "8", username: "user008", phone: "+254789012345", full_name: "Ann Muthoni", type: "hotspot", status: "active", package_id: "2", package_name: "Standard", expires_at: "2026-02-28T10:00:00Z", created_at: "2026-02-10T08:00:00Z", mikrotik_id: "rt1", devices_count: 4, data_used_gb: 6.3, kyc_verified: true },
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
  { id: "tk1", user_name: "Peter Ochieng", title: "Cannot connect to WiFi", description: "I've been unable to connect since this morning. My phone shows the network but won't authenticate.", status: "open", priority: "high", created_at: "2026-02-25T15:00:00Z", assigned_to: null, lat: -1.2864, lng: 36.8172, gps_accuracy: 15 },
  { id: "tk2", user_name: "James Mwangi", title: "Slow internet speed", description: "Downloads are very slow, getting about 1Mbps instead of 10Mbps on Standard package.", status: "in_progress", priority: "normal", created_at: "2026-02-25T10:00:00Z", assigned_to: "Tech-Brian", lat: -1.2921, lng: 36.8219, gps_accuracy: 20 },
  { id: "tk3", user_name: "Grace Akinyi", title: "TV not connecting", description: "My Smart TV cannot access the captive portal. Need TV binding.", status: "open", priority: "normal", created_at: "2026-02-24T18:00:00Z", assigned_to: null, lat: -1.2980, lng: 36.8120, gps_accuracy: 10 },
  { id: "tk4", user_name: "Mary Wanjiku", title: "M-Pesa payment not reflected", description: "I paid KES 500 via M-Pesa 2 hours ago but my account still shows expired.", status: "resolved", priority: "high", created_at: "2026-02-24T09:00:00Z", assigned_to: "Support-Jane", lat: -1.2750, lng: 36.8300, gps_accuracy: 25 },
  { id: "tk5", user_name: "David Kimani", title: "Account suspended wrongly", description: "My account was suspended but I haven't violated any terms. Please investigate.", status: "open", priority: "critical", created_at: "2026-02-25T16:00:00Z", assigned_to: null, lat: -1.3010, lng: 36.8050, gps_accuracy: 12 },
];

export const routers: MikroTikRouter[] = [
  { id: "rt1", name: "Router-Site1", ip_address: "192.168.1.1", status: "online", cpu_load: 42, memory_used: 58, active_users: 45, uptime: "15d 8h 30m", model: "hAP ac³", firmware: "7.12.1", interfaces: [
    { name: "ether1-WAN", type: "ethernet", tx_rate: 45000000, rx_rate: 120000000, status: "up" },
    { name: "ether2-LAN", type: "ethernet", tx_rate: 95000000, rx_rate: 35000000, status: "up" },
    { name: "wlan1", type: "wireless", tx_rate: 75000000, rx_rate: 28000000, status: "up" },
    { name: "wlan2", type: "wireless", tx_rate: 42000000, rx_rate: 15000000, status: "up" },
  ]},
  { id: "rt2", name: "Router-Site2", ip_address: "192.168.2.1", status: "online", cpu_load: 67, memory_used: 72, active_users: 32, uptime: "8d 12h 15m", model: "RB4011iGS+", firmware: "7.12.1", interfaces: [
    { name: "ether1-WAN", type: "ethernet", tx_rate: 32000000, rx_rate: 85000000, status: "up" },
    { name: "ether2-LAN", type: "ethernet", tx_rate: 65000000, rx_rate: 22000000, status: "up" },
    { name: "wlan1", type: "wireless", tx_rate: 55000000, rx_rate: 20000000, status: "up" },
  ]},
  { id: "rt3", name: "Router-Site3", ip_address: "192.168.3.1", status: "offline", cpu_load: 0, memory_used: 0, active_users: 0, uptime: "0", model: "hAP ac²", firmware: "7.11.2", interfaces: [] },
];

export const kycRecords: KYCRecord[] = [
  { id: "kyc1", user_id: "1", user_name: "James Mwangi", full_name: "James Mwangi Karanja", id_number: "****5678", id_type: "national_id", phone: "+254712345678", address: "Westlands, Nairobi", verified: true, verified_by: "Admin-Sarah", verified_at: "2026-01-12T10:00:00Z", created_at: "2026-01-10T08:00:00Z" },
  { id: "kyc2", user_id: "2", user_name: "Mary Wanjiku", full_name: "Mary Wanjiku Ngugi", id_number: "****3456", id_type: "national_id", phone: "+254723456789", address: "Kilimani, Nairobi", verified: true, verified_by: "Admin-Sarah", verified_at: "2026-01-07T14:00:00Z", created_at: "2026-01-05T08:00:00Z" },
  { id: "kyc3", user_id: "3", user_name: "Peter Ochieng", full_name: "Peter Ochieng Otieno", id_number: "****7890", id_type: "national_id", phone: "+254734567890", address: "Umoja, Nairobi", verified: false, verified_by: null, verified_at: null, created_at: "2026-02-01T08:00:00Z" },
  { id: "kyc4", user_id: "4", user_name: "Grace Akinyi", full_name: "Grace Akinyi Odhiambo", id_number: "****8901", id_type: "national_id", phone: "+254745678901", address: "Karen, Nairobi", verified: true, verified_by: "Admin-Sarah", verified_at: "2025-12-20T09:00:00Z", created_at: "2025-12-15T08:00:00Z" },
  { id: "kyc5", user_id: "5", user_name: "David Kimani", full_name: "David Kimani Njoroge", id_number: "****9012", id_type: "national_id", phone: "+254756789012", address: "Eastleigh, Nairobi", verified: true, verified_by: "Admin-Sarah", verified_at: "2026-01-22T11:00:00Z", created_at: "2026-01-20T08:00:00Z" },
  { id: "kyc6", user_id: "6", user_name: "Faith Njeri", full_name: "Faith Njeri Kamau", id_number: "****0123", id_type: "national_id", phone: "+254767890123", address: "Pangani, Nairobi", verified: false, verified_by: null, verified_at: null, created_at: "2026-02-20T08:00:00Z" },
];

export const errorLogs: ErrorLog[] = [
  { id: "e1", level: "error", message: "RADIUS authentication timeout for user003", service: "radius", context: { user_id: "3", mikrotik_id: "rt2" }, resolved: false, created_at: "2026-02-25T15:30:00Z" },
  { id: "e2", level: "error", message: "M-Pesa STK Push failed: timeout from Daraja API", service: "mpesa", context: { phone: "+254789012345", amount: "150" }, resolved: true, resolved_by: "Admin-Sarah", created_at: "2026-02-25T08:20:00Z" },
  { id: "e3", level: "warn", message: "Router-Site2 CPU load exceeded 65% threshold", service: "mikrotik", context: { mikrotik_id: "rt2", cpu: "67" }, resolved: false, created_at: "2026-02-25T14:00:00Z" },
  { id: "e4", level: "error", message: "SMS delivery failed to +254734567890", service: "sms", context: { user_id: "3", provider: "africas_talking" }, resolved: false, created_at: "2026-02-25T12:00:00Z" },
  { id: "e5", level: "warn", message: "Database connection pool at 78% capacity", service: "api", resolved: true, resolved_by: "Admin-Tech", created_at: "2026-02-25T06:00:00Z" },
  { id: "e6", level: "info", message: "Scheduled RADIUS sync completed successfully", service: "radius", resolved: false, created_at: "2026-02-25T05:00:00Z" },
  { id: "e7", level: "error", message: "Router-Site3 unreachable — ping timeout 3 min", service: "mikrotik", context: { mikrotik_id: "rt3" }, resolved: false, created_at: "2026-02-24T22:00:00Z" },
  { id: "e8", level: "warn", message: "Hotspot sharing detected: user005 has 12 devices (limit: 10)", service: "api", context: { user_id: "5", devices: "12" }, resolved: true, resolved_by: "Admin-Brian", created_at: "2026-02-24T18:00:00Z" },
];

export const expenditures: Expenditure[] = [
  { id: "exp1", category: "bandwidth", description: "Safaricom fiber monthly (100Mbps)", amount: 25000, expense_date: "2026-02-01", added_by: "Super Admin", created_at: "2026-02-01T08:00:00Z" },
  { id: "exp2", category: "equipment", description: "MikroTik hAP ac³ replacement", amount: 18500, expense_date: "2026-02-05", added_by: "Super Admin", created_at: "2026-02-05T10:00:00Z" },
  { id: "exp3", category: "salary", description: "Field technician — Brian (Feb)", amount: 35000, expense_date: "2026-02-01", added_by: "Super Admin", created_at: "2026-02-01T08:00:00Z" },
  { id: "exp4", category: "salary", description: "Support agent — Jane (Feb)", amount: 28000, expense_date: "2026-02-01", added_by: "Super Admin", created_at: "2026-02-01T08:00:00Z" },
  { id: "exp5", category: "power", description: "Electricity bill — Server room", amount: 8500, expense_date: "2026-02-10", added_by: "Super Admin", created_at: "2026-02-10T08:00:00Z" },
  { id: "exp6", category: "office", description: "Office rent (Feb)", amount: 15000, expense_date: "2026-02-01", added_by: "Super Admin", created_at: "2026-02-01T08:00:00Z" },
  { id: "exp7", category: "other", description: "Africa's Talking SMS credits", amount: 5000, expense_date: "2026-02-15", added_by: "Super Admin", created_at: "2026-02-15T08:00:00Z" },
];

export const bandwidthSchedules: BandwidthSchedule[] = [
  { id: "bs1", package_id: "1", package_name: "Basic", day_of_week: null, start_time: "06:00", end_time: "18:00", rate_down: "5M", rate_up: "2M", label: "Daytime" },
  { id: "bs2", package_id: "1", package_name: "Basic", day_of_week: null, start_time: "18:00", end_time: "06:00", rate_down: "8M", rate_up: "3M", label: "Night Boost" },
  { id: "bs3", package_id: "2", package_name: "Standard", day_of_week: null, start_time: "06:00", end_time: "18:00", rate_down: "10M", rate_up: "4M", label: "Daytime" },
  { id: "bs4", package_id: "2", package_name: "Standard", day_of_week: null, start_time: "18:00", end_time: "06:00", rate_down: "15M", rate_up: "6M", label: "Night Boost" },
  { id: "bs5", package_id: "3", package_name: "Premium", day_of_week: [0, 6], start_time: "00:00", end_time: "23:59", rate_down: "30M", rate_up: "12M", label: "Weekend Boost" },
  { id: "bs6", package_id: "4", package_name: "Unlimited", day_of_week: null, start_time: "00:00", end_time: "23:59", rate_down: "50M", rate_up: "20M", label: "Always Max" },
];

export const notifications: Notification[] = [
  { id: "n1", type: "expiry", title: "Package Expiry Warning", message: "Your WiFi package expires in 24 hours. Renew now.", channel: "both", target: "individual", target_name: "Faith Njeri", sent_at: "2026-02-25T10:00:00Z", status: "sent" },
  { id: "n2", type: "payment", title: "Payment Received", message: "Payment of KES 500 received. Active until Mar 20.", channel: "both", target: "individual", target_name: "Mary Wanjiku", sent_at: "2026-02-25T13:15:00Z", status: "sent" },
  { id: "n3", type: "outage", title: "Network Outage", message: "We're experiencing an outage at Site 3. Working on it.", channel: "both", target: "segment", target_name: "Router-Site3 Users", sent_at: "2026-02-24T22:10:00Z", status: "sent" },
  { id: "n4", type: "broadcast", title: "New Premium Package", message: "Try our new Premium package — 20Mbps for just KES 500/week!", channel: "sms", target: "all", sent_at: "2026-02-23T09:00:00Z", status: "sent" },
  { id: "n5", type: "ticket", title: "Ticket Updated", message: "Your ticket #tk4 has been resolved by Support-Jane.", channel: "push", target: "individual", target_name: "Mary Wanjiku", sent_at: "2026-02-24T15:00:00Z", status: "sent" },
  { id: "n6", type: "system", title: "Scheduled Maintenance", message: "Maintenance window: Feb 28, 2-4 AM. Expect brief downtime.", channel: "both", target: "all", sent_at: "2026-02-25T16:00:00Z", status: "pending" },
];

export const aiHealthReport: AIHealthReport = {
  id: "ahr1",
  timestamp: "2026-02-25T16:00:00Z",
  overall_status: "warning",
  summary: "System is mostly healthy but Router-Site3 has been offline for 18 hours. M-Pesa STK success rate dropped to 92% in the last hour. Recommend investigating Router-Site3 connectivity and checking Daraja API status.",
  checks: [
    { component: "RADIUS Server", status: "ok", metric: "Auth Success Rate", value: "99.2%", threshold: "> 99%" },
    { component: "API Server", status: "ok", metric: "Response Time (p95)", value: "145ms", threshold: "< 200ms" },
    { component: "M-Pesa Daraja", status: "warning", metric: "STK Success Rate", value: "92%", threshold: "> 95%" },
    { component: "Router-Site1", status: "ok", metric: "CPU Load", value: "42%", threshold: "< 70%" },
    { component: "Router-Site2", status: "warning", metric: "CPU Load", value: "67%", threshold: "< 70%" },
    { component: "Router-Site3", status: "critical", metric: "Status", value: "Offline 18h", threshold: "Online" },
    { component: "Database", status: "ok", metric: "Connection Pool", value: "45%", threshold: "< 80%" },
    { component: "Redis Cache", status: "ok", metric: "Memory Usage", value: "38%", threshold: "< 80%" },
    { component: "SMS Gateway", status: "ok", metric: "Delivery Rate", value: "98%", threshold: "> 95%" },
  ],
  recommendations: [
    "Dispatch field technician to Router-Site3 location. Router has been offline since Feb 24, 10PM.",
    "Monitor M-Pesa STK Push success rate — currently at 92%, below 95% threshold. Consider switching to backup Daraja credentials.",
    "Router-Site2 CPU is approaching threshold (67%). Consider load balancing or upgrading hardware.",
    "3 unverified KYC records pending review. Compliance deadline approaching.",
    "Consider sending re-engagement SMS to 5 lapsed users whose packages expired in the last 7 days.",
  ],
};

export const connectedDevices: ConnectedDevice[] = [
  { id: "d1", user_id: "1", mac_address: "AA:BB:CC:11:22:33", ip_address: "192.168.88.101", hostname: "James-iPhone", device_type: "phone", last_seen: "2026-02-25T16:00:00Z", blocked: false, bytes_total: 629145600 },
  { id: "d2", user_id: "1", mac_address: "AA:BB:CC:11:22:44", ip_address: "192.168.88.106", hostname: "James-Laptop", device_type: "laptop", last_seen: "2026-02-25T15:30:00Z", blocked: false, bytes_total: 2147483648 },
  { id: "d3", user_id: "1", mac_address: "AA:BB:CC:11:22:55", ip_address: "192.168.88.107", hostname: "James-Tablet", device_type: "tablet", last_seen: "2026-02-25T14:00:00Z", blocked: false, bytes_total: 104857600 },
  { id: "d4", user_id: "2", mac_address: "AA:BB:CC:44:55:66", ip_address: "192.168.88.102", hostname: "Mary-MacBook", device_type: "laptop", last_seen: "2026-02-25T16:00:00Z", blocked: false, bytes_total: 5368709120 },
  { id: "d5", user_id: "2", mac_address: "AA:BB:CC:44:55:77", ip_address: "192.168.88.108", hostname: "LG-SmartTV", device_type: "tv", last_seen: "2026-02-25T16:00:00Z", blocked: false, bytes_total: 10737418240 },
];

export const sharingViolations: SharingViolation[] = [
  { id: "sv1", user_id: "5", username: "user005", detection_method: "device_count", device_count: 12, max_devices: 10, action_taken: "throttled", created_at: "2026-02-24T18:00:00Z" },
  { id: "sv2", user_id: "3", username: "user003", detection_method: "ttl_analysis", device_count: 8, max_devices: 5, action_taken: "warned", created_at: "2026-02-23T14:00:00Z" },
  { id: "sv3", user_id: "1", username: "user001", detection_method: "user_agent", device_count: 6, max_devices: 10, action_taken: "warned", created_at: "2026-02-22T09:00:00Z" },
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

export const revenueByRouter = [
  { router: "Site 1", revenue: 78500, users: 45 },
  { router: "Site 2", revenue: 56400, users: 32 },
  { router: "Site 3", revenue: 0, users: 0 },
];

export const monthlyRevenue = [
  { month: "Sep", revenue: 98000, expenses: 85000 },
  { month: "Oct", revenue: 105000, expenses: 88000 },
  { month: "Nov", revenue: 112000, expenses: 90000 },
  { month: "Dec", revenue: 125000, expenses: 92000 },
  { month: "Jan", revenue: 118000, expenses: 95000 },
  { month: "Feb", revenue: 134900, expenses: 135000 },
];

export const customerSegments = [
  { segment: "Active", count: 180, percentage: 68, color: "hsl(var(--success))" },
  { segment: "Lapsed (<7d)", count: 35, percentage: 13, color: "hsl(var(--warning))" },
  { segment: "Churned (>30d)", count: 30, percentage: 11, color: "hsl(var(--destructive))" },
  { segment: "High Value", count: 20, percentage: 8, color: "hsl(var(--primary))" },
];

export const adminRoles = [
  { id: "ar1", name: "Super Admin", email: "admin@isp.co.ke", role: "super_admin" as const, permissions: ["*"], last_active: "2026-02-25T16:00:00Z" },
  { id: "ar2", name: "Sarah Kamau", email: "sarah@isp.co.ke", role: "billing_admin" as const, permissions: ["payments:*", "packages:*", "reports:financial"], last_active: "2026-02-25T14:00:00Z" },
  { id: "ar3", name: "Brian Ouma", email: "brian@isp.co.ke", role: "field_tech" as const, permissions: ["tickets:read", "tickets:update", "map:*"], last_active: "2026-02-25T12:00:00Z" },
  { id: "ar4", name: "Jane Wambui", email: "jane@isp.co.ke", role: "support_agent" as const, permissions: ["tickets:*", "users:read", "sessions:read"], last_active: "2026-02-25T15:30:00Z" },
  { id: "ar5", name: "Mike Ndungu", email: "mike@isp.co.ke", role: "network_admin" as const, permissions: ["mikrotik:*", "users:read", "sessions:*", "bandwidth:*"], last_active: "2026-02-25T10:00:00Z" },
  { id: "ar6", name: "Ann Mwende", email: "ann@isp.co.ke", role: "read_only" as const, permissions: ["*:read"], last_active: "2026-02-24T16:00:00Z" },
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
