import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ConstructionProvider } from "./contexts/ConstructionContext";
import { SystemSetupCheck } from "./components/setup/SystemSetupCheck";
import { ProjectRequiredGuard } from "./components/guards/ProjectRequiredGuard";
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
 * ✅ ProtectedLayout: SystemSetupCheck + ProjectRequiredGuard
 * - Não contém Providers (estão no topo)
 * - Apenas renderiza ou redireciona
 */
function ProtectedLayout() {
  return (
    <SystemSetupCheck>
      <Outlet />
    </SystemSetupCheck>
  );
}

/**
 * Layout para rotas que requerem projeto ativo.
 */
function ProjectRequiredLayout() {
  return (
    <ProjectRequiredGuard>
      <Outlet />
    </ProjectRequiredGuard>
  );
}

/**
 * ✅ ESTRUTURA CORRETA:
 * - AuthProvider e ConstructionProvider apenas uma vez no topo
 * - Nunca dentro de rotas ou layouts
 * - Guards apenas renderizam ou redirecionam
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* ✅ Providers no topo - apenas uma vez */}
        <AuthProvider>
          <ConstructionProvider>
            <Routes>
              {/* Auth routes - fora do setup check */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/change-password" element={<ChangePassword />} />

              {/* Rotas protegidas com SystemSetupCheck */}
              <Route element={<ProtectedLayout />}>
                {/* Admin routes - não requerem projeto ativo */}
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/migration" element={<LegacyDataMigration />} />
                
                {/* Rotas que requerem projeto ativo */}
                <Route element={<ProjectRequiredLayout />}>
                  <Route path="/measurement-planning" element={<MeasurementPlanningPage />} />
                  <Route path="/long-term-planning" element={<LongTermPlanningPage />} />
                  <Route path="/project-contract" element={<ProjectContractPage />} />
                </Route>
                
                {/* Index pode mostrar estado vazio se não houver projetos */}
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
