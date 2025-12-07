import { useState, useRef, useMemo, useCallback } from "react";
import { useConstruction, DEFAULT_LEGEND_ITEMS } from "@/contexts/ConstructionContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Move, 
  X,
  MapPin,
  Search
} from "lucide-react";

export function InteractiveMapView() {
  const { currentProject, selectedHouse, setSelectedHouse } = useConstruction();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredHouse, setHoveredHouse] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const houses = currentProject?.houses || [];
  const legendItems = currentProject?.customLegendItems || DEFAULT_LEGEND_ITEMS;
  const legendFollowMacros = currentProject?.legendFollowMacros || false;
  const macrosTemplate = currentProject?.macrosTemplate || [];

  // Get house color based on progress
  const getHouseColor = useCallback((houseId: number): string => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return "hsl(var(--muted))";
    
    const progress = calculateHouseProgress(house);
    
    if (legendFollowMacros && macrosTemplate.length > 0) {
      for (const macro of macrosTemplate) {
        const macroProgress = house.macros.find(m => m.id === macro.id);
        if (macroProgress) {
          const macroComplete = macroProgress.scopes.every(s => s.progress >= 100);
          const macroStarted = macroProgress.scopes.some(s => s.progress > 0);
          
          if (macroStarted && !macroComplete) {
            return macro.color || "hsl(var(--muted))";
          }
        }
      }
    }
    
    for (const item of legendItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.color;
      }
    }
    
    return "hsl(var(--muted))";
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

  // Get house by ID from current project
  const getHouseById = (houseId: number) => {
    return houses.find(h => h.id === houseId);
  };

  // Organize houses by quadra for layout
  const quadraLayouts = useMemo(() => {
    const projectQuadras = currentProject?.quadras || [];
    
    // Sort quadras by name
    const sortedQuadras = [...projectQuadras].sort((a, b) => a.name.localeCompare(b.name));
    
    // Calculate layout positions for each quadra
    const layouts: Array<{
      quadra: typeof projectQuadras[0];
      x: number;
      y: number;
      width: number;
      height: number;
      housePositions: Array<{ houseId: number; x: number; y: number }>;
    }> = [];
    
    const QUADRA_MARGIN = 30;
    const HOUSE_SIZE = 40;
    const HOUSE_GAP = 8;
    const HOUSES_PER_ROW = 5;
    
    let currentY = 40;
    let currentX = 40;
    let rowMaxHeight = 0;
    const maxWidth = 800;
    
    sortedQuadras.forEach((quadra) => {
      const houseIds = quadra.houses || [];
      const rows = Math.ceil(houseIds.length / HOUSES_PER_ROW);
      const cols = Math.min(houseIds.length, HOUSES_PER_ROW);
      
      const quadraWidth = cols * (HOUSE_SIZE + HOUSE_GAP) + QUADRA_MARGIN;
      const quadraHeight = rows * (HOUSE_SIZE + HOUSE_GAP) + QUADRA_MARGIN + 20;
      
      // Check if we need to wrap to next row
      if (currentX + quadraWidth > maxWidth) {
        currentX = 40;
        currentY += rowMaxHeight + QUADRA_MARGIN;
        rowMaxHeight = 0;
      }
      
      rowMaxHeight = Math.max(rowMaxHeight, quadraHeight);
      
      // Calculate house positions within quadra
      const housePositions = houseIds.map((houseId, idx) => {
        const row = Math.floor(idx / HOUSES_PER_ROW);
        const col = idx % HOUSES_PER_ROW;
        return {
          houseId,
          x: currentX + QUADRA_MARGIN / 2 + col * (HOUSE_SIZE + HOUSE_GAP),
          y: currentY + QUADRA_MARGIN / 2 + 20 + row * (HOUSE_SIZE + HOUSE_GAP),
        };
      });
      
      layouts.push({
        quadra,
        x: currentX,
        y: currentY,
        width: quadraWidth,
        height: quadraHeight,
        housePositions,
      });
      
      currentX += quadraWidth + QUADRA_MARGIN;
    });
    
    // Handle houses without quadra
    const allQuadraHouseIds = new Set(projectQuadras.flatMap(q => q.houses || []));
    const housesWithoutQuadra = houses.filter(h => !allQuadraHouseIds.has(h.id));
    
    if (housesWithoutQuadra.length > 0) {
      const rows = Math.ceil(housesWithoutQuadra.length / HOUSES_PER_ROW);
      const cols = Math.min(housesWithoutQuadra.length, HOUSES_PER_ROW);
      
      const quadraWidth = cols * (HOUSE_SIZE + HOUSE_GAP) + QUADRA_MARGIN;
      const quadraHeight = rows * (HOUSE_SIZE + HOUSE_GAP) + QUADRA_MARGIN + 20;
      
      if (currentX + quadraWidth > maxWidth) {
        currentX = 40;
        currentY += rowMaxHeight + QUADRA_MARGIN;
      }
      
      const housePositions = housesWithoutQuadra.map((house, idx) => {
        const row = Math.floor(idx / HOUSES_PER_ROW);
        const col = idx % HOUSES_PER_ROW;
        return {
          houseId: house.id,
          x: currentX + QUADRA_MARGIN / 2 + col * (HOUSE_SIZE + HOUSE_GAP),
          y: currentY + QUADRA_MARGIN / 2 + 20 + row * (HOUSE_SIZE + HOUSE_GAP),
        };
      });
      
      layouts.push({
        quadra: { id: 'sem-quadra', name: 'Sem Quadra', houses: housesWithoutQuadra.map(h => h.id) },
        x: currentX,
        y: currentY,
        width: quadraWidth,
        height: quadraHeight,
        housePositions,
      });
    }
    
    return layouts;
  }, [currentProject?.quadras, houses]);

  // Calculate SVG dimensions based on layouts
  const svgDimensions = useMemo(() => {
    if (quadraLayouts.length === 0) return { width: 800, height: 600 };
    
    const maxX = Math.max(...quadraLayouts.map(l => l.x + l.width)) + 40;
    const maxY = Math.max(...quadraLayouts.map(l => l.y + l.height)) + 40;
    
    return { width: Math.max(800, maxX), height: Math.max(600, maxY) };
  }, [quadraLayouts]);

  // Filter houses by search
  const filteredLayouts = useMemo(() => {
    if (!searchTerm) return quadraLayouts;
    
    const term = searchTerm.toLowerCase();
    return quadraLayouts.map(layout => ({
      ...layout,
      housePositions: layout.housePositions.filter(hp => 
        hp.houseId.toString().includes(term) ||
        layout.quadra.name.toLowerCase().includes(term)
      )
    })).filter(layout => layout.housePositions.length > 0);
  }, [quadraLayouts, searchTerm]);

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

        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar casa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
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
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-muted/20"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            <svg 
              width={svgDimensions.width} 
              height={svgDimensions.height}
              className="select-none"
            >
              {/* Grid pattern background */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              
              {/* Quadras */}
              {filteredLayouts.map((layout) => (
                <g key={layout.quadra.id}>
                  {/* Quadra boundary */}
                  <rect
                    x={layout.x}
                    y={layout.y}
                    width={layout.width}
                    height={layout.height}
                    fill="hsl(var(--card))"
                    stroke="hsl(var(--border))"
                    strokeWidth="2"
                    rx="8"
                  />
                  
                  {/* Quadra name */}
                  <text
                    x={layout.x + 10}
                    y={layout.y + 16}
                    fill="hsl(var(--foreground))"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {layout.quadra.name}
                  </text>
                  
                  {/* Houses in quadra */}
                  {layout.housePositions.map(({ houseId, x, y }) => {
                    const house = getHouseById(houseId);
                    const progress = getHouseProgress(houseId);
                    const color = getHouseColor(houseId);
                    const isSelected = selectedHouse?.id === houseId;
                    const isHovered = hoveredHouse === houseId;
                    
                    return (
                      <g 
                        key={houseId}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => handleHouseClick(houseId, e as any)}
                        onMouseEnter={() => setHoveredHouse(houseId)}
                        onMouseLeave={() => setHoveredHouse(null)}
                      >
                        {/* House rectangle */}
                        <rect
                          x={x}
                          y={y}
                          width={36}
                          height={36}
                          fill={color}
                          stroke={isSelected ? "hsl(var(--primary))" : isHovered ? "hsl(var(--foreground))" : "hsl(var(--border))"}
                          strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
                          rx="4"
                          className="transition-all duration-150"
                        />
                        
                        {/* House number */}
                        <text
                          x={x + 18}
                          y={y + 22}
                          fill="white"
                          fontSize="11"
                          fontWeight="bold"
                          textAnchor="middle"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                        >
                          {houseId}
                        </text>
                        
                        {/* Progress bar */}
                        <rect
                          x={x + 2}
                          y={y + 30}
                          width={32}
                          height={3}
                          fill="rgba(0,0,0,0.3)"
                          rx="1.5"
                        />
                        <rect
                          x={x + 2}
                          y={y + 30}
                          width={32 * (progress / 100)}
                          height={3}
                          fill="white"
                          rx="1.5"
                        />
                        
                        {/* Tooltip on hover */}
                        {(isHovered || isSelected) && (
                          <g>
                            <rect
                              x={x - 20}
                              y={y - 35}
                              width={80}
                              height={30}
                              fill="hsl(var(--popover))"
                              stroke="hsl(var(--border))"
                              rx="4"
                            />
                            <text
                              x={x + 20}
                              y={y - 20}
                              fill="hsl(var(--popover-foreground))"
                              fontSize="10"
                              fontWeight="600"
                              textAnchor="middle"
                            >
                              Casa {houseId}
                            </text>
                            <text
                              x={x + 20}
                              y={y - 10}
                              fill="hsl(var(--muted-foreground))"
                              fontSize="9"
                              textAnchor="middle"
                            >
                              {progress.toFixed(1)}% concluído
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
              
              {/* Legend */}
              <g transform={`translate(${svgDimensions.width - 150}, 20)`}>
                <rect
                  x="0"
                  y="0"
                  width="140"
                  height={legendItems.length * 20 + 30}
                  fill="hsl(var(--card))"
                  stroke="hsl(var(--border))"
                  rx="4"
                />
                <text x="10" y="18" fill="hsl(var(--foreground))" fontSize="11" fontWeight="600">
                  Legenda
                </text>
                {legendItems.map((item, idx) => (
                  <g key={item.id} transform={`translate(10, ${30 + idx * 18})`}>
                    <rect width="12" height="12" fill={item.color} rx="2" />
                    <text x="18" y="10" fill="hsl(var(--muted-foreground))" fontSize="9">
                      {item.name}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </Card>

        {/* Side Panel */}
        <Card className="w-72 shrink-0 flex flex-col">
          <div className="p-3 border-b">
            <h3 className="font-semibold flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4" />
              Detalhes da Casa
            </h3>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-3">
              {selectedHouse ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-bold">Casa {selectedHouse.id}</h4>
                      <p className="text-xs text-muted-foreground">
                        {selectedHouse.type}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedHouse(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Progresso Geral</span>
                      <span className="font-medium">
                        {calculateHouseProgress(selectedHouse).toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={calculateHouseProgress(selectedHouse)} className="h-2" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-md p-2">
                      <p className="text-muted-foreground text-[10px]">Área</p>
                      <p className="font-semibold">{selectedHouse.area} m²</p>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2">
                      <p className="text-muted-foreground text-[10px]">Construtora</p>
                      <p className="font-semibold truncate">{selectedHouse.constructorName || "-"}</p>
                    </div>
                  </div>
                  
                  {/* Macros Progress */}
                  <div className="space-y-2">
                    <h5 className="font-medium text-xs">Etapas</h5>
                    {selectedHouse.macros.map(macro => {
                      const macroProgress = macro.scopes.reduce((sum, s) => sum + s.progress * s.weight, 0) / 
                        macro.scopes.reduce((sum, s) => sum + s.weight, 0) || 0;
                      
                      return (
                        <div key={macro.id} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="truncate flex-1" style={{ color: macro.color }}>
                              {macro.name}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              {macroProgress.toFixed(0)}%
                            </span>
                          </div>
                          <Progress 
                            value={macroProgress} 
                            className="h-1.5"
                            style={{ 
                              '--progress-color': macro.color 
                            } as React.CSSProperties}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Clique em uma casa no mapa para ver os detalhes</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
