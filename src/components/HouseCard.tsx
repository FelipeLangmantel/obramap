import { useConstruction } from "@/contexts/ConstructionContext";
import { calculateHouseProgress, getStatusFromProgress } from "@/data/constructionData";
import { cn } from "@/lib/utils";

interface HouseCardProps {
  houseId: number;
}

export function HouseCard({ houseId }: HouseCardProps) {
  const { houses, selectedHouse, setSelectedHouse } = useConstruction();
  const house = houses.find(h => h.id === houseId);
  
  if (!house) return null;
  
  const progress = calculateHouseProgress(house);
  const status = getStatusFromProgress(progress);
  
  const statusStyles: Record<string, string> = {
    "not-started": "bg-secondary border-border text-muted-foreground",
    "foundation": "bg-progress-low-bg border-progress-low text-progress-low",
    "structure": "bg-progress-medium-bg border-progress-medium text-progress-medium",
    "finishing": "bg-progress-high-bg border-progress-high text-progress-high",
    "completed": "bg-progress-complete-bg border-progress-complete text-progress-complete",
  };

  const isSelected = selectedHouse?.id === houseId;

  return (
    <button
      onClick={() => setSelectedHouse(house)}
      className={cn(
        "w-14 h-14 rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-200 hover:scale-105 hover:shadow-md",
        statusStyles[status],
        isSelected && "ring-2 ring-primary ring-offset-2"
      )}
    >
      <span className="text-xs font-medium opacity-70">{houseId}</span>
      <span className="text-sm font-bold">{progress}%</span>
    </button>
  );
}
