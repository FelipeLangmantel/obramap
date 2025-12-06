import { useState, useEffect } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DefaultLegendItem {
  id: string;
  name: string;
  color: string;
  minPercent: number;
  maxPercent: number;
}

const DEFAULT_LEGEND_ITEMS: DefaultLegendItem[] = [
  { id: "nao_iniciado", name: "Não Iniciado", color: "#9ca3af", minPercent: 0, maxPercent: 0 },
  { id: "fundacao", name: "Fundação", color: "#ef4444", minPercent: 1, maxPercent: 25 },
  { id: "estrutura", name: "Estrutura", color: "#f59e0b", minPercent: 26, maxPercent: 60 },
  { id: "acabamento", name: "Acabamento", color: "#3b82f6", minPercent: 61, maxPercent: 99 },
  { id: "concluido", name: "Concluído", color: "#22c55e", minPercent: 99.1, maxPercent: 100 },
];

// Load from localStorage or use defaults
const getStoredLegend = (): DefaultLegendItem[] => {
  try {
    const stored = localStorage.getItem("default_legend_items");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error loading legend from localStorage:", e);
  }
  return DEFAULT_LEGEND_ITEMS;
};

const getStoredLegendMode = (): boolean => {
  try {
    const stored = localStorage.getItem("legend_follow_macros");
    if (stored !== null) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error loading legend mode from localStorage:", e);
  }
  return false; // Default: use standard legend
};

export function Legend() {
  const { currentProject } = useConstruction();
  const [followMacros, setFollowMacros] = useState(getStoredLegendMode);
  const [legendItems, setLegendItems] = useState<DefaultLegendItem[]>(getStoredLegend);
  const [isEditing, setIsEditing] = useState(false);
  const [editingItems, setEditingItems] = useState<DefaultLegendItem[]>([]);

  // Save followMacros to localStorage
  useEffect(() => {
    localStorage.setItem("legend_follow_macros", JSON.stringify(followMacros));
  }, [followMacros]);

  // Save legendItems to localStorage
  useEffect(() => {
    localStorage.setItem("default_legend_items", JSON.stringify(legendItems));
  }, [legendItems]);

  const handleEditClick = () => {
    setEditingItems([...legendItems]);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setLegendItems(editingItems);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingItems([]);
  };

  const updateEditingItem = (id: string, field: keyof DefaultLegendItem, value: string | number) => {
    setEditingItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  // Use macros from current project when following macros mode
  const macros = currentProject?.macrosTemplate || [];

  // Determine what to display
  const displayItems = followMacros ? macros : legendItems;

  if (!followMacros && legendItems.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-xl border border-border">
        <span className="text-sm font-medium text-foreground">Legenda</span>
        <span className="text-sm text-muted-foreground">Nenhuma etapa configurada</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Legenda</span>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="follow-macros" className="text-sm">
                  Seguir Gerenciador de Etapas
                </Label>
                <Switch
                  id="follow-macros"
                  checked={followMacros}
                  onCheckedChange={setFollowMacros}
                />
              </div>

              {!followMacros && (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Legenda padrão baseada em porcentagem
                  </div>
                  
                  {!isEditing ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEditClick}
                      className="w-full"
                    >
                      Editar Legenda Padrão
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      {editingItems.map((item) => (
                        <div key={item.id} className="space-y-2 p-2 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={item.color}
                              onChange={(e) => updateEditingItem(item.id, "color", e.target.value)}
                              className="w-8 h-8 rounded border cursor-pointer"
                            />
                            <Input
                              value={item.name}
                              onChange={(e) => updateEditingItem(item.id, "name", e.target.value)}
                              className="h-8 flex-1"
                            />
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span>De</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={item.minPercent}
                              onChange={(e) => updateEditingItem(item.id, "minPercent", parseFloat(e.target.value) || 0)}
                              className="h-7 w-16 text-xs"
                            />
                            <span>até</span>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={item.maxPercent}
                              onChange={(e) => updateEditingItem(item.id, "maxPercent", parseFloat(e.target.value) || 0)}
                              className="h-7 w-16 text-xs"
                            />
                            <span>%</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="flex-1"
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          className="flex-1"
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {followMacros ? (
        // Display macros from manager
        macros.map((macro) => (
          <div key={macro.id} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: macro.color }}
            />
            <span className="text-sm text-muted-foreground">{macro.name}</span>
          </div>
        ))
      ) : (
        // Display default legend with percentage ranges
        legendItems.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-muted-foreground">
              {item.name}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

// Export helper function to get legend color based on progress
export function getLegendColorByProgress(progress: number): string {
  const legendItems = getStoredLegend();
  
  for (const item of legendItems) {
    if (progress >= item.minPercent && progress <= item.maxPercent) {
      return item.color;
    }
  }
  
  // Fallback
  return "#9ca3af";
}

// Export helper to check if following macros mode
export function isFollowingMacrosMode(): boolean {
  return getStoredLegendMode();
}
