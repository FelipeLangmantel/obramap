import React, { Suspense, useEffect } from "react";
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
import Auth from "./pages/Auth";
import LandingPage from "./pages/LandingPage";
import ChangePassword from "./pages/ChangePassword";
import NotFound from "./pages/NotFound";
import { CameraTestPage } from "./pages/CameraTestPage";
import Unsubscribe from "./pages/Unsubscribe";
import { bootstrapSyncWorker } from "@/offline/sync";

const Index = React.lazy(() => import("./pages/Index"));
const SystemDashboard = React.lazy(() => import("./pages/system/SystemDashboard"));
const SystemModulesPage = React.lazy(() => import("./pages/system/SystemModulesPage"));
const LegacyDataMigration = React.lazy(() => import("./pages/admin/LegacyDataMigration"));
const MeasurementPlanningPage = React.lazy(() => import("./pages/MeasurementPlanningPage"));
const LongTermPlanningPage = React.lazy(() => import("./pages/LongTermPlanningPage"));
const ProjectContractPage = React.lazy(() => import("./pages/ProjectContractPage"));
const PleMeasurementsPage = React.lazy(() => import("./pages/PleMeasurementsPage"));
const HoldingReceitasPage = React.lazy(() => import("./pages/HoldingReceitasPage"));
const HoldingDespesasPage = React.lazy(() => import("./pages/HoldingDespesasPage"));
const HoldingDocumentosPage = React.lazy(() => import("./pages/HoldingDocumentosPage"));
const HoldingPrdPage = React.lazy(() => import("./pages/HoldingPrdPage"));
const HoldingInsightsPage = React.lazy(() => import("./pages/HoldingInsightsPage"));
const HoldingConfigPage = React.lazy(() => import("./pages/HoldingConfigPage"));
const CashflowSimulatorPage = React.lazy(() => import("./pages/CashflowSimulatorPage"));
const PurchasePanelPage = React.lazy(() => import("./pages/PurchasePanelPage"));
const DiarioOfflineQueuePage = React.lazy(() => import("./pages/DiarioOfflineQueuePage"));
const DiarioConfigPage = React.lazy(() => import("./pages/DiarioConfigPage"));
const HouseHistoryPage = React.lazy(() => import("./pages/HouseHistoryPage"));

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
  "/holding-receitas": "holding_receitas",
  "/holding-despesas": "holding_despesas",
  "/holding-documentos": "holding_documentos",
  "/holding-prd": "holding_prd",
  "/holding-insights": "holding_insights",
  "/holding-config": "holding",
  "/cashflow-simulator": "simulador_desembolsos",
  "/purchase-panel": "painel_compras",
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
    document.documentElement.classList.add("dark");
    localStorage.setItem("obramap_theme", "dark");
    // Inicia o worker de sincronização offline (autodetecta online/offline)
    bootstrapSyncWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<div>Carregando...</div>}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                {/* Diagnóstico de câmera — rota pública sem contextos pesados */}
                <Route path="/camera-test" element={<CameraTestPage />} />
                {/* Legacy redirect */}
                <Route path="/landing" element={<LandingPage />} />

                {/* ========== ROTAS DE SISTEMA (System Admin) ========== */}
                <Route element={<ConstructionProvider><SystemLayout /></ConstructionProvider>}>
                    <Route path="/system/dashboard" element={<SystemDashboard />} />
                    <Route path="/system/modules" element={<SystemModulesPage />} />
                    <Route path="/system/migration" element={<LegacyDataMigration />} />
                    <Route path="/admin/dashboard" element={<SystemDashboard />} />
                    <Route path="/admin/migration" element={<LegacyDataMigration />} />
                  </Route>

                {/* ========== ROTAS DE EMPRESA (Usuários comuns) ========== */}
                <Route element={<ConstructionProvider><CompanyLayout /></ConstructionProvider>}>
                  <Route path="/measurement-planning" element={<MeasurementPlanningPage />} />
                  <Route path="/long-term-planning" element={<LongTermPlanningPage />} />
                  <Route path="/project-contract" element={<ProjectContractPage />} />
                  <Route path="/ple-measurements" element={<PleMeasurementsPage />} />
                  <Route path="/holding-receitas" element={<HoldingReceitasPage />} />
                  <Route path="/holding-despesas" element={<HoldingDespesasPage />} />
                  <Route path="/holding-documentos" element={<HoldingDocumentosPage />} />
                  <Route path="/holding-prd" element={<HoldingPrdPage />} />
                  <Route path="/holding-insights" element={<HoldingInsightsPage />} />
                  <Route path="/holding-config" element={<HoldingConfigPage />} />
                  <Route path="/cashflow-simulator" element={<CashflowSimulatorPage />} />
                  <Route path="/purchase-panel" element={<PurchasePanelPage />} />
                  <Route path="/diario-fila-offline" element={<DiarioOfflineQueuePage />} />
                  <Route path="/diario-config" element={<DiarioConfigPage />} />
                  <Route path="/casa/:houseId/historico" element={<HouseHistoryPage />} />
                  <Route path="/dashboard" element={<Index />} />
                  <Route path="/index" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
