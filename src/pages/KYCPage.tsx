import AdminLayout from "@/components/AdminLayout";
import { useKycRecords } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const KYCPage = () => {
  const [search, setSearch] = useState("");
  const { data: kycRecords = [] } = useKycRecords();
  const filtered = kycRecords.filter((k: any) =>
    k.full_name.toLowerCase().includes(search.toLowerCase()) ||
    k.phone.includes(search)
  );

  const verified = kycRecords.filter((k: any) => k.verified).length;
  const pending = kycRecords.filter((k: any) => !k.verified).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">KYC / Legal Compliance</h1>
            <p className="text-sm text-muted-foreground mt-1">Kenya ICT Act subscriber identity records</p>
          </div>
          <div className="flex gap-3">
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">{verified} verified</Badge>
            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">{pending} pending</Badge>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>

        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Full Name</TableHead>
                <TableHead className="text-xs">ID Type</TableHead>
                <TableHead className="text-xs">ID Number</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Address</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Verified By</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((kyc) => (
                <TableRow key={kyc.id} className="border-border/30">
                  <TableCell className="text-sm font-medium">{kyc.full_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">{kyc.id_type.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{kyc.id_number}</TableCell>
                  <TableCell className="text-xs font-mono">{kyc.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{kyc.address}</TableCell>
                  <TableCell>
                    {kyc.verified ? (
                      <div className="flex items-center gap-1 text-success">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-medium">Verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-warning">
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-medium">Pending</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{kyc.verified_by || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                        <FileText className="h-3 w-3" />
                        View ID
                      </Button>
                      {!kyc.verified && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-success hover:text-success">
                          Verify
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold mb-2">Data Retention Policy</h3>
          <div className="grid grid-cols-3 gap-4 text-[10px] text-muted-foreground">
            <div>• KYC records: retained indefinitely</div>
            <div>• IP/MAC history: JSONB auto-logged</div>
            <div>• Session logs: 90-day retention</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default KYCPage;
