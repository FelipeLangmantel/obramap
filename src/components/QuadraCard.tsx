import { useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Quadra, calculateHouseProgress, getStatusFromProgress } from "@/data/constructionData";
import { HouseCard } from "./HouseCard";
import { Progress } from "@/components/ui/progress";

interface QuadraCardProps {
  quadra: Quadra;
}

export function QuadraCard({ quadra }: QuadraCardProps) {
  const { houses, filterStatus } = useConstruction();
  
  const { avgProgress, filteredHouses } = useMemo(() => {
    const quadraHouses = houses.filter(h => h.quadra === quadra.id);
    const progresses = quadraHouses.map(h => calculateHouseProgress(h));
    const avg = Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length);
    
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

  if (filteredHouses.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground">{quadra.name}</h3>
        <div className="flex items-center gap-3">
          <Progress value={avgProgress} className="w-24 h-2" />
          <span className="text-sm font-medium text-muted-foreground">{avgProgress}%</span>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {filteredHouses.map(houseId => (
          <HouseCard key={houseId} houseId={houseId} />
        ))}
      </div>
    </div>
  );
}
