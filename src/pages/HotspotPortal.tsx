import { useState } from "react";
import { Wifi, Phone, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { packages, formatKES } from "@/lib/mockData";

const HotspotPortal = () => {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"select" | "phone" | "processing" | "success">("select");

  const handlePurchase = () => {
    if (!selectedPackage || !phone) return;
    setStep("processing");
    setTimeout(() => setStep("success"), 3000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Wifi className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gradient">Connect to WiFi</h1>
          <p className="text-sm text-muted-foreground">Select a package and pay via M-Pesa</p>
        </div>

        {step === "select" && (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => { setSelectedPackage(pkg.id); setStep("phone"); }}
                className={`w-full glass-card p-4 text-left transition-all duration-200 hover:border-primary/50 active:scale-[0.99]`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-foreground">{pkg.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{pkg.speed_down} · {pkg.duration_days}d · {pkg.max_devices} devices</p>
                  </div>
                  <p className="text-lg font-extrabold text-primary">{formatKES(pkg.price)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === "phone" && (
          <div className="glass-card p-6 space-y-5">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Selected: <span className="font-semibold text-foreground">{packages.find(p => p.id === selectedPackage)?.name}</span></p>
              <p className="text-2xl font-extrabold text-primary mt-1">{formatKES(packages.find(p => p.id === selectedPackage)?.price || 0)}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">M-Pesa Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="0712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9 bg-muted/50 border-border"
                  type="tel"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("select"); setSelectedPackage(null); }}>
                Back
              </Button>
              <Button className="flex-1" onClick={handlePurchase} disabled={!phone || phone.length < 10}>
                Pay via M-Pesa
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="glass-card p-10 text-center space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
            <div>
              <p className="font-semibold">STK Push Sent</p>
              <p className="text-sm text-muted-foreground mt-1">Enter your M-Pesa PIN on your phone to complete payment</p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="glass-card p-10 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <div>
              <p className="font-bold text-lg">Connected!</p>
              <p className="text-sm text-muted-foreground mt-1">Your password has been sent via SMS. Enjoy your WiFi!</p>
            </div>
            <Button className="w-full" onClick={() => { setStep("select"); setSelectedPackage(null); setPhone(""); }}>
              Done
            </Button>
          </div>
        )}

        <p className="text-[10px] text-center text-muted-foreground">WiFi Billing System v2.0 · Powered by MikroTik</p>
      </div>
    </div>
  );
};

export default HotspotPortal;
