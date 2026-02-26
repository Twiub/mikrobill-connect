
-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'network_admin', 'billing_admin', 'support_agent', 'field_tech', 'read_only');
CREATE TYPE public.package_tier AS ENUM ('basic', 'standard', 'premium', 'unlimited');
CREATE TYPE public.connection_type AS ENUM ('hotspot', 'pppoe', 'both');
CREATE TYPE public.subscriber_status AS ENUM ('active', 'expired', 'suspended');
CREATE TYPE public.transaction_type AS ENUM ('hotspot_purchase', 'pppoe_renewal', 'package_upgrade');
CREATE TYPE public.transaction_status AS ENUM ('success', 'failed', 'pending');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE public.router_status AS ENUM ('online', 'offline');
CREATE TYPE public.interface_status AS ENUM ('up', 'down');
CREATE TYPE public.id_type AS ENUM ('national_id', 'passport', 'military_id');
CREATE TYPE public.log_level AS ENUM ('error', 'warn', 'info');
CREATE TYPE public.log_service AS ENUM ('api', 'radius', 'mikrotik', 'mpesa', 'sms');
CREATE TYPE public.expense_category AS ENUM ('bandwidth', 'equipment', 'salary', 'power', 'office', 'other');
CREATE TYPE public.notification_type AS ENUM ('expiry', 'payment', 'outage', 'ticket', 'broadcast', 'system');
CREATE TYPE public.notification_channel AS ENUM ('sms', 'push', 'both');
CREATE TYPE public.notification_target AS ENUM ('all', 'segment', 'individual');
CREATE TYPE public.notification_status AS ENUM ('sent', 'failed', 'pending');
CREATE TYPE public.health_status AS ENUM ('healthy', 'warning', 'critical');
CREATE TYPE public.check_status AS ENUM ('ok', 'warning', 'critical');
CREATE TYPE public.device_type AS ENUM ('phone', 'laptop', 'tv', 'tablet', 'other');
CREATE TYPE public.detection_method AS ENUM ('device_count', 'ttl_analysis', 'user_agent', 'traffic_pattern');
CREATE TYPE public.violation_action AS ENUM ('throttled', 'disconnected', 'warned');

-- =============================================
-- PROFILES TABLE
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================
-- USER ROLES TABLE
-- =============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'read_only',
  permissions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin', 'network_admin', 'billing_admin', 'support_agent', 'field_tech'))
$$;

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- =============================================
-- PACKAGES TABLE
-- =============================================
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier package_tier NOT NULL DEFAULT 'basic',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  speed_down TEXT NOT NULL DEFAULT '5 Mbps',
  speed_up TEXT NOT NULL DEFAULT '2 Mbps',
  duration_days INTEGER NOT NULL DEFAULT 1,
  max_devices INTEGER NOT NULL DEFAULT 5,
  type connection_type NOT NULL DEFAULT 'both',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view packages" ON public.packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage packages" ON public.packages FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- SUBSCRIBERS TABLE
-- =============================================
CREATE TABLE public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  full_name TEXT NOT NULL,
  type connection_type NOT NULL DEFAULT 'hotspot',
  status subscriber_status NOT NULL DEFAULT 'active',
  package_id UUID REFERENCES public.packages(id),
  expires_at TIMESTAMPTZ,
  mikrotik_id TEXT,
  devices_count INTEGER NOT NULL DEFAULT 0,
  data_used_gb NUMERIC(10,2) NOT NULL DEFAULT 0,
  mac_binding TEXT,
  static_ip TEXT,
  kyc_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view subscribers" ON public.subscribers FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage subscribers" ON public.subscribers FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- TRANSACTIONS TABLE
-- =============================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES public.subscribers(id),
  user_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  type transaction_type NOT NULL,
  mpesa_ref TEXT,
  phone TEXT NOT NULL,
  status transaction_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view transactions" ON public.transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage transactions" ON public.transactions FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- ACTIVE SESSIONS TABLE
-- =============================================
CREATE TABLE public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  mac_address TEXT NOT NULL,
  uptime TEXT NOT NULL DEFAULT '0h 0m',
  bytes_in BIGINT NOT NULL DEFAULT 0,
  bytes_out BIGINT NOT NULL DEFAULT 0,
  mikrotik_name TEXT,
  package_tier TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view sessions" ON public.active_sessions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage sessions" ON public.active_sessions FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- TICKETS TABLE
-- =============================================
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES public.subscribers(id),
  user_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status ticket_status NOT NULL DEFAULT 'open',
  priority ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view tickets" ON public.tickets FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage tickets" ON public.tickets FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- ROUTERS TABLE
-- =============================================
CREATE TABLE public.routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  status router_status NOT NULL DEFAULT 'online',
  cpu_load INTEGER NOT NULL DEFAULT 0,
  memory_used INTEGER NOT NULL DEFAULT 0,
  active_users INTEGER NOT NULL DEFAULT 0,
  uptime TEXT NOT NULL DEFAULT '0',
  model TEXT,
  firmware TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view routers" ON public.routers FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage routers" ON public.routers FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- ROUTER INTERFACES TABLE
-- =============================================
CREATE TABLE public.router_interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  tx_rate BIGINT NOT NULL DEFAULT 0,
  rx_rate BIGINT NOT NULL DEFAULT 0,
  status interface_status NOT NULL DEFAULT 'up'
);
ALTER TABLE public.router_interfaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view interfaces" ON public.router_interfaces FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage interfaces" ON public.router_interfaces FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- KYC RECORDS TABLE
-- =============================================
CREATE TABLE public.kyc_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES public.subscribers(id),
  user_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  id_type id_type NOT NULL DEFAULT 'national_id',
  phone TEXT NOT NULL,
  address TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kyc_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view kyc" ON public.kyc_records FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage kyc" ON public.kyc_records FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- ERROR LOGS TABLE
-- =============================================
CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level log_level NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  stack TEXT,
  service log_service NOT NULL DEFAULT 'api',
  context JSONB DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view logs" ON public.error_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage logs" ON public.error_logs FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- EXPENDITURES TABLE
-- =============================================
CREATE TABLE public.expenditures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  added_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenditures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view expenditures" ON public.expenditures FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage expenditures" ON public.expenditures FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- BANDWIDTH SCHEDULES TABLE
-- =============================================
CREATE TABLE public.bandwidth_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES public.packages(id),
  day_of_week INTEGER[],
  start_time TIME NOT NULL DEFAULT '00:00',
  end_time TIME NOT NULL DEFAULT '23:59',
  rate_down TEXT NOT NULL,
  rate_up TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bandwidth_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view schedules" ON public.bandwidth_schedules FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage schedules" ON public.bandwidth_schedules FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'both',
  target notification_target NOT NULL DEFAULT 'all',
  target_name TEXT,
  status notification_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view notifications" ON public.notifications FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- CONNECTED DEVICES TABLE
-- =============================================
CREATE TABLE public.connected_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES public.subscribers(id),
  mac_address TEXT NOT NULL,
  ip_address TEXT,
  hostname TEXT,
  device_type device_type NOT NULL DEFAULT 'other',
  last_seen TIMESTAMPTZ DEFAULT now(),
  blocked BOOLEAN NOT NULL DEFAULT false,
  bytes_total BIGINT NOT NULL DEFAULT 0
);
ALTER TABLE public.connected_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view devices" ON public.connected_devices FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage devices" ON public.connected_devices FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- SHARING VIOLATIONS TABLE
-- =============================================
CREATE TABLE public.sharing_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES public.subscribers(id),
  username TEXT NOT NULL,
  detection_method detection_method NOT NULL,
  device_count INTEGER NOT NULL DEFAULT 0,
  max_devices INTEGER NOT NULL DEFAULT 0,
  action_taken violation_action NOT NULL DEFAULT 'warned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sharing_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view violations" ON public.sharing_violations FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage violations" ON public.sharing_violations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- IP BINDINGS TABLE
-- =============================================
CREATE TABLE public.ip_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES public.subscribers(id),
  username TEXT NOT NULL,
  mac_address TEXT NOT NULL,
  ip_address TEXT,
  binding_type TEXT NOT NULL DEFAULT 'mac',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view bindings" ON public.ip_bindings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage bindings" ON public.ip_bindings FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- AI HEALTH REPORTS TABLE
-- =============================================
CREATE TABLE public.ai_health_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overall_status health_status NOT NULL DEFAULT 'healthy',
  summary TEXT,
  checks JSONB DEFAULT '[]',
  recommendations TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_health_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view health" ON public.ai_health_reports FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage health" ON public.ai_health_reports FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- SYSTEM SETTINGS TABLE
-- =============================================
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view settings" ON public.system_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can manage settings" ON public.system_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- =============================================
-- TRIGGERS: auto-update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_subscribers_updated_at BEFORE UPDATE ON public.subscribers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.active_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_routers_updated_at BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- TRIGGER: auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
