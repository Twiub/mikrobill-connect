/**
 * src/hooks/useBranding.ts — v2.0.0 (Supabase)
 * Reads branding from system_settings table.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  company_version: "v3.20",
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
      const { data: row } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "branding")
        .maybeSingle();
      if (!row?.value) return DEFAULTS;
      return { ...DEFAULTS, ...(row.value as Partial<Branding>) };
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { branding: data ?? DEFAULTS, isLoading };
}
