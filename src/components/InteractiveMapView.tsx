import { useState, useRef, useMemo, useCallback, useEffect, type SyntheticEvent } from "react";
import { useConstruction, DEFAULT_LEGEND_ITEMS, LegendItem } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  MapPin,
  Search,
  Upload,
  Trash2,
  Filter,
  Loader2,
  Edit3,
  Save,
  XCircle,
  Grid3X3,
  Eye,
  EyeOff,
  Trash,
  Palette,
  Undo2,
  AlignCenter,
  ChevronDown,
  ChevronRight,
  Calendar,
  Camera
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { HouseFotoHistoryDrawer } from "@/components/diario/HouseFotoHistoryDrawer";
import {
  canDeleteInteractiveMap,
  canEditInteractiveMap,
  canImportInteractiveMap,
} from "@/lib/accessControl";

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
  visible: boolean;
}

interface MapLayout {
  imageUrl: string | null;
  quadras: QuadraLayout[];
  houses: HousePosition[];
  mapWidth: number;
  mapHeight: number;
}

const MAP_LAYOUT_STORAGE_KEY = "obramap_interactive_map_layout";

// Helper component for house details dialog content
function HouseDetailsDialogContent({ 
  house, 
  legendItems, 
  quadraName,
  macrosTemplate
}: { 
  house: any; 
  legendItems: LegendItem[];
  quadraName?: string;
  macrosTemplate?: any[];
}) {
  const [openMacros, setOpenMacros] = useState<Set<string>>(new Set());

  const getProgressBarColor = (progress: number) => {
    for (const item of legendItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.color;
      }
    }
    if (progress === 0) return "hsl(var(--muted))";
    if (progress < 50) return "#ef4444";
    if (progress < 100) return "#f59e0b";
    return "#22c55e";
  };

  const getMacroProgress = (macro: any) => {
    if (macro.scopes.length === 0) return 0;
    const totalWeight = macro.scopes.reduce((sum: number, s: any) => sum + s.weight, 0);
    if (totalWeight === 0) return 0;
    return Math.round(macro.scopes.reduce((sum: number, s: any) => sum + s.progress * s.weight, 0) / totalWeight);
  };

  const toggleMacro = (macroId: string) => {
    setOpenMacros(prev => {
      const newSet = new Set(prev);
      if (newSet.has(macroId)) {
        newSet.delete(macroId);
      } else {
        newSet.add(macroId);
      }
      return newSet;
    });
  };

  const overallProgress = calculateHouseProgress(house, macrosTemplate);

  return (
    <div className="space-y-4 overflow-y-auto flex-1">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Progresso Geral</span>
          <span className="text-lg font-bold text-foreground">{overallProgress}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-300"
            style={{ 
              width: `${overallProgress}%`,
              backgroundColor: getProgressBarColor(overallProgress)
            }}
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold text-foreground">Etapas</h4>
        </div>
        
        <ScrollArea className="h-60">
          <div className="space-y-2 pr-3">
            {house.macros.map((macro: any) => {
              const macroProgress = getMacroProgress(macro);
              const isOpen = openMacros.has(macro.id);
              
              return (
                <Collapsible 
                  key={macro.id} 
                  open={isOpen} 
                  onOpenChange={() => toggleMacro(macro.id)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-md p-1 -m-1 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {isOpen ? (
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium text-foreground">{macro.name}</span>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">
                          {macroProgress}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden ml-4">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${macroProgress}%`,
                            backgroundColor: getProgressBarColor(macroProgress)
                          }}
                        />
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="mt-2 ml-4 space-y-2 border-l-2 border-border pl-3">
                      {macro.scopes.map((scope: any) => (
                        <div key={scope.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{scope.name}</span>
                            <span className="text-xs font-medium text-muted-foreground">
                              {scope.progress}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-300"
                              style={{ 
                                width: `${scope.progress}%`,
                                backgroundColor: getProgressBarColor(scope.progress)
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function InteractiveMapView() {
  const { currentProject, selectedHouse, setSelectedHouse } = useConstruction();
  const { profile } = useAuth();
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
  const [isLayoutLoaded, setIsLayoutLoaded] = useState(true);
  const [isMapImageLoading, setIsMapImageLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [photoHistoryOpen, setPhotoHistoryOpen] = useState(false);
  
  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingQuadras, setEditingQuadras] = useState<QuadraLayout[]>([]);
  const [editingHouses, setEditingHouses] = useState<HousePosition[]>([]);
  const [draggingItem, setDraggingItem] = useState<{ type: 'quadra' | 'house' | 'resize' | 'pan'; id: string; houseId?: number; corner?: string } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragStartQuadraPos, setDragStartQuadraPos] = useState({ x: 0, y: 0 });
  const [dragStartHousePositions, setDragStartHousePositions] = useState<Map<number, { x: number; y: number }>>(new Map());
  
  // Multi-select states
  const [selectedHouseIds, setSelectedHouseIds] = useState<Set<number>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
  const [multiDragOffset, setMultiDragOffset] = useState<Map<number, { x: number; y: number }>>(new Map());
  
  // Undo history states
  const [editHistory, setEditHistory] = useState<{ quadras: QuadraLayout[]; houses: HousePosition[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMacro, setFilterMacro] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");

  const houses = currentProject?.houses || [];
  const legendItems = currentProject?.customLegendItems || DEFAULT_LEGEND_ITEMS;
  const legendFollowMacros = currentProject?.legendFollowMacros || false;
  const macrosTemplate = currentProject?.macrosTemplate || [];
  const canImportMap = canImportInteractiveMap(profile);
  const canEditMap = canEditInteractiveMap(profile);
  const canDeleteMap = canDeleteInteractiveMap(profile);

  // Map dimensions
  const MAP_WIDTH = 1600;
  const MAP_HEIGHT = 1200;
  const BASE_HOUSE_RADIUS = 14;
  const MIN_QUADRA_SIZE = 80;
  
  // Dynamic house radius - mantém tamanho visual consistente ao fazer zoom
  const displayRadius = useMemo(() => {
    // Raio base no SVG, sem compensação de zoom (o SVG já escala)
    return BASE_HOUSE_RADIUS;
  }, []);

  // Load saved map layout from database for current project
  useEffect(() => {
    // Don't block rendering - load layout in background
    
    const loadLayout = async () => {
      if (!currentProject?.id) {
        setMapImage(null);
        setCustomLayout(null);
        setIsLayoutLoaded(true);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('map_layouts')
          .select('*')
          .eq('project_id', currentProject.id)
          .maybeSingle();

        if (error) {
          console.error("Error loading map layout:", error);
          setIsLayoutLoaded(true);
          return;
        }

        if (data) {
          const layout: MapLayout = {
            imageUrl: data.image_url,
            quadras: data.quadras as unknown as QuadraLayout[],
            houses: data.houses as unknown as HousePosition[],
            mapWidth: data.map_width,
            mapHeight: data.map_height,
          };
          setMapImage(layout.imageUrl);
          setCustomLayout(layout);
        } else {
          // Fallback: try to migrate from localStorage
          const savedLayout = localStorage.getItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject.id}`);
          if (savedLayout) {
            try {
              const layout: MapLayout = JSON.parse(savedLayout);
              setMapImage(layout.imageUrl);
              setCustomLayout(layout);
              // Migrate to database
              await supabase.from('map_layouts').upsert([{
                project_id: currentProject.id,
                image_url: layout.imageUrl,
                quadras: layout.quadras as unknown as Json,
                houses: layout.houses as unknown as Json,
                map_width: layout.mapWidth,
                map_height: layout.mapHeight,
              }], { onConflict: 'project_id' });
              // Remove from localStorage after successful migration
              localStorage.removeItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject.id}`);
            } catch (e) {
              console.error("Error migrating map layout:", e);
            }
          } else {
            setMapImage(null);
            setCustomLayout(null);
          }
        }
        setIsLayoutLoaded(true);
      } catch (e) {
        console.error("Error loading map layout:", e);
        setIsLayoutLoaded(true);
      }
    };

    loadLayout();
  }, [currentProject?.id]);

  // Fit map to container - recalculates when container becomes visible
  const fitToContainer = useCallback(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Only fit if container has dimensions (is visible)
      if (containerWidth > 0 && containerHeight > 0) {
        const scaleX = containerWidth / MAP_WIDTH;
        const scaleY = containerHeight / MAP_HEIGHT;
        const newScale = Math.min(scaleX, scaleY, 1) * 0.95;
        setScale(newScale);
        setPosition({
          x: (containerWidth - MAP_WIDTH * newScale) / 2,
          y: (containerHeight - MAP_HEIGHT * newScale) / 2
        });
      }
    }
  }, []);

  const fitAfterImageReady = useCallback(() => {
    requestAnimationFrame(() => {
      fitToContainer();
      requestAnimationFrame(fitToContainer);
    });
    setTimeout(fitToContainer, 80);
  }, [fitToContainer]);

  // Fit to container when layout is loaded
  useEffect(() => {
    if (isLayoutLoaded) {
      // Use multiple delayed frames to ensure container is fully rendered
      // Some browsers need extra frames after tab/view switch
      const tryFit = (attempts = 0) => {
        if (attempts > 10) return;
        requestAnimationFrame(() => {
          const container = containerRef.current;
          if (container && container.clientWidth > 0 && container.clientHeight > 0) {
            fitAfterImageReady();
          } else {
            // Container not ready yet, retry
            setTimeout(() => tryFit(attempts + 1), 50);
          }
        });
      };
      tryFit();
    }
  }, [isLayoutLoaded, fitAfterImageReady, currentProject?.id]);

  // Re-fit when container becomes visible (e.g., tab change)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isLayoutLoaded) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          fitAfterImageReady();
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [fitAfterImageReady, currentProject?.id, isLayoutLoaded]);

  useEffect(() => {
    if (!isLayoutLoaded || !mapImage) {
      setIsMapImageLoading(false);
      return;
    }

    let cancelled = false;
    const image = new Image();
    setIsMapImageLoading(true);

    const finish = () => {
      if (cancelled) return;
      setIsMapImageLoading(false);
      fitAfterImageReady();
    };

    image.onload = () => {
      if (typeof image.decode === "function") {
        image.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };
    image.onerror = finish;
    image.src = mapImage;

    return () => {
      cancelled = true;
    };
  }, [fitAfterImageReady, isLayoutLoaded, mapImage, customLayout?.imageUrl]);

  const handleMapImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const finish = () => {
      setIsMapImageLoading(false);
      fitAfterImageReady();
    };

    if (typeof image.decode === "function") {
      image.decode().then(finish).catch(finish);
      return;
    }

    finish();
  }, [fitAfterImageReady]);

  // Generate default layout with absolute house positions
  const generateDefaultLayout = useCallback((quadras: any[], allHouses: any[]): { quadras: QuadraLayout[], houses: HousePosition[] } => {
    const layouts: QuadraLayout[] = [];
    const housePositions: HousePosition[] = [];
    const PADDING = 40;
    const QUADRA_GAP = 30;
    let currentX = PADDING;
    let currentY = PADDING;
    let rowMaxHeight = 0;
    const maxWidth = MAP_WIDTH - PADDING * 2;

    quadras.forEach((quadra) => {
      const houseIds = quadra.houses || [];
      const houseCount = houseIds.length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(houseCount)));
      const rows = Math.max(1, Math.ceil(houseCount / cols));
      
      const quadraWidth = Math.max(MIN_QUADRA_SIZE, cols * (BASE_HOUSE_RADIUS * 3) + 40);
      const quadraHeight = Math.max(MIN_QUADRA_SIZE, rows * (BASE_HOUSE_RADIUS * 3) + 50);

      if (currentX + quadraWidth > maxWidth) {
        currentX = PADDING;
        currentY += rowMaxHeight + QUADRA_GAP;
        rowMaxHeight = 0;
      }

      rowMaxHeight = Math.max(rowMaxHeight, quadraHeight);

      // Calculate absolute positions for houses
      houseIds.forEach((houseId: number, idx: number) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const cellWidth = (quadraWidth - 40) / Math.max(cols, 1);
        const cellHeight = (quadraHeight - 50) / Math.max(rows, 1);
        
        housePositions.push({
          id: houseId,
          x: currentX + 20 + col * cellWidth + cellWidth / 2,
          y: currentY + 35 + row * cellHeight + cellHeight / 2,
        });
      });

      layouts.push({
        id: quadra.id,
        name: quadra.name,
        x: currentX,
        y: currentY,
        width: quadraWidth,
        height: quadraHeight,
        visible: true,
      });

      currentX += quadraWidth + QUADRA_GAP;
    });

    return { quadras: layouts, houses: housePositions };
  }, []);

  // Initialize editing when entering edit mode - detect new houses not in saved layout
  useEffect(() => {
    if (isEditMode && currentProject) {
      const projectQuadras = currentProject.quadras || [];
      const allHouseIds = new Set(houses.map(h => h.id));
      
      let initialQuadras: QuadraLayout[];
      let initialHouses: HousePosition[];
      
      if (customLayout?.quadras && customLayout.houses) {
        initialQuadras = customLayout.quadras.map(q => ({
          ...q,
          id: projectQuadras.find(pq => pq.name === q.name)?.id || q.id,
          visible: q.visible !== false,
        }));
        initialHouses = [...customLayout.houses];
        
        // Detect new houses that exist in the project but not in the saved layout
        const savedHouseIds = new Set(customLayout.houses.map(h => h.id));
        const newHouseIds = [...allHouseIds].filter(id => !savedHouseIds.has(id));
        
        if (newHouseIds.length > 0) {
          // Place new houses in a staging area (top-left, stacked)
          const stagingX = 30;
          const stagingY = 30;
          newHouseIds.forEach((houseId, idx) => {
            initialHouses.push({
              id: houseId,
              x: stagingX + (idx % 10) * (BASE_HOUSE_RADIUS * 3),
              y: stagingY + Math.floor(idx / 10) * (BASE_HOUSE_RADIUS * 3),
            });
          });
          toast.info(`${newHouseIds.length} nova(s) casa(s) detectada(s). Posicione-as no mapa.`);
        }
        
        // Also remove houses from layout that no longer exist in the project
        initialHouses = initialHouses.filter(h => allHouseIds.has(h.id));
      } else {
        const { quadras, houses: defaultHouses } = generateDefaultLayout(projectQuadras, houses);
        initialQuadras = quadras;
        initialHouses = defaultHouses;
      }
      
      setEditingQuadras(initialQuadras);
      setEditingHouses(initialHouses);
      // Initialize history with initial state
      setEditHistory([{ quadras: initialQuadras, houses: initialHouses }]);
      setHistoryIndex(0);
    } else {
      // Reset history when exiting edit mode
      setEditHistory([]);
      setHistoryIndex(-1);
    }
  }, [isEditMode, currentProject, customLayout, generateDefaultLayout, houses]);

  // Get SVG coordinates from mouse event - corrigido para funcionar com zoom
  const getSvgCoords = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - position.x) / scale,
      y: (e.clientY - rect.top - position.y) / scale,
    };
  }, [position, scale]);

  // Handle mouse down for editing houses (absolute positioning)
  const handleHouseEditMouseDown = (e: React.MouseEvent, houseId: number) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    const coords = getSvgCoords(e);
    
    // Determine the effective selection for this drag
    let effectiveSelection: Set<number>;
    
    if (e.shiftKey) {
      // Shift+click: add to current selection
      effectiveSelection = new Set([...selectedHouseIds, houseId]);
    } else if (selectedHouseIds.has(houseId) && selectedHouseIds.size > 1) {
      // Clicked a house that's part of a multi-selection: drag the group
      effectiveSelection = selectedHouseIds;
    } else {
      // Normal click: select ONLY this house (isolate it)
      effectiveSelection = new Set([houseId]);
    }
    
    setSelectedHouseIds(effectiveSelection);
    
    // Calculate offsets only for the effective selection
    const offsets = new Map<number, { x: number; y: number }>();
    editingHouses.forEach(house => {
      if (effectiveSelection.has(house.id)) {
        offsets.set(house.id, { x: coords.x - house.x, y: coords.y - house.y });
      }
    });
    setMultiDragOffset(offsets);
    setDraggingItem({ type: 'house', id: 'multi', houseId });
  };

  // Handle mouse down for editing quadras
  const handleQuadraEditMouseDown = (e: React.MouseEvent, quadraId: string, corner?: string) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    const coords = getSvgCoords(e);
    const quadra = editingQuadras.find(q => q.id === quadraId);
    
    if (quadra) {
      if (corner) {
        setDraggingItem({ type: 'resize', id: quadraId, corner });
      } else {
        setDragOffset({ x: coords.x - quadra.x, y: coords.y - quadra.y });
        setDragStartQuadraPos({ x: quadra.x, y: quadra.y });
        
        // Store initial positions of all houses in this quadra
        const projectQuadra = currentProject?.quadras.find(q => q.id === quadraId);
        const houseIdsInQuadra = projectQuadra?.houses || [];
        const initialPositions = new Map<number, { x: number; y: number }>();
        editingHouses.forEach(house => {
          if (houseIdsInQuadra.includes(house.id)) {
            initialPositions.set(house.id, { x: house.x, y: house.y });
          }
        });
        setDragStartHousePositions(initialPositions);
        
        setDraggingItem({ type: 'quadra', id: quadraId });
      }
    }
    // Clear multi-selection when dragging quadra
    setSelectedHouseIds(new Set());
  };

  // Handle background mouse down for selection box or panning in edit mode
  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (!isEditMode) return;
    
    // Middle mouse button or Ctrl+left click for panning
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      return;
    }
    
    // Left click for selection box (only if not shift and not ctrl)
    if (e.button === 0 && !e.shiftKey && !e.ctrlKey) {
      const coords = getSvgCoords(e);
      setIsSelecting(true);
      setSelectionStart(coords);
      setSelectionEnd(coords);
      // Limpa seleção ao iniciar nova caixa de seleção
      setSelectedHouseIds(new Set());
    }
  };

  // Handle mouse move for editing
  const handleEditMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isEditMode) return;
    
    const coords = getSvgCoords(e);
    
    // Handle selection box
    if (isSelecting) {
      setSelectionEnd(coords);
      return;
    }
    
    if (!draggingItem) return;

    if (draggingItem.type === 'house' && draggingItem.houseId !== undefined) {
      // Sempre arrasta todas as casas selecionadas
      setEditingHouses(prev => prev.map(house => {
        if (!selectedHouseIds.has(house.id)) return house;
        const offset = multiDragOffset.get(house.id);
        if (!offset) return house;
        return {
          ...house,
          x: Math.max(BASE_HOUSE_RADIUS, Math.min(MAP_WIDTH - BASE_HOUSE_RADIUS, coords.x - offset.x)),
          y: Math.max(BASE_HOUSE_RADIUS, Math.min(MAP_HEIGHT - BASE_HOUSE_RADIUS, coords.y - offset.y)),
        };
      }));
    } else if (draggingItem.type === 'quadra') {
      // Calculate new quadra position based on mouse coords and initial drag offset
      const newX = Math.max(0, Math.min(MAP_WIDTH - 100, coords.x - dragOffset.x));
      const newY = Math.max(0, Math.min(MAP_HEIGHT - 100, coords.y - dragOffset.y));
      
      // Calculate total displacement from start position
      const totalDeltaX = newX - dragStartQuadraPos.x;
      const totalDeltaY = newY - dragStartQuadraPos.y;
      
      // Update quadra position
      setEditingQuadras(prev => prev.map(q => {
        if (q.id !== draggingItem.id) return q;
        return { ...q, x: newX, y: newY };
      }));
      
      // Update houses using initial positions + total delta (not incremental)
      const quadra = editingQuadras.find(q => q.id === draggingItem.id);
      if (quadra?.visible && dragStartHousePositions.size > 0) {
        setEditingHouses(prev => prev.map(house => {
          const startPos = dragStartHousePositions.get(house.id);
          if (!startPos) return house;
          return {
            ...house,
            x: startPos.x + totalDeltaX,
            y: startPos.y + totalDeltaY,
          };
        }));
      }
    } else if (draggingItem.type === 'resize' && draggingItem.corner) {
      const quadra = editingQuadras.find(q => q.id === draggingItem.id);
      if (!quadra) return;
      
      let newX = quadra.x, newY = quadra.y;
      let newWidth = quadra.width, newHeight = quadra.height;

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
      }
      
      setEditingQuadras(prev => prev.map(q => {
        if (q.id !== draggingItem.id) return q;
        return { ...q, x: newX, y: newY, width: newWidth, height: newHeight };
      }));
    }
  }, [isEditMode, draggingItem, dragOffset, getSvgCoords, isSelecting, dragStart, selectedHouseIds, multiDragOffset]);

  // Handle mouse up for editing
  const handleEditMouseUp = useCallback(() => {
    // Save to history if we were dragging something (not just selecting)
    const wasDragging = draggingItem && (draggingItem.type === 'house' || draggingItem.type === 'quadra' || draggingItem.type === 'resize');
    
    // Finalize selection box
    if (isSelecting) {
      const minX = Math.min(selectionStart.x, selectionEnd.x);
      const maxX = Math.max(selectionStart.x, selectionEnd.x);
      const minY = Math.min(selectionStart.y, selectionEnd.y);
      const maxY = Math.max(selectionStart.y, selectionEnd.y);
      
      // Only select if the box has some size
      if (maxX - minX > 5 && maxY - minY > 5) {
        const housesInBox = editingHouses.filter(house => 
          house.x >= minX && house.x <= maxX && house.y >= minY && house.y <= maxY
        );
        setSelectedHouseIds(new Set(housesInBox.map(h => h.id)));
      }
      setIsSelecting(false);
    }
    
    // When finishing resize, redistribute houses in the quadra
    if (draggingItem?.type === 'resize' && draggingItem.id) {
      const quadra = editingQuadras.find(q => q.id === draggingItem.id);
      if (quadra && quadra.visible) {
        const projectQuadra = currentProject?.quadras.find(q => q.id === draggingItem.id);
        const houseIds = projectQuadra?.houses || [];
        const houseCount = houseIds.length;
        
        if (houseCount > 0) {
          const cols = Math.max(1, Math.ceil(Math.sqrt(houseCount)));
          const rows = Math.ceil(houseCount / cols);
          const cellWidth = (quadra.width - 40) / cols;
          const cellHeight = (quadra.height - 50) / rows;
          
          setEditingHouses(prev => {
            const otherHouses = prev.filter(h => !houseIds.includes(h.id));
            const newHouses = houseIds.map((id: number, idx: number) => ({
              id,
              x: quadra.x + 20 + (idx % cols) * cellWidth + cellWidth / 2,
              y: quadra.y + 35 + Math.floor(idx / cols) * cellHeight + cellHeight / 2,
            }));
            return [...otherHouses, ...newHouses];
          });
        }
      }
    }
    
    // Save to history after any drag operation
    if (wasDragging) {
      // Use setTimeout to ensure state is updated before saving
      setTimeout(() => {
        setEditHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push({ quadras: [...editingQuadras], houses: [...editingHouses] });
          if (newHistory.length > 50) newHistory.shift();
          return newHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, 49));
      }, 0);
    }
    
    setDraggingItem(null);
    setMultiDragOffset(new Map());
  }, [isSelecting, selectionStart, selectionEnd, editingHouses, draggingItem, editingQuadras, currentProject, historyIndex]);

  // Toggle quadra visibility
  const toggleQuadraVisibility = (quadraId: string) => {
    setEditingQuadras(prev => prev.map(q => 
      q.id === quadraId ? { ...q, visible: !q.visible } : q
    ));
  };

  // Auto-distribute houses in a quadra
  const autoDistributeHousesInQuadra = (quadraId: string) => {
    const quadra = editingQuadras.find(q => q.id === quadraId);
    if (!quadra) return;
    
    const projectQuadra = currentProject?.quadras.find(q => q.id === quadraId);
    const houseIds = projectQuadra?.houses || [];
    const houseCount = houseIds.length;
    if (houseCount === 0) return;
    
    const cols = Math.max(1, Math.ceil(Math.sqrt(houseCount)));
    const rows = Math.ceil(houseCount / cols);
    const cellWidth = (quadra.width - 40) / cols;
    const cellHeight = (quadra.height - 50) / rows;
    
    setEditingHouses(prev => {
      const otherHouses = prev.filter(h => !houseIds.includes(h.id));
      const newHouses = houseIds.map((id: number, idx: number) => ({
        id,
        x: quadra.x + 20 + (idx % cols) * cellWidth + cellWidth / 2,
        y: quadra.y + 35 + Math.floor(idx / cols) * cellHeight + cellHeight / 2,
      }));
      return [...otherHouses, ...newHouses];
    });
  };

  // Save the edited layout to database
  const saveLayout = async () => {
    if (!currentProject) return;
    if (!canEditMap) {
      toast.error("Sem permissão para editar o mapa interativo.");
      return;
    }

    const layout: MapLayout = {
      imageUrl: mapImage,
      quadras: editingQuadras,
      houses: editingHouses,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
    };

    try {
      const { error } = await supabase.from('map_layouts').upsert([{
        project_id: currentProject.id,
        image_url: layout.imageUrl,
        quadras: layout.quadras as unknown as Json,
        houses: layout.houses as unknown as Json,
        map_width: layout.mapWidth,
        map_height: layout.mapHeight,
      }], { onConflict: 'project_id' });

      if (error) {
        console.error("Error saving map layout:", error);
        toast.error("Erro ao salvar layout!");
        return;
      }

      setCustomLayout(layout);
      setIsEditMode(false);
      toast.success("Layout salvo com sucesso!");
    } catch (e) {
      console.error("Error saving map layout:", e);
      toast.error("Erro ao salvar layout!");
    }
  };

  const cancelEdit = () => {
    setIsEditMode(false);
    setEditingQuadras([]);
    setEditingHouses([]);
    setSelectedHouseIds(new Set());
  };

  useEffect(() => {
    if (!canEditMap && isEditMode) {
      cancelEdit();
    }
  }, [canEditMap, isEditMode]);

  const enterEditMode = () => {
    if (!canEditMap) {
      toast.error("Sem permissão para editar o mapa interativo.");
      return;
    }
    setIsEditMode(true);
    setSelectedHouseIds(new Set());
  };
  
  const clearSelection = () => {
    setSelectedHouseIds(new Set());
  };

  // Save current state to history
  const saveToHistory = useCallback(() => {
    const currentState = { quadras: [...editingQuadras], houses: [...editingHouses] };
    setEditHistory(prev => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(currentState);
      // Keep only last 50 states
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [editingQuadras, editingHouses, historyIndex]);

  // Undo last change
  const undoLastChange = useCallback(() => {
    if (historyIndex <= 0) {
      toast.info("Nenhuma alteração para desfazer");
      return;
    }
    const prevState = editHistory[historyIndex - 1];
    if (prevState) {
      setEditingQuadras(prevState.quadras);
      setEditingHouses(prevState.houses);
      setHistoryIndex(prev => prev - 1);
      toast.success("Alteração desfeita!");
    }
  }, [historyIndex, editHistory]);

  // Keyboard shortcuts for edit mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditMode) return;
      
      // Ctrl+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoLastChange();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, undoLastChange]);

  // Auto-align all quadras and houses in a grid
  const autoAlignLayout = useCallback(() => {
    if (!canEditMap) {
      toast.error("Sem permissão para editar o mapa interativo.");
      return;
    }
    saveToHistory();
    
    const GRID_SIZE = 20; // Align to 20px grid
    const QUADRA_PADDING = 30;
    
    // Align quadras to grid and distribute evenly
    const sortedQuadras = [...editingQuadras].sort((a, b) => {
      const rowA = Math.floor(a.y / 200);
      const rowB = Math.floor(b.y / 200);
      if (rowA !== rowB) return rowA - rowB;
      return a.x - b.x;
    });
    
    let currentX = QUADRA_PADDING;
    let currentY = QUADRA_PADDING;
    let rowMaxHeight = 0;
    const maxWidth = MAP_WIDTH - QUADRA_PADDING * 2;
    
    const alignedQuadras: QuadraLayout[] = [];
    const alignedHouses: HousePosition[] = [];
    
    sortedQuadras.forEach((quadra) => {
      // Snap dimensions to grid
      const snappedWidth = Math.round(quadra.width / GRID_SIZE) * GRID_SIZE;
      const snappedHeight = Math.round(quadra.height / GRID_SIZE) * GRID_SIZE;
      
      // Check if we need a new row
      if (currentX + snappedWidth > maxWidth) {
        currentX = QUADRA_PADDING;
        currentY += rowMaxHeight + QUADRA_PADDING;
        rowMaxHeight = 0;
      }
      
      rowMaxHeight = Math.max(rowMaxHeight, snappedHeight);
      
      // Calculate delta for this quadra
      const deltaX = currentX - quadra.x;
      const deltaY = currentY - quadra.y;
      
      alignedQuadras.push({
        ...quadra,
        x: currentX,
        y: currentY,
        width: snappedWidth,
        height: snappedHeight,
      });
      
      // Move houses that belong to this quadra
      const projectQuadra = currentProject?.quadras.find(q => q.id === quadra.id);
      const houseIdsInQuadra = projectQuadra?.houses || [];
      
      editingHouses.forEach(house => {
        if (houseIdsInQuadra.includes(house.id)) {
          alignedHouses.push({
            id: house.id,
            x: Math.round((house.x + deltaX) / GRID_SIZE) * GRID_SIZE,
            y: Math.round((house.y + deltaY) / GRID_SIZE) * GRID_SIZE,
          });
        }
      });
      
      currentX += snappedWidth + QUADRA_PADDING;
    });
    
    // Add houses that don't belong to any quadra (orphans)
    const allQuadraHouseIds = currentProject?.quadras.flatMap(q => q.houses) || [];
    editingHouses.forEach(house => {
      if (!allQuadraHouseIds.includes(house.id)) {
        alignedHouses.push({
          id: house.id,
          x: Math.round(house.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(house.y / GRID_SIZE) * GRID_SIZE,
        });
      }
    });
    
    setEditingQuadras(alignedQuadras);
    setEditingHouses(alignedHouses);
    setSelectedHouseIds(new Set());
    toast.success("Layout alinhado automaticamente!");
  }, [canEditMap, editingQuadras, editingHouses, currentProject, saveToHistory]);

  // Reorganizar casas para layout inicial
  const reorganizeHouses = () => {
    if (!canEditMap) {
      toast.error("Sem permissão para editar o mapa interativo.");
      return;
    }
    saveToHistory();
    if (!currentProject) return;
    const projectQuadras = currentProject.quadras || [];
    const { quadras, houses: defaultHouses } = generateDefaultLayout(projectQuadras, houses);
    setEditingQuadras(quadras);
    setEditingHouses(defaultHouses);
    setSelectedHouseIds(new Set());
    toast.success("Casas reorganizadas para layout inicial!");
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

      const projectQuadras = currentProject?.quadras || [];
      const quadraLayouts: QuadraLayout[] = [];
      const housePositions: HousePosition[] = [];

      (data.quadras || []).forEach((q: any) => {
        const projectQuadra = projectQuadras.find(pq => 
          pq.name.toLowerCase() === q.name.toLowerCase()
        );
        
        const quadraX = (q.x / 100) * MAP_WIDTH;
        const quadraY = (q.y / 100) * MAP_HEIGHT;
        const quadraWidth = (q.width / 100) * MAP_WIDTH;
        const quadraHeight = (q.height / 100) * MAP_HEIGHT;
        
        quadraLayouts.push({
          id: projectQuadra?.id || q.name,
          name: q.name,
          x: quadraX,
          y: quadraY,
          width: quadraWidth,
          height: quadraHeight,
          visible: true,
        });

        (q.houses || []).forEach((h: any) => {
          housePositions.push({
            id: h.id,
            x: quadraX + (h.x / 100) * quadraWidth,
            y: quadraY + (h.y / 100) * quadraHeight,
          });
        });
      });

      const layout: MapLayout = {
        imageUrl: imageBase64,
        quadras: quadraLayouts,
        houses: housePositions,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      };

      setCustomLayout(layout);
      localStorage.setItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject?.id}`, JSON.stringify(layout));
      toast.success("Planta analisada e casas distribuídas automaticamente!");
    } catch (error) {
      console.error("Error analyzing floor plan:", error);
      toast.error("Erro ao analisar. Entre no modo de edição para desenhar manualmente.");
      
      const { quadras, houses: defaultHouses } = generateDefaultLayout(currentProject?.quadras || [], houses);
      const layout: MapLayout = {
        imageUrl: imageBase64,
        quadras,
        houses: defaultHouses,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
      };
      setCustomLayout(layout);
      localStorage.setItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject?.id}`, JSON.stringify(layout));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImportMap) {
      toast.error("Sem permissão para importar mapa interativo.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
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

  const handleRemoveImage = () => {
    if (!canDeleteMap) {
      toast.error("Sem permissão para excluir o mapa interativo.");
      return;
    }
    if (!window.confirm("Excluir a imagem do mapa interativo? Esta ação não poderá ser desfeita.")) return;
    if (currentProject) {
      setMapImage(null);
      setCustomLayout(null);
      setEditingQuadras([]);
      setEditingHouses([]);
      localStorage.removeItem(`${MAP_LAYOUT_STORAGE_KEY}_${currentProject.id}`);
      toast.success("Layout resetado.");
    }
  };

  // Get house color based on progress - respects active filters
  const getHouseColor = useCallback((houseId: number): string => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return "hsl(var(--muted))";
    
    // When filtering by scope, use the scope's macro color
    if (filterScope !== "all") {
      // Find the macro that contains this scope
      for (const macro of house.macros) {
        const scope = macro.scopes.find(s => s.id === filterScope);
        if (scope) {
          // Use macro color for this scope, with opacity based on progress
          const macroTemplate = macrosTemplate.find(m => m.id === macro.id);
          if (scope.progress > 0) {
            return macroTemplate?.color || "hsl(var(--muted))";
          }
          return "hsl(var(--muted))";
        }
      }
      return "hsl(var(--muted))";
    }
    
    // When filtering by macro, use that macro's color
    if (filterMacro !== "all") {
      const macro = house.macros.find(m => m.id === filterMacro);
      const macroTemplate = macrosTemplate.find(m => m.id === filterMacro);
      if (macro && macroTemplate) {
        const hasProgress = macro.scopes.some(s => s.progress > 0);
        if (hasProgress) {
          return macroTemplate.color || "hsl(var(--muted))";
        }
      }
      return "hsl(var(--muted))";
    }
    
    // Default behavior - use legend or macro colors
    const progress = calculateHouseProgress(house, macrosTemplate);
    
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
  }, [houses, legendItems, legendFollowMacros, macrosTemplate, filterMacro, filterScope]);

  // Get house progress - respects active filters
  const getHouseProgress = useCallback((houseId: number): number => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return 0;
    
    // When filtering by scope, return that scope's progress
    if (filterScope !== "all") {
      for (const macro of house.macros) {
        const scope = macro.scopes.find(s => s.id === filterScope);
        if (scope) {
          return scope.progress;
        }
      }
      return 0;
    }
    
    // When filtering by macro, return that macro's progress
    if (filterMacro !== "all") {
      const macro = house.macros.find(m => m.id === filterMacro);
      if (macro) {
        const totalWeight = macro.scopes.reduce((sum, s) => sum + s.weight, 0);
        if (totalWeight === 0) return 0;
        return macro.scopes.reduce((sum, s) => sum + s.progress * s.weight, 0) / totalWeight;
      }
      return 0;
    }
    
    return calculateHouseProgress(house, macrosTemplate);
  }, [houses, filterMacro, filterScope]);

  const getHouseStatus = useCallback((houseId: number): string => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return "nao_iniciado";
    const progress = calculateHouseProgress(house, macrosTemplate);
    for (const item of legendItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.id;
      }
    }
    return "nao_iniciado";
  }, [houses, legendItems]);

  // Filter houses by macro/scope - only show houses with progress in selected item
  const houseMatchesMacroFilter = useCallback((houseId: number): boolean => {
    if (filterMacro === "all" && filterScope === "all") return true;
    const house = houses.find(h => h.id === houseId);
    if (!house) return false;
    
    // If scope filter is set, only show houses with progress > 0 in that scope
    if (filterScope !== "all") {
      for (const macro of house.macros) {
        const scope = macro.scopes.find(s => s.id === filterScope);
        if (scope && scope.progress > 0) return true;
      }
      return false;
    }
    
    // If macro filter is set, only show houses with progress > 0 in any scope of that macro
    if (filterMacro !== "all") {
      const macro = house.macros.find(m => m.id === filterMacro);
      if (!macro) return false;
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
    if (isEditMode) {
      // In edit mode, delegate to background handler
      handleBackgroundMouseDown(e);
      return;
    }
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Handle panning in both modes when isDragging is true
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      return;
    }
    
    if (isEditMode) {
      handleEditMouseMove(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    handleEditMouseUp();
  };

  // Zoom handler usando useEffect para prevenir scroll da página
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Shift+scroll para pan horizontal
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setPosition(prev => ({
          x: prev.x - e.deltaY,
          y: prev.y
        }));
        return;
      }
      
      // Scroll normal = zoom (comportamento principal pedido pelo usuário)
      const zoomIntensity = 0.001;
      const delta = -e.deltaY * zoomIntensity;
      const newScale = Math.max(0.15, Math.min(6, scale * (1 + delta)));
      
      // Zoom centrado no mouse
      const scaleRatio = newScale / scale;
      setPosition(prev => ({
        x: mouseX - (mouseX - prev.x) * scaleRatio,
        y: mouseY - (mouseY - prev.y) * scaleRatio
      }));
      setScale(newScale);
    };

    container.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => container.removeEventListener('wheel', handleWheelEvent);
  }, [scale]);

  const handleHouseClick = (houseId: number, e: React.MouseEvent) => {
    if (isEditMode) return;
    e.stopPropagation();
    const house = houses.find(h => h.id === houseId);
    if (house) {
      setSelectedHouse(house);
      setShowDetailsDialog(true);
    }
  };

  const availableScopes = useMemo(() => {
    if (filterMacro === "all") return [];
    const macro = macrosTemplate.find(m => m.id === filterMacro);
    return macro?.scopes || [];
  }, [filterMacro, macrosTemplate]);

  // Get all scopes from all macros for independent scope filter
  const allScopes = useMemo(() => {
    const scopes: { id: string; name: string; macroId: string; macroName: string; color: string }[] = [];
    macrosTemplate.forEach(macro => {
      macro.scopes.forEach(scope => {
        scopes.push({
          id: scope.id,
          name: scope.name,
          macroId: macro.id,
          macroName: macro.name,
          color: macro.color
        });
      });
    });
    return scopes;
  }, [macrosTemplate]);

  // Delete selected houses from editing
  const deleteSelectedHouses = useCallback(() => {
    if (!canDeleteMap) {
      toast.error("Sem permissão para excluir itens do mapa interativo.");
      return;
    }
    if (selectedHouseIds.size === 0) return;
    if (!window.confirm("Excluir as casas selecionadas do mapa? Esta ação não poderá ser desfeita.")) return;
    saveToHistory();
    setEditingHouses(prev => prev.filter(h => !selectedHouseIds.has(h.id)));
    toast.success(`${selectedHouseIds.size} casa(s) removida(s) do mapa`);
    setSelectedHouseIds(new Set());
  }, [canDeleteMap, selectedHouseIds, saveToHistory]);

  // Delete a specific quadra from editing
  const deleteQuadra = useCallback((quadraId: string) => {
    if (!canDeleteMap) {
      toast.error("Sem permissão para excluir itens do mapa interativo.");
      return;
    }
    if (!window.confirm("Excluir esta quadra do mapa? Esta ação não poderá ser desfeita.")) return;
    saveToHistory();
    setEditingQuadras(prev => prev.filter(q => q.id !== quadraId));
    toast.success("Quadra removida do mapa");
  }, [canDeleteMap, saveToHistory]);

  // Get display data
  const displayData = useMemo(() => {
    if (isEditMode) {
      return { quadras: editingQuadras, houses: editingHouses };
    }
    if (customLayout?.quadras && customLayout.houses) {
      // In view mode, also include new houses not yet positioned (show them so user knows to edit)
      const allHouseIds = new Set(houses.map(h => h.id));
      const savedHouseIds = new Set(customLayout.houses.map(h => h.id));
      const missingHouses: HousePosition[] = [];
      
      allHouseIds.forEach(id => {
        if (!savedHouseIds.has(id)) {
          missingHouses.push({ id, x: 30 + (missingHouses.length % 10) * (BASE_HOUSE_RADIUS * 3), y: 30 + Math.floor(missingHouses.length / 10) * (BASE_HOUSE_RADIUS * 3) });
        }
      });
      
      // Also filter out houses that no longer exist
      const validHouses = customLayout.houses.filter(h => allHouseIds.has(h.id));
      
      return { quadras: customLayout.quadras, houses: [...validHouses, ...missingHouses] };
    }
    return generateDefaultLayout(currentProject?.quadras || [], houses);
  }, [isEditMode, editingQuadras, editingHouses, customLayout, currentProject?.quadras, houses, generateDefaultLayout]);

  // Filter houses for display
  const filteredHouses = useMemo(() => {
    return displayData.houses.filter(hp => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || hp.id.toString().includes(term);
      const matchesStatus = filterStatus === "all" || getHouseStatus(hp.id) === filterStatus;
      const matchesMacroScope = houseMatchesMacroFilter(hp.id);
      return matchesSearch && matchesStatus && matchesMacroScope;
    });
  }, [displayData.houses, searchTerm, filterStatus, getHouseStatus, houseMatchesMacroFilter]);

  const visibleQuadras = useMemo(() => {
    return displayData.quadras.filter(q => q.visible !== false);
  }, [displayData.quadras]);

  // Fixed SVG dimensions - quadras overlay the map, don't expand it
  const svgDimensions = useMemo(() => {
    return { width: MAP_WIDTH, height: MAP_HEIGHT };
  }, []);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione uma obra para visualizar o mapa de implantação
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-3 p-2 bg-background/80 backdrop-blur border-b flex-wrap shrink-0">
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
          <Badge variant="outline" className="text-xs h-6">{Math.round(scale * 100)}%</Badge>
        </div>

        <div className="flex items-center gap-2">
          {canImportMap && (
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isAnalyzing || isEditMode} />
          )}
          
          {!isEditMode ? (
            <>
              {canImportMap && (
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 h-8 text-xs" disabled={isAnalyzing}>
                  {isAnalyzing ? <><Loader2 className="h-3 w-3 animate-spin" />Analisando...</> : <><Upload className="h-3 w-3" />Importar</>}
                </Button>
              )}
              {canEditMap && (
                <Button variant="default" size="sm" onClick={enterEditMode} className="gap-1.5 h-8 text-xs">
                  <Edit3 className="h-3 w-3" />Editar
                </Button>
              )}
              {mapImage && canDeleteMap && (
                <Button variant="ghost" size="sm" onClick={handleRemoveImage} className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={undoLastChange} 
                className="gap-1.5 h-8 text-xs"
                disabled={historyIndex <= 0}
                title="Desfazer última alteração (Ctrl+Z)"
              >
                <Undo2 className="h-3 w-3" />Desfazer
              </Button>
              <Button variant="outline" size="sm" onClick={autoAlignLayout} className="gap-1.5 h-8 text-xs" title="Alinhar quadras e casas em grade">
                <AlignCenter className="h-3 w-3" />Autoajuste
              </Button>
              {selectedHouseIds.size > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={clearSelection} className="gap-1.5 h-8 text-xs">
                    Limpar seleção ({selectedHouseIds.size})
                  </Button>
                  {canDeleteMap && (
                    <Button variant="destructive" size="sm" onClick={deleteSelectedHouses} className="gap-1.5 h-8 text-xs" title="Remover casas selecionadas do mapa">
                      <Trash className="h-3 w-3" />Excluir
                    </Button>
                  )}
                </>
              )}
              <Button variant="outline" size="sm" onClick={reorganizeHouses} className="gap-1.5 h-8 text-xs">
                <RotateCcw className="h-3 w-3" />Reorganizar
              </Button>
              <Button variant="default" size="sm" onClick={saveLayout} className="gap-1.5 h-8 text-xs" disabled={!canEditMap}>
                <Save className="h-3 w-3" />Salvar
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive">
                <XCircle className="h-3 w-3" />Cancelar
              </Button>
            </>
          )}
        </div>

        {!isEditMode && (
          <div className="relative w-40">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input placeholder="Buscar casa..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-7 h-8 text-xs" />
          </div>
        )}
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {isEditMode ? (
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-primary/20 text-primary text-xs">
                <Edit3 className="h-3 w-3 mr-1" />Modo Edição
              </Badge>
              <span className="text-muted-foreground">Ctrl+Arrastar: mover mapa | Scroll: zoom | Shift+Click: multi-seleção</span>
              {selectedHouseIds.size > 0 && (
                <Badge variant="outline" className="text-xs">
                  {selectedHouseIds.size} casa{selectedHouseIds.size > 1 ? 's' : ''} selecionada{selectedHouseIds.size > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          ) : (
            <><Move className="h-3 w-3" /><span>Scroll: mover | Ctrl+Scroll: zoom</span></>
          )}
        </div>
      </div>

      {/* Filters Row */}
      {!isEditMode && (
        <div className="flex items-center gap-3 flex-wrap p-2 bg-muted/20 border-b shrink-0">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">Filtros:</span>
          </div>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32 h-7 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
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
            <SelectTrigger className="w-32 h-7 text-xs"><SelectValue placeholder="Etapa" /></SelectTrigger>
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

          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="Serviço" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Serviços</SelectItem>
              {filterMacro !== "all" ? (
                availableScopes.map(scope => <SelectItem key={scope.id} value={scope.id}>{scope.name}</SelectItem>)
              ) : (
                allScopes.map(scope => (
                  <SelectItem key={scope.id} value={scope.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: scope.color }} />
                      <span className="truncate text-xs">{scope.name}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {(filterStatus !== "all" || filterMacro !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterMacro("all"); setFilterScope("all"); }} className="text-xs h-7 px-2">
              Limpar
            </Button>
          )}
        </div>
      )}

      {/* Edit mode: Quadra visibility controls */}
      {isEditMode && (
        <div className="flex items-center gap-2 flex-wrap p-2 bg-muted/30 border-b shrink-0">
          <span className="text-xs font-medium">Quadras:</span>
          {editingQuadras.map(q => (
            <div key={q.id} className="flex items-center gap-0.5 bg-background/50 rounded px-1">
              <Button
                variant={q.visible ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-xs gap-1 px-2"
                onClick={() => toggleQuadraVisibility(q.id)}
              >
                {q.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {q.name}
              </Button>
              {q.visible && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => autoDistributeHousesInQuadra(q.id)} title="Auto-distribuir casas">
                  <Grid3X3 className="h-3 w-3" />
                </Button>
              )}
              {canDeleteMap && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteQuadra(q.id)}
                  title="Remover quadra do mapa"
                >
                  <Trash className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Full-screen Map Container */}
      <div 
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${isDragging ? 'cursor-grabbing' : isEditMode ? 'cursor-crosshair' : 'cursor-grab'} bg-muted/10`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isAnalyzing && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm font-medium">Analisando planta e distribuindo casas...</span>
            </div>
          </div>
        )}
        {isMapImageLoading && !isAnalyzing && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-40">
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Carregando planta de implantação...</span>
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
          {/* Background image - auto-fit */}
          {mapImage && (
            <img 
              src={mapImage} 
              alt="Planta"
              className="absolute inset-0 pointer-events-none"
              onLoad={handleMapImageLoad}
              style={{ 
                maxWidth: 'none',
                width: svgDimensions.width,
                height: svgDimensions.height,
                objectFit: 'contain',
                opacity: isMapImageLoading ? 0 : isEditMode ? 0.6 : 0.4,
              }}
            />
          )}

          <svg ref={svgRef} width={svgDimensions.width} height={svgDimensions.height} className="select-none relative z-10">
            {/* Grid */}
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={mapImage ? "transparent" : "url(#grid)"} />
            
            {/* Visible Quadras */}
            {visibleQuadras.map((quadra) => (
              <g key={quadra.id}>
                <rect
                  x={quadra.x}
                  y={quadra.y}
                  width={quadra.width}
                  height={quadra.height}
                  fill={isEditMode ? "hsl(var(--card) / 0.5)" : "hsl(var(--card) / 0.3)"}
                  stroke={isEditMode ? "hsl(var(--primary))" : "hsl(var(--border) / 0.5)"}
                  strokeWidth={isEditMode ? 2 : 1}
                  strokeDasharray={isEditMode ? "5,5" : "none"}
                  rx="6"
                  style={{ cursor: isEditMode ? 'move' : 'default' }}
                  onMouseDown={(e) => handleQuadraEditMouseDown(e, quadra.id)}
                />
                
                <text x={quadra.x + 10} y={quadra.y + 16} fill="hsl(var(--foreground))" fontSize="12" fontWeight="600" style={{ pointerEvents: 'none' }}>
                  {quadra.name}
                </text>

                {/* Resize handles in edit mode */}
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
                          onMouseDown={(e) => handleQuadraEditMouseDown(e, quadra.id, corner)}
                        />
                      );
                    })}
                  </>
                )}
              </g>
            ))}
            
            {/* Houses - all rendered with absolute positions */}
            {(isEditMode ? editingHouses : filteredHouses).map((house) => {
              const progress = getHouseProgress(house.id);
              const color = getHouseColor(house.id);
              const isSelectedHouse = selectedHouse?.id === house.id;
              const isMultiSelected = isEditMode && selectedHouseIds.has(house.id);
              const r = displayRadius;
              
              return (
                <g 
                  key={`house-${house.id}`}
                  style={{ cursor: isEditMode ? 'move' : 'pointer' }}
                  onClick={(e) => handleHouseClick(house.id, e)}
                  onMouseDown={(e) => isEditMode && handleHouseEditMouseDown(e, house.id)}
                >
                  {/* Multi-selection highlight ring */}
                  {isMultiSelected && (
                    <circle 
                      cx={house.x} 
                      cy={house.y} 
                      r={r + 6} 
                      fill="none" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      strokeDasharray="4,2"
                      className="animate-pulse"
                    />
                  )}
                  
                  {/* Progress ring background */}
                  <circle cx={house.x} cy={house.y} r={r + 2} fill="none" stroke="hsl(var(--border))" strokeWidth={2} opacity={0.3} />
                  
                  {/* Progress ring */}
                  <circle
                    cx={house.x}
                    cy={house.y}
                    r={r + 2}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={`${(progress / 100) * (2 * Math.PI * (r + 2))} ${2 * Math.PI * (r + 2)}`}
                    strokeDashoffset={0.25 * 2 * Math.PI * (r + 2)}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'none' }}
                  />
                  
                  {/* House circle */}
                  <circle
                    cx={house.x}
                    cy={house.y}
                    r={r}
                    fill={color}
                    stroke={isSelectedHouse || isMultiSelected ? "white" : "hsl(var(--border))"}
                    strokeWidth={isSelectedHouse || isMultiSelected ? 3 : 1}
                    className="transition-all duration-150"
                  />
                  
                  {/* House number */}
                  <text
                    x={house.x}
                    y={house.y + 4}
                    fill="white"
                    fontSize={Math.max(8, r * 0.6)}
                    fontWeight="bold"
                    textAnchor="middle"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}
                  >
                    {house.id}
                  </text>
                </g>
              );
            })}
            
            {/* Selection box */}
            {isEditMode && isSelecting && (
              <rect
                x={Math.min(selectionStart.x, selectionEnd.x)}
                y={Math.min(selectionStart.y, selectionEnd.y)}
                width={Math.abs(selectionEnd.x - selectionStart.x)}
                height={Math.abs(selectionEnd.y - selectionStart.y)}
                fill="hsl(var(--primary) / 0.1)"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeDasharray="5,5"
                pointerEvents="none"
              />
            )}
            
          </svg>
        </div>
      </div>

      {/* House Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Casa {selectedHouse?.id}
            </DialogTitle>
          </DialogHeader>
          
          {selectedHouse && (
            <>
              <HouseDetailsDialogContent 
                house={selectedHouse} 
                legendItems={legendItems}
                quadraName={currentProject?.quadras.find(q => q.houses?.includes(selectedHouse.id))?.name}
                macrosTemplate={macrosTemplate}
              />
              <div className="pt-3 mt-2 border-t flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => { setShowDetailsDialog(false); setPhotoHistoryOpen(true); }}
                >
                  <Camera className="h-4 w-4 mr-1.5" />
                  Histórico fotográfico
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <HouseFotoHistoryDrawer
        open={photoHistoryOpen}
        onOpenChange={setPhotoHistoryOpen}
        houseId={selectedHouse?.id ?? null}
        projectId={currentProject?.id ?? null}
        houseLabel={selectedHouse ? `Casa ${String(selectedHouse.id).padStart(2, "0")}` : undefined}
      />
    </div>
  );
}
