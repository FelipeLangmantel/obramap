import { Eye, EyeOff, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelLayer, LayerStageLink } from "./useModelLayers";

interface LayersPanelProps {
  layers: ModelLayer[];
  links: LayerStageLink[];
  autoMode: boolean;
  onAutoModeChange: (v: boolean) => void;
  onToggleLayer: (name: string) => void;
  onOpacityChange: (name: string, opacity: number) => void;
  onOpenLinkDialog: () => void;
}

export function LayersPanel({
  layers, links, autoMode, onAutoModeChange,
  onToggleLayer, onOpacityChange, onOpenLinkDialog,
}: LayersPanelProps) {
  if (layers.length === 0) return null;

  return (
    <Card className="absolute top-4 left-4 w-72 max-h-[calc(100%-2rem)] z-10 bg-background/95 backdrop-blur-sm">
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Camadas ({layers.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={onOpenLinkDialog} className="h-7 text-xs">
            <Link2 className="h-3 w-3 mr-1" />Vincular Etapas
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Switch
            id="auto-mode"
            checked={autoMode}
            onCheckedChange={onAutoModeChange}
          />
          <Label htmlFor="auto-mode" className="text-xs cursor-pointer">
            {autoMode ? "Visão Atual (por produção)" : "Visão Completa"}
          </Label>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-1.5">
            {layers.map((layer) => {
              const link = links.find(l => l.layer_name === layer.name);
              return (
                <div key={layer.name} className="p-2 rounded-md border border-border/50 bg-muted/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleLayer(layer.name)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <span className="text-xs font-medium flex-1 truncate" title={layer.name}>
                      {layer.name}
                    </span>
                    {link?.stage_id ? (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        <Link2 className="h-2.5 w-2.5 mr-0.5" />vinculado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                        <Unlink className="h-2.5 w-2.5 mr-0.5" />livre
                      </Badge>
                    )}
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
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
