import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ConstructionProvider } from "./contexts/ConstructionContext";
import { SetupFlowGuard } from "./components/guards/SetupFlowGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ChangePassword from "./pages/ChangePassword";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import LegacyDataMigration from "./pages/admin/LegacyDataMigration";
import MeasurementPlanningPage from "./pages/MeasurementPlanningPage";
import LongTermPlanningPage from "./pages/LongTermPlanningPage";
import ProjectContractPage from "./pages/ProjectContractPage";

const queryClient = new QueryClient();

/**
 * ✅ ARQUITETURA SIMPLIFICADA:
 * - Um único guard central (SetupFlowGuard) para todas as rotas protegidas
 * - Sem guards aninhados
 * - Sem redirects em useEffect dentro de páginas
 * - Lógica clara: loading -> check -> render ou redirect
 */
function ProtectedLayout() {
  return (
    <SetupFlowGuard>
      <Outlet />
    </SetupFlowGuard>
  );
}

/**
 * ✅ ESTRUTURA:
 * - AuthProvider e ConstructionProvider no topo (apenas uma vez)
 * - Rotas de auth fora do guard
 * - Todas as outras rotas passam pelo SetupFlowGuard único
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ConstructionProvider>
            <Routes>
              {/* Auth routes - fora do guard */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/change-password" element={<ChangePassword />} />

              {/* Todas as rotas protegidas usam o guard único */}
              <Route element={<ProtectedLayout />}>
                {/* Admin routes */}
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/migration" element={<LegacyDataMigration />} />
                
                {/* Rotas de módulos - o guard controla acesso baseado em setup_step */}
                <Route path="/measurement-planning" element={<MeasurementPlanningPage />} />
                <Route path="/long-term-planning" element={<LongTermPlanningPage />} />
                <Route path="/project-contract" element={<ProjectContractPage />} />
                
                {/* Index e fallback */}
                <Route path="/" element={<Index />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ConstructionProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
