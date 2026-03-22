// @ts-nocheck
/**
 * src/components/LocationConsentModal.tsx  — v3.4.0
 *
 * Redesigned consent modal for GPS location sharing in the subscriber portal.
 *
 * Design goals:
 *   • Warm, trust-building tone (not corporate/legal)
 *   • Clearly explains WHY location is requested (outage response, speed issues)
 *   • Hard guarantees on what we will NOT do (no 3rd party, no non-ISP tracking)
 *   • Dismissable at any time — declining never removes features
 *   • Escape key support
 *
 * Benefits communicated to user:
 *   - Faster outage response near their area
 *   - Network quality reports (latency/speed near them)
 *   - No impact if denied
 */

import { useEffect, useState } from "react";
import { MapPin, Shield, Zap, WifiOff, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onAccept:  () => Promise<void>;
  onDecline: () => void;
}

const BENEFITS = [
  {
    icon: <WifiOff className="h-4 w-4 text-amber-500" />,
    title: "Faster outage response",
    desc:  "When something's wrong in your area we can spot it and fix it faster.",
  },
  {
    icon: <Zap className="h-4 w-4 text-sky-500" />,
    title: "Better signal planning",
    desc:  "We use coverage data to position new equipment in areas that need it most.",
  },
  {
    icon: <Shield className="h-4 w-4 text-emerald-500" />,
    title: "Your data, your control",
    desc:  "Only collected while you're on our network. Stop any time from your browser settings.",
  },
];

const NOTS = [
  "Tracked on mobile data or other Wi-Fi",
  "Shared with advertisers or third parties",
  "Required for any portal feature",
  "Stored longer than 90 days",
];

const LocationConsentModal = ({ onAccept, onDecline }: Props) => {
  const [loading,  setLoading]  = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Escape key dismissal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onDecline(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onDecline]);

  const handleAccept = async () => {
    setLoading(true);
    try { await onAccept(); }
    finally { setLoading(false); }
  };

  return (
    /* Backdrop — click outside to dismiss */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onDecline(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loc-consent-title"
    >
      <div className="relative w-full max-w-sm rounded-3xl bg-card border border-border/60
                      shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">

        {/* Dismiss */}
        <button
          onClick={onDecline}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full
                     text-muted-foreground hover:bg-muted hover:text-foreground
                     transition-colors"
          aria-label="Not now"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Hero */}
        <div className="relative overflow-hidden px-6 pt-8 pb-6
                        bg-gradient-to-br from-sky-500/8 via-transparent to-emerald-500/8">
          {/* Decorative rings */}
          <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full
                          bg-sky-500/5 border border-sky-500/10" />
          <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full
                          bg-emerald-500/5 border border-emerald-500/10" />

          <div className="relative flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20
                              border border-border/60 flex items-center justify-center shadow-lg">
                <MapPin className="h-7 w-7 text-sky-500" />
              </div>
              {/* Pulse dot */}
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full
                                 bg-emerald-400 opacity-40" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500
                                 border-2 border-card" />
              </span>
            </div>
            <div>
              <h2 id="loc-consent-title" className="text-base font-bold leading-tight">
                Help us serve you better
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Share your location <em>only while on our network</em>
              </p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="px-6 pt-4 pb-2 space-y-3">
          {BENEFITS.map(b => (
            <div key={b.title} className="flex items-start gap-3">
              <div className="mt-0.5 h-7 w-7 rounded-lg bg-muted flex items-center
                              justify-center flex-shrink-0">
                {b.icon}
              </div>
              <div>
                <p className="text-sm font-medium leading-snug">{b.title}</p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Expandable "what we won't do" */}
        <div className="px-6 pb-2">
          <button
            onClick={() => setShowMore(s => !s)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground
                       hover:text-foreground transition-colors py-1"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showMore ? "rotate-90" : ""}`} />
            {showMore ? "Hide privacy details" : "See what we'll never do"}
          </button>

          {showMore && (
            <div className="mt-2 rounded-xl bg-muted/40 border border-border/50 p-3 space-y-1.5">
              {NOTS.map(item => (
                <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-destructive font-bold">✗</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-3 space-y-2">
          <Button
            onClick={handleAccept}
            disabled={loading}
            className="w-full gap-2 rounded-xl h-11 text-sm font-semibold
                       bg-gradient-to-r from-sky-500 to-emerald-500
                       hover:from-sky-600 hover:to-emerald-600 text-white border-0"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Requesting permission…
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                Allow location sharing
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={onDecline}
            className="w-full text-muted-foreground text-sm h-9"
          >
            Not now — maybe later
          </Button>
          <p className="text-center text-[10px] text-muted-foreground/60 leading-relaxed">
            Approving opens a browser permission dialog. You can revoke it any time
            from your browser's site settings.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LocationConsentModal;
