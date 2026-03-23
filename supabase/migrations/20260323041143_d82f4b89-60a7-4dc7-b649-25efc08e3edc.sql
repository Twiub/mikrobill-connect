
DROP VIEW IF EXISTS public.v_qos_latest;
CREATE VIEW public.v_qos_latest WITH (security_invoker = true) AS
SELECT DISTINCT ON (router_id, queue_name)
  id, router_id, queue_name, rate_limit, bytes_in, bytes_out, drop_rate, recorded_at
FROM public.qos_stats
ORDER BY router_id, queue_name, recorded_at DESC;
