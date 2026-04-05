/**
 * frontend/src/lib/authClient.ts
 *
 * Drop-in replacement for @/integrations/supabase/client.
 * Talks to our own /api/auth/* routes instead of Supabase.
 *
 * Usage (same pattern as the old supabase client):
 *   import { authClient } from "@/lib/authClient";
 *
 *   await authClient.signInWithPassword({ email, password });
 *   await authClient.signUp({ email, password, options: { data: { full_name } } });
 *   await authClient.resetPasswordForEmail(email);
 *   await authClient.updateUser({ password });  // for reset-password page
 *   await authClient.signOut();                 // server-side revocation + local clear
 *   const token = authClient.getToken();
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ─── Token storage ────────────────────────────────────────────────────────────

const TOKEN_KEY = "mb_auth_token";

function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/auth${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

// Authenticated POST — includes the stored JWT in Authorization header
async function authPost(path: string, body: Record<string, unknown> = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/auth${path}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

// ─── Auth client ──────────────────────────────────────────────────────────────

export const authClient = {
  /**
   * Sign in with email + password.
   * Stores the JWT in localStorage on success.
   */
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const data = await post("/login", { email, password });
      saveToken(data.token);
      return { data: { user: data.user, session: { access_token: data.token } }, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  },

  /**
   * Register a new admin user.
   */
  async signUp({
    email,
    password,
    options,
  }: {
    email: string;
    password: string;
    options?: { data?: { full_name?: string }; emailRedirectTo?: string };
  }) {
    try {
      const data = await post("/signup", {
        email,
        password,
        full_name: options?.data?.full_name ?? "",
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  },

  /**
   * Send a password reset email.
   */
  async resetPasswordForEmail(email: string, _options?: { redirectTo?: string }) {
    try {
      const data = await post("/forgot-password", { email });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  },

  /**
   * Set a new password using a reset token from the URL.
   * Call this from ResetPasswordPage after reading ?token= from the URL.
   */
  async updateUser({ password, token }: { password: string; token?: string }) {
    // token comes from ?token= query param on the reset page
    const resetToken = token ?? new URLSearchParams(window.location.search).get("token") ?? "";
    try {
      const data = await post("/reset-password", { token: resetToken, password });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  },

  /**
   * Get the current user from the stored JWT (decoded, no network call).
   * Returns null if not logged in or token is expired.
   */
  getUser(): { id: string; email: string; role: string } | null {
    const token = getToken();
    if (!token) return null;
    try {
      // Decode the JWT payload without verifying (verification happens server-side)
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        clearToken();
        return null;
      }
      return { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      return null;
    }
  },

  /**
   * Sign out — revokes the JWT server-side via the jti blocklist, then clears
   * the stored token locally. Falls back to local-only clear if the request fails.
   * SEC-AUTH-03 FIX: signOut() now hits POST /api/auth/logout so the token
   * is immediately invalid server-side, not just removed from localStorage.
   */
  async signOut(): Promise<void> {
    try {
      await authPost("/logout");
    } catch {
      // Non-fatal: token will expire naturally via its exp claim
    } finally {
      clearToken();
    }
  },

  /**
   * Returns the raw JWT string (for Authorization: Bearer headers).
   */
  getToken,
};
