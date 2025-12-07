import { X, Edit, Tag, Home, User, Calendar } from "lucide-react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { calculateHouseProgress, getStatusFromProgress, getStatusLabel } from "@/data/constructionData";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScopesList } from "./ScopesList";
import { useState } from "react";
import { EditHouseDialog } from "./EditHouseDialog";
import { format, parseISO } from "date-fns";

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
  const status = getStatusFromProgress(progress);
  
  const statusColors: Record<string, string> = {
    "not-started": "bg-secondary text-muted-foreground",
    "foundation": "bg-status-foundation text-primary-foreground",
    "structure": "bg-status-structure text-primary-foreground",
    "finishing": "bg-status-finishing text-primary-foreground",
    "completed": "bg-status-completed text-primary-foreground",
  };

  return (
    <div className="w-full lg:w-96 bg-card rounded-xl border border-border animate-slide-in-right flex flex-col max-h-[calc(100vh-8rem)] overflow-hidden">
      <div className="p-4 border-b border-border flex items-start justify-between shrink-0">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Quadra {currentProject.quadras.find(q => q.id === house.quadra)?.name || house.quadra} - Casa {house.id}
          </h3>
          <p className="text-sm text-muted-foreground">
            Última atualização: {house.lastUpdate}
          </p>
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
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[status]}`}>
            {getStatusLabel(status)}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Progresso Geral</span>
              <span className="text-lg font-bold text-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Tag className="w-4 h-4" />
              <span className="text-xs">Área</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{currentProject.unitSize} m²</p>
          </div>
          
          <div className="p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Home className="w-4 h-4" />
              <span className="text-xs">Tipo</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{currentProject.projectType}</p>
          </div>
          
          <div className="p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <User className="w-4 h-4" />
              <span className="text-xs">Construtora</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{currentProject.contractor}</p>
          </div>
          
          <div className="p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-xs">Previsão</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {currentProject.expectedEndDate ? format(parseISO(currentProject.expectedEndDate), "dd/MM/yyyy") : "-"}
            </p>
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
