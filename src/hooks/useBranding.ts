/**
 * src/hooks/useBranding.ts — v2.0.0 (Supabase-free)
 *
 * PHASE8-FIX: supabase.from("app_settings") replaced with fetch() to
 *   GET /api/admin/data/branding  (defined in backend/src/routes/admin/data.js)
 */

import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/authClient";

export interface Branding {
  company_name:    string;
  company_tagline: string;
  company_version: string;
  footer_text:     string;
  logo_url:        string | null;
  primary_color:   string;
  support_email:   string | null;
  support_phone:   string | null;
  support_url:     string | null;
  portal_welcome:  string;
  portal_subtext:  string;
  show_powered_by: boolean;
}

const DEFAULTS: Branding = {
  company_name:    "WiFi Billing System",
  company_tagline: "MikroTik ISP Platform",
  company_version: "v2.0",
  footer_text:     "WiFi Billing System · Powered by MikroTik",
  logo_url:        null,
  primary_color:   "#2563EB",
  support_email:   null,
  support_phone:   null,
  support_url:     null,
  portal_welcome:  "Welcome to our WiFi network",
  portal_subtext:  "Login or purchase a package to get started",
  show_powered_by: true,
};

export function useBranding(): { branding: Branding; isLoading: boolean } {
  const { data, isLoading } = useQuery<Branding>({
    queryKey: ["app_settings", "branding"],
    queryFn: async () => {
      const token = getToken();
      if (token) {
        // Admin session — use the full admin branding endpoint
        const res = await fetch("/api/admin/data/branding", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json() : null;
        if (data) return { ...DEFAULTS, ...(data as Partial<Branding>) };
      }
      // Portal / unauthenticated user — use the public portal branding endpoint
      const res = await fetch("/api/portal/branding");
      const data = res.ok ? await res.json() : null;
      if (data?.success) return { ...DEFAULTS, ...(data as Partial<Branding>) };
      return DEFAULTS;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — branding rarely changes
    retry: false,
  });

  return { branding: data ?? DEFAULTS, isLoading };
}
