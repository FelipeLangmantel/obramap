import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface EditableDiaryItem {
  id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  house_ids: number[];
  percentual_executado: number;
  observacao: string | null;
  production_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EditableDiaryItem | null;
  /** Lista de casas do projeto (id = house_number). */
  houses: { id: number; quadra: string }[];
  /**
   * Aplica a alteração: reverte o item antigo e aplica o novo.
   * Devolve `Promise<void>` em sucesso, lança em erro.
   */
  onApply: (params: {
    item: EditableDiaryItem;
    newHouseIds: number[];
    newPercent: number;
    newObs: string;
  }) => Promise<void>;
}

/**
 * Dialog para corrigir um lançamento ANTES de enviar para aprovação.
 * Permite ajustar percentual e seleção de casas. A persistência fica a
 * cargo do callback `onApply` para reaproveitar a lógica atômica de
 * revert+reaplicação que já existe no DiarioObraView.
 */
export function EditDiaryItemDialog({ open, onOpenChange, item, houses, onApply }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [percent, setPercent] = useState(100);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setSelected([...item.house_ids].sort((a, b) => a - b));
      setPercent(item.percentual_executado);
      setObs(item.observacao || "");
    }
  }, [item]);

  const grouped = useMemo(() => {
    const map = new Map<string, number[]>();
    houses.forEach(h => {
      const k = h.quadra || "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h.id);
    });
    return Array.from(map.entries()).map(([name, ids]) => ({
      name,
      ids: ids.sort((a, b) => a - b),
    }));
  }, [houses]);

  const toggleHouse = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].sort((a, b) => a - b));
  };

  const handleSave = async () => {
    if (!item) return;
    if (selected.length === 0) {
      toast.error("Selecione ao menos uma casa.");
      return;
    }
    if (percent < 1 || percent > 100) {
      toast.error("Percentual deve estar entre 1 e 100.");
      return;
    }
    setSaving(true);
    try {
      await onApply({ item, newHouseIds: selected, newPercent: percent, newObs: obs });
      toast.success("Lançamento atualizado.");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar lançamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="text-sm font-medium">{item.macro_name} · {item.scope_name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {item.house_ids.length} casa(s) — {item.percentual_executado}% atual
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Casas do lançamento
            </label>
            {grouped.map(g => (
              <div key={g.name} className="mb-3">
                <div className="text-xs font-semibold text-muted-foreground mb-1">{g.name}</div>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
                  {g.ids.map(id => {
                    const isSelected = selected.includes(id);
                    return (
                      <Button
                        key={id}
                        type="button"
                        variant="outline"
                        className={cn(
                          "h-12 w-full p-0 text-xs font-bold",
                          isSelected && "ring-2 ring-primary bg-primary/20 border-primary"
                        )}
                        onClick={() => toggleHouse(id)}
                      >
                        {String(id).padStart(2, "0")}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Badge variant="secondary" className="mt-1">
              {selected.length} casa(s) selecionada(s)
            </Badge>
          </div>

          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Percentual executado:</span>
              <span className="text-2xl font-bold text-primary">{percent}%</span>
            </div>
            <Slider min={10} max={100} step={10} value={[percent]} onValueChange={v => setPercent(v[0])} />
            <Input
              type="number" min={1} max={100} value={percent}
              onChange={e => setPercent(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
              className="h-9"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Observação (opcional)
            </label>
            <Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
