import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ConstructionProvider, useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProjectSelector } from "@/components/ProjectSelector";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { Legend } from "@/components/Legend";
import { QuadrasGrid } from "@/components/QuadrasGrid";
import { HouseDetails } from "@/components/HouseDetails";
import { ChartsView } from "@/components/ChartsView";
import { WeeklyProductionView } from "@/components/WeeklyProductionView";
import { PlanningView } from "@/components/PlanningView";
import { ProjectCostsView } from "@/components/ProjectCostsView";
import { Loader2 } from "lucide-react";

function IndexContent() {
  const [activeView, setActiveView] = useState<"map" | "charts" | "production" | "costs" | "planning">("map");
  const { selectedHouse, isLoading, projects } = useConstruction();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground text-base">Carregando obras...</p>
        </div>
      </div>
    );
  }

  const viewTitles = {
    map: "Mapa de Obras",
    charts: "Gráficos e Análises",
    production: "Produção Semanal",
    planning: "Planejamento",
    costs: "Custos da Obra"
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar 
          activeView={activeView} 
          onViewChange={setActiveView}
        />
        
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Header */}
          <header className="h-14 bg-card border-b border-border px-4 md:px-6 flex items-center gap-4 shrink-0">
            <h2 className="text-lg md:text-xl font-semibold text-foreground whitespace-nowrap shrink-0">
              {viewTitles[activeView]}
            </h2>
            
            <div className="flex-1 min-w-0" />
            
            <div className="flex items-center gap-3 shrink-0">
              <ProjectSelector />
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
                {(activeView === "map" || activeView === "charts") && <StatsCards />}
                
                {activeView === "map" && (
                  <div className="flex-1 flex flex-col gap-4 mt-4">
                    <Legend />
                    <div className="flex-1 flex flex-col lg:flex-row gap-4">
                      <div className={`min-w-0 transition-all duration-300 ${selectedHouse ? 'flex-1' : 'w-full'}`}>
                        <QuadrasGrid />
                      </div>
                      {selectedHouse && (
                        <div className="lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-12rem)]">
                          <HouseDetails />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
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
              </div>
            )}
          </main>

          {/* Footer */}
          <footer className="py-2.5 text-center text-sm text-muted-foreground border-t border-border/50 bg-card/50 shrink-0">
            <p>Desenvolvido por <span className="font-semibold text-foreground">Felipe Langmantel</span></p>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}

const Index = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ConstructionProvider>
      <IndexContent />
    </ConstructionProvider>
  );
};

export default Index;
