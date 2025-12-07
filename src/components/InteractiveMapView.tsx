import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useConstruction, DEFAULT_LEGEND_ITEMS } from "@/contexts/ConstructionContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Move, 
  X,
  MapPin,
  Search,
  Upload,
  Trash2,
  Filter,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HousePosition {
  id: number;
  x: number;
  y: number;
}

interface QuadraLayout {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  houses: HousePosition[];
  rows: number;
  cols: number;
  orientation: "horizontal" | "vertical" | "grid";
}

interface MapLayout {
  imageUrl: string | null;
  quadras: QuadraLayout[];
  mapWidth: number;
  mapHeight: number;
}

const MAP_LAYOUT_STORAGE_KEY = "obramap_interactive_map_layout";

export function InteractiveMapView() {
  const { currentProject, selectedHouse, setSelectedHouse } = useConstruction();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredHouse, setHoveredHouse] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [customLayout, setCustomLayout] = useState<MapLayout | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMacro, setFilterMacro] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");

  const houses = currentProject?.houses || [];
  const legendItems = currentProject?.customLegendItems || DEFAULT_LEGEND_ITEMS;
  const legendFollowMacros = currentProject?.legendFollowMacros || false;
  const macrosTemplate = currentProject?.macrosTemplate || [];

  // Map dimensions
  const MAP_WIDTH = 1000;
  const MAP_HEIGHT = 800;
  const HOUSE_SIZE = 32;

  // Load saved map layout for current project
  useEffect(() => {
    if (currentProject?.id) {
      const savedLayout = localStorage.getItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject.id}`);
      if (savedLayout) {
        try {
          const layout: MapLayout = JSON.parse(savedLayout);
          setMapImage(layout.imageUrl);
          setCustomLayout(layout);
        } catch (e) {
          console.error("Error loading map layout:", e);
        }
      } else {
        setMapImage(null);
        setCustomLayout(null);
      }
    }
  }, [currentProject?.id]);

  // Analyze floor plan with AI
  const analyzeFloorPlan = async (imageBase64: string) => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-floor-plan", {
        body: {
          imageBase64,
          existingQuadras: currentProject?.quadras || [],
        },
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      console.log("AI Analysis result:", data);

      // Create the layout from AI analysis
      const layout: MapLayout = {
        imageUrl: imageBase64,
        quadras: data.quadras || [],
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      };

      setCustomLayout(layout);
      localStorage.setItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject?.id}`, JSON.stringify(layout));
      
      toast.success("Planta analisada! O mapa foi reconfigurado conforme o layout detectado.");
    } catch (error) {
      console.error("Error analyzing floor plan:", error);
      toast.error("Erro ao analisar a planta. Usando layout padrão.");
      
      // Use default layout on error
      const defaultLayout: MapLayout = {
        imageUrl: imageBase64,
        quadras: [],
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      };
      setCustomLayout(defaultLayout);
      localStorage.setItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject?.id}`, JSON.stringify(defaultLayout));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentProject) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageUrl = event.target?.result as string;
        setMapImage(imageUrl);
        await analyzeFloorPlan(imageUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove image and reset layout
  const handleRemoveImage = () => {
    if (currentProject) {
      setMapImage(null);
      setCustomLayout(null);
      localStorage.removeItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject.id}`);
      toast.success("Layout resetado para o padrão.");
    }
  };

  // Get house status based on progress
  const getHouseStatus = useCallback((houseId: number): string => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return "nao_iniciado";
    
    const progress = calculateHouseProgress(house);
    
    for (const item of legendItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.id;
      }
    }
    
    return "nao_iniciado";
  }, [houses, legendItems]);

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

  // Check if house matches current macro/scope filter
  const houseMatchesMacroFilter = useCallback((houseId: number): boolean => {
    if (filterMacro === "all" && filterScope === "all") return true;
    
    const house = houses.find(h => h.id === houseId);
    if (!house) return false;
    
    if (filterMacro !== "all") {
      const macro = house.macros.find(m => m.id === filterMacro);
      if (!macro) return false;
      
      if (filterScope !== "all") {
        const scope = macro.scopes.find(s => s.id === filterScope);
        if (!scope) return false;
        return scope.progress > 0;
      }
      
      return macro.scopes.some(s => s.progress > 0);
    }
    
    return true;
  }, [houses, filterMacro, filterScope]);

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

  // Get available scopes for selected macro
  const availableScopes = useMemo(() => {
    if (filterMacro === "all") return [];
    const macro = macrosTemplate.find(m => m.id === filterMacro);
    return macro?.scopes || [];
  }, [filterMacro, macrosTemplate]);

  // Calculate quadra layouts based on custom layout or default
  const quadraLayouts = useMemo(() => {
    const projectQuadras = currentProject?.quadras || [];
    const PADDING = 20;

    interface LayoutItem {
      quadra: typeof projectQuadras[0];
      x: number;
      y: number;
      width: number;
      height: number;
      housePositions: Array<{ houseId: number; x: number; y: number }>;
    }

    const layouts: LayoutItem[] = [];

    if (customLayout && customLayout.quadras && customLayout.quadras.length > 0) {
      // Use custom layout from AI analysis
      customLayout.quadras.forEach((customQuadra) => {
        // Find matching project quadra
        const projectQuadra = projectQuadras.find(
          q => q.name.toLowerCase() === customQuadra.name.toLowerCase()
        );

        if (!projectQuadra) return;

        // Convert percentages to pixels
        const quadraX = (customQuadra.x / 100) * MAP_WIDTH;
        const quadraY = (customQuadra.y / 100) * MAP_HEIGHT;
        const quadraWidth = (customQuadra.width / 100) * MAP_WIDTH;
        const quadraHeight = (customQuadra.height / 100) * MAP_HEIGHT;

        // Calculate house positions based on AI-detected positions
        const houseIds = projectQuadra.houses || [];
        const housePositions = houseIds.map((houseId, idx) => {
          // Find custom position for this house
          const customHousePos = customQuadra.houses?.find(h => h.id === houseId);
          
          if (customHousePos) {
            // Use AI-detected position (convert from percentage within quadra to absolute)
            return {
              houseId,
              x: quadraX + PADDING + (customHousePos.x / 100) * (quadraWidth - PADDING * 2 - HOUSE_SIZE),
              y: quadraY + PADDING + 20 + (customHousePos.y / 100) * (quadraHeight - PADDING * 2 - HOUSE_SIZE - 20),
            };
          } else {
            // Calculate position based on rows/cols layout
            const rows = customQuadra.rows || Math.ceil(Math.sqrt(houseIds.length));
            const cols = customQuadra.cols || Math.ceil(houseIds.length / rows);
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            
            const cellWidth = (quadraWidth - PADDING * 2) / cols;
            const cellHeight = (quadraHeight - PADDING * 2 - 20) / rows;
            
            return {
              houseId,
              x: quadraX + PADDING + col * cellWidth + (cellWidth - HOUSE_SIZE) / 2,
              y: quadraY + PADDING + 20 + row * cellHeight + (cellHeight - HOUSE_SIZE) / 2,
            };
          }
        });

        layouts.push({
          quadra: projectQuadra,
          x: quadraX,
          y: quadraY,
          width: quadraWidth,
          height: quadraHeight,
          housePositions,
        });
      });

      // Add any quadras not in custom layout
      const customQuadraNames = new Set(customLayout.quadras.map(q => q.name.toLowerCase()));
      projectQuadras.forEach((quadra, index) => {
        if (!customQuadraNames.has(quadra.name.toLowerCase())) {
          const existingLayouts = layouts.length;
          const row = Math.floor(existingLayouts / 3);
          const col = existingLayouts % 3;
          
          const quadraWidth = MAP_WIDTH * 0.28;
          const quadraHeight = MAP_HEIGHT * 0.25;
          const quadraX = 20 + col * (quadraWidth + 20);
          const quadraY = 20 + row * (quadraHeight + 20);
          
          const houseIds = quadra.houses || [];
          const rows = Math.ceil(Math.sqrt(houseIds.length));
          const cols = Math.ceil(houseIds.length / rows);
          
          const housePositions = houseIds.map((houseId, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const cellWidth = (quadraWidth - PADDING * 2) / cols;
            const cellHeight = (quadraHeight - PADDING * 2 - 20) / rows;
            
            return {
              houseId,
              x: quadraX + PADDING + c * cellWidth + (cellWidth - HOUSE_SIZE) / 2,
              y: quadraY + PADDING + 20 + r * cellHeight + (cellHeight - HOUSE_SIZE) / 2,
            };
          });

          layouts.push({
            quadra,
            x: quadraX,
            y: quadraY,
            width: quadraWidth,
            height: quadraHeight,
            housePositions,
          });
        }
      });
    } else {
      // Default auto-layout
      const sortedQuadras = [...projectQuadras].sort((a, b) => a.name.localeCompare(b.name));
      const HOUSES_PER_ROW = 5;
      const HOUSE_GAP = 8;
      const QUADRA_MARGIN = 30;
      
      let currentY = 40;
      let currentX = 40;
      let rowMaxHeight = 0;
      const maxWidth = MAP_WIDTH - 80;

      sortedQuadras.forEach((quadra) => {
        const houseIds = quadra.houses || [];
        const rows = Math.ceil(houseIds.length / HOUSES_PER_ROW);
        const cols = Math.min(houseIds.length, HOUSES_PER_ROW);
        
        const quadraWidth = cols * (HOUSE_SIZE + HOUSE_GAP) + QUADRA_MARGIN;
        const quadraHeight = rows * (HOUSE_SIZE + HOUSE_GAP) + QUADRA_MARGIN + 20;
        
        if (currentX + quadraWidth > maxWidth) {
          currentX = 40;
          currentY += rowMaxHeight + QUADRA_MARGIN;
          rowMaxHeight = 0;
        }
        
        rowMaxHeight = Math.max(rowMaxHeight, quadraHeight);
        
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
    }

    // Handle houses without quadra
    const allQuadraHouseIds = new Set(projectQuadras.flatMap(q => q.houses || []));
    const housesWithoutQuadra = houses.filter(h => !allQuadraHouseIds.has(h.id));
    
    if (housesWithoutQuadra.length > 0) {
      const lastLayout = layouts[layouts.length - 1];
      const startX = lastLayout ? Math.min(lastLayout.x + lastLayout.width + 30, MAP_WIDTH - 200) : 40;
      const startY = lastLayout ? lastLayout.y : 40;
      
      const HOUSES_PER_ROW = 5;
      const HOUSE_GAP = 8;
      const rows = Math.ceil(housesWithoutQuadra.length / HOUSES_PER_ROW);
      const cols = Math.min(housesWithoutQuadra.length, HOUSES_PER_ROW);
      
      const quadraWidth = cols * (HOUSE_SIZE + HOUSE_GAP) + 30;
      const quadraHeight = rows * (HOUSE_SIZE + HOUSE_GAP) + 50;
      
      const housePositions = housesWithoutQuadra.map((house, idx) => {
        const row = Math.floor(idx / HOUSES_PER_ROW);
        const col = idx % HOUSES_PER_ROW;
        return {
          houseId: house.id,
          x: startX + 15 + col * (HOUSE_SIZE + HOUSE_GAP),
          y: startY + 35 + row * (HOUSE_SIZE + HOUSE_GAP),
        };
      });
      
      layouts.push({
        quadra: { id: 'sem-quadra', name: 'Sem Quadra', houses: housesWithoutQuadra.map(h => h.id) },
        x: startX,
        y: startY,
        width: quadraWidth,
        height: quadraHeight,
        housePositions,
      });
    }
    
    return layouts;
  }, [currentProject?.quadras, houses, customLayout, MAP_WIDTH, MAP_HEIGHT, HOUSE_SIZE]);

  // Calculate SVG dimensions
  const svgDimensions = useMemo(() => {
    if (quadraLayouts.length === 0) return { width: MAP_WIDTH, height: MAP_HEIGHT };
    
    const maxX = Math.max(...quadraLayouts.map(l => l.x + l.width)) + 40;
    const maxY = Math.max(...quadraLayouts.map(l => l.y + l.height)) + 40;
    
    return { width: Math.max(MAP_WIDTH, maxX), height: Math.max(MAP_HEIGHT, maxY) };
  }, [quadraLayouts, MAP_WIDTH, MAP_HEIGHT]);

  // Filter houses
  const filteredLayouts = useMemo(() => {
    return quadraLayouts.map(layout => ({
      ...layout,
      housePositions: layout.housePositions.filter(hp => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || 
          hp.houseId.toString().includes(term) ||
          layout.quadra.name.toLowerCase().includes(term);
        
        const matchesStatus = filterStatus === "all" || getHouseStatus(hp.houseId) === filterStatus;
        const matchesMacroScope = houseMatchesMacroFilter(hp.houseId);
        
        return matchesSearch && matchesStatus && matchesMacroScope;
      })
    })).filter(layout => layout.housePositions.length > 0);
  }, [quadraLayouts, searchTerm, filterStatus, getHouseStatus, houseMatchesMacroFilter]);

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

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            disabled={isAnalyzing}
          />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Importar Planta
              </>
            )}
          </Button>
          {mapImage && !isAnalyzing && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRemoveImage}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Resetar
            </Button>
          )}
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

      {/* Filters Row */}
      <div className="flex items-center gap-4 flex-wrap p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros:</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Status:</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {legendItems.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: item.color }}
                    />
                    {item.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Etapa:</Label>
          <Select 
            value={filterMacro} 
            onValueChange={(value) => {
              setFilterMacro(value);
              setFilterScope("all");
            }}
          >
            <SelectTrigger className="w-40 h-8">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {macrosTemplate.map(macro => (
                <SelectItem key={macro.id} value={macro.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: macro.color }}
                    />
                    {macro.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filterMacro !== "all" && (
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Serviço:</Label>
            <Select value={filterScope} onValueChange={setFilterScope}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableScopes.map(scope => (
                  <SelectItem key={scope.id} value={scope.id}>
                    {scope.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(filterStatus !== "all" || filterMacro !== "all") && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              setFilterStatus("all");
              setFilterMacro("all");
              setFilterScope("all");
            }}
            className="text-muted-foreground"
          >
            Limpar filtros
          </Button>
        )}
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
          {isAnalyzing && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm font-medium">Analisando planta com IA...</span>
                <span className="text-xs text-muted-foreground">Detectando quadras e posições das casas</span>
              </div>
            </div>
          )}
          
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            {/* Background image if uploaded */}
            {mapImage && (
              <img 
                src={mapImage} 
                alt="Planta do loteamento"
                className="absolute inset-0 pointer-events-none"
                style={{ 
                  maxWidth: 'none',
                  width: svgDimensions.width,
                  height: svgDimensions.height,
                  objectFit: 'contain',
                  opacity: 0.35,
                }}
              />
            )}

            <svg 
              width={svgDimensions.width} 
              height={svgDimensions.height}
              className="select-none relative z-10"
            >
              {/* Grid pattern background */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3"/>
                </pattern>
              </defs>
              {!mapImage && <rect width="100%" height="100%" fill="url(#grid)" />}
              
              {/* Quadras */}
              {filteredLayouts.map((layout) => (
                <g key={layout.quadra.id}>
                  {/* Quadra boundary */}
                  <rect
                    x={layout.x}
                    y={layout.y}
                    width={layout.width}
                    height={layout.height}
                    fill={mapImage ? "hsl(var(--card) / 0.75)" : "hsl(var(--card))"}
                    stroke="hsl(var(--primary) / 0.6)"
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
                    const progress = getHouseProgress(houseId);
                    const color = getHouseColor(houseId);
                    const isSelected = selectedHouse?.id === houseId;
                    const isHovered = hoveredHouse === houseId;
                    
                    return (
                      <g 
                        key={houseId}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => handleHouseClick(houseId, e as React.MouseEvent)}
                        onMouseEnter={() => setHoveredHouse(houseId)}
                        onMouseLeave={() => setHoveredHouse(null)}
                      >
                        {/* House rectangle */}
                        <rect
                          x={x}
                          y={y}
                          width={HOUSE_SIZE}
                          height={HOUSE_SIZE}
                          fill={color}
                          stroke={isSelected ? "hsl(var(--primary))" : isHovered ? "hsl(var(--foreground))" : "hsl(var(--border))"}
                          strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
                          rx="4"
                          className="transition-all duration-150"
                        />
                        
                        {/* House number */}
                        <text
                          x={x + HOUSE_SIZE / 2}
                          y={y + HOUSE_SIZE / 2 + 4}
                          fill="white"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                        >
                          {houseId}
                        </text>
                        
                        {/* Progress bar */}
                        <rect
                          x={x + 2}
                          y={y + HOUSE_SIZE - 5}
                          width={HOUSE_SIZE - 4}
                          height={3}
                          fill="rgba(0,0,0,0.3)"
                          rx="1.5"
                        />
                        <rect
                          x={x + 2}
                          y={y + HOUSE_SIZE - 5}
                          width={(HOUSE_SIZE - 4) * (progress / 100)}
                          height={3}
                          fill="white"
                          rx="1.5"
                        />
                        
                        {/* Tooltip on hover */}
                        {(isHovered || isSelected) && (
                          <g>
                            <rect
                              x={x - 20}
                              y={y - 38}
                              width={80}
                              height={32}
                              fill="hsl(var(--popover))"
                              stroke="hsl(var(--border))"
                              rx="4"
                            />
                            <text
                              x={x + 20}
                              y={y - 22}
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
            {selectedHouse ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-lg">Casa {selectedHouse.id}</h4>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => setSelectedHouse(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quadra:</span>
                    <span className="font-medium">
                      {currentProject?.quadras.find(q => q.houses?.includes(selectedHouse.id))?.name || "Sem quadra"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Área:</span>
                    <span className="font-medium">{selectedHouse.area} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="font-medium">{selectedHouse.type}</span>
                  </div>
                  {selectedHouse.constructorName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Construtor:</span>
                      <span className="font-medium">{selectedHouse.constructorName}</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Progresso Geral</span>
                    <span className="text-sm font-bold">
                      {calculateHouseProgress(selectedHouse).toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={calculateHouseProgress(selectedHouse)} className="h-2" />
                </div>
                
                <div className="space-y-3">
                  <h5 className="font-medium text-sm">Etapas</h5>
                  {selectedHouse.macros.map((macro) => {
                    const macroProgress = macro.scopes.reduce((sum, s) => sum + s.progress * s.weight, 0) / 
                      macro.scopes.reduce((sum, s) => sum + s.weight, 0);
                    
                    return (
                      <div key={macro.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full shrink-0" 
                            style={{ backgroundColor: macro.color }}
                          />
                          <span className="text-xs font-medium flex-1">{macro.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {macroProgress.toFixed(0)}%
                          </span>
                        </div>
                        <Progress value={macroProgress} className="h-1" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <MapPin className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Clique em uma casa no mapa para ver os detalhes</p>
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
