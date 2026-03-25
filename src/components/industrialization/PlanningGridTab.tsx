import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { getDaysInMonth, addDays, format } from "date-fns";
import { CalendarRange, Loader2 } from "lucide-react";

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Factory {
  id: string; name: string; capacity_houses_month: number;
  price_per_house: number; advance_payment_pct: number; avg_lead_time_days: number;
}

interface GridCell {
  planned_houses: number;
  actual_houses: number;
}

interface Props {
  companyId: string;
  contextId: string;
  totalUnits: number;
}

function generateFortnights(startDate: Date, endDate: Date) {
  const result: { year: number; month: number; fortnight: 1|2; label: string; start: Date; end: Date }[] = [];
  const cur = new Date(startDate);
  cur.setDate(1);
  while (cur <= endDate) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const dim = getDaysInMonth(cur);
    const f1s = new Date(y, m, 1);
    const f1e = new Date(y, m, 15);
    if (f1s <= endDate && f1e >= startDate) {
      result.push({ year: y, month: m + 1, fortnight: 1, label: `1ª ${MONTHS_PT[m]}/${String(y).slice(2)}`, start: f1s, end: f1e });
    }
    const f2s = new Date(y, m, 16);
    const f2e = new Date(y, m, dim);
    if (f2s <= endDate && f2e >= startDate) {
      result.push({ year: y, month: m + 1, fortnight: 2, label: `2ª ${MONTHS_PT[m]}/${String(y).slice(2)}`, start: f2s, end: f2e });
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

export default function PlanningGridTab({ companyId, contextId, totalUnits }: Props) {
  const { canEdit, requireEdit } = useAuth();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [grid, setGrid] = useState<Record<string, GridCell>>({});
  const [contextDates, setContextDates] = useState<{ start: Date; end: Date } | null>(null);
  const [loading, setLoading] = useState(true);

  const [cellDialog, setCellDialog] = useState<{
    factoryId: string; factoryName: string; capacity: number;
    year: number; month: number; fortnight: 1 | 2; label: string;
    current: GridCell;
  } | null>(null);
  const [cellInput, setCellInput] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: periods } = await supabase
        .from("ind_periods").select("start_date, end_date")
        .eq("context_id", contextId).order("start_date");

      if (periods && periods.length > 0) {
        setContextDates({
          start: new Date(periods[0].start_date + "T12:00:00"),
          end: new Date(periods[periods.length - 1].end_date + "T12:00:00"),
        });
      } else {
        const hoje = new Date();
        setContextDates({ start: hoje, end: addDays(hoje, 180) });
      }

      const { data: facs } = await supabase
        .from("ind_factories").select("id,name,capacity_houses_month,price_per_house,advance_payment_pct,avg_lead_time_days")
        .eq("company_id", companyId).eq("is_active", true).order("name");
      setFactories((facs || []) as Factory[]);

      const { data: gridData } = await supabase
        .from("ind_planning_grid").select("*").eq("context_id", contextId);
      const map: Record<string, GridCell> = {};
      (gridData || []).forEach((row: any) => {
        const key = `${row.factory_id}_${row.year}_${row.month}_${row.fortnight}`;
        map[key] = { planned_houses: row.planned_houses, actual_houses: row.actual_houses };
      });
      setGrid(map);
    } finally {
      setLoading(false);
    }
  }, [companyId, contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fortnights = useMemo(() => {
    if (!contextDates) return [];
    return generateFortnights(contextDates.start, contextDates.end);
  }, [contextDates]);

  const colTotals = useMemo(() => {
    const totals: Record<string, { planned: number; actual: number }> = {};
    fortnights.forEach(fn => {
      let p = 0, a = 0;
      factories.forEach(f => {
        const key = `${f.id}_${fn.year}_${fn.month}_${fn.fortnight}`;
        p += grid[key]?.planned_houses || 0;
        a += grid[key]?.actual_houses || 0;
      });
      totals[`${fn.year}_${fn.month}_${fn.fortnight}`] = { planned: p, actual: a };
    });
    return totals;
  }, [fortnights, factories, grid]);

  const grandTotal = useMemo(() =>
    Object.values(colTotals).reduce((s, v) => s + v.planned, 0),
  [colTotals]);

  const openCell = (factory: Factory, fn: typeof fortnights[0]) => {
    const key = `${factory.id}_${fn.year}_${fn.month}_${fn.fortnight}`;
    const current = grid[key] || { planned_houses: 0, actual_houses: 0 };
    const halfCap = Math.floor(factory.capacity_houses_month / 2);
    setCellDialog({
      factoryId: factory.id, factoryName: factory.name,
      capacity: halfCap, year: fn.year, month: fn.month,
      fortnight: fn.fortnight as 1 | 2, label: fn.label, current,
    });
    setCellInput(current.planned_houses);
  };

  const saveCell = async () => {
    if (!cellDialog || !requireEdit()) return;
    const { factoryId, year, month, fortnight } = cellDialog;
    const startDate = fortnight === 1
      ? format(new Date(year, month - 1, 1), "yyyy-MM-dd")
      : format(new Date(year, month - 1, 16), "yyyy-MM-dd");
    const endDate = fortnight === 1
      ? format(new Date(year, month - 1, 15), "yyyy-MM-dd")
      : format(new Date(year, month - 1, getDaysInMonth(new Date(year, month - 1))), "yyyy-MM-dd");

    const { error } = await supabase.from("ind_planning_grid").upsert({
      company_id: companyId, context_id: contextId,
      factory_id: factoryId, year, month, fortnight,
      start_date: startDate, end_date: endDate,
      planned_houses: cellInput,
      actual_houses: cellDialog.current.actual_houses,
    } as any, { onConflict: "context_id,factory_id,year,month,fortnight" });

    if (error) { toast.error("Erro ao salvar: " + error.message); return; }

    const key = `${factoryId}_${year}_${month}_${fortnight}`;
    setGrid(prev => ({ ...prev, [key]: { ...cellDialog.current, planned_houses: cellInput } }));
    toast.success(cellInput > 0 ? `${cellInput} casas planejadas para ${cellDialog.label}` : "Célula limpa");
    setCellDialog(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="text-muted-foreground">
          Total planejado: <strong className="text-foreground">{grandTotal}</strong> casas
        </span>
        <span className="text-muted-foreground">
          Meta da obra: <strong className="text-foreground">{totalUnits}</strong> casas
        </span>
        {totalUnits > 0 && (
          <span className={grandTotal >= totalUnits ? "text-emerald-600 font-semibold" : "text-amber-600"}>
            {grandTotal >= totalUnits ? "✓ Meta atingida no planejamento" : `Faltam ${totalUnits - grandTotal} casas para planejar`}
          </span>
        )}
      </div>

      {factories.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <CalendarRange className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma fábrica cadastrada.</p>
          <p className="text-xs text-muted-foreground">Cadastre as fábricas parceiras no painel principal antes de planejar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs min-w-[160px] sticky left-0 bg-card z-10">Fábrica</TableHead>
                <TableHead className="text-xs text-center w-20">Cap./Mês</TableHead>
                {fortnights.map(fn => (
                  <TableHead key={`${fn.year}_${fn.month}_${fn.fortnight}`} className="text-xs text-center min-w-[70px]">
                    {fn.label}
                  </TableHead>
                ))}
                <TableHead className="text-xs text-center w-16 font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {factories.map(factory => {
                const halfCap = Math.floor(factory.capacity_houses_month / 2);
                const rowTotal = fortnights.reduce((s, fn) => {
                  const key = `${factory.id}_${fn.year}_${fn.month}_${fn.fortnight}`;
                  return s + (grid[key]?.planned_houses || 0);
                }, 0);
                return (
                  <TableRow key={factory.id}>
                    <TableCell className="text-xs sticky left-0 bg-card z-10">
                      <div className="font-medium text-foreground">{factory.name}</div>
                      {factory.price_per_house > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {BRL.format(factory.price_per_house)}/casa · {factory.advance_payment_pct}% entrada · {factory.avg_lead_time_days}d lead
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-center text-muted-foreground">
                      {factory.capacity_houses_month > 0 ? factory.capacity_houses_month : "—"}
                    </TableCell>
                    {fortnights.map(fn => {
                      const key = `${factory.id}_${fn.year}_${fn.month}_${fn.fortnight}`;
                      const cell = grid[key];
                      const planned = cell?.planned_houses || 0;
                      const actual = cell?.actual_houses || 0;
                      const isOver = halfCap > 0 && planned > halfCap;

                      let cellClass = "text-muted-foreground/40 hover:bg-accent cursor-pointer";
                      let content: React.ReactNode = canEdit ? <span className="text-[10px]">+</span> : "—";

                      if (planned > 0) {
                        if (actual >= planned) {
                          cellClass = "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/50 cursor-pointer";
                          content = <>{actual}/{planned}</>;
                        } else if (actual > 0) {
                          cellClass = "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer";
                          content = <>{actual}/{planned}</>;
                        } else {
                          cellClass = isOver
                            ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 font-semibold hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer"
                            : "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-semibold hover:bg-blue-100 dark:hover:bg-blue-950/50 cursor-pointer";
                          content = <>{planned}</>;
                        }
                      }

                      return (
                        <TableCell
                          key={`${fn.year}_${fn.month}_${fn.fortnight}`}
                          className={`text-xs text-center p-1 transition-colors ${cellClass}`}
                          onClick={() => canEdit && openCell(factory, fn)}
                        >
                          <div className="min-w-[40px]">
                            {content}
                            {isOver && planned > 0 && <div className="text-[8px] text-red-500">⚠️</div>}
                          </div>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-xs text-center font-bold">
                      {rowTotal > 0 ? rowTotal : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell className="text-xs sticky left-0 bg-muted/30 z-10">TOTAL</TableCell>
                <TableCell className="text-xs text-center">
                  {factories.reduce((s, f) => s + f.capacity_houses_month, 0)}
                </TableCell>
                {fortnights.map(fn => {
                  const col = colTotals[`${fn.year}_${fn.month}_${fn.fortnight}`] || { planned: 0, actual: 0 };
                  return (
                    <TableCell key={`${fn.year}_${fn.month}_${fn.fortnight}`} className="text-xs text-center">
                      {col.planned > 0 ? (
                        <span className={col.actual >= col.planned ? "text-emerald-600" : "text-blue-600"}>
                          {col.actual > 0 ? `${col.actual}/` : ""}{col.planned}
                        </span>
                      ) : "—"}
                    </TableCell>
                  );
                })}
                <TableCell className="text-xs text-center font-bold">{grandTotal || "—"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 inline-block" /> Planejado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 inline-block" /> Em produção (parcial)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 inline-block" /> Realizado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 inline-block" /> Acima da capacidade</span>
        {canEdit && <span className="italic">Clique em qualquer célula para planejar</span>}
      </div>

      {/* Dialog de edição de célula */}
      <Dialog open={!!cellDialog} onOpenChange={v => !v && setCellDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{cellDialog?.factoryName} — {cellDialog?.label}</DialogTitle>
          </DialogHeader>
          {cellDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Cap. da quinzena</p>
                  <p className="text-sm font-bold">{cellDialog.capacity > 0 ? `${cellDialog.capacity} casas` : "Não definida"}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Já realizado</p>
                  <p className="text-sm font-bold">{cellDialog.current.actual_houses} casas</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Casas planejadas para esta quinzena</Label>
                <Input
                  type="number" min={0} value={cellInput}
                  onChange={e => setCellInput(parseInt(e.target.value) || 0)}
                  className="h-9 text-sm"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && saveCell()}
                />
                {cellDialog.capacity > 0 && cellInput > cellDialog.capacity && (
                  <p className="text-[10px] text-red-500">
                    ⚠️ Acima da capacidade da quinzena ({cellDialog.capacity} casas)
                  </p>
                )}
                {cellInput === 0 && <p className="text-[10px] text-muted-foreground">Digite 0 para limpar a célula</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCellDialog(null)}>Cancelar</Button>
            <Button size="sm" onClick={saveCell}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
