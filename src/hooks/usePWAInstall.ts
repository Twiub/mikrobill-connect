/**
 * src/hooks/usePWAInstall.ts
 *
 * React hook that manages PWA installation state and prompts.
 *
 * Features:
 *   - Detects if running inside installed PWA (standalone mode)
 *   - Captures the browser's beforeinstallprompt event for manual triggering
 *   - Detects if PWA was launched via web redirect (pwa_launch=1 param)
 *   - iOS-specific detection (navigator.standalone)
 *   - Returns prompt function, install state, and platform info
 *
 * Usage in HotspotPortal / UserPortal:
 *   const { isInstalled, isStandalone, canInstall, promptInstall, isIOS } = usePWAInstall();
 *
 *   if (!isInstalled && !isStandalone) {
 *     // Show "Add to Home Screen" banner
 *   }
 */

import { useState, useEffect, useCallback } from "react";

interface PWAInstallState {
  /** True if the app is running in standalone/PWA mode */
  isStandalone: boolean;
  /** True if PWA is confirmed installed (standalone OR launched via redirect) */
  isInstalled: boolean;
  /** True if browser supports installation and prompt is available */
  canInstall: boolean;
  /** True if running on iOS (Safari limitations apply) */
  isIOS: boolean;
  /** True if running on Android */
  isAndroid: boolean;
  /** True if this page was opened by the web→PWA redirect */
  isFromWebRedirect: boolean;
  /** Call this to trigger the native browser install prompt */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  /** True while install prompt is being shown */
  isPrompting: boolean;
  /** True if user already dismissed the install prompt this session */
  wasDismissed: boolean;
  /** Dismiss the in-app install banner without triggering the native prompt */
  dismissBanner: () => void;
  /** True if the in-app install banner should be shown */
  showBanner: boolean;
}

// Extend the BeforeInstallPromptEvent which is not in standard TypeScript lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPrompting, setIsPrompting]       = useState(false);
  const [wasDismissed, setWasDismissed]     = useState(false);
  const [showBanner, setShowBanner]         = useState(false);

  // ── Static detections ────────────────────────────────────────────────────
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches    ||
    window.matchMedia("(display-mode: fullscreen)").matches    ||
    window.matchMedia("(display-mode: minimal-ui)").matches    ||
    (navigator as { standalone?: boolean }).standalone === true;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
  const isAndroid = /android/i.test(navigator.userAgent);

  // Detect if we arrived via the web→PWA redirect
  const isFromWebRedirect = new URLSearchParams(window.location.search).get("pwa_launch") === "1";

  // Consider "installed" if: running standalone, OR arrived via PWA deep-link redirect
  const isInstalled = isStandalone || isFromWebRedirect;

  // ── Capture beforeinstallprompt ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault(); // Prevent default mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Auto-show install banner after 3 seconds on portal pages
      // (don't immediately interrupt the user)
      const path = window.location.pathname;
      const isPortalPage = path === "/hotspot" || path === "/portal";
      if (isPortalPage && !isStandalone) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isStandalone]);

  // ── Detect app installed (after user accepts prompt) ────────────────────
  useEffect(() => {
    const handler = () => {
      setDeferredPrompt(null);
      setShowBanner(false);
    };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  // ── iOS: show banner manually since beforeinstallprompt is not available ─
  useEffect(() => {
    if (isIOS && !isStandalone) {
      const path = window.location.pathname;
      const isPortalPage = path === "/hotspot" || path === "/portal";
      // Only show once per session
      const dismissed = sessionStorage.getItem("pwa-banner-dismissed");
      if (isPortalPage && !dismissed) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    }
  }, [isIOS, isStandalone]);

  // ── promptInstall ────────────────────────────────────────────────────────
  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";

    setIsPrompting(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowBanner(false);
      if (outcome === "dismissed") setWasDismissed(true);
      return outcome;
    } finally {
      setIsPrompting(false);
    }
  }, [deferredPrompt]);

  // ── dismissBanner ────────────────────────────────────────────────────────
  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    setWasDismissed(true);
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  }, []);

  return {
    isStandalone,
    isInstalled,
    canInstall: !!deferredPrompt,
    isIOS,
    isAndroid,
    isFromWebRedirect,
    promptInstall,
    isPrompting,
    wasDismissed,
    dismissBanner,
    showBanner,
  };
}
