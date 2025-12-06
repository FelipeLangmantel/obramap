import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ConstructionProvider, useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { ViewTabs } from "@/components/ViewTabs";
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

  if (projects.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 p-4 lg:p-6">
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="text-6xl">🏗️</div>
            <h2 className="text-2xl font-semibold text-foreground">Nenhuma obra cadastrada</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Clique em "Nova Obra" no menu superior para cadastrar seu primeiro empreendimento.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 p-4 lg:p-6 space-y-4 lg:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <ViewTabs activeView={activeView} onViewChange={setActiveView} />
          {activeView !== "production" && <FilterBar />}
        </div>
        
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
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="py-4 text-center text-sm text-muted-foreground border-t border-border/50 bg-card/50">
      <p>Desenvolvido e produzido por <span className="font-semibold text-foreground">Felipe Langmantel</span></p>
    </footer>
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
