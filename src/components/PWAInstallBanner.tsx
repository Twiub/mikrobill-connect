// @ts-nocheck
/**
 * src/components/PWAInstallBanner.tsx
 *
 * Install banner shown at the bottom of the hotspot/portal page when:
 *   - The PWA is not yet installed (not running in standalone mode)
 *   - The browser supports installation (beforeinstallprompt fired) OR user is on iOS
 *
 * The banner slides up from the bottom and can be dismissed.
 * On iOS it shows "Add to Home Screen" instructions instead of a button
 * (since iOS doesn't support programmatic install prompts).
 *
 * Usage:
 *   import { PWAInstallBanner } from "@/components/PWAInstallBanner";
 *
 *   // In your portal page:
 *   <PWAInstallBanner />
 */

import { useState } from "react";
import { Download, X, Share, Plus, Smartphone } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export function PWAInstallBanner() {
  const {
    isStandalone,
    canInstall,
    isIOS,
    showBanner,
    isPrompting,
    promptInstall,
    dismissBanner,
  } = usePWAInstall();

  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  // Don't show if already in PWA mode
  if (isStandalone) return null;

  // Don't show if banner hasn't triggered yet
  if (!showBanner) return null;

  // Don't show if can't install and not iOS
  if (!canInstall && !isIOS) return null;

  const handleInstall = async () => {
    if (isIOS) {
      setIosGuideOpen(true);
      return;
    }
    const result = await promptInstall();
    if (result === "accepted") {
      // Banner will auto-hide via appinstalled event
    }
  };

  return (
    <>
      {/* Install Banner */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300"
        style={{ maxWidth: "100vw" }}
      >
        <div
          className="mx-3 mb-3 rounded-2xl p-4 flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
            border: "1px solid rgba(99,102,241,0.4)",
            boxShadow: "0 -4px 32px rgba(99,102,241,0.2)",
          }}
        >
          {/* Icon */}
          <div
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.25)" }}
          >
            <Smartphone className="w-6 h-6 text-indigo-300" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">
              Install WiFi Portal
            </p>
            <p className="text-xs text-indigo-300 leading-tight mt-0.5">
              {isIOS
                ? "Add to Home Screen for faster access"
                : "One-tap access to your account & payments"}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleInstall}
              disabled={isPrompting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "rgba(99,102,241,0.7)" }}
            >
              <Download className="w-3.5 h-3.5" />
              {isPrompting ? "Installing…" : isIOS ? "How to" : "Install"}
            </button>
            <button
              onClick={dismissBanner}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-indigo-400 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS How-To Modal */}
      {iosGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setIosGuideOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "#1a1a2e", border: "1px solid rgba(99,102,241,0.3)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Add to Home Screen</h3>
              <button onClick={() => setIosGuideOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <Step
                num={1}
                icon={<Share className="w-5 h-5 text-blue-400" />}
                title="Tap the Share button"
                desc="At the bottom of Safari, tap the Share icon (square with arrow pointing up)"
              />
              <Step
                num={2}
                icon={<Plus className="w-5 h-5 text-green-400" />}
                title="Add to Home Screen"
                desc={'Scroll down in the share sheet and tap "Add to Home Screen"'}
              />
              <Step
                num={3}
                icon={<Smartphone className="w-5 h-5 text-indigo-400" />}
                title="Tap Add"
                desc={'Confirm by tapping "Add" in the top right — the app icon will appear on your home screen'}
              />
            </div>

            <button
              onClick={() => setIosGuideOpen(false)}
              className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: "rgba(99,102,241,0.6)" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Step({
  num,
  icon,
  title,
  desc,
}: {
  num: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ background: "rgba(99,102,241,0.4)" }}
      >
        {num}
      </div>
      <div>
        <p className="text-white text-sm font-medium flex items-center gap-2">
          {icon} {title}
        </p>
        <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
