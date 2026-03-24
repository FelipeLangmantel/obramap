import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { HomeDashboard } from "@/components/HomeDashboard";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { Legend } from "@/components/Legend";
import { QuadrasGrid } from "@/components/QuadrasGrid";
import { HouseDetails } from "@/components/HouseDetails";
import { ChartsView } from "@/components/ChartsView";
import { WeeklyProductionView } from "@/components/WeeklyProductionView";
import { PlanningView } from "@/components/PlanningView";
import { ProjectCostsView } from "@/components/ProjectCostsView";
import { InteractiveMapView } from "@/components/InteractiveMapView";
import { Map3DView } from "@/components/Map3DView";
import { SuppliesJITView } from "@/components/supplies";
import { InputsManagementView } from "@/components/InputsManagementView";
import { SuppliersManagementView } from "@/components/SuppliersManagementView";
import { FinancialFlowView } from "@/components/FinancialFlowView";
import { BoardDecisionsView } from "@/components/BoardDecisionsView";
import DeliveryView from "@/components/DeliveryView";
import SmartPlanningView from "@/components/smart-planning/SmartPlanningView";
import { ServiceProductivityView } from "@/components/productivity/ServiceProductivityView";
import ContractorsModuleView from "@/components/contractors/ContractorsModuleView";
import IndustrializationModuleView from "@/components/industrialization/IndustrializationModuleView";
import HoldingDashboardView from "@/components/holding/HoldingDashboardView";
import { Loader2, Menu, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Sidebar trigger button - visible on all screen sizes
function SidebarTriggerButton() {
  return (
    <SidebarTrigger className="p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors no-print">
      <Menu className="h-6 w-6" />
    </SidebarTrigger>
  );
}

type ViewType = "home" | "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies" | "inputs" | "suppliers" | "financial-flow" | "board-decisions" | "delivery" | "smart-planning" | "productivity" | "contractors" | "industrialization" | "holding-dashboard";

/**
 * ✅ Index agora é puro - sem redirects
 * O SetupFlowGuard já garantiu que:
 * - Usuário está autenticado
 * - Tem acesso a esta rota
 */
function Index() {
  const routeStateKey = "obramap_route_state_root";
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const restoredState = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(routeStateKey) || "null") as {
        activeView?: ViewType;
        scrollTop?: number;
      } | null;
    } catch {
      return null;
    }
  }, []);

  // ✅ Restaurar view ativa do sessionStorage para preservar estado ao trocar aba
  const [activeView, setActiveView] = useState<ViewType>(() => {
    return restoredState?.activeView || "home";
  });
  const location = useLocation();
  const { selectedHouse, isLoading, projects, currentProject, setCurrentProject } = useConstruction();
  const { canAccessProject } = useAuth();

  // ✅ Persistir estado real da rota
  useEffect(() => {
    try {
      sessionStorage.setItem(routeStateKey, JSON.stringify({ activeView }));
    } catch {
      // noop
    }
  }, [activeView]);

  useEffect(() => {
    const scrollElement = document.querySelector("main") as HTMLElement | null;
    mainScrollRef.current = scrollElement;

    if (scrollElement && typeof restoredState?.scrollTop === "number") {
      requestAnimationFrame(() => {
        scrollElement.scrollTop = restoredState.scrollTop ?? 0;
      });
    }

    const persistScroll = () => {
      if (!mainScrollRef.current) return;
      try {
        const current = JSON.parse(sessionStorage.getItem(routeStateKey) || "{}");
        sessionStorage.setItem(routeStateKey, JSON.stringify({
          ...current,
          activeView,
          scrollTop: mainScrollRef.current.scrollTop,
        }));
      } catch {
        // noop
      }
    };

    scrollElement?.addEventListener("scroll", persistScroll, { passive: true });
    document.addEventListener("visibilitychange", persistScroll);
    window.addEventListener("beforeunload", persistScroll);

    return () => {
      scrollElement?.removeEventListener("scroll", persistScroll);
      document.removeEventListener("visibilitychange", persistScroll);
      window.removeEventListener("beforeunload", persistScroll);
    };
  }, [activeView, restoredState]);

  useEffect(() => {
    console.log("[MOUNT] Index mounted");
    return () => console.log("[UNMOUNT] Index unmounted");
  }, []);

  // ✅ Se navegou de outra rota com targetView no state, aplicar a view
  useEffect(() => {
    const state = location.state as { targetView?: ViewType } | null;
    if (state?.targetView) {
      setActiveView(state.targetView);
      // Limpar o state para não re-aplicar em re-renders
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // ✅ Auto-seleciona a primeira obra acessível APENAS se não houver projeto atual
  // Usa ref para evitar múltiplas execuções
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    // ✅ Proteção contra execução duplicada
    if (hasAutoSelectedRef.current) return;
    if (isLoading) return;
    if (projects.length === 0) return;
    
    // ✅ Se já tem projeto atual válido, não faz nada
    if (currentProject && canAccessProject(currentProject.id)) {
      hasAutoSelectedRef.current = true;
      return;
    }

    const accessibleProjects = projects.filter((p) => canAccessProject(p.id));
    if (accessibleProjects.length === 0) {
      hasAutoSelectedRef.current = true;
      return;
    }

    // ✅ Seleciona apenas uma vez
    hasAutoSelectedRef.current = true;
    console.log("[INDEX] Auto-selecting first accessible project:", accessibleProjects[0].id);
    setCurrentProject(accessibleProjects[0].id);
  }, [isLoading, projects.length, currentProject?.id, canAccessProject, setCurrentProject]);

  const mapGridRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrintMap = () => {
    window.print();
  };

  const hasStableProjectData = projects.length > 0 || !!currentProject;

  if (isLoading && !hasStableProjectData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground text-base">Carregando obras...</p>
        </div>
      </div>
    );
  }

  const viewTitles: Record<ViewType, string> = {
    home: "Painel Inicial",
    map: "Mapa de Obras",
    "interactive-map": "Mapa Interativo",
    "3d-map": "Mapa 3D",
    charts: "Gráficos e Análises",
    production: "Produção Semanal",
    planning: "Planejamento Semanal",
    costs: "Custos da Obra",
    supplies: "Suprimentos",
    inputs: "Cadastro de Insumos",
    suppliers: "Cadastro de Fornecedores",
    "financial-flow": "Fluxo Financeiro",
    "board-decisions": "Painel Diretoria",
    delivery: "Entrega & Pós-Obra",
    "smart-planning": "Planejamento Inteligente",
    "productivity": "Produtividade e Equipes",
    "contractors": "Empreiteiros",
    "industrialization": "Industrialização & Logística",
    "holding-dashboard": "Painel da Holding",
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar 
          activeView={activeView} 
          onViewChange={setActiveView}
        />
        
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Header */}
          <header className="no-print min-h-[56px] bg-card border-b border-border px-2 md:px-6 flex items-center gap-2 md:gap-4 shrink-0 flex-wrap py-2">
            <SidebarTriggerButton />
            <h2 className="text-sm md:text-xl font-semibold text-foreground whitespace-nowrap shrink-0 truncate max-w-[200px] md:max-w-none">
              {viewTitles[activeView]}
            </h2>
            
            <div className="flex-1 min-w-0" />
            
            <div className="flex items-center gap-1.5 md:gap-3 shrink-0 flex-wrap">
              {(activeView === "map" || activeView === "charts") && <FilterBar />}
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 md:p-5 lg:p-6 overflow-auto">
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="text-6xl">🏗️</div>
                <h2 className="text-2xl font-semibold text-foreground">Nenhuma obra cadastrada</h2>
                <p className="text-muted-foreground text-center max-w-md text-base">
                  Clique em "Nova Obra" no menu lateral para cadastrar seu primeiro empreendimento.
                </p>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {activeView === "home" && (
                  <div className="flex-1">
                    <HomeDashboard onNavigateToProject={(view) => setActiveView(view as ViewType)} />
                  </div>
                )}

                {activeView === "map" && (
                  <div className="flex-1 flex flex-col gap-4">
                    {/* Print header — hidden on screen, shown on print */}
                    <div className="print-header hidden items-center justify-between bg-secondary text-secondary-foreground rounded-lg px-4 py-2 mb-1">
                      <div>
                        <h1 className="text-base font-bold">{currentProject?.name || "Mapa de Obras"}</h1>
                        <p className="text-[10px] opacity-80">
                          {currentProject?.houses.length} Casas • {currentProject?.quadras.length} Quadras • Impresso em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <p className="text-[10px] font-medium opacity-70">ObraMap — Sistema de Gestão de Obras</p>
                    </div>
                    <div ref={printAreaRef} className="print-area flex flex-col gap-4">
                      <StatsCards />
                      <Legend />
                      <QuadrasGrid ref={mapGridRef} />
                    </div>
                    {/* Print footer — hidden on screen, shown on print */}
                    <div className="print-footer hidden items-center justify-between border-t border-border pt-2 mt-2">
                      <p className="text-[9px] text-muted-foreground">
                        Desenvolvido por <span className="font-semibold text-foreground">Felipe Langmantel</span> — ObraMap © {new Date().getFullYear()}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        Página 1 de 1
                      </p>
                    </div>
                    <div className="flex justify-end -mt-2 no-print">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 shrink-0"
                        onClick={handlePrintMap}
                      >
                        <Printer className="w-4 h-4" />
                        Imprimir Mapa
                      </Button>
                    </div>
                    {selectedHouse && (
                      <div className="no-print fixed top-20 right-4 z-50 shadow-xl">
                        <HouseDetails />
                      </div>
                    )}
                  </div>
                )}

                {activeView === "charts" && <StatsCards />}
                
                {activeView === "charts" && (
                  <div className="mt-4 flex-1">
                    <ChartsView />
                  </div>
                )}
                
                {activeView === "production" && (
                  <div className="flex-1">
                    <WeeklyProductionView />
                  </div>
                )}

                {activeView === "costs" && (
                  <div className="flex-1">
                    <ProjectCostsView />
                  </div>
                )}

                {activeView === "planning" && (
                  <div className="flex-1">
                    <PlanningView />
                  </div>
                )}

                {activeView === "interactive-map" && (
                  <div className="flex-1">
                    <InteractiveMapView />
                  </div>
                )}

                {activeView === "3d-map" && (
                  <div className="flex-1">
                    <Map3DView />
                  </div>
                )}

                {activeView === "supplies" && (
                  <div className="flex-1">
                    <SuppliesJITView />
                  </div>
                )}

                {activeView === "inputs" && (
                  <div className="flex-1">
                    <InputsManagementView />
                  </div>
                )}

                {activeView === "suppliers" && (
                  <div className="flex-1">
                    <SuppliersManagementView />
                  </div>
                )}

                {activeView === "financial-flow" && (
                  <div className="flex-1">
                    <FinancialFlowView />
                  </div>
                )}

                {activeView === "board-decisions" && (
                  <div className="flex-1">
                    <BoardDecisionsView />
                  </div>
                )}

                {activeView === "delivery" && (
                  <div className="flex-1">
                    <DeliveryView />
                  </div>
                )}

                {activeView === "smart-planning" && (
                  <div className="flex-1">
                    <SmartPlanningView />
                  </div>
                )}

                {activeView === "productivity" && (
                  <div className="flex-1">
                    <ServiceProductivityView />
                  </div>
                )}

                {activeView === "contractors" && (
                  <div className="flex-1">
                    <ContractorsModuleView />
                  </div>
                )}

                {activeView === "industrialization" && (
                  <div className="flex-1">
                    <IndustrializationModuleView />
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Footer */}
          <footer className="no-print py-2.5 text-center text-sm text-muted-foreground border-t border-border/50 bg-card/50 shrink-0">
            <p>Desenvolvido por <span className="font-semibold text-foreground">Felipe Langmantel</span></p>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default Index;
