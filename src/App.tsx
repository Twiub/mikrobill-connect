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
          <Route path="/routers" element={<RoutersPage />} />
          <Route path="/hotspot" element={<HotspotPortal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
