import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ConstructionProvider } from "./contexts/ConstructionContext";
import { SystemSetupCheck } from "./components/setup/SystemSetupCheck";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ChangePassword from "./pages/ChangePassword";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import LegacyDataMigration from "./pages/admin/LegacyDataMigration";
import MeasurementPlanningPage from "./pages/MeasurementPlanningPage";

const queryClient = new QueryClient();

function ProtectedLayout() {
  return (
    <ConstructionProvider>
      <SystemSetupCheck>
        <Outlet />
      </SystemSetupCheck>
    </ConstructionProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Auth routes - fora do setup check */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/change-password" element={<ChangePassword />} />

            {/* Rotas protegidas */}
            <Route element={<ProtectedLayout />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/migration" element={<LegacyDataMigration />} />
              <Route path="/measurement-planning" element={<MeasurementPlanningPage />} />
              <Route path="/" element={<Index />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

