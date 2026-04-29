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
  housesGrouped: { name: string; houses: { id: number }[] }[];
  getHouseProgress: (houseId: number, macroId: string, scopeId: string) => number;
  /**
   * Aplica a alteração: reverte o item antigo e aplica o novo. Quando
   * `housePercents` é fornecido, cada casa recebe o seu próprio percentual.
   * Caso contrário usa `newPercent` para todas as casas selecionadas.
   */
  onApply: (params: {
    item: EditableDiaryItem;
    newHouseIds: number[];
    newPercent: number;
    newObs: string;
    housePercents?: Record<number, number>;
  }) => Promise<void>;
}

/**
 * Edita um lançamento ANTES da aprovação. Permite ajustar:
 *  • a seleção de casas (mantendo o padrão visual do fluxo principal),
 *  • o percentual de cada casa individualmente,
 *  • a observação.
 *
 * Casas 100% por OUTROS lançamentos ficam bloqueadas. Casas que pertencem
 * a este item podem ser desmarcadas mesmo que estejam em 100% (porque
 * desmarcar é justamente reverter este lançamento na casa).
 */
export function EditDiaryItemDialog({ open, onOpenChange, item, housesGrouped, getHouseProgress, onApply }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  /** Percentual aplicado por casa selecionada. */
  const [percents, setPercents] = useState<Record<number, number>>({});
  /** Percentual "global" usado como default ao selecionar uma casa nova. */
  const [globalPercent, setGlobalPercent] = useState(100);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      const ids = [...item.house_ids].sort((a, b) => a - b);
      setSelected(ids);
      const init: Record<number, number> = {};
      ids.forEach(id => { init[id] = item.percentual_executado; });
      setPercents(init);
      setGlobalPercent(item.percentual_executado);
      setObs(item.observacao || "");
    }
  }, [item]);

  const grouped = useMemo(() => {
    return (housesGrouped || []).map(g => ({
      name: g.name || "—",
      ids: g.houses.map(h => h.id).sort((a, b) => a - b),
    }));
  }, [housesGrouped]);

  /** Progresso atual da casa descontando o próprio lançamento em edição. */
  const baselineProgressFor = (houseId: number) => {
    if (!item) return 0;
    const raw = getHouseProgress(houseId, item.macro_id, item.scope_id);
    if (item.house_ids.includes(houseId)) {
      return Math.max(0, raw - (item.percentual_executado || 0));
    }
    return raw;
  };

  const toggleHouse = (id: number) => {
    if (!item) return;
    const isInItem = item.house_ids.includes(id);
    const baseline = baselineProgressFor(id);
    if (!isInItem && baseline >= 100) return;
    setSelected(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(x => x !== id);
        setPercents(p => { const n = { ...p }; delete n[id]; return n; });
        return next;
      } else {
        const maxAllowed = Math.max(1, 100 - baseline);
        const def = Math.min(globalPercent, maxAllowed);
        setPercents(p => ({ ...p, [id]: def }));
        return [...prev, id].sort((a, b) => a - b);
      }
    });
  };

  const updateHousePercent = (id: number, value: number) => {
    const baseline = baselineProgressFor(id);
    const max = Math.max(1, 100 - baseline);
    const v = Math.max(1, Math.min(max, Math.round(value)));
    setPercents(p => ({ ...p, [id]: v }));
  };

  const applyGlobalToAll = () => {
    setPercents(prev => {
      const n: Record<number, number> = {};
      selected.forEach(id => {
        const baseline = baselineProgressFor(id);
        const max = Math.max(1, 100 - baseline);
        n[id] = Math.min(globalPercent, max);
      });
      return n;
    });
  };

  const handleSave = async () => {
    if (!item) return;
    if (selected.length === 0) {
      toast.error("Selecione ao menos uma casa.");
      return;
    }
    for (const id of selected) {
      const p = percents[id];
      if (!p || p < 1 || p > 100) {
        toast.error(`Percentual inválido na casa ${String(id).padStart(2, "0")}.`);
        return;
      }
    }
    setSaving(true);
    try {
      await onApply({
        item,
        newHouseIds: selected,
        newPercent: globalPercent,
        newObs: obs,
        housePercents: percents,
      });
      toast.success("Lançamento atualizado.");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

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
              {item.house_ids.length} casa(s) · {item.percentual_executado}% original
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
                    const hp = percents[id];
                    const liveTotal = Math.min(100, baseline + (isSelected ? (hp || 0) : 0));
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
                            +{hp || 0}%
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

          {/* Slider global — atalho para aplicar o mesmo % em todas as casas */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Percentual padrão (atalho):</span>
              <span className="text-xl font-bold text-primary">{globalPercent}%</span>
            </div>
            <Slider min={10} max={100} step={10} value={[globalPercent]}
              onValueChange={v => setGlobalPercent(v[0])} />
            <div className="flex gap-2">
              <Input
                type="number" min={1} max={100} value={globalPercent}
                onChange={e => setGlobalPercent(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                className="h-9"
              />
              <Button type="button" variant="outline" className="h-9 shrink-0"
                onClick={applyGlobalToAll} disabled={selected.length === 0}>
                Aplicar a todas
              </Button>
            </div>
          </div>

          {/* Editor individual — uma linha por casa selecionada */}
          {selected.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                Percentual por casa
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {selected.map(id => {
                  const baseline = baselineProgressFor(id);
                  const max = Math.max(1, 100 - baseline);
                  const v = percents[id] ?? 0;
                  const total = Math.min(100, baseline + v);
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="w-14 justify-center shrink-0">
                        Casa {String(id).padStart(2, "0")}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums w-20 shrink-0">
                        base: {baseline}%
                      </span>
                      <Input
                        type="number" min={1} max={max} value={v}
                        onChange={e => updateHousePercent(id, Number(e.target.value) || 0)}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                      <span className="text-muted-foreground">%</span>
                      <span className={cn(
                        "ml-auto text-[11px] font-medium tabular-nums",
                        total >= 100 ? "text-emerald-600" : "text-primary"
                      )}>
                        → {total}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
