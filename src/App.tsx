import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
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

const P = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>{children}</ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/hotspot" element={<HotspotPortal />} />
            <Route path="/portal" element={<UserPortal />} />
            <Route path="/" element={<P><Index /></P>} />
            <Route path="/users" element={<P><UsersPage /></P>} />
            <Route path="/packages" element={<P><PackagesPage /></P>} />
            <Route path="/transactions" element={<P><TransactionsPage /></P>} />
            <Route path="/sessions" element={<P><SessionsPage /></P>} />
            <Route path="/tickets" element={<P><TicketsPage /></P>} />
            <Route path="/ticket-map" element={<P><TicketMapPage /></P>} />
            <Route path="/routers" element={<P><RoutersPage /></P>} />
            <Route path="/network" element={<P><NetworkMonitorPage /></P>} />
            <Route path="/analytics" element={<P><AnalyticsPage /></P>} />
            <Route path="/ai-health" element={<P><AIHealthPage /></P>} />
            <Route path="/error-logs" element={<P><ErrorLogsPage /></P>} />
            <Route path="/expenditure" element={<P><ExpenditurePage /></P>} />
            <Route path="/bandwidth" element={<P><BandwidthPage /></P>} />
            <Route path="/ip-binding" element={<P><IPBindingPage /></P>} />
            <Route path="/sharing" element={<P><SharingEnforcementPage /></P>} />
            <Route path="/kyc" element={<P><KYCPage /></P>} />
            <Route path="/notifications" element={<P><NotificationsPage /></P>} />
            <Route path="/admin-roles" element={<P><AdminRolesPage /></P>} />
            <Route path="/settings" element={<P><SettingsPage /></P>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
