import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Link2, Unlink, Save, Loader2, Home, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { matchServiceForMesh } from "./serviceKeywordMap";
import type { ModelLayer, LayerStageLink } from "./useModelLayers";

interface ServiceOption {
  id: string;
  label: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  color: string;
}

interface LinkLayersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layers: ModelLayer[];
  links: LayerStageLink[];
  projectId: string;
  onSaveLink: (
    layerName: string,
    stageId: string | null,
    macroId: string | null,
    scopeId?: string | null,
    displayName?: string | null,
    houseNumber?: number | null,
  ) => Promise<any>;
  onRemoveLink: (layerName: string) => Promise<void>;
}

export function LinkLayersDialog({
  open, onOpenChange, layers, links, projectId,
  onSaveLink, onRemoveLink,
}: LinkLayersDialogProps) {
  const { currentProject } = useConstruction();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [localLinks, setLocalLinks] = useState<Record<string, string>>({});
  const [localHouses, setLocalHouses] = useState<Record<string, string>>({}); // "_all" ou número da casa
  const [saving, setSaving] = useState(false);

  const totalHouses = currentProject?.houses?.length ?? 0;
  const houseOptions = Array.from({ length: totalHouses }, (_, i) => i + 1);

  useEffect(() => {
    if (!open || !projectId) return;
    const load = async () => {
      const { data: contractServices } = await supabase
        .from("project_contract_services")
        .select("id, macro_id, macro_name, scope_id, scope_name")
        .eq("project_id", projectId)
        .order("macro_name, scope_name");

      if (contractServices && contractServices.length > 0) {
        const colors = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
        const macroColorMap = new Map<string, string>();
        let colorIdx = 0;
        const opts: ServiceOption[] = contractServices.map(s => {
          if (!macroColorMap.has(s.macro_id)) {
            macroColorMap.set(s.macro_id, colors[colorIdx % colors.length]);
            colorIdx++;
          }
          return {
            id: `${s.macro_id}__${s.scope_id}`,
            label: `${s.macro_name} → ${s.scope_name}`,
            macro_id: s.macro_id,
            macro_name: s.macro_name,
            scope_id: s.scope_id,
            scope_name: s.scope_name,
            color: macroColorMap.get(s.macro_id) || "#6b7280",
          };
        });
        setServices(opts);
      }
    };
    load();
  }, [open, projectId]);

  // Inicializa estado local a partir dos vínculos existentes + auto-detecção da casa
  // E sugere serviço pelo nome do mesh quando ainda não há vínculo (auto + ajuste fino)
  useEffect(() => {
    const map: Record<string, string> = {};
    const houses: Record<string, string> = {};
    layers.forEach(l => {
      const existing = links.find(lk => lk.layer_name === l.name);
      if (existing) {
        if (existing.macro_id && existing.scope_id) {
          map[l.name] = `${existing.macro_id}__${existing.scope_id}`;
        } else if (existing.stage_id) {
          map[l.name] = existing.stage_id;
        }
        houses[l.name] = existing.house_number != null ? String(existing.house_number) : "_all";
      } else {
        // Sem vínculo: sugere serviço pelo nome + casa detectada/atribuída
        const suggested = services.length > 0 ? matchServiceForMesh(l.name, services) : null;
        map[l.name] = suggested ? suggested.id : "_none";
        houses[l.name] = l.houseNumber != null ? String(l.houseNumber) : "_all";
      }
    });
    setLocalLinks(map);
    setLocalHouses(houses);
  }, [links, layers, open, services]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const layer of layers) {
        const serviceKey = localLinks[layer.name];
        const houseSel = localHouses[layer.name];
        const houseNumber = houseSel && houseSel !== "_all" ? parseInt(houseSel, 10) : null;
        const existingLink = links.find(l => l.layer_name === layer.name);

        if (serviceKey && serviceKey !== "_none") {
          const service = services.find(s => s.id === serviceKey);
          if (service) {
            await onSaveLink(layer.name, null, service.macro_id, service.scope_id, null, houseNumber);
          }
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

  const autoDetectedCount = layers.filter(l => l.houseNumber != null).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Camadas aos Serviços
          </DialogTitle>
          <DialogDescription>
            Cada camada do modelo 3D pode representar a obra inteira ou uma casa específica.
            {autoDetectedCount > 0 && (
              <span className="block mt-1 text-primary text-xs">
                ✨ {autoDetectedCount} camada(s) com número de casa detectado automaticamente pelo nome do mesh.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="space-y-2">
            {layers.map((layer) => {
              const currentKey = localLinks[layer.name] || "_none";
              const currentHouse = localHouses[layer.name] || "_all";
              return (
                <div key={layer.name} className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-medium truncate flex-1" title={layer.name}>
                      {layer.displayName}
                    </p>
                    {layer.houseNumber != null && (
                      <Badge variant="secondary" className="text-[10px] h-5">
                        <Home className="h-2.5 w-2.5 mr-0.5" />
                        Casa {String(layer.houseNumber).padStart(2, "0")} (auto)
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{layer.meshCount} mesh(es)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Serviço</label>
                      <Select
                        value={currentKey}
                        onValueChange={(v) => setLocalLinks(prev => ({ ...prev, [layer.name]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecionar serviço..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Unlink className="h-3 w-3" /> Sem vínculo
                            </span>
                          </SelectItem>
                          {services.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: service.color }}
                                />
                                <span className="truncate">{service.label}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Casa</label>
                      <Select
                        value={currentHouse}
                        onValueChange={(v) => setLocalHouses(prev => ({ ...prev, [layer.name]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">
                            <span className="flex items-center gap-1.5">
                              <Building2 className="h-3 w-3" /> Toda a obra (média)
                            </span>
                          </SelectItem>
                          {houseOptions.map(n => (
                            <SelectItem key={n} value={String(n)}>
                              <span className="flex items-center gap-1.5">
                                <Home className="h-3 w-3" /> Casa {String(n).padStart(2, "0")}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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

        {services.length === 0 && layers.length > 0 && (
          <div className="text-center py-4">
            <Badge variant="outline" className="text-xs">
              Nenhum serviço cadastrado no projeto
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
