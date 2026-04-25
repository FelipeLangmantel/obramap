import { X, Edit, Camera } from "lucide-react";
import { useConstruction, DEFAULT_LEGEND_ITEMS } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { Button } from "@/components/ui/button";
import { ScopesList } from "./ScopesList";
import { useState } from "react";
import { EditHouseDialog } from "./EditHouseDialog";
import { HouseFotoHistoryDrawer } from "./diario/HouseFotoHistoryDrawer";

export function HouseDetails() {
  const { selectedHouse, setSelectedHouse, currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  
  const legendItems = currentProject?.customLegendItems ?? DEFAULT_LEGEND_ITEMS;
  
  if (!selectedHouse || !currentProject) {
    return null;
  }
  
  // Get fresh house data from currentProject to ensure it's always up to date
  const house = currentProject.houses.find(h => h.id === selectedHouse.id) || selectedHouse;
  
  const progress = calculateHouseProgress(house, currentProject.macrosTemplate);

  const getProgressBarColor = (progress: number) => {
    for (const item of legendItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.color;
      }
    }
    // Fallback colors
    if (progress === 0) return "hsl(var(--muted))";
    if (progress < 50) return "#ef4444";
    if (progress < 100) return "#f59e0b";
    return "#22c55e";
  };

  return (
    <div className="w-full lg:w-96 bg-card rounded-xl border border-border animate-slide-in-right flex flex-col max-h-[calc(100vh-12rem)] overflow-hidden">
      <div className="p-4 border-b border-border flex items-start justify-between shrink-0">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Casa {house.id}
          </h3>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
              <Edit className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setSelectedHouse(null)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Progresso Geral</span>
            <span className="text-lg font-bold text-foreground">{progress}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-300"
              style={{ 
                width: `${progress}%`,
                backgroundColor: getProgressBarColor(progress)
              }}
            />
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => setHistoryOpen(true)}
        >
          <Camera className="w-4 h-4 mr-2" />
          Ver histórico fotográfico
        </Button>
        
        <ScopesList house={house} />
      </div>
      
      <EditHouseDialog 
        open={editOpen} 
        onOpenChange={setEditOpen} 
        house={house}
      />

      <HouseFotoHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        houseId={house.id}
        projectId={currentProject.id}
        houseLabel={`Casa ${house.id}`}
      />
    </div>
  );
}
