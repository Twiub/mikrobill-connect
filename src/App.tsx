/**
 * App.tsx — WiFi Billing Edition (Stripped)
 */

import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";

import AuthPage          from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import HotspotPortal     from "./pages/HotspotPortal";
import UserPortal        from "./pages/UserPortal";
import JoinPage          from "./pages/JoinPage";
import NotFound          from "./pages/NotFound";

const Index                  = lazy(() => import("./pages/Index"));
const UsersPage              = lazy(() => import("./pages/UsersPage"));
const PackagesPage           = lazy(() => import("./pages/PackagesPage"));
const TransactionsPage       = lazy(() => import("./pages/TransactionsPage"));
const SessionsPage           = lazy(() => import("./pages/SessionsPage"));
const TicketsPage            = lazy(() => import("./pages/TicketsPage"));
const RoutersPage            = lazy(() => import("./pages/RoutersPage"));
const AnalyticsPage          = lazy(() => import("./pages/AnalyticsPage"));
const ErrorLogsPage          = lazy(() => import("./pages/ErrorLogsPage"));
const ExpenditurePage        = lazy(() => import("./pages/ExpenditurePage"));
const AIHealthPage           = lazy(() => import("./pages/AIHealthPage"));
const KYCPage                = lazy(() => import("./pages/KYCPage"));
const NotificationsPage      = lazy(() => import("./pages/NotificationsPage"));
const BandwidthPage          = lazy(() => import("./pages/BandwidthPage"));
const AutoRatePage           = lazy(() => import("./pages/AutoRatePage"));
const IPBindingPage          = lazy(() => import("./pages/IPBindingPage"));
const SharingEnforcementPage = lazy(() => import("./pages/SharingEnforcementPage"));
const AdminRolesPage         = lazy(() => import("./pages/AdminRolesPage"));
const SettingsPage           = lazy(() => import("./pages/SettingsPage"));
const NetworkMonitorPage     = lazy(() => import("./pages/NetworkMonitorPage"));
const IPPoolPage             = lazy(() => import("./pages/IPPoolPage"));
const QoSPage                = lazy(() => import("./pages/QoSPage"));
const MikrotikScriptPage     = lazy(() => import("./pages/MikrotikScriptPage"));
const NetworkHierarchyPage   = lazy(() => import("./pages/NetworkHierarchyPage"));
const VouchersPage           = lazy(() => import("./pages/VouchersPage"));
const AISettingsPage         = lazy(() => import("./pages/AISettingsPage"));
const PPPoEAccountsPage      = lazy(() => import("./pages/PPPoEAccountsPage"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-xs text-muted-foreground">Loading…</p>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000 } },
});

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
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth"           element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/hotspot"        element={<HotspotPortal />} />
              <Route path="/portal"         element={<UserPortal />} />
              <Route path="/pppoe-portal"   element={<Navigate to="/portal" replace />} />
              <Route path="/join/:token"    element={<JoinPage />} />

              <Route path="/"                  element={<P><Index /></P>} />
              <Route path="/users"             element={<P><UsersPage /></P>} />
              <Route path="/packages"          element={<P><PackagesPage /></P>} />
              <Route path="/transactions"      element={<P><TransactionsPage /></P>} />
              <Route path="/sessions"          element={<P><SessionsPage /></P>} />
              <Route path="/tickets"           element={<P><TicketsPage /></P>} />
              <Route path="/routers"           element={<P><RoutersPage /></P>} />
              <Route path="/network"           element={<P><NetworkMonitorPage /></P>} />
              <Route path="/analytics"         element={<P><AnalyticsPage /></P>} />
              <Route path="/ai-health"         element={<P><AIHealthPage /></P>} />
              <Route path="/error-logs"        element={<P><ErrorLogsPage /></P>} />
              <Route path="/expenditure"       element={<P><ExpenditurePage /></P>} />
              <Route path="/bandwidth"         element={<P><BandwidthPage /></P>} />
              <Route path="/autorate"          element={<P><AutoRatePage /></P>} />
              <Route path="/ip-binding"        element={<P><IPBindingPage /></P>} />
              <Route path="/sharing"           element={<P><SharingEnforcementPage /></P>} />
              <Route path="/kyc"               element={<P><KYCPage /></P>} />
              <Route path="/notifications"     element={<P><NotificationsPage /></P>} />
              <Route path="/admin-roles"       element={<P><AdminRolesPage /></P>} />
              <Route path="/settings"          element={<P><SettingsPage /></P>} />
              <Route path="/ip-pools"          element={<P><IPPoolPage /></P>} />
              <Route path="/qos"               element={<P><QoSPage /></P>} />
              <Route path="/mikrotik-scripts"  element={<P><MikrotikScriptPage /></P>} />
              <Route path="/network-hierarchy" element={<P><NetworkHierarchyPage /></P>} />
              <Route path="/vouchers"          element={<P><VouchersPage /></P>} />
              <Route path="/ai-settings"       element={<P><AISettingsPage /></P>} />
              <Route path="/pppoe-accounts"    element={<P><PPPoEAccountsPage /></P>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
