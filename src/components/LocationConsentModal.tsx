import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocationConsentModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

const LocationConsentModal = ({ onAccept, onDecline }: LocationConsentModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="bg-card rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/10">
          <MapPin className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Share Your Location?</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Sharing your location helps us improve network coverage in your area. 
        Your location is only collected while connected to our network and is never shared with third parties.
      </p>
      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onDecline}>
          No Thanks
        </Button>
        <Button className="flex-1" onClick={onAccept}>
          Allow
        </Button>
      </div>
    </div>
  </div>
);

export default LocationConsentModal;
