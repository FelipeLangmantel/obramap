import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ConstructionProvider, useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProjectSelector } from "@/components/ProjectSelector";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { Legend } from "@/components/Legend";
import { QuadrasGrid } from "@/components/QuadrasGrid";
import { HouseDetails } from "@/components/HouseDetails";
import { ChartsView } from "@/components/ChartsView";
import { WeeklyProductionView } from "@/components/WeeklyProductionView";
import { Loader2 } from "lucide-react";

function IndexContent() {
  const [activeView, setActiveView] = useState<"map" | "charts" | "production">("map");
  const { selectedHouse, isLoading, projects } = useConstruction();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando obras...</p>
        </div>
      </div>
    );
  }

  const viewTitles = {
    map: "Mapa de Obras",
    charts: "Gráficos e Análises",
    production: "Produção Semanal"
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar 
          activeView={activeView} 
          onViewChange={setActiveView}
        />
        
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header */}
          <header className="h-14 bg-card border-b border-border px-4 flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-3 shrink-0">
              <SidebarTrigger className="lg:hidden" />
              <h2 className="text-lg font-semibold text-foreground whitespace-nowrap">{viewTitles[activeView]}</h2>
            </div>
            {activeView !== "production" && (
              <div className="flex-1 flex items-center justify-start overflow-x-auto">
                <FilterBar />
              </div>
            )}
            <div className="shrink-0 ml-auto">
              <ProjectSelector />
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6 overflow-auto">
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="text-6xl">🏗️</div>
                <h2 className="text-2xl font-semibold text-foreground">Nenhuma obra cadastrada</h2>
                <p className="text-muted-foreground text-center max-w-md">
                  Clique em "Nova Obra" no menu superior para cadastrar seu primeiro empreendimento.
                </p>
              </div>
            ) : (
              <>
                {activeView !== "production" && <StatsCards />}
                
                {activeView === "map" && (
                  <>
                    <Legend />
                    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                      <div className={`min-w-0 transition-all duration-300 ${selectedHouse ? 'flex-1' : 'w-full'}`}>
                        <QuadrasGrid />
                      </div>
                      {selectedHouse && <HouseDetails />}
                    </div>
                  </>
                )}
                
                {activeView === "charts" && <ChartsView />}
                
                {activeView === "production" && <WeeklyProductionView />}
              </>
            )}
          </main>

          {/* Footer */}
          <footer className="py-3 text-center text-sm text-muted-foreground border-t border-border/50 bg-card/50 shrink-0">
            <p>Desenvolvido e produzido por <span className="font-semibold text-foreground">Felipe Langmantel</span></p>
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
