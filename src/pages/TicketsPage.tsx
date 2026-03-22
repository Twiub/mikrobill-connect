// @ts-nocheck
import AdminLayout from "@/components/AdminLayout";
import StatusBadge from "@/components/StatusBadge";
import PriorityBadge from "@/components/PriorityBadge";
import { useTickets } from "@/hooks/useDatabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TicketsPage = () => {
  const { data: tickets, isLoading } = useTickets();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Support Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">User-reported issues with GPS location</p>
        </div>

        <div className="glass-card overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" /><p className="text-xs">Loading…</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs whitespace-nowrap">User</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Title</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Priority</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Assigned To</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets?.map((t: any) => (
                  <TableRow key={t.id} className="border-border/30 cursor-pointer hover:bg-muted/30">
                    <TableCell className="text-sm font-medium">{t.user_name}</TableCell>
                    <TableCell className="text-sm">{t.title}</TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.assigned_to || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && (!tickets || tickets.length === 0) && (
            <div className="p-12 text-center text-muted-foreground">
              <div className="text-4xl mb-3">🎫</div>
              <p className="text-sm font-medium">No support tickets</p>
              <p className="text-xs mt-1">User-submitted issues will appear here</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default TicketsPage;
