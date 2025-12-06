import { useConstruction } from "@/contexts/ConstructionContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { cn } from "@/lib/utils";
import { DragEvent, useMemo, useState, useEffect } from "react";
import { getLegendColorByProgress, isFollowingMacrosMode } from "./Legend";

interface HouseCardProps {
  houseId: number;
}

export function HouseCard({ houseId }: HouseCardProps) {
  const { currentProject, selectedHouse, setSelectedHouse } = useConstruction();
  const [followMacros, setFollowMacros] = useState(isFollowingMacrosMode);
  
  // Listen to localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setFollowMacros(isFollowingMacrosMode());
    };
    
    // Check periodically for changes (since we're in the same tab)
    const interval = setInterval(handleStorageChange, 500);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
  
  if (!currentProject) return null;
  
  const house = currentProject.houses.find(h => h.id === houseId);
  
  if (!house) return null;
  
  const progress = calculateHouseProgress(house);
  
  // Get the card style based on legend mode
  const cardStyle = useMemo(() => {
    if (!followMacros) {
      // Use default legend based on percentage
      const legendColor = getLegendColorByProgress(progress);
      return { 
        backgroundColor: legendColor + '20', 
        borderColor: legendColor, 
        color: legendColor 
      };
    }
    
    // Follow macros mode - existing logic
    if (progress === 0) {
      return { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#6b7280' };
    }
    
    if (progress === 100) {
      return { backgroundColor: '#dcfce7', borderColor: '#22c55e', color: '#22c55e' };
    }
    
    // Find the current active macro (first one not complete)
    for (const macro of house.macros) {
      const macroProgress = macro.scopes.reduce((sum, s) => sum + s.progress, 0) / (macro.scopes.length || 1);
      if (macroProgress < 100 && macroProgress > 0) {
        // This macro is in progress
        const hexColor = macro.color;
        return { 
          backgroundColor: hexColor + '20', 
          borderColor: hexColor, 
          color: hexColor 
        };
      } else if (macroProgress === 0) {
        // This is the next macro to start - show previous color or first macro
        const macroIndex = house.macros.indexOf(macro);
        if (macroIndex > 0) {
          const prevMacro = house.macros[macroIndex - 1];
          const hexColor = prevMacro.color;
          return { 
            backgroundColor: hexColor + '20', 
            borderColor: hexColor, 
            color: hexColor 
          };
        }
        const hexColor = macro.color;
        return { 
          backgroundColor: hexColor + '20', 
          borderColor: hexColor, 
          color: hexColor 
        };
      }
    }
    
    // Default: use first macro color
    const firstMacro = house.macros[0];
    if (firstMacro) {
      return { 
        backgroundColor: firstMacro.color + '20', 
        borderColor: firstMacro.color, 
        color: firstMacro.color 
      };
    }
    
    return { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#6b7280' };
  }, [house.macros, progress, followMacros]);

  const isSelected = selectedHouse?.id === houseId;

  const handleDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData("houseId", houseId.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onClick={() => setSelectedHouse(house)}
      className={cn(
        "w-14 h-14 rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-200 hover:scale-105 hover:shadow-md cursor-grab active:cursor-grabbing",
        isSelected && "ring-2 ring-primary ring-offset-2"
      )}
      style={cardStyle}
    >
      <span className="text-xs font-medium opacity-70">{houseId}</span>
      <span className="text-sm font-bold">{progress}%</span>
    </button>
  );
}