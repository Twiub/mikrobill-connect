import { ReactNode } from "react";
import AdminSidebar from "./AdminSidebar";

const AdminLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <main className="ml-64 p-6">{children}</main>
    </div>
  );
};

export default AdminLayout;
