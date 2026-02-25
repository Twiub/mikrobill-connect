import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import UsersPage from "./pages/UsersPage";
import PackagesPage from "./pages/PackagesPage";
import TransactionsPage from "./pages/TransactionsPage";
import SessionsPage from "./pages/SessionsPage";
import TicketsPage from "./pages/TicketsPage";
import RoutersPage from "./pages/RoutersPage";
import HotspotPortal from "./pages/HotspotPortal";
import AnalyticsPage from "./pages/AnalyticsPage";
import ErrorLogsPage from "./pages/ErrorLogsPage";
import ExpenditurePage from "./pages/ExpenditurePage";
import AIHealthPage from "./pages/AIHealthPage";
import KYCPage from "./pages/KYCPage";
import NotificationsPage from "./pages/NotificationsPage";
import BandwidthPage from "./pages/BandwidthPage";
import IPBindingPage from "./pages/IPBindingPage";
import SharingEnforcementPage from "./pages/SharingEnforcementPage";
import AdminRolesPage from "./pages/AdminRolesPage";
import SettingsPage from "./pages/SettingsPage";
import NetworkMonitorPage from "./pages/NetworkMonitorPage";
import TicketMapPage from "./pages/TicketMapPage";
import UserPortal from "./pages/UserPortal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/ticket-map" element={<TicketMapPage />} />
          <Route path="/routers" element={<RoutersPage />} />
          <Route path="/network" element={<NetworkMonitorPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/ai-health" element={<AIHealthPage />} />
          <Route path="/error-logs" element={<ErrorLogsPage />} />
          <Route path="/expenditure" element={<ExpenditurePage />} />
          <Route path="/bandwidth" element={<BandwidthPage />} />
          <Route path="/ip-binding" element={<IPBindingPage />} />
          <Route path="/sharing" element={<SharingEnforcementPage />} />
          <Route path="/kyc" element={<KYCPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin-roles" element={<AdminRolesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/hotspot" element={<HotspotPortal />} />
          <Route path="/portal" element={<UserPortal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
