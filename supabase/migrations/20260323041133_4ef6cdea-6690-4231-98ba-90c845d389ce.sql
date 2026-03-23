
-- 1. ip_pool_stats
CREATE TABLE public.ip_pool_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid REFERENCES public.routers(id) ON DELETE CASCADE,
  pool_name text NOT NULL,
  total_ips integer NOT NULL DEFAULT 0,
  used_ips integer NOT NULL DEFAULT 0,
  pct_used numeric GENERATED ALWAYS AS (CASE WHEN total_ips > 0 THEN ROUND((used_ips::numeric / total_ips) * 100, 1) ELSE 0 END) STORED,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_pool_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view ip_pool_stats" ON public.ip_pool_stats FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage ip_pool_stats" ON public.ip_pool_stats FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- 2. qos_stats
CREATE TABLE public.qos_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid REFERENCES public.routers(id) ON DELETE CASCADE,
  queue_name text NOT NULL,
  rate_limit text,
  bytes_in bigint NOT NULL DEFAULT 0,
  bytes_out bigint NOT NULL DEFAULT 0,
  drop_rate numeric NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qos_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view qos_stats" ON public.qos_stats FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage qos_stats" ON public.qos_stats FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- 3. v_qos_latest view (latest QoS per router+queue)
CREATE VIEW public.v_qos_latest AS
SELECT DISTINCT ON (router_id, queue_name)
  id, router_id, queue_name, rate_limit, bytes_in, bytes_out, drop_rate, recorded_at
FROM public.qos_stats
ORDER BY router_id, queue_name, recorded_at DESC;

-- 4. radiusdesk_aps
CREATE TABLE public.radiusdesk_aps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mac text NOT NULL UNIQUE,
  name text NOT NULL,
  lat double precision,
  lng double precision,
  status text NOT NULL DEFAULT 'unknown',
  connected_users integer NOT NULL DEFAULT 0,
  tx_bytes bigint NOT NULL DEFAULT 0,
  rx_bytes bigint NOT NULL DEFAULT 0,
  last_contact timestamptz
);
ALTER TABLE public.radiusdesk_aps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view radiusdesk_aps" ON public.radiusdesk_aps FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage radiusdesk_aps" ON public.radiusdesk_aps FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- 5. user_locations
CREATE TABLE public.user_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  username text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view user_locations" ON public.user_locations FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage user_locations" ON public.user_locations FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- 6. nas (RADIUS NAS devices)
CREATE TABLE public.nas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL,
  shortname text NOT NULL,
  nasname text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  secret text NOT NULL DEFAULT 'changeme',
  ports integer DEFAULT 3799,
  community text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view nas" ON public.nas FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage nas" ON public.nas FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- 7. staff
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  full_name text NOT NULL,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'field_tech',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view staff" ON public.staff FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage staff" ON public.staff FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- 8. expenditure_categories
CREATE TABLE public.expenditure_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expenditure_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view expenditure_categories" ON public.expenditure_categories FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage expenditure_categories" ON public.expenditure_categories FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- Seed default categories
INSERT INTO public.expenditure_categories (name, description) VALUES
  ('bandwidth', 'Internet bandwidth costs'),
  ('equipment', 'Hardware and equipment'),
  ('salary', 'Staff salaries'),
  ('power', 'Electricity and power'),
  ('office', 'Office expenses'),
  ('other', 'Miscellaneous');

-- 9. notification_templates
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  variables text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view notification_templates" ON public.notification_templates FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage notification_templates" ON public.notification_templates FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- Seed default templates
INSERT INTO public.notification_templates (type, title, body, variables) VALUES
  ('expiry', 'Package Expiring', 'Hi {{name}}, your {{package}} plan expires on {{date}}.', ARRAY['name','package','date']),
  ('payment', 'Payment Received', 'Hi {{name}}, KES {{amount}} received. Ref: {{ref}}.', ARRAY['name','amount','ref']),
  ('outage', 'Service Outage', 'We are experiencing issues in {{area}}. ETA: {{eta}}.', ARRAY['area','eta']);

-- 10. mpesa_config
CREATE TABLE public.mpesa_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcode text NOT NULL DEFAULT '',
  consumer_key text NOT NULL DEFAULT '',
  consumer_secret text NOT NULL DEFAULT '',
  passkey text NOT NULL DEFAULT '',
  callback_url text NOT NULL DEFAULT '',
  environment text NOT NULL DEFAULT 'sandbox',
  active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mpesa_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view mpesa_config" ON public.mpesa_config FOR SELECT TO authenticated USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins can manage mpesa_config" ON public.mpesa_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- 11. voucher_batches
CREATE TABLE public.voucher_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  batch_label text NOT NULL DEFAULT '',
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.voucher_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view voucher_batches" ON public.voucher_batches FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage voucher_batches" ON public.voucher_batches FOR ALL TO authenticated USING (is_admin(auth.uid()));

-- 12. vouchers
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL REFERENCES public.voucher_batches(batch_id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by_name text,
  redeemed_by_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view vouchers" ON public.vouchers FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can manage vouchers" ON public.vouchers FOR ALL TO authenticated USING (is_admin(auth.uid()));
