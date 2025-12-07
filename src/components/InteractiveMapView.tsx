import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useConstruction, LegendItem, DEFAULT_LEGEND_ITEMS } from "@/contexts/ConstructionContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Move, 
  Home,
  X,
  MapPin
} from "lucide-react";
import plantaLoteamento from "@/assets/planta-loteamento.jpg";

interface HouseMarker {
  id: number;
  x: number; // percentage from left
  y: number; // percentage from top
}

// Mapeamento das posições das casas na planta (valores em porcentagem)
const HOUSE_POSITIONS: HouseMarker[] = [
  // Linha superior esquerda (casas NOVA)
  { id: 83, x: 8, y: 5 },
  { id: 7, x: 14, y: 3 },
  
  // Fileira superior
  { id: 6, x: 22, y: 3 },
  { id: 7, x: 26, y: 3 },
  { id: 8, x: 30, y: 4 },
  { id: 17, x: 18, y: 6 },
  { id: 18, x: 22, y: 6 },
  { id: 19, x: 26, y: 7 },
  { id: 9, x: 34, y: 6 },
  { id: 10, x: 38, y: 7 },
  
  // Segunda fileira
  { id: 28, x: 16, y: 10 },
  { id: 29, x: 20, y: 11 },
  { id: 20, x: 26, y: 11 },
  { id: 21, x: 30, y: 11 },
  { id: 11, x: 38, y: 10 },
  { id: 12, x: 42, y: 11 },
  { id: 1, x: 46, y: 8 },
  { id: 2, x: 50, y: 9 },
  
  // Terceira fileira
  { id: 32, x: 12, y: 14 },
  { id: 30, x: 20, y: 14 },
  { id: 22, x: 30, y: 14 },
  { id: 13, x: 42, y: 14 },
  { id: 3, x: 54, y: 12 },
  { id: 4, x: 62, y: 12 },
  { id: 5, x: 66, y: 13 },
  
  // Quarta fileira
  { id: 33, x: 12, y: 17 },
  { id: 31, x: 20, y: 17 },
  { id: 23, x: 30, y: 17 },
  { id: 14, x: 42, y: 17 },
  { id: 15, x: 46, y: 20 },
  { id: 36, x: 66, y: 16 },
  
  // Quinta fileira
  { id: 34, x: 16, y: 21 },
  { id: 24, x: 34, y: 20 },
  { id: 25, x: 38, y: 21 },
  { id: 16, x: 50, y: 22 },
  { id: 41, x: 62, y: 20 },
  { id: 37, x: 70, y: 18 },
  
  // Sexta fileira
  { id: 35, x: 18, y: 24 },
  { id: 26, x: 38, y: 24 },
  { id: 27, x: 42, y: 26 },
  { id: 42, x: 62, y: 23 },
  { id: 38, x: 74, y: 21 },
  
  // Sétima fileira
  { id: 46, x: 48, y: 28 },
  { id: 43, x: 66, y: 26 },
  { id: 39, x: 78, y: 24 },
  
  // Oitava fileira
  { id: 52, x: 40, y: 32 },
  { id: 47, x: 52, y: 30 },
  { id: 48, x: 56, y: 31 },
  { id: 44, x: 70, y: 28 },
  { id: 40, x: 82, y: 26 },
  
  // Nona fileira
  { id: 53, x: 46, y: 35 },
  { id: 54, x: 50, y: 36 },
  { id: 49, x: 60, y: 33 },
  { id: 45, x: 76, y: 29 },
  
  // Décima fileira
  { id: 59, x: 34, y: 38 },
  { id: 60, x: 44, y: 39 },
  { id: 55, x: 56, y: 37 },
  { id: 50, x: 68, y: 34 },
  { id: 51, x: 72, y: 36 },
  
  // 11ª fileira
  { id: 67, x: 32, y: 42 },
  { id: 61, x: 44, y: 42 },
  { id: 56, x: 56, y: 40 },
  { id: 57, x: 68, y: 38 },
  { id: 85, x: 76, y: 37 },
  
  // 12ª fileira
  { id: 68, x: 34, y: 46 },
  { id: 62, x: 46, y: 45 },
  { id: 63, x: 52, y: 44 },
  { id: 58, x: 68, y: 42 },
  
  // 13ª fileira
  { id: 75, x: 28, y: 48 },
  { id: 69, x: 38, y: 49 },
  { id: 70, x: 44, y: 50 },
  
  // 14ª fileira
  { id: 76, x: 32, y: 52 },
  { id: 71, x: 44, y: 52 },
  { id: 64, x: 56, y: 48 },
  { id: 102, x: 86, y: 44 },
  
  // 15ª fileira
  { id: 77, x: 34, y: 56 },
  { id: 72, x: 48, y: 54 },
  { id: 65, x: 60, y: 50 },
  { id: 103, x: 86, y: 47 },
  { id: 104, x: 86, y: 50 },
  
  // 16ª fileira
  { id: 78, x: 36, y: 60 },
  { id: 73, x: 50, y: 58 },
  { id: 66, x: 62, y: 52 },
  { id: 105, x: 86, y: 53 },
  
  // 17ª fileira
  { id: 79, x: 32, y: 64 },
  { id: 74, x: 54, y: 60 },
  { id: 106, x: 86, y: 56 },
  
  // 18ª fileira
  { id: 80, x: 36, y: 68 },
  { id: 107, x: 86, y: 59 },
  
  // 19ª fileira
  { id: 81, x: 40, y: 72 },
  { id: 83, x: 62, y: 66 },
  { id: 108, x: 86, y: 62 },
  
  // 20ª fileira
  { id: 82, x: 44, y: 76 },
  { id: 84, x: 62, y: 70 },
  { id: 109, x: 86, y: 65 },
  
  // 21ª fileira
  { id: 85, x: 62, y: 74 },
  { id: 110, x: 86, y: 68 },
  
  // 22ª fileira
  { id: 86, x: 54, y: 80 },
  { id: 87, x: 58, y: 78 },
  { id: 111, x: 86, y: 71 },
  
  // Fileira vertical direita (88-102)
  { id: 88, x: 62, y: 82 },
  { id: 89, x: 62, y: 85 },
  { id: 90, x: 62, y: 88 },
  { id: 91, x: 62, y: 91 },
  { id: 92, x: 62, y: 94 },
  { id: 93, x: 66, y: 86 },
  { id: 94, x: 66, y: 89 },
  { id: 95, x: 66, y: 92 },
  { id: 96, x: 66, y: 95 },
  { id: 97, x: 66, y: 98 },
  
  // Final
  { id: 98, x: 50, y: 96 },
  { id: 99, x: 54, y: 96 },
  { id: 100, x: 62, y: 96 },
  { id: 101, x: 52, y: 99 },
  { id: 102, x: 58, y: 99 },
  
  // Coluna extrema direita
  { id: 112, x: 86, y: 74 },
  { id: 113, x: 86, y: 77 },
  { id: 114, x: 86, y: 80 },
  { id: 115, x: 86, y: 83 },
  { id: 116, x: 86, y: 86 },
  { id: 117, x: 86, y: 89 },
  { id: 118, x: 86, y: 92 },
  { id: 119, x: 86, y: 95 },
  { id: 120, x: 86, y: 98 },
  { id: 121, x: 90, y: 95 },
  { id: 122, x: 90, y: 98 },
  { id: 123, x: 94, y: 98 },
];

export function InteractiveMapView() {
  const { currentProject, selectedHouse, setSelectedHouse } = useConstruction();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredHouse, setHoveredHouse] = useState<number | null>(null);

  const houses = currentProject?.houses || [];
  const legendItems = currentProject?.customLegendItems || DEFAULT_LEGEND_ITEMS;
  const legendFollowMacros = currentProject?.legendFollowMacros || false;
  const macrosTemplate = currentProject?.macrosTemplate || [];

  // Get house color based on progress
  const getHouseColor = useCallback((houseId: number): string => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return "#9ca3af";
    
    const progress = calculateHouseProgress(house);
    
    if (legendFollowMacros && macrosTemplate.length > 0) {
      // Find which macro stage the house is in
      for (const macro of macrosTemplate) {
        const macroProgress = house.macros.find(m => m.id === macro.id);
        if (macroProgress) {
          const macroComplete = macroProgress.scopes.every(s => s.progress >= 100);
          const macroStarted = macroProgress.scopes.some(s => s.progress > 0);
          
          if (macroStarted && !macroComplete) {
            return macro.color || "#9ca3af";
          }
        }
      }
    }
    
    // Use legend items based on progress percentage
    for (const item of legendItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.color;
      }
    }
    
    return "#9ca3af";
  }, [houses, legendItems, legendFollowMacros, macrosTemplate]);

  // Get house progress
  const getHouseProgress = useCallback((houseId: number): number => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return 0;
    return calculateHouseProgress(house);
  }, [houses]);

  // Zoom handlers
  const handleZoomIn = () => setScale(s => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Mouse handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.max(0.5, Math.min(4, s + delta)));
  };

  // Select house
  const handleHouseClick = (houseId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const house = houses.find(h => h.id === houseId);
    if (house) {
      setSelectedHouse(house);
    }
  };

  // Navigate to house on map
  const navigateToHouse = (houseId: number) => {
    const marker = HOUSE_POSITIONS.find(m => m.id === houseId);
    if (marker && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;
      
      // Calculate position to center the house
      const targetX = -(marker.x / 100 * containerRect.width * scale - centerX);
      const targetY = -(marker.y / 100 * containerRect.height * scale - centerY);
      
      setPosition({ x: targetX, y: targetY });
      setScale(2);
    }
  };

  // Get house by ID from current project
  const getHouseById = (houseId: number) => {
    return houses.find(h => h.id === houseId);
  };

  // Filter positions to only show houses that exist in the project
  const availableMarkers = useMemo(() => {
    const projectHouseIds = new Set(houses.map(h => h.id));
    return HOUSE_POSITIONS.filter(marker => projectHouseIds.has(marker.id));
  }, [houses]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione uma obra para visualizar o mapa de implantação
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Badge variant="secondary" className="ml-2">
            {Math.round(scale * 100)}%
          </Badge>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Move className="h-4 w-4" />
          <span>Arraste para navegar • Scroll para zoom</span>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Interactive Map */}
        <Card 
          ref={containerRef}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-muted/30"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <div
            className="absolute inset-0 transition-transform duration-100"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          >
            {/* Background Image */}
            <img
              src={plantaLoteamento}
              alt="Planta do Loteamento"
              className="w-full h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
            
            {/* House Markers */}
            {availableMarkers.map(marker => {
              const house = getHouseById(marker.id);
              const progress = getHouseProgress(marker.id);
              const color = getHouseColor(marker.id);
              const isSelected = selectedHouse?.id === marker.id;
              const isHovered = hoveredHouse === marker.id;
              
              return (
                <div
                  key={marker.id}
                  className={`absolute cursor-pointer transition-all duration-200 ${
                    isSelected ? "z-20" : isHovered ? "z-10" : "z-0"
                  }`}
                  style={{
                    left: `${marker.x}%`,
                    top: `${marker.y}%`,
                    transform: `translate(-50%, -50%) scale(${isSelected || isHovered ? 1.3 : 1})`,
                  }}
                  onClick={(e) => handleHouseClick(marker.id, e)}
                  onMouseEnter={() => setHoveredHouse(marker.id)}
                  onMouseLeave={() => setHoveredHouse(null)}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold shadow-lg border-2 transition-all ${
                      isSelected 
                        ? "border-primary ring-2 ring-primary/50" 
                        : "border-background"
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    <span className="text-white drop-shadow-md">{marker.id}</span>
                  </div>
                  
                  {/* Tooltip on hover */}
                  {(isHovered || isSelected) && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-12 bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 shadow-lg whitespace-nowrap z-30 border">
                      <div className="font-semibold">Casa {marker.id}</div>
                      <div className="text-muted-foreground">{progress.toFixed(1)}% concluído</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Side Panel */}
        <Card className="w-80 shrink-0 flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Detalhes da Casa
            </h3>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-4">
              {selectedHouse ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-2xl font-bold">Casa {selectedHouse.id}</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedHouse.type}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedHouse(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progresso Geral</span>
                      <span className="font-medium">
                        {calculateHouseProgress(selectedHouse).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={calculateHouseProgress(selectedHouse)} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Área</p>
                      <p className="font-semibold">{selectedHouse.area} m²</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-muted-foreground text-xs">Construtora</p>
                      <p className="font-semibold truncate">{selectedHouse.constructorName || "-"}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 col-span-2">
                      <p className="text-muted-foreground text-xs">Última Atualização</p>
                      <p className="font-semibold">{selectedHouse.lastUpdate}</p>
                    </div>
                  </div>
                  
                  {/* Macros Progress */}
                  <div className="space-y-3">
                    <h5 className="font-medium text-sm">Etapas</h5>
                    {selectedHouse.macros.map(macro => {
                      const macroProgress = macro.scopes.reduce((sum, s) => sum + s.progress * s.weight, 0) / 
                        macro.scopes.reduce((sum, s) => sum + s.weight, 0) || 0;
                      
                      return (
                        <div key={macro.id} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: macro.color }}
                              />
                              <span>{macro.name}</span>
                            </div>
                            <span className="text-muted-foreground">
                              {macroProgress.toFixed(0)}%
                            </span>
                          </div>
                          <Progress value={macroProgress} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                  
                  <Button 
                    className="w-full" 
                    onClick={() => navigateToHouse(selectedHouse.id)}
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Centralizar no Mapa
                  </Button>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Clique em uma casa no mapa para ver os detalhes</p>
                </div>
              )}
            </div>
          </ScrollArea>
          
          {/* Legend */}
          <div className="p-4 border-t bg-muted/30">
            <h5 className="text-xs font-medium mb-2 text-muted-foreground">Legenda</h5>
            <div className="grid grid-cols-2 gap-1">
              {legendItems.map(item => (
                <div key={item.id} className="flex items-center gap-1.5 text-xs">
                  <div 
                    className="w-3 h-3 rounded-full shrink-0" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
