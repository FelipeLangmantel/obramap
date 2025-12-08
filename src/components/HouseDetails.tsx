import { X, Edit } from "lucide-react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { Button } from "@/components/ui/button";
import { ScopesList } from "./ScopesList";
import { useState } from "react";
import { EditHouseDialog } from "./EditHouseDialog";

export function HouseDetails() {
  const { selectedHouse, setSelectedHouse, currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  
  if (!selectedHouse || !currentProject) {
    return null;
  }
  
  // Get fresh house data from currentProject to ensure it's always up to date
  const house = currentProject.houses.find(h => h.id === selectedHouse.id) || selectedHouse;
  
  const progress = calculateHouseProgress(house);

  const getProgressBarColor = (progress: number) => {
    if (progress === 0) return "hsl(var(--muted))";
    if (progress < 50) return "hsl(0, 84%, 60%)"; // Red
    if (progress < 100) return "hsl(45, 93%, 47%)"; // Yellow/Orange
    return "hsl(142, 71%, 45%)"; // Green
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
        
        <ScopesList house={house} />
      </div>
      
      <EditHouseDialog 
        open={editOpen} 
        onOpenChange={setEditOpen} 
        house={house}
      />
    </div>
  );
}
