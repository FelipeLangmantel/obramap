import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Link2, Unlink, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ModelLayer, LayerStageLink } from "./useModelLayers";

interface PlanningStageOption {
  id: string;
  name: string;
  color: string;
  macro_id?: string;
}

interface LinkLayersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layers: ModelLayer[];
  links: LayerStageLink[];
  projectId: string;
  onSaveLink: (layerName: string, stageId: string | null, macroId: string | null) => Promise<any>;
  onRemoveLink: (layerName: string) => Promise<void>;
}

export function LinkLayersDialog({
  open, onOpenChange, layers, links, projectId,
  onSaveLink, onRemoveLink,
}: LinkLayersDialogProps) {
  const [stages, setStages] = useState<PlanningStageOption[]>([]);
  const [localLinks, setLocalLinks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load planning stages for this project
  useEffect(() => {
    if (!open || !projectId) return;
    const load = async () => {
      const { data } = await supabase
        .from("planning_stages")
        .select("id, name, color, macro_id")
        .eq("project_id", projectId)
        .order("sequence_order");
      if (data) setStages(data);
    };
    load();
  }, [open, projectId]);

  // Initialize local state from existing links
  useEffect(() => {
    const map: Record<string, string> = {};
    links.forEach(l => {
      if (l.stage_id) map[l.layer_name] = l.stage_id;
    });
    setLocalLinks(map);
  }, [links, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save all links
      for (const layer of layers) {
        const stageId = localLinks[layer.name];
        const existingLink = links.find(l => l.layer_name === layer.name);

        if (stageId && stageId !== "_none") {
          const stage = stages.find(s => s.id === stageId);
          await onSaveLink(layer.name, stageId, stage?.macro_id || null);
        } else if (existingLink) {
          await onRemoveLink(layer.name);
        }
      }
      toast.success("Vínculos salvos com sucesso!");
      onOpenChange(false);
    } catch (err) {
      toast.error("Erro ao salvar vínculos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Camadas às Etapas
          </DialogTitle>
          <DialogDescription>
            Associe cada camada do modelo 3D a uma etapa do planejamento. A visibilidade será controlada automaticamente com base na produção.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-2">
            {layers.map((layer) => {
              const currentStageId = localLinks[layer.name] || "_none";
              return (
                <div key={layer.name} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={layer.name}>{layer.name}</p>
                    <p className="text-xs text-muted-foreground">{layer.meshCount} mesh(es)</p>
                  </div>
                  <div className="w-64">
                    <Select
                      value={currentStageId}
                      onValueChange={(v) => setLocalLinks(prev => ({ ...prev, [layer.name]: v }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar etapa..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Unlink className="h-3 w-3" /> Sem vínculo
                          </span>
                        </SelectItem>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <span className="flex items-center gap-1.5">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
            {layers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhuma camada encontrada. Importe um modelo 3D primeiro.
              </div>
            )}
          </div>
        </ScrollArea>

        {stages.length === 0 && layers.length > 0 && (
          <div className="text-center py-4">
            <Badge variant="outline" className="text-xs">
              Nenhuma etapa cadastrada no Planejamento Inteligente
            </Badge>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Salvar Vínculos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
