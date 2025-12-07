import { useConstruction, DEFAULT_LEGEND_ITEMS } from "@/contexts/ConstructionContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { cn } from "@/lib/utils";
import { DragEvent, useMemo, useEffect, useRef } from "react";
import { getLegendColorByProgress } from "./Legend";

interface HouseCardProps {
  houseId: number;
}

export function HouseCard({ houseId }: HouseCardProps) {
  const { 
    currentProject, 
    selectedHouse, 
    setSelectedHouse,
    filterMode,
    filterMacro,
    filterScope
  } = useConstruction();
  
  const cardRef = useRef<HTMLButtonElement>(null);
  
  if (!currentProject) return null;
  
  const house = currentProject.houses.find(h => h.id === houseId);
  
  if (!house) return null;
  
  const followMacros = currentProject.legendFollowMacros;
  const legendItems = currentProject.customLegendItems || DEFAULT_LEGEND_ITEMS;
  const isSelected = selectedHouse?.id === houseId;

  // Scroll into view when selected
  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [isSelected]);
  
  // Calculate progress and color based on filter mode
  const { progress, cardStyle } = useMemo(() => {
    // Default: overall progress
    if (filterMode === "status" || (filterMode === "macro" && filterMacro === "all") || (filterMode === "scope" && filterScope === "all")) {
      const overallProgress = calculateHouseProgress(house);
      
      if (!followMacros) {
        const legendColor = getLegendColorByProgress(overallProgress, legendItems);
        return { 
          progress: overallProgress,
          cardStyle: { 
            backgroundColor: legendColor + '20', 
            borderColor: legendColor, 
            color: legendColor 
          }
        };
      }
      
      // Follow macros mode - existing logic for overall
      if (overallProgress === 0) {
        return { progress: overallProgress, cardStyle: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#6b7280' } };
      }
      
      if (overallProgress === 100) {
        return { progress: overallProgress, cardStyle: { backgroundColor: '#dcfce7', borderColor: '#22c55e', color: '#22c55e' } };
      }
      
      // Find the current active macro
      for (const macro of house.macros) {
        const macroProgress = macro.scopes.reduce((sum, s) => sum + s.progress, 0) / (macro.scopes.length || 1);
        if (macroProgress < 100 && macroProgress > 0) {
          return { 
            progress: overallProgress,
            cardStyle: { 
              backgroundColor: macro.color + '20', 
              borderColor: macro.color, 
              color: macro.color 
            }
          };
        } else if (macroProgress === 0) {
          const macroIndex = house.macros.indexOf(macro);
          if (macroIndex > 0) {
            const prevMacro = house.macros[macroIndex - 1];
            return { 
              progress: overallProgress,
              cardStyle: { 
                backgroundColor: prevMacro.color + '20', 
                borderColor: prevMacro.color, 
                color: prevMacro.color 
              }
            };
          }
          return { 
            progress: overallProgress,
            cardStyle: { 
              backgroundColor: macro.color + '20', 
              borderColor: macro.color, 
              color: macro.color 
            }
          };
        }
      }
      
      const firstMacro = house.macros[0];
      if (firstMacro) {
        return { 
          progress: overallProgress,
          cardStyle: { 
            backgroundColor: firstMacro.color + '20', 
            borderColor: firstMacro.color, 
            color: firstMacro.color 
          }
        };
      }
      
      return { progress: overallProgress, cardStyle: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#6b7280' } };
    }
    
    // Filter by specific macro (Etapa)
    if (filterMode === "macro" && filterMacro !== "all") {
      const macro = house.macros.find(m => m.id === filterMacro);
      if (!macro) {
        return { progress: 0, cardStyle: { backgroundColor: '#e5e7eb', borderColor: '#9ca3af', color: '#6b7280' } };
      }
      
      const macroProgress = macro.scopes.length > 0 
        ? Math.round(macro.scopes.reduce((sum, s) => sum + s.progress, 0) / macro.scopes.length)
        : 0;
      
      // If macro is not started (0%), show gray with emphasis
      if (macroProgress === 0) {
        return { 
          progress: 0,
          cardStyle: { 
            backgroundColor: '#e5e7eb', // Light gray background
            borderColor: '#9ca3af', // Gray border
            color: '#6b7280' // Gray text
          }
        };
      }
      
      return { 
        progress: macroProgress,
        cardStyle: { 
          backgroundColor: macro.color + '20', 
          borderColor: macro.color, 
          color: macro.color 
        }
      };
    }
    
    // Filter by specific scope (Serviço)
    if (filterMode === "scope" && filterScope !== "all") {
      for (const macro of house.macros) {
        const scope = macro.scopes.find(s => s.id === filterScope);
        if (scope) {
          // If scope is not executed (0%), show gray with emphasis
          if (scope.progress === 0) {
            return { 
              progress: 0,
              cardStyle: { 
                backgroundColor: '#e5e7eb', // Light gray background
                borderColor: '#9ca3af', // Gray border
                color: '#6b7280' // Gray text
              }
            };
          }
          // If partially or fully executed, show with macro color
          return { 
            progress: scope.progress,
            cardStyle: { 
              backgroundColor: macro.color + '20', 
              borderColor: macro.color, 
              color: macro.color 
            }
          };
        }
      }
      
      // Scope not found in this house
      return { progress: 0, cardStyle: { backgroundColor: '#e5e7eb', borderColor: '#9ca3af', color: '#6b7280' } };
    }
    
    return { progress: 0, cardStyle: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#6b7280' } };
  }, [house, followMacros, legendItems, filterMode, filterMacro, filterScope]);

  const handleDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData("houseId", houseId.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  // Create inline styles for the card based on progress color
  const borderColor = cardStyle.borderColor;
  const textColor = cardStyle.color;
  
  return (
    <button
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onClick={() => setSelectedHouse(house)}
      className={cn(
        "w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-200 hover:scale-105 hover:shadow-md cursor-grab active:cursor-grabbing bg-card",
        isSelected && "ring-2 ring-primary ring-offset-2"
      )}
      style={{
        borderColor: borderColor,
        backgroundColor: cardStyle.backgroundColor,
      }}
    >
      <span 
        className="text-xs font-semibold"
        style={{ color: textColor }}
      >
        {houseId}
      </span>
      <span 
        className="text-sm font-bold"
        style={{ color: textColor }}
      >
        {progress}%
      </span>
    </button>
  );
}
