import { useState } from "react";
import { ConstructionProvider } from "@/contexts/ConstructionContext";
import { Header } from "@/components/Header";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar } from "@/components/FilterBar";
import { ViewTabs } from "@/components/ViewTabs";
import { Legend } from "@/components/Legend";
import { QuadrasGrid } from "@/components/QuadrasGrid";
import { HouseDetails } from "@/components/HouseDetails";
import { ChartsView } from "@/components/ChartsView";

const Index = () => {
  const [activeView, setActiveView] = useState<"map" | "charts">("map");

  return (
    <ConstructionProvider>
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
                <div className="flex-1 min-w-0">
                  <QuadrasGrid />
                </div>
                <HouseDetails />
              </div>
            </>
          ) : (
            <ChartsView />
          )}
        </main>
      </div>
    </ConstructionProvider>
  );
};

export default Index;
