import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, CheckCircle2 } from "lucide-react";
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
  /**
   * Casas do projeto agrupadas por quadra (com NOME real da quadra, não UUID).
   * Use o mesmo `housesGroupedByQuadra` que o fluxo principal de lançamento usa.
   */
  housesGrouped: { name: string; houses: { id: number }[] }[];
  /**
   * Devolve o progresso atual (0–100) da casa para o macro/escopo deste item.
   * Usado para esconder casas já finalizadas e mostrar o % atual no botão.
   */
  getHouseProgress: (houseId: number, macroId: string, scopeId: string) => number;
  /**
   * Aplica a alteração: reverte o item antigo e aplica o novo.
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
 * Permite ajustar percentual e seleção de casas. Mantém o padrão visual
 * do seletor de casas usado no fluxo principal de lançamento (cores
 * âmbar para em andamento, esmeralda para 100%, % visível no card).
 *
 * Casas que já estão 100% executadas (descontando o próprio lançamento
 * em edição) ficam desabilitadas — não podem ser re-selecionadas.
 */
export function EditDiaryItemDialog({ open, onOpenChange, item, housesGrouped, getHouseProgress, onApply }: Props) {
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
    return (housesGrouped || []).map(g => ({
      name: g.name || "—",
      ids: g.houses.map(h => h.id).sort((a, b) => a - b),
    }));
  }, [housesGrouped]);

  /**
   * Para cada casa devolvemos o progresso atual já descontando o próprio
   * lançamento que está sendo editado. Isso evita que uma casa apareça
   * como "100%" só porque ela faz parte deste lançamento.
   */
  const baselineProgressFor = (houseId: number) => {
    if (!item) return 0;
    const raw = getHouseProgress(houseId, item.macro_id, item.scope_id);
    if (item.house_ids.includes(houseId)) {
      return Math.max(0, raw - (item.percentual_executado || 0));
    }
    return raw;
  };

  const toggleHouse = (id: number) => {
    // Permite desmarcar uma casa que pertence a este lançamento (mesmo se baseline+pct=100).
    // Bloqueia adicionar uma casa que JÁ está 100% por outros lançamentos.
    if (!item) return;
    const isInItem = item.house_ids.includes(id);
    if (!isInItem && baselineProgressFor(id) >= 100) return;
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

  // Mostra: casas que estão neste lançamento (sempre — para poder reduzir/remover)
  // + casas com baseline < 100 (para poder adicionar). Esconde casas 100% por OUTROS.
  const groupedFiltered = grouped
    .map(g => ({
      ...g,
      ids: g.ids.filter(id =>
        item.house_ids.includes(id) || baselineProgressFor(id) < 100
      ),
    }))
    .filter(g => g.ids.length > 0);

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
            {groupedFiltered.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-1">
                Não há casas pendentes deste serviço para selecionar.
              </p>
            )}
            {groupedFiltered.map(g => (
              <div key={g.name} className="mb-3">
                <div className="text-xs font-semibold text-muted-foreground mb-1">{g.name}</div>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
                  {g.ids.map(id => {
                    const isSelected = selected.includes(id);
                    const baseline = baselineProgressFor(id);
                    const isInThisItem = item.house_ids.includes(id);
                    const liveTotal = Math.min(100, baseline + (isSelected ? percent : 0));
                    const isFullByOthers = !isInThisItem && baseline >= 100;
                    return (
                      <Button
                        key={id}
                        type="button"
                        variant="outline"
                        disabled={isFullByOthers}
                        title={`Outros lançamentos: ${baseline}%`}
                        className={cn(
                          "h-14 w-full p-0 flex flex-col items-center justify-center gap-0 text-xs font-bold relative",
                          isSelected && "ring-2 ring-primary bg-primary/20 border-primary",
                          !isSelected && baseline === 0 && "bg-background",
                          !isSelected && baseline > 0 && baseline < 100 &&
                            "bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-800 dark:text-amber-300",
                          isFullByOthers &&
                            "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 text-emerald-700 dark:text-emerald-300 opacity-70 cursor-not-allowed"
                        )}
                        onClick={() => toggleHouse(id)}
                      >
                        <span className="text-xs font-bold leading-tight">{String(id).padStart(2, "0")}</span>
                        {isSelected ? (
                          <span className="text-[9px] font-medium leading-tight text-primary">
                            {liveTotal}%
                          </span>
                        ) : baseline > 0 && baseline < 100 ? (
                          <span className="text-[9px] font-medium leading-tight text-amber-600 dark:text-amber-400">
                            {baseline}%
                          </span>
                        ) : isFullByOthers ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        ) : null}
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
