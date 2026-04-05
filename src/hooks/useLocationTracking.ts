/**
 * src/hooks/useLocationTracking.ts
 *
 * Customer PWA hook for optional GPS location sharing.
 *
 * Flow:
 *   1. On mount, checks if user is on ISP network via /api/portal/network-check
 *   2. Requests permission once (shows modal via returned `needsConsent` flag)
 *   3. If granted AND on ISP network, starts periodic reporting every 5 minutes
 *   4. Stops automatically when component unmounts or user leaves ISP network
 *
 * Important: location is NEVER sent when the device is not on the ISP's
 * IP ranges (verified server-side too, but we guard client-side as well
 * to avoid unnecessary API calls).
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PermissionState = "prompt" | "granted" | "denied" | "unavailable";

export interface LocationTrackingState {
  permission:      PermissionState;
  onISPNetwork:    boolean;
  isReporting:     boolean;
  lastSent:        Date | null;
  error:           string | null;
  /** Call this when user clicks "Allow" in the consent modal */
  grantPermission: () => Promise<void>;
  /** Call this when user dismisses the consent modal */
  denyPermission:  () => void;
  /** True when we have enough info to show the consent modal */
  needsConsent:    boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REPORT_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const GEO_TIMEOUT_MS     = 10_000;
const GEO_MAX_AGE_MS     = 60_000;
const CONSENT_KEY        = "loc_consent";    // localStorage key

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLocationTracking(authToken: string | null): LocationTrackingState {
  const [permission,   setPermission]   = useState<PermissionState>("prompt");
  const [onISPNetwork, setOnISPNetwork] = useState(false);
  const [isReporting,  setIsReporting]  = useState(false);
  const [lastSent,     setLastSent]     = useState<Date | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Check if browser supports geolocation ──────────────────────────────────
  const isSupported = typeof navigator !== "undefined" && "geolocation" in navigator;

  // ── Verify ISP network on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!authToken) return;

    fetch("/api/portal/network-check", {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(r => r.json())
      .then(data => setOnISPNetwork(data.onISPNetwork === true))
      .catch(() => setOnISPNetwork(false));
  }, [authToken]);

  // ── Read cached permission from browser API ────────────────────────────────
  useEffect(() => {
    if (!isSupported) { setPermission("unavailable"); return; }

    navigator.permissions
      .query({ name: "geolocation" })
      .then(result => {
        setPermission(result.state as PermissionState);
        result.onchange = () => setPermission(result.state as PermissionState);
      })
      .catch(() => {
        // Browser doesn't support permissions API — treat as prompt
        setPermission("prompt");
      });
  }, [isSupported]);

  // ── Core: get current GPS position ────────────────────────────────────────
  const getCurrentPosition = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout:            GEO_TIMEOUT_MS,
        maximumAge:         GEO_MAX_AGE_MS,
      })
    );

  // ── Send location to API ───────────────────────────────────────────────────
  const sendLocation = useCallback(async () => {
    if (!authToken || !onISPNetwork) return;

    try {
      const pos = await getCurrentPosition();
      const res = await fetch("/api/portal/location", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLastSent(new Date());
      setError(null);
    } catch (err: any) {
      console.debug("Location report skipped:", err?.message);
      if (err?.code === err?.PERMISSION_DENIED) {
        setPermission("denied");
        stopReporting();
      }
    }
  }, [authToken, onISPNetwork]); // eslint-disable-line

  // ── Start / stop periodic reporting ───────────────────────────────────────
  const startReporting = useCallback(() => {
    if (intervalRef.current) return; // already running

    setIsReporting(true);
    sendLocation(); // immediate first report

    intervalRef.current = setInterval(sendLocation, REPORT_INTERVAL_MS);
  }, [sendLocation]);

  const stopReporting = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsReporting(false);
  }, []);

  // ── Auto-start when conditions are met ────────────────────────────────────
  useEffect(() => {
    const hasConsent = localStorage.getItem(CONSENT_KEY) === "granted";

    if (permission === "granted" && onISPNetwork && hasConsent) {
      startReporting();
    } else {
      stopReporting();
    }

    return stopReporting;
  }, [permission, onISPNetwork, startReporting, stopReporting]);

  // ── User actions ───────────────────────────────────────────────────────────
  const grantPermission = async () => {
    if (!isSupported) return;
    try {
      // Trigger the browser permission dialog
      await getCurrentPosition();
      localStorage.setItem(CONSENT_KEY, "granted");
      setPermission("granted");
    } catch (err: unknown) {
      if (err?.code === 1 /* PERMISSION_DENIED */) {
        setPermission("denied");
        localStorage.setItem(CONSENT_KEY, "denied");
      } else {
        setError(err?.message ?? "GPS error");
      }
    }
  };

  const denyPermission = () => {
    localStorage.setItem(CONSENT_KEY, "denied");
    setPermission("denied");
  };

  // Show consent modal when:
  //   - user is on ISP network
  //   - browser permission is "prompt"
  //   - user hasn't already made a choice in our app
  const needsConsent =
    onISPNetwork &&
    permission === "prompt" &&
    localStorage.getItem(CONSENT_KEY) === null;

  return {
    permission,
    onISPNetwork,
    isReporting,
    lastSent,
    error,
    grantPermission,
    denyPermission,
    needsConsent,
  };
}
