import { useState } from "react";
import { Eye, EyeOff, Link2, Unlink, Pencil, Check, X, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelLayer, LayerStageLink } from "./useModelLayers";

interface LayersPanelProps {
  layers: ModelLayer[];
  links: LayerStageLink[];
  autoMode: boolean;
  onToggleLayer: (name: string) => void;
  onOpacityChange: (name: string, opacity: number) => void;
  onShowAllLayers: () => void;
  onRenameLayer?: (name: string, newDisplayName: string) => void;
}

export function LayersPanel({
  layers, links, autoMode,
  onToggleLayer, onOpacityChange, onShowAllLayers, onRenameLayer,
}: LayersPanelProps) {
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  if (layers.length === 0) return null;
  const hiddenCount = layers.filter((layer) => !layer.visible || layer.opacity < 1).length;

  const startRename = (layer: ModelLayer) => {
    setEditingLayer(layer.name);
    setEditName(layer.displayName);
  };

  const confirmRename = (layerName: string) => {
    if (editName.trim() && onRenameLayer) {
      onRenameLayer(layerName, editName.trim());
    }
    setEditingLayer(null);
  };

  const cancelRename = () => {
    setEditingLayer(null);
    setEditName("");
  };

  return (
    <Card className="absolute top-4 left-4 z-10 flex w-[calc(100vw-2rem)] max-w-[520px] flex-col bg-background/95 backdrop-blur-sm sm:w-[460px] lg:w-[500px]" style={{ maxHeight: 'calc(100% - 2rem)' }}>
      <CardHeader className="pb-2 px-3 pt-3 flex-shrink-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm leading-none">Camadas ({layers.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onShowAllLayers}
              className="h-7 whitespace-nowrap text-xs"
              title={hiddenCount > 0 ? `${hiddenCount} camada(s) ocultas ou translucidas` : "Resetar visualizacao 3D"}
            >
              <RotateCcw className="h-3 w-3 mr-1" />Reexibir tudo
            </Button>
          </div>
        </div>
        {hiddenCount > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {hiddenCount} camada(s) ocultas ou com opacidade reduzida.
          </p>
        )}
        {links.length > 0 && autoMode && (
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            Camadas atualizam em tempo real conforme a obra avança no Diário.
          </p>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-3 flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
          <div className="space-y-1.5">
            {layers.map((layer) => {
              const link = links.find(l => l.layer_name === layer.name);
              const isEditing = editingLayer === layer.name;
              return (
                <div key={layer.name} className="p-2 rounded-md border border-border/50 bg-muted/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleLayer(layer.name)}
                      className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                    >
                      {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-6 text-xs px-1.5"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmRename(layer.name);
                            if (e.key === "Escape") cancelRename();
                          }}
                        />
                        <button onClick={() => confirmRename(layer.name)} className="text-primary hover:text-primary/80 flex-shrink-0">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-medium flex-1 truncate" title={layer.name}>
                          {layer.displayName}
                        </span>
                        <button
                          onClick={() => startRename(layer)}
                          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                          title="Renomear camada"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                    {!isEditing && layer.houseNumber != null && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0 border-primary/40 text-primary">
                        <Home className="h-2.5 w-2.5 mr-0.5" />C{String(layer.houseNumber).padStart(2, "0")}
                      </Badge>
                    )}
                    {!isEditing && (link?.stage_id || link?.scope_id ? (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 flex-shrink-0">
                        <Link2 className="h-2.5 w-2.5 mr-0.5" />vinculado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground flex-shrink-0">
                        <Unlink className="h-2.5 w-2.5 mr-0.5" />livre
                      </Badge>
                    ))}
                  </div>
                  {layer.progress !== undefined && autoMode && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${layer.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{layer.progress?.toFixed(0)}%</span>
                    </div>
                  )}
                  {!autoMode && (
                    <Slider
                      value={[layer.opacity * 100]}
                      min={0} max={100} step={5}
                      onValueChange={([v]) => onOpacityChange(layer.name, v / 100)}
                      className="py-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
