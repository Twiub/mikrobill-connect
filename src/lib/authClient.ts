/**
 * frontend/src/lib/authClient.ts — Supabase shim
 *
 * Drop-in replacement that wraps Supabase auth to match the v3.20.0
 * authClient API surface. All pages importing getToken / authClient
 * will work without changes.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Token storage ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  // Supabase stores session in localStorage under sb-<ref>-auth-token
  // We pull from the supabase client's session synchronously
  const raw = Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(raw) || "");
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

// ─── Auth client ──────────────────────────────────────────────────────────────

export const authClient = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  },

  async signUp({
    email,
    password,
    options,
  }: {
    email: string;
    password: string;
    options?: { data?: { full_name?: string }; emailRedirectTo?: string };
  }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options?.data,
        emailRedirectTo: options?.emailRedirectTo,
      },
    });
    return { data, error };
  },

  async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: options?.redirectTo,
    });
    return { data, error };
  },

  async updateUser({ password }: { password: string; token?: string }) {
    const { data, error } = await supabase.auth.updateUser({ password });
    return { data, error };
  },

  getUser(): { id: string; email: string; role: string } | null {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) return null;
      return { id: payload.sub, email: payload.email, role: payload.role ?? "super_admin" };
    } catch {
      return null;
    }
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  getToken,
};
