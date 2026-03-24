import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ConstructionProvider } from "./contexts/ConstructionContext";
import { SetupFlowGuard } from "./components/guards/SetupFlowGuard";
import { SystemAdminGuard } from "./components/guards/SystemAdminGuard";
import { CompanyUserGuard } from "./components/guards/CompanyUserGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import LandingPage from "./pages/LandingPage";
import ChangePassword from "./pages/ChangePassword";
import NotFound from "./pages/NotFound";
import SystemDashboard from "./pages/system/SystemDashboard";
import SystemModulesPage from "./pages/system/SystemModulesPage";
import LegacyDataMigration from "./pages/admin/LegacyDataMigration";
import MeasurementPlanningPage from "./pages/MeasurementPlanningPage";
import LongTermPlanningPage from "./pages/LongTermPlanningPage";
import ProjectContractPage from "./pages/ProjectContractPage";
import PleMeasurementsPage from "./pages/PleMeasurementsPage";
import HoldingReceitasPage from "./pages/HoldingReceitasPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 10, // 10 minutes
    },
  },
});

// ✅ Mapeamento de rotas para permissões de menu
const ROUTE_PERMISSION_MAP: Record<string, string> = {
  "/measurement-planning": "planejamento_periodo",
  "/long-term-planning": "planejamento_estrategico",
  "/project-contract": "contrato",
  "/ple-measurements": "ple_medicoes",
  "/holding-receitas": "holding",
};

/** Layout para rotas de System Admin */
function SystemLayout() {
  return (
    <SystemAdminGuard>
      <Outlet />
    </SystemAdminGuard>
  );
}

/**
 * ✅ Guard de permissão por rota
 * Verifica se o usuário tem acesso ao menu correspondente à rota atual.
 * Redireciona para / se não tiver permissão.
 */
function RoutePermissionCheck() {
  const { canAccessMenu } = useAuth();
  const location = useLocation();

  const requiredPermission = ROUTE_PERMISSION_MAP[location.pathname];

  if (requiredPermission && !canAccessMenu(requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

/** Layout para rotas de usuário de empresa */
function CompanyLayout() {
  return (
    <CompanyUserGuard>
      <SetupFlowGuard>
        <RoutePermissionCheck />
      </SetupFlowGuard>
    </CompanyUserGuard>
  );
}

const App = () => {
  useEffect(() => {
    console.log("[MOUNT] App mounted");
    return () => console.log("[UNMOUNT] App unmounted");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ConstructionProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/change-password" element={<ChangePassword />} />
                {/* Legacy redirect */}
                <Route path="/landing" element={<LandingPage />} />

                {/* ========== ROTAS DE SISTEMA (System Admin) ========== */}
                <Route element={<SystemLayout />}>
                  <Route path="/system/dashboard" element={<SystemDashboard />} />
                  <Route path="/system/modules" element={<SystemModulesPage />} />
                  <Route path="/system/migration" element={<LegacyDataMigration />} />
                  <Route path="/admin/dashboard" element={<SystemDashboard />} />
                  <Route path="/admin/migration" element={<LegacyDataMigration />} />
                </Route>

                {/* ========== ROTAS DE EMPRESA (Usuários comuns) ========== */}
                <Route element={<CompanyLayout />}>
                  <Route path="/measurement-planning" element={<MeasurementPlanningPage />} />
                  <Route path="/long-term-planning" element={<LongTermPlanningPage />} />
                  <Route path="/project-contract" element={<ProjectContractPage />} />
                  <Route path="/ple-measurements" element={<PleMeasurementsPage />} />
                  <Route path="/dashboard" element={<Index />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </ConstructionProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
