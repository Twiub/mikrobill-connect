import AdminLayout from "@/components/AdminLayout";
import StatusBadge from "@/components/StatusBadge";
import { transactions, formatKES } from "@/lib/mockData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TransactionsPage = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">M-Pesa payment history</p>
        </div>

        <div className="glass-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">M-Pesa Ref</TableHead>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Amount</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id} className="border-border/30">
                  <TableCell className="text-xs font-mono font-semibold text-primary">{t.mpesa_ref}</TableCell>
                  <TableCell className="text-sm font-medium">{t.user_name}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{t.phone}</TableCell>
                  <TableCell className="text-sm font-mono font-semibold">{formatKES(t.amount)}</TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">{t.type.replace(/_/g, " ")}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default TransactionsPage;
