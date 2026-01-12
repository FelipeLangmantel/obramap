import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ConstructionProvider } from "./contexts/ConstructionContext";
import { SetupFlowGuard } from "./components/guards/SetupFlowGuard";
import { SystemAdminGuard } from "./components/guards/SystemAdminGuard";
import { CompanyUserGuard } from "./components/guards/CompanyUserGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ChangePassword from "./pages/ChangePassword";
import NotFound from "./pages/NotFound";
import SystemDashboard from "./pages/system/SystemDashboard";
import LegacyDataMigration from "./pages/admin/LegacyDataMigration";
import MeasurementPlanningPage from "./pages/MeasurementPlanningPage";
import LongTermPlanningPage from "./pages/LongTermPlanningPage";
import ProjectContractPage from "./pages/ProjectContractPage";

const queryClient = new QueryClient();

/**
 * ✅ ARQUITETURA DE NAVEGAÇÃO:
 * 
 * 1. ROTAS DE SISTEMA (/system/*):
 *    - Acesso exclusivo para isSystemAdmin === true
 *    - NÃO exigem company_id ou projeto selecionado
 *    - Gerenciamento global de empresas, usuários e módulos
 * 
 * 2. ROTAS DE EMPRESA (/, /measurement-planning, etc.):
 *    - Acesso para usuários de empresa (company_id definido)
 *    - System Admin é redirecionado para /system/dashboard
 *    - Seguem fluxo de setup da obra
 */

/** Layout para rotas de System Admin */
function SystemLayout() {
  return (
    <SystemAdminGuard>
      <Outlet />
    </SystemAdminGuard>
  );
}

/** Layout para rotas de usuário de empresa */
function CompanyLayout() {
  return (
    <CompanyUserGuard>
      <SetupFlowGuard>
        <Outlet />
      </SetupFlowGuard>
    </CompanyUserGuard>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ConstructionProvider>
            <Routes>
              {/* Auth routes - fora de qualquer guard */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/change-password" element={<ChangePassword />} />

              {/* ========== ROTAS DE SISTEMA (System Admin) ========== */}
              <Route element={<SystemLayout />}>
                <Route path="/system/dashboard" element={<SystemDashboard />} />
                <Route path="/system/migration" element={<LegacyDataMigration />} />
                {/* Fallback de admin antigo para novo sistema */}
                <Route path="/admin/dashboard" element={<SystemDashboard />} />
                <Route path="/admin/migration" element={<LegacyDataMigration />} />
              </Route>

              {/* ========== ROTAS DE EMPRESA (Usuários comuns) ========== */}
              <Route element={<CompanyLayout />}>
                <Route path="/measurement-planning" element={<MeasurementPlanningPage />} />
                <Route path="/long-term-planning" element={<LongTermPlanningPage />} />
                <Route path="/project-contract" element={<ProjectContractPage />} />
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
