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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Loader2,
  Edit3,
  Save,
  XCircle,
  Grid3X3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HousePosition {
  id: number;
  x: number;
  y: number;
}

interface QuadraLayout {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  houses: HousePosition[];
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
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [customLayout, setCustomLayout] = useState<MapLayout | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  
  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingQuadras, setEditingQuadras] = useState<QuadraLayout[]>([]);
  const [draggingItem, setDraggingItem] = useState<{ type: 'quadra' | 'house' | 'resize'; id: string; houseId?: number; corner?: string } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [initialDragPos, setInitialDragPos] = useState({ x: 0, y: 0 });
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMacro, setFilterMacro] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");

  const houses = currentProject?.houses || [];
  const legendItems = currentProject?.customLegendItems || DEFAULT_LEGEND_ITEMS;
  const legendFollowMacros = currentProject?.legendFollowMacros || false;
  const macrosTemplate = currentProject?.macrosTemplate || [];

  // Map dimensions
  const MAP_WIDTH = 1600;
  const MAP_HEIGHT = 1200;
  const HOUSE_RADIUS = 14;
  const MIN_QUADRA_SIZE = 80;

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

  // Initialize editing quadras when entering edit mode
  useEffect(() => {
    if (isEditMode && currentProject) {
      const projectQuadras = currentProject.quadras || [];
      
      if (customLayout?.quadras && customLayout.quadras.length > 0) {
        setEditingQuadras(customLayout.quadras.map(q => ({
          ...q,
          id: projectQuadras.find(pq => pq.name === q.name)?.id || q.id || q.name,
        })));
      } else {
        const defaultLayout = generateDefaultLayout(projectQuadras, houses);
        setEditingQuadras(defaultLayout);
      }
    }
  }, [isEditMode, currentProject, customLayout]);

  // Generate default layout
  const generateDefaultLayout = (quadras: any[], allHouses: any[]): QuadraLayout[] => {
    const layouts: QuadraLayout[] = [];
    const PADDING = 40;
    const QUADRA_GAP = 30;
    let currentX = PADDING;
    let currentY = PADDING;
    let rowMaxHeight = 0;
    const maxWidth = MAP_WIDTH - PADDING * 2;

    quadras.forEach((quadra) => {
      const houseIds = quadra.houses || [];
      const houseCount = houseIds.length;
      const cols = Math.ceil(Math.sqrt(houseCount));
      const rows = Math.ceil(houseCount / cols);
      
      const quadraWidth = Math.max(MIN_QUADRA_SIZE, cols * (HOUSE_RADIUS * 2.5 + 12) + 30);
      const quadraHeight = Math.max(MIN_QUADRA_SIZE, rows * (HOUSE_RADIUS * 2.5 + 12) + 40);

      if (currentX + quadraWidth > maxWidth) {
        currentX = PADDING;
        currentY += rowMaxHeight + QUADRA_GAP;
        rowMaxHeight = 0;
      }

      rowMaxHeight = Math.max(rowMaxHeight, quadraHeight);

      const housePositions = houseIds.map((houseId: number, idx: number) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const cellWidth = (quadraWidth - 30) / Math.max(cols, 1);
        const cellHeight = (quadraHeight - 40) / Math.max(rows, 1);
        
        return {
          id: houseId,
          x: 15 + col * cellWidth + cellWidth / 2,
          y: 30 + row * cellHeight + cellHeight / 2,
        };
      });

      layouts.push({
        id: quadra.id,
        name: quadra.name,
        x: currentX,
        y: currentY,
        width: quadraWidth,
        height: quadraHeight,
        houses: housePositions,
      });

      currentX += quadraWidth + QUADRA_GAP;
    });

    return layouts;
  };

  // Auto-distribute houses in a quadra
  const autoDistributeHouses = (quadraId: string) => {
    setEditingQuadras(prev => prev.map(quadra => {
      if (quadra.id !== quadraId) return quadra;
      
      const houseCount = quadra.houses.length;
      if (houseCount === 0) return quadra;
      
      const cols = Math.ceil(Math.sqrt(houseCount));
      const rows = Math.ceil(houseCount / cols);
      const cellWidth = (quadra.width - 30) / Math.max(cols, 1);
      const cellHeight = (quadra.height - 40) / Math.max(rows, 1);
      
      return {
        ...quadra,
        houses: quadra.houses.map((house, idx) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          return {
            ...house,
            x: 15 + col * cellWidth + cellWidth / 2,
            y: 30 + row * cellHeight + cellHeight / 2,
          };
        }),
      };
    }));
  };

  // Get SVG coordinates from mouse event
  const getSvgCoords = useCallback((e: React.MouseEvent) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - svgRect.left - position.x) / scale,
      y: (e.clientY - svgRect.top - position.y) / scale,
    };
  }, [position, scale]);

  // Handle mouse down for editing
  const handleEditMouseDown = (e: React.MouseEvent, type: 'quadra' | 'house' | 'resize', quadraId: string, houseId?: number, corner?: string) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    const coords = getSvgCoords(e);

    if (type === 'quadra') {
      const quadra = editingQuadras.find(q => q.id === quadraId);
      if (quadra) {
        setDragOffset({ x: coords.x - quadra.x, y: coords.y - quadra.y });
      }
    } else if (type === 'house' && houseId !== undefined) {
      const quadra = editingQuadras.find(q => q.id === quadraId);
      const house = quadra?.houses.find(h => h.id === houseId);
      if (house && quadra) {
        setDragOffset({ x: coords.x - (quadra.x + house.x), y: coords.y - (quadra.y + house.y) });
      }
    }

    setInitialDragPos(coords);
    setDraggingItem({ type, id: quadraId, houseId, corner });
  };

  // Handle mouse move for editing
  const handleEditMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isEditMode || !draggingItem) return;

    const coords = getSvgCoords(e);

    setEditingQuadras(prev => prev.map(quadra => {
      if (quadra.id !== draggingItem.id) return quadra;

      if (draggingItem.type === 'quadra') {
        const newX = Math.max(0, Math.min(MAP_WIDTH - quadra.width, coords.x - dragOffset.x));
        const newY = Math.max(0, Math.min(MAP_HEIGHT - quadra.height, coords.y - dragOffset.y));
        return { ...quadra, x: newX, y: newY };
      } else if (draggingItem.type === 'house' && draggingItem.houseId !== undefined) {
        return {
          ...quadra,
          houses: quadra.houses.map(house => {
            if (house.id !== draggingItem.houseId) return house;
            const newX = Math.max(HOUSE_RADIUS, Math.min(quadra.width - HOUSE_RADIUS, coords.x - quadra.x));
            const newY = Math.max(HOUSE_RADIUS + 20, Math.min(quadra.height - HOUSE_RADIUS, coords.y - quadra.y));
            return { ...house, x: newX, y: newY };
          }),
        };
      } else if (draggingItem.type === 'resize' && draggingItem.corner) {
        let newX = quadra.x;
        let newY = quadra.y;
        let newWidth = quadra.width;
        let newHeight = quadra.height;

        switch (draggingItem.corner) {
          case 'se':
            newWidth = Math.max(MIN_QUADRA_SIZE, coords.x - quadra.x);
            newHeight = Math.max(MIN_QUADRA_SIZE, coords.y - quadra.y);
            break;
          case 'sw':
            newWidth = Math.max(MIN_QUADRA_SIZE, quadra.x + quadra.width - coords.x);
            newX = Math.min(quadra.x + quadra.width - MIN_QUADRA_SIZE, coords.x);
            newHeight = Math.max(MIN_QUADRA_SIZE, coords.y - quadra.y);
            break;
          case 'ne':
            newWidth = Math.max(MIN_QUADRA_SIZE, coords.x - quadra.x);
            newHeight = Math.max(MIN_QUADRA_SIZE, quadra.y + quadra.height - coords.y);
            newY = Math.min(quadra.y + quadra.height - MIN_QUADRA_SIZE, coords.y);
            break;
          case 'nw':
            newWidth = Math.max(MIN_QUADRA_SIZE, quadra.x + quadra.width - coords.x);
            newX = Math.min(quadra.x + quadra.width - MIN_QUADRA_SIZE, coords.x);
            newHeight = Math.max(MIN_QUADRA_SIZE, quadra.y + quadra.height - coords.y);
            newY = Math.min(quadra.y + quadra.height - MIN_QUADRA_SIZE, coords.y);
            break;
          case 'e':
            newWidth = Math.max(MIN_QUADRA_SIZE, coords.x - quadra.x);
            break;
          case 'w':
            newWidth = Math.max(MIN_QUADRA_SIZE, quadra.x + quadra.width - coords.x);
            newX = Math.min(quadra.x + quadra.width - MIN_QUADRA_SIZE, coords.x);
            break;
          case 's':
            newHeight = Math.max(MIN_QUADRA_SIZE, coords.y - quadra.y);
            break;
          case 'n':
            newHeight = Math.max(MIN_QUADRA_SIZE, quadra.y + quadra.height - coords.y);
            newY = Math.min(quadra.y + quadra.height - MIN_QUADRA_SIZE, coords.y);
            break;
        }

        return { ...quadra, x: newX, y: newY, width: newWidth, height: newHeight };
      }

      return quadra;
    }));
  }, [isEditMode, draggingItem, dragOffset, getSvgCoords]);

  // Handle mouse up for editing
  const handleEditMouseUp = () => {
    setDraggingItem(null);
  };

  // Save the edited layout
  const saveLayout = () => {
    if (!currentProject) return;

    const layout: MapLayout = {
      imageUrl: mapImage,
      quadras: editingQuadras,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
    };

    setCustomLayout(layout);
    localStorage.setItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject.id}`, JSON.stringify(layout));
    setIsEditMode(false);
    toast.success("Layout salvo com sucesso!");
  };

  // Cancel editing
  const cancelEdit = () => {
    setIsEditMode(false);
    setEditingQuadras([]);
  };

  // Enter edit mode
  const enterEditMode = () => {
    setIsEditMode(true);
  };

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

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Convert AI result to our format
      const projectQuadras = currentProject?.quadras || [];
      const quadraLayouts: QuadraLayout[] = (data.quadras || []).map((q: any) => {
        const projectQuadra = projectQuadras.find(pq => 
          pq.name.toLowerCase() === q.name.toLowerCase()
        );
        
        const quadraWidth = (q.width / 100) * MAP_WIDTH;
        const quadraHeight = (q.height / 100) * MAP_HEIGHT;
        
        return {
          id: projectQuadra?.id || q.name,
          name: q.name,
          x: (q.x / 100) * MAP_WIDTH,
          y: (q.y / 100) * MAP_HEIGHT,
          width: quadraWidth,
          height: quadraHeight,
          houses: (q.houses || []).map((h: any) => ({
            id: h.id,
            x: (h.x / 100) * quadraWidth,
            y: (h.y / 100) * quadraHeight,
          })),
        };
      });

      const layout: MapLayout = {
        imageUrl: imageBase64,
        quadras: quadraLayouts,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      };

      setCustomLayout(layout);
      localStorage.setItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject?.id}`, JSON.stringify(layout));
      toast.success("Planta analisada e casas distribuídas automaticamente!");
    } catch (error) {
      console.error("Error analyzing floor plan:", error);
      toast.error("Erro ao analisar. Entre no modo de edição para desenhar manualmente.");
      
      // Save image without AI analysis, generate default layout
      const defaultLayout = generateDefaultLayout(currentProject?.quadras || [], houses);
      const layout: MapLayout = {
        imageUrl: imageBase64,
        quadras: defaultLayout,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      };
      setCustomLayout(layout);
      localStorage.setItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject?.id}`, JSON.stringify(layout));
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
      setEditingQuadras([]);
      localStorage.removeItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject.id}`);
      toast.success("Layout resetado.");
    }
  };

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

  // Get house status
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

  // Check if house matches filter
  const houseMatchesMacroFilter = useCallback((houseId: number): boolean => {
    if (filterMacro === "all" && filterScope === "all") return true;
    const house = houses.find(h => h.id === houseId);
    if (!house) return false;
    if (filterMacro !== "all") {
      const macro = house.macros.find(m => m.id === filterMacro);
      if (!macro) return false;
      if (filterScope !== "all") {
        const scope = macro.scopes.find(s => s.id === filterScope);
        return scope ? scope.progress > 0 : false;
      }
      return macro.scopes.some(s => s.progress > 0);
    }
    return true;
  }, [houses, filterMacro, filterScope]);

  // Zoom handlers
  const handleZoomIn = () => setScale(s => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.25, 0.3));
  const handleReset = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditMode && draggingItem) return;
    if (e.button === 0 && !isEditMode) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isEditMode) {
      handleEditMouseMove(e);
      return;
    }
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    handleEditMouseUp();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.max(0.3, Math.min(4, s + delta)));
  };

  // Select house - show dialog with details
  const handleHouseClick = (houseId: number, e: React.MouseEvent) => {
    if (isEditMode) return;
    e.stopPropagation();
    const house = houses.find(h => h.id === houseId);
    if (house) {
      setSelectedHouse(house);
      setShowDetailsDialog(true);
    }
  };

  // Get available scopes
  const availableScopes = useMemo(() => {
    if (filterMacro === "all") return [];
    const macro = macrosTemplate.find(m => m.id === filterMacro);
    return macro?.scopes || [];
  }, [filterMacro, macrosTemplate]);

  // Get display quadras (editing or custom layout or default)
  const displayQuadras = useMemo(() => {
    if (isEditMode) return editingQuadras;
    if (customLayout?.quadras && customLayout.quadras.length > 0) {
      return customLayout.quadras;
    }
    return generateDefaultLayout(currentProject?.quadras || [], houses);
  }, [isEditMode, editingQuadras, customLayout, currentProject?.quadras, houses]);

  // Filter quadras
  const filteredQuadras = useMemo(() => {
    return displayQuadras.map(quadra => ({
      ...quadra,
      houses: quadra.houses.filter(hp => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm || 
          hp.id.toString().includes(term) ||
          quadra.name.toLowerCase().includes(term);
        const matchesStatus = filterStatus === "all" || getHouseStatus(hp.id) === filterStatus;
        const matchesMacroScope = houseMatchesMacroFilter(hp.id);
        return matchesSearch && matchesStatus && matchesMacroScope;
      })
    })).filter(q => q.houses.length > 0 || isEditMode);
  }, [displayQuadras, searchTerm, filterStatus, getHouseStatus, houseMatchesMacroFilter, isEditMode]);

  // SVG dimensions
  const svgDimensions = useMemo(() => {
    if (displayQuadras.length === 0) return { width: MAP_WIDTH, height: MAP_HEIGHT };
    const maxX = Math.max(...displayQuadras.map(q => q.x + q.width)) + 50;
    const maxY = Math.max(...displayQuadras.map(q => q.y + q.height)) + 50;
    return { width: Math.max(MAP_WIDTH, maxX), height: Math.max(MAP_HEIGHT, maxY) };
  }, [displayQuadras]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione uma obra para visualizar o mapa de implantação
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls - compact bar */}
      <div className="flex items-center justify-between gap-3 p-2 bg-background/80 backdrop-blur border-b flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Badge variant="outline" className="text-xs h-6">
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
            disabled={isAnalyzing || isEditMode}
          />
          
          {!isEditMode ? (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 h-8 text-xs"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Upload className="h-3 w-3" />
                    Importar
                  </>
                )}
              </Button>
              
              <Button 
                variant="default" 
                size="sm"
                onClick={enterEditMode}
                className="gap-1.5 h-8 text-xs"
              >
                <Edit3 className="h-3 w-3" />
                Editar
              </Button>

              {mapImage && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleRemoveImage}
                  className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button 
                variant="default" 
                size="sm"
                onClick={saveLayout}
                className="gap-1.5 h-8 text-xs"
              >
                <Save className="h-3 w-3" />
                Salvar
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={cancelEdit}
                className="gap-1.5 h-8 text-xs"
              >
                <XCircle className="h-3 w-3" />
                Cancelar
              </Button>
            </>
          )}
        </div>

        {!isEditMode && (
          <div className="relative w-40">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar casa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>
        )}
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isEditMode ? (
            <Badge variant="secondary" className="bg-primary/20 text-primary text-xs">
              <Edit3 className="h-3 w-3 mr-1" />
              Modo Edição
            </Badge>
          ) : (
            <>
              <Move className="h-3 w-3" />
              <span>Arraste para navegar</span>
            </>
          )}
        </div>
      </div>

      {/* Filters Row (hidden in edit mode) */}
      {!isEditMode && (
        <div className="flex items-center gap-3 flex-wrap p-2 bg-muted/20 border-b">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">Filtros:</span>
          </div>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {legendItems.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterMacro} onValueChange={(v) => { setFilterMacro(v); setFilterScope("all"); }}>
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {macrosTemplate.map(macro => (
                <SelectItem key={macro.id} value={macro.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: macro.color }} />
                    {macro.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filterMacro !== "all" && (
            <Select value={filterScope} onValueChange={setFilterScope}>
              <SelectTrigger className="w-32 h-7 text-xs">
                <SelectValue placeholder="Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {availableScopes.map(scope => (
                  <SelectItem key={scope.id} value={scope.id}>{scope.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(filterStatus !== "all" || filterMacro !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterMacro("all"); setFilterScope("all"); }} className="text-xs h-7 px-2">
              Limpar
            </Button>
          )}
        </div>
      )}

      {/* Full-screen Map Container */}
      <div 
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${isEditMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} bg-muted/10`}
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
              <span className="text-sm font-medium">Analisando planta e distribuindo casas...</span>
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
          {/* Background image */}
          {mapImage && (
            <img 
              src={mapImage} 
              alt="Planta"
              className="absolute inset-0 pointer-events-none"
              style={{ 
                maxWidth: 'none',
                width: svgDimensions.width,
                height: svgDimensions.height,
                objectFit: 'contain',
                opacity: isEditMode ? 0.6 : 0.4,
              }}
            />
          )}

          <svg 
            ref={svgRef}
            width={svgDimensions.width} 
            height={svgDimensions.height}
            className="select-none relative z-10"
          >
            {/* Grid */}
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={mapImage ? "transparent" : "url(#grid)"} />
            
            {/* Quadras */}
            {(isEditMode ? editingQuadras : filteredQuadras).map((quadra) => (
              <g key={quadra.id}>
                {/* Quadra rectangle */}
                <rect
                  x={quadra.x}
                  y={quadra.y}
                  width={quadra.width}
                  height={quadra.height}
                  fill={isEditMode ? "hsl(var(--card) / 0.7)" : "hsl(var(--card) / 0.85)"}
                  stroke={isEditMode ? "hsl(var(--primary))" : "hsl(var(--border))"}
                  strokeWidth={isEditMode ? 2 : 1}
                  strokeDasharray={isEditMode ? "5,5" : "none"}
                  rx="6"
                  style={{ cursor: isEditMode ? 'move' : 'default' }}
                  onMouseDown={(e) => handleEditMouseDown(e, 'quadra', quadra.id)}
                />
                
                {/* Quadra name + auto-distribute button */}
                <text
                  x={quadra.x + 10}
                  y={quadra.y + 16}
                  fill="hsl(var(--foreground))"
                  fontSize="12"
                  fontWeight="600"
                  style={{ pointerEvents: 'none' }}
                >
                  {quadra.name}
                </text>

                {/* Auto-distribute button in edit mode */}
                {isEditMode && (
                  <g
                    style={{ cursor: 'pointer' }}
                    onClick={() => autoDistributeHouses(quadra.id)}
                  >
                    <rect
                      x={quadra.x + quadra.width - 24}
                      y={quadra.y + 4}
                      width={20}
                      height={18}
                      fill="hsl(var(--secondary))"
                      stroke="hsl(var(--border))"
                      rx="3"
                    />
                    <text
                      x={quadra.x + quadra.width - 14}
                      y={quadra.y + 17}
                      fill="hsl(var(--foreground))"
                      fontSize="10"
                      textAnchor="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      ⊞
                    </text>
                  </g>
                )}

                {/* Resize handles (edit mode only) */}
                {isEditMode && (
                  <>
                    {['nw', 'ne', 'sw', 'se'].map(corner => {
                      const cx = corner.includes('w') ? quadra.x : quadra.x + quadra.width;
                      const cy = corner.includes('n') ? quadra.y : quadra.y + quadra.height;
                      return (
                        <circle
                          key={corner}
                          cx={cx}
                          cy={cy}
                          r={6}
                          fill="hsl(var(--primary))"
                          stroke="white"
                          strokeWidth={2}
                          style={{ cursor: `${corner}-resize` }}
                          onMouseDown={(e) => handleEditMouseDown(e, 'resize', quadra.id, undefined, corner)}
                        />
                      );
                    })}
                    {[
                      { key: 'n', x: quadra.x + quadra.width / 2, y: quadra.y },
                      { key: 's', x: quadra.x + quadra.width / 2, y: quadra.y + quadra.height },
                      { key: 'e', x: quadra.x + quadra.width, y: quadra.y + quadra.height / 2 },
                      { key: 'w', x: quadra.x, y: quadra.y + quadra.height / 2 },
                    ].map(({ key, x, y }) => (
                      <circle
                        key={key}
                        cx={x}
                        cy={y}
                        r={5}
                        fill="hsl(var(--secondary))"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1.5}
                        style={{ cursor: key === 'n' || key === 's' ? 'ns-resize' : 'ew-resize' }}
                        onMouseDown={(e) => handleEditMouseDown(e, 'resize', quadra.id, undefined, key)}
                      />
                    ))}
                  </>
                )}
                
                {/* Houses as circles */}
                {quadra.houses.map((house) => {
                  const progress = getHouseProgress(house.id);
                  const color = getHouseColor(house.id);
                  const isSelected = selectedHouse?.id === house.id;
                  const cx = quadra.x + house.x;
                  const cy = quadra.y + house.y;
                  
                  return (
                    <g 
                      key={`house-${quadra.id}-${house.id}`}
                      style={{ cursor: isEditMode ? 'move' : 'pointer' }}
                      onClick={(e) => handleHouseClick(house.id, e)}
                      onMouseDown={(e) => isEditMode && handleEditMouseDown(e, 'house', quadra.id, house.id)}
                    >
                      {/* Progress ring background */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={HOUSE_RADIUS + 2}
                        fill="none"
                        stroke="hsl(var(--border))"
                        strokeWidth={2}
                        opacity={0.3}
                      />
                      
                      {/* Progress ring */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={HOUSE_RADIUS + 2}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray={`${(progress / 100) * (2 * Math.PI * (HOUSE_RADIUS + 2))} ${2 * Math.PI * (HOUSE_RADIUS + 2)}`}
                        strokeDashoffset={0.25 * 2 * Math.PI * (HOUSE_RADIUS + 2)}
                        strokeLinecap="round"
                        style={{ pointerEvents: 'none' }}
                      />
                      
                      {/* House circle */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={HOUSE_RADIUS}
                        fill={color}
                        stroke={isSelected ? "white" : "hsl(var(--border))"}
                        strokeWidth={isSelected ? 3 : 1}
                        className="transition-all duration-150"
                      />
                      
                      {/* House number */}
                      <text
                        x={cx}
                        y={cy + 4}
                        fill="white"
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="middle"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}
                      >
                        {house.id}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))}
            
            {/* Legend - positioned in corner */}
            {!isEditMode && (
              <g transform={`translate(20, 20)`}>
                <rect x="0" y="0" width="120" height={legendItems.length * 18 + 25} fill="hsl(var(--card) / 0.95)" stroke="hsl(var(--border))" rx="4" />
                <text x="8" y="15" fill="hsl(var(--foreground))" fontSize="10" fontWeight="600">Legenda</text>
                {legendItems.map((item, idx) => (
                  <g key={item.id} transform={`translate(8, ${25 + idx * 16})`}>
                    <circle cx="5" cy="5" r="5" fill={item.color} />
                    <text x="15" y="8" fill="hsl(var(--muted-foreground))" fontSize="8">{item.name}</text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* House Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Casa {selectedHouse?.id}
            </DialogTitle>
          </DialogHeader>
          
          {selectedHouse && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quadra:</span>
                  <span className="font-medium">
                    {currentProject?.quadras.find(q => q.houses?.includes(selectedHouse.id))?.name || "-"}
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
                  <span className="text-sm font-bold">{calculateHouseProgress(selectedHouse).toFixed(1)}%</span>
                </div>
                <Progress value={calculateHouseProgress(selectedHouse)} className="h-2" />
              </div>
              
              <div className="space-y-3">
                <h5 className="font-medium text-sm">Etapas</h5>
                <ScrollArea className="h-48">
                  <div className="space-y-3 pr-3">
                    {selectedHouse.macros.map((macro) => {
                      const macroProgress = macro.scopes.reduce((sum, s) => sum + s.progress * s.weight, 0) / 
                        Math.max(macro.scopes.reduce((sum, s) => sum + s.weight, 0), 1);
                      return (
                        <div key={macro.id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: macro.color }} />
                            <span className="text-xs font-medium flex-1">{macro.name}</span>
                            <span className="text-xs text-muted-foreground">{macroProgress.toFixed(0)}%</span>
                          </div>
                          <Progress value={macroProgress} className="h-1" />
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
