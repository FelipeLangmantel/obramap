import { useMemo, useState, DragEvent } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { calculateHouseProgress, getStatusFromProgress } from "@/data/constructionData";
import { HouseCard } from "./HouseCard";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface QuadraCardProps {
  quadraId: string;
}

export function QuadraCard({ quadraId }: QuadraCardProps) {
  const { houses, filterStatus, quadras, moveHouseToQuadra } = useConstruction();
  const [isDragOver, setIsDragOver] = useState(false);
  
  const quadra = quadras.find(q => q.id === quadraId);
  
  if (!quadra) return null;
  
  const { avgProgress, filteredHouses } = useMemo(() => {
    const quadraHouses = houses.filter(h => h.quadra === quadra.id);
    const progresses = quadraHouses.map(h => calculateHouseProgress(h));
    const avg = progresses.length > 0 ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : 0;
    
    let filtered = quadra.houses;
    if (filterStatus !== "all") {
      filtered = quadra.houses.filter(houseId => {
        const house = houses.find(h => h.id === houseId);
        if (!house) return false;
        const progress = calculateHouseProgress(house);
        const status = getStatusFromProgress(progress);
        return status === filterStatus;
      });
    }
    
    return { avgProgress: avg, filteredHouses: filtered };
  }, [houses, quadra, filterStatus]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const houseId = parseInt(e.dataTransfer.getData("houseId"));
    if (houseId) {
      moveHouseToQuadra(houseId, quadra.id);
    }
  };

  if (filteredHouses.length === 0 && !isDragOver) return null;

  return (
    <div 
      className={cn(
        "bg-card rounded-xl border-2 p-4 animate-fade-in transition-all duration-200",
        isDragOver ? "border-primary bg-primary/5" : "border-border"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">{quadra.name}</h3>
        <div className="flex items-center gap-3">
          <Progress value={avgProgress} className="w-24 h-2" />
          <span className="text-sm font-medium text-muted-foreground">{avgProgress}%</span>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 min-h-[60px]">
        {filteredHouses.map(houseId => (
          <HouseCard key={houseId} houseId={houseId} />
        ))}
        {isDragOver && filteredHouses.length === 0 && (
          <div className="w-14 h-14 rounded-lg border-2 border-dashed border-primary flex items-center justify-center">
            <span className="text-xs text-primary">Soltar</span>
          </div>
        )}
      </div>
    </div>
  );
}
