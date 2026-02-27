import AdminLayout from "@/components/AdminLayout";
import { usePackages, formatKES } from "@/hooks/useDatabase";
import { Zap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";

const PackagesPage = () => {
  const { data: packages, isLoading } = usePackages();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Packages</h1>
            <p className="text-sm text-muted-foreground mt-1">WiFi plans with QoS-based bandwidth</p>
          </div>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Package
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading packages...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages?.map((pkg: any) => (
              <div key={pkg.id} className="glass-card p-6 flex flex-col relative overflow-hidden group hover:border-primary/50 transition-colors">
                <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-[60px]" />
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">{pkg.name}</h3>
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-gradient mb-1">{formatKES(Number(pkg.price))}</p>
                <p className="text-xs text-muted-foreground mb-5">{pkg.duration_days} day{pkg.duration_days > 1 ? "s" : ""}</p>
                <div className="space-y-2.5 flex-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Download</span><span className="font-semibold">{pkg.speed_down}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Upload</span><span className="font-semibold">{pkg.speed_up}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Max Devices</span><span className="font-semibold">{pkg.max_devices}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Type</span><span className="font-semibold capitalize">{pkg.type}</span></div>
                </div>
                <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
                  <StatusBadge status={pkg.active ? "active" : "expired"} />
                  <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary">Edit</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default PackagesPage;
