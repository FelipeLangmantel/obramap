import { useState } from "react";
import { ConstructionProvider, useConstruction } from "@/contexts/ConstructionContext";
import { Header } from "@/components/Header";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { ViewTabs } from "@/components/ViewTabs";
import { Legend } from "@/components/Legend";
import { QuadrasGrid } from "@/components/QuadrasGrid";
import { HouseDetails } from "@/components/HouseDetails";
import { ChartsView } from "@/components/ChartsView";
import { Loader2 } from "lucide-react";

function IndexContent() {
  const [activeView, setActiveView] = useState<"map" | "charts">("map");
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
      <div className="min-h-screen bg-background">
        <Header />
        <main className="p-4 lg:p-6">
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="text-6xl">🏗️</div>
            <h2 className="text-2xl font-semibold text-foreground">Nenhuma obra cadastrada</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Clique em "Nova Obra" no menu superior para cadastrar seu primeiro empreendimento.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="p-4 lg:p-6 space-y-4 lg:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <ViewTabs activeView={activeView} onViewChange={setActiveView} />
          <FilterBar />
        </div>
        
        <StatsCards />
        
        {activeView === "map" ? (
          <>
            <Legend />
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
              <div className={`min-w-0 transition-all duration-300 ${selectedHouse ? 'flex-1' : 'w-full'}`}>
                <QuadrasGrid />
              </div>
              {selectedHouse && <HouseDetails />}
            </div>
          </>
        ) : (
          <ChartsView />
        )}
      </main>
    </div>
  );
}

const Index = () => {
  return (
    <ConstructionProvider>
      <IndexContent />
    </ConstructionProvider>
  );
};

export default Index;
