import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, ZoomIn, ZoomOut, MapPin, Home, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  macroId: string;
  scopeId: string;
  macroName: string;
  scopeName: string;
  assignedHouseIds: Set<number>;
  selectedHouseIds: number[];
  onConfirm: (houseIds: number[]) => void;
}

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;
const HOUSE_RADIUS = 12;

export function ContractorHouseMapSelector({
  open, onOpenChange, macroId, scopeId, macroName, scopeName,
  assignedHouseIds, selectedHouseIds: initialSelected, onConfirm,
}: Props) {
  const { currentProject } = useConstruction();
  const houses = currentProject?.houses || [];
  const quadras = currentProject?.quadras || [];

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<Set<number>>(new Set(initialSelected));
  const [search, setSearch] = useState("");
  const [mapLayout, setMapLayout] = useState<MapLayout | null>(null);
  const [initialDbHouseIds, setInitialDbHouseIds] = useState<Set<number>>(new Set());
  const [completedHouseIds, setCompletedHouseIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelected));
      setSearch("");
    }
  }, [open, initialSelected]);

  // Load map layout
  useEffect(() => {
    if (!open || !currentProject?.id) return;
    (async () => {
      const { data } = await supabase
        .from("map_layouts")
        .select("image_url, quadras, houses, map_width, map_height")
        .eq("project_id", currentProject.id)
        .maybeSingle();
      if (data) {
        setMapLayout({
          imageUrl: data.image_url,
          quadras: data.quadras as unknown as QuadraLayout[],
          houses: data.houses as unknown as HousePosition[],
          mapWidth: data.map_width,
          mapHeight: data.map_height,
        });
      }
    })();
  }, [open, currentProject?.id]);

  // Load banco inicial + completed houses
  useEffect(() => {
    if (!open || !currentProject?.id) return;
    (async () => {
      const { data: initialProds } = await supabase
        .from("productions")
        .select("house_ids")
        .eq("project_id", currentProject.id)
        .eq("macro_id", macroId)
        .eq("scope_id", scopeId)
        .eq("is_initial_database", true);

      const initialIds = new Set<number>();
      (initialProds || []).forEach(p => {
        (p.house_ids || []).forEach((id: number) => initialIds.add(id));
      });
      setInitialDbHouseIds(initialIds);

      const completed = new Set<number>();
      houses.forEach(h => {
        const macro = h.macros?.find((m: any) => m.id === macroId);
        if (!macro) return;
        const scope = macro.scopes?.find((s: any) => s.id === scopeId);
        if (scope && scope.progress >= 100) {
          completed.add(h.id);
        }
      });
      setCompletedHouseIds(completed);
    })();
  }, [open, currentProject?.id, macroId, scopeId, houses]);

  // Fit map
  useEffect(() => {
    if (!mapLayout || !containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      const mw = mapLayout.mapWidth || MAP_WIDTH;
      const mh = mapLayout.mapHeight || MAP_HEIGHT;
      const s = Math.min(w / mw, h / mh, 1) * 0.9;
      setScale(s);
      setPosition({ x: (w - mw * s) / 2, y: (h - mh * s) / 2 });
    }
  }, [mapLayout]);

  // Available houses
  const availableHouses = useMemo(() => {
    return houses.filter(h => {
      if (initialDbHouseIds.has(h.id)) return false;
      if (completedHouseIds.has(h.id)) return false;
      if (assignedHouseIds.has(h.id) && !initialSelected.includes(h.id)) return false;
      return true;
    });
  }, [houses, initialDbHouseIds, completedHouseIds, assignedHouseIds, initialSelected]);

  const availableSet = useMemo(() => new Set(availableHouses.map(h => h.id)), [availableHouses]);

  const filteredHouses = useMemo(() => {
    if (!search.trim()) return availableHouses;
    const q = search.toLowerCase();
    return availableHouses.filter(h =>
      String(h.id).includes(q) || h.type?.toLowerCase().includes(q) || h.quadra?.toLowerCase().includes(q)
    );
  }, [availableHouses, search]);

  // Group by quadra
  const groupedByQuadra = useMemo(() => {
    const groups: Record<string, typeof filteredHouses> = {};
    filteredHouses.forEach(h => {
      const key = h.quadra || "Sem Quadra";
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    Object.values(groups).forEach(g => g.sort((a, b) => a.id - b.id));
    return groups;
  }, [filteredHouses]);

  const housePositions = useMemo(() => {
    if (!mapLayout?.houses) return new Map<number, HousePosition>();
    const map = new Map<number, HousePosition>();
    mapLayout.houses.forEach(h => map.set(h.id, h));
    return map;
  }, [mapLayout]);

  const toggleHouse = (houseId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(houseId)) next.delete(houseId); else next.add(houseId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filteredHouses.map(h => h.id)));
  const clearAll = () => setSelected(new Set());

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const zoom = (delta: number) => setScale(s => Math.max(0.2, Math.min(3, s + delta)));

  const getHouseColor = (houseId: number) => selected.has(houseId) ? "hsl(var(--primary))" : "hsl(var(--muted))";
  const mw = mapLayout?.mapWidth || MAP_WIDTH;
  const mh = mapLayout?.mapHeight || MAP_HEIGHT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[90vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Selecionar Casas — {macroName} / {scopeName}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique nas casas do mapa ou na lista lateral. Disponíveis: {availableHouses.length} | Selecionadas: {selected.size}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-primary" />
              {selected.size} selecionada(s)
            </Badge>
            <Button size="sm" onClick={() => { onConfirm(Array.from(selected)); onOpenChange(false); }}>
              Confirmar
            </Button>
          </div>
        </div>

        {/* Main */}
        <div className="flex flex-1 min-h-0">
          {/* Map */}
          <div className="flex-1 relative bg-muted/30 overflow-hidden" ref={containerRef}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => zoom(0.2)}><ZoomIn className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => zoom(-0.2)}><ZoomOut className="h-3.5 w-3.5" /></Button>
            </div>

            <div className="absolute bottom-2 left-2 z-10 bg-card/90 rounded-md border p-2 text-[10px] space-y-1">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary inline-block" /> Selecionada</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-muted inline-block border" /> Disponível</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full opacity-25 bg-muted-foreground inline-block border border-dashed" /> Indisponível</div>
            </div>

            <div style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transformOrigin: "0 0", cursor: isDragging ? "grabbing" : "grab" }}>
              <svg width={mw} height={mh} className="select-none">
                {mapLayout?.imageUrl && <image href={mapLayout.imageUrl} width={mw} height={mh} />}
                <defs>
                  <pattern id="contractor-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
                  </pattern>
                </defs>
                {!mapLayout?.imageUrl && <rect width="100%" height="100%" fill="url(#contractor-grid)" />}

                {(mapLayout?.quadras || []).filter(q => q.visible !== false).map(q => (
                  <g key={q.id}>
                    <rect x={q.x} y={q.y} width={q.width} height={q.height}
                      fill="hsl(var(--card) / 0.3)" stroke="hsl(var(--border) / 0.5)" strokeWidth={1} rx="6" />
                    <text x={q.x + 10} y={q.y + 16} fill="hsl(var(--foreground))" fontSize="12" fontWeight="600" style={{ pointerEvents: "none" }}>{q.name}</text>
                  </g>
                ))}

                {/* Unavailable houses */}
                {houses.filter(h => !availableSet.has(h.id)).map(h => {
                  const pos = housePositions.get(h.id);
                  if (!pos) return null;
                  return (
                    <g key={`u-${h.id}`} opacity={0.25}>
                      <circle cx={pos.x} cy={pos.y} r={HOUSE_RADIUS} fill="hsl(var(--muted-foreground))" stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="3,2" />
                      <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="8" fontWeight="600" style={{ pointerEvents: "none" }}>{h.id}</text>
                    </g>
                  );
                })}

                {/* Available houses */}
                {availableHouses.map(h => {
                  const pos = housePositions.get(h.id);
                  if (!pos) return null;
                  const isSel = selected.has(h.id);
                  return (
                    <g key={`h-${h.id}`} style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); toggleHouse(h.id); }}>
                      {isSel && <circle cx={pos.x} cy={pos.y} r={HOUSE_RADIUS + 5} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} opacity={0.6} />}
                      <circle cx={pos.x} cy={pos.y} r={HOUSE_RADIUS} fill={getHouseColor(h.id)} stroke={isSel ? "white" : "hsl(var(--border))"} strokeWidth={isSel ? 2 : 1} />
                      <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill={isSel ? "white" : "hsl(var(--foreground))"} fontSize="9" fontWeight="600" style={{ pointerEvents: "none" }}>{h.id}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Side panel */}
          <div className="w-72 border-l bg-card flex flex-col shrink-0">
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar casa..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={selectAll}>
                  Selecionar Todas ({filteredHouses.length})
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px]" onClick={clearAll}>Limpar</Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-3">
                {Object.entries(groupedByQuadra).map(([qName, qHouses]) => (
                  <div key={qName}>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
                      {qName} ({qHouses.length})
                    </div>
                    <div className="space-y-0.5">
                      {qHouses.map(h => (
                        <div key={h.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-accent/50 transition-colors ${selected.has(h.id) ? "bg-primary/10 border border-primary/20" : ""}`}
                          onClick={() => toggleHouse(h.id)}>
                          <Checkbox checked={selected.has(h.id)} className="h-3.5 w-3.5" />
                          <Home className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">Casa {h.id}</span>
                          <span className="text-muted-foreground text-[10px] ml-auto">{h.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(groupedByQuadra).length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-8">
                    <XCircle className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    Nenhuma casa disponível
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
