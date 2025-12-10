import { useCallback, useRef, useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Zap, RotateCcw, Target } from "lucide-react";
import { toast } from "sonner";

interface House {
  id: number;
  macros: any[];
}

interface HouseGridProps {
  houses: House[];
  selectedHouses: number[];
  onSelectionChange: (houses: number[]) => void;
  completedHouses: number[];
  selectedMacro: string;
  selectedScope: string;
  plannedHouseIds?: number[];
  customPercentMode?: boolean;
  housePercentages?: Record<number, number>;
  massPercentage?: number;
  macroColor?: string;
}

export function HouseGrid({
  houses,
  selectedHouses,
  onSelectionChange,
  completedHouses,
  selectedMacro,
  selectedScope,
  plannedHouseIds = [],
  customPercentMode = false,
  housePercentages = {},
  massPercentage = 100,
  macroColor
}: HouseGridProps) {
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const dragStartRef = useRef<number | null>(null);

  const handleMouseDown = useCallback((houseId: number, isCompleted: boolean, event: React.MouseEvent) => {
    if (isCompleted) return;
    
    if (event.button === 2) {
      event.preventDefault();
    }
    
    if (event.button === 0 || event.button === 2) {
      setIsDragging(true);
      dragStartRef.current = houseId;
      
      const isCurrentlySelected = selectedHouses.includes(houseId);
      setDragMode(isCurrentlySelected ? 'deselect' : 'select');
      
      if (isCurrentlySelected) {
        onSelectionChange(selectedHouses.filter(id => id !== houseId));
      } else {
        onSelectionChange([...selectedHouses, houseId].sort((a, b) => a - b));
      }
    }
  }, [selectedHouses, onSelectionChange]);

  const handleMouseEnter = useCallback((houseId: number, isCompleted: boolean) => {
    if (!isDragging || isCompleted) return;
    
    if (dragMode === 'select') {
      if (!selectedHouses.includes(houseId)) {
        onSelectionChange([...selectedHouses, houseId].sort((a, b) => a - b));
      }
    } else {
      onSelectionChange(selectedHouses.filter(id => id !== houseId));
    }
  }, [isDragging, dragMode, selectedHouses, onSelectionChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const selectAllHouses = () => {
    const available = houses.filter(h => !completedHouses.includes(h.id)).map(h => h.id);
    onSelectionChange(available);
  };

  const clearSelection = () => {
    onSelectionChange([]);
  };

  const selectPlannedHouses = () => {
    if (plannedHouseIds.length > 0) {
      const available = plannedHouseIds.filter(id => !completedHouses.includes(id));
      onSelectionChange(available);
      toast.info(`${available.length} casas planejadas selecionadas`);
    }
  };

  // Get progress for a house
  const getHouseProgress = (house: House): number => {
    const houseMacros = (house.macros as any[]) || [];
    const houseMacro = houseMacros.find(m => m.id === selectedMacro);
    const houseScope = houseMacro?.scopes?.find((s: any) => s.id === selectedScope);
    return houseScope?.progress || 0;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b">
        <Button variant="outline" size="sm" onClick={selectAllHouses} className="gap-1">
          <Zap className="w-3 h-3" />
          Todas
        </Button>
        <Button variant="outline" size="sm" onClick={clearSelection} className="gap-1">
          <RotateCcw className="w-3 h-3" />
          Limpar
        </Button>
        {plannedHouseIds.length > 0 && (
          <Button 
            variant="default" 
            size="sm" 
            onClick={selectPlannedHouses}
            className="gap-1"
          >
            <Target className="w-3 h-3" />
            Previstas ({plannedHouseIds.length})
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {selectedHouses.length} selecionadas
          </Badge>
          <Badge variant="outline" className="text-sm text-green-600">
            {completedHouses.length} concluídas
          </Badge>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-xs text-muted-foreground mb-2">
        💡 Clique e arraste para selecionar múltiplas casas. Casas em verde já foram concluídas.
      </p>

      {/* Grid */}
      <ScrollArea className="flex-1">
        <div 
          className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-14 xl:grid-cols-16 gap-1.5 p-1 select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          {houses.map(house => {
            const isCompleted = completedHouses.includes(house.id);
            const isSelected = selectedHouses.includes(house.id);
            const isPlanned = plannedHouseIds.includes(house.id);
            const currentProgress = getHouseProgress(house);
            const hasPartialProgress = currentProgress > 0 && currentProgress < 100;
            const remainingPercent = 100 - currentProgress;
            
            const housePercent = customPercentMode 
              ? Math.min(housePercentages[house.id] ?? massPercentage, remainingPercent)
              : remainingPercent;
            
            return (
              <button
                key={house.id}
                onMouseDown={(e) => handleMouseDown(house.id, isCompleted, e)}
                onMouseEnter={() => handleMouseEnter(house.id, isCompleted)}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isCompleted}
                className={`
                  relative aspect-square rounded-md border-2 flex flex-col items-center justify-center text-xs font-medium transition-all
                  ${isCompleted 
                    ? 'bg-green-100 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-300 cursor-not-allowed opacity-60' 
                    : hasPartialProgress
                      ? isSelected 
                        ? 'border-primary bg-primary/20 text-primary cursor-pointer'
                        : 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 cursor-pointer'
                      : isSelected 
                        ? 'border-primary bg-primary/20 text-primary cursor-pointer' 
                        : isPlanned
                          ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:border-blue-400 cursor-pointer'
                          : 'border-border bg-card hover:border-muted-foreground/50 cursor-pointer'
                  }
                  ${isDragging && !isCompleted ? 'cursor-crosshair' : ''}
                `}
                style={isSelected && macroColor ? { borderColor: macroColor, backgroundColor: macroColor + '20' } : undefined}
                title={`Casa ${house.id}: ${currentProgress}% concluído - Resta ${remainingPercent}%`}
              >
                <span className="font-bold text-sm">{house.id}</span>
                <span className={`text-[9px] leading-tight ${hasPartialProgress ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                  {currentProgress}%
                </span>
                {isSelected && !isCompleted && (
                  <span className="text-[8px] leading-tight text-green-600 font-medium">
                    +{housePercent}
                  </span>
                )}
                {isCompleted && (
                  <CheckCircle2 className="absolute -top-0.5 -right-0.5 w-3 h-3 text-green-600" />
                )}
                {isPlanned && !isSelected && !isCompleted && (
                  <div className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
