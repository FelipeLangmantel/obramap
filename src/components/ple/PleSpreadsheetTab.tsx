import { useMemo, useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronsUpDown } from "lucide-react";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface Props extends PleDataReturn {
  selectedMeasurement: PleMeasurement | null;
}

export function PleSpreadsheetTab({ groups, events, measurements, entries, currentProject, selectedMeasurement }: Props) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCur = (v: number) => `R$ ${fmt(v)}`;
  const fmtCurCompact = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 10_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
    return fmtCur(v);
  };

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups.map(g => g.id)));
  const allExpanded = useMemo(() => groups.length > 0 && groups.every(g => expandedGroups.has(g.id)), [groups, expandedGroups]);
  const toggleAll = () => setExpandedGroups(allExpanded ? new Set() : new Set(groups.map(g => g.id)));
  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substages = useMemo(() => groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);

  const rows = useMemo(() => {
    return events.map(event => {
      const valorPorCasa = event.quantity * event.unit_value;
      const totalContrato = valorPorCasa * (currentProject?.total_houses || 1);

      let qtdMed = 0;
      if (selectedMeasurement) {
        qtdMed = entries.filter(e => e.event_id === event.id && e.measurement_id === selectedMeasurement.id).length;
      } else {
        qtdMed = entries.filter(e => e.event_id === event.id).length;
      }
      const valorMed = qtdMed * valorPorCasa;
      const pctItem = totalContrato > 0 ? (valorMed / totalContrato) * 100 : 0;

      let qtdAcum = entries.filter(e => e.event_id === event.id).length;
      if (selectedMeasurement) {
        const measurementsUpTo = measurements.filter(m => m.measurement_number <= selectedMeasurement.measurement_number);
        const measurementIds = new Set(measurementsUpTo.map(m => m.id));
        qtdAcum = entries.filter(e => e.event_id === event.id && measurementIds.has(e.measurement_id)).length;
      }
      const valorAcum = qtdAcum * valorPorCasa;
      const pctAcum = totalContrato > 0 ? (valorAcum / totalContrato) * 100 : 0;
      const saldo = totalContrato - valorAcum;

      return { event, valorPorCasa, totalContrato, qtdMed, valorMed, pctItem, qtdAcum, valorAcum, pctAcum, saldo };
    });
  }, [events, entries, measurements, selectedMeasurement, currentProject]);

  const groupedRows = useMemo(() => {
    const result: { type: "stage" | "substage" | "item"; stage?: typeof stages[0]; substage?: typeof substages[0]; row?: typeof rows[0] }[] = [];
    stages.forEach(stage => {
      result.push({ type: "stage", stage });
      if (!expandedGroups.has(stage.id)) return;
      const subs = substages.filter(s => s.parent_id === stage.id);
      subs.forEach(sub => {
        result.push({ type: "substage", substage: sub });
        if (!expandedGroups.has(sub.id)) return;
        const subRows = rows.filter(r => r.event.group_id === sub.id).sort((a, b) => a.event.display_order - b.event.display_order);
        subRows.forEach(row => result.push({ type: "item", row }));
      });
    });
    const orphanRows = rows.filter(r => !r.event.group_id || !groups.find(g => g.id === r.event.group_id));
    orphanRows.forEach(row => result.push({ type: "item", row }));
    return result;
  }, [rows, stages, substages, groups, expandedGroups]);

  const totalContrato = rows.reduce((sum, r) => sum + r.totalContrato, 0);
  const totalMedido = rows.reduce((sum, r) => sum + r.valorMed, 0);
  const totalAcum = rows.reduce((sum, r) => sum + r.valorAcum, 0);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum serviço cadastrado. Use a aba "Orçamento" para adicionar etapas e serviços.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border border-border rounded-lg overflow-hidden h-full flex flex-col bg-card">
        {/* Project info header */}
        {currentProject && (
          <div className="bg-muted/50 px-2 sm:px-4 py-1.5 sm:py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-6 border-b border-border text-[9px] sm:text-xs">
            <div className="min-w-0">
              <span className="text-muted-foreground font-medium uppercase tracking-wider text-[8px] sm:text-[10px]">MUNICÍPIO</span>
              <div className="font-bold text-foreground mt-0.5 text-[10px] sm:text-xs truncate">{currentProject.location || "—"}</div>
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground font-medium uppercase tracking-wider text-[8px] sm:text-[10px]">OBRA</span>
              <div className="font-bold text-foreground mt-0.5 text-[10px] sm:text-xs truncate">{currentProject.name}</div>
            </div>
            <div>
              <span className="text-muted-foreground font-medium uppercase tracking-wider text-[8px] sm:text-[10px]">Nº MEDIÇÃO</span>
              <div className="font-extrabold text-primary text-sm sm:text-lg mt-0.5">{selectedMeasurement?.measurement_number || "Todas"}</div>
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground font-medium uppercase tracking-wider text-[8px] sm:text-[10px]">PERÍODO</span>
              <div className="font-bold text-foreground mt-0.5 text-[10px] sm:text-xs truncate">{selectedMeasurement?.period_label || "—"}</div>
            </div>
          </div>
        )}

        {/* Expand/Collapse */}
        <div className="px-2 sm:px-4 py-1 sm:py-1.5 border-b border-border flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1 text-[9px] sm:text-xs h-6 sm:h-7 px-2">
            <ChevronsUpDown className="h-3 w-3" /> {allExpanded ? "Recolher" : "Expandir"}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="min-w-[600px] lg:min-w-[900px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/80 text-[8px] sm:text-[10px] uppercase tracking-wide border-b-2 border-border">
                  <TableHead className="w-[50px] sm:w-14 font-extrabold text-foreground px-1 sm:px-2">ITEM</TableHead>
                  <TableHead className="font-extrabold text-foreground min-w-[100px] sm:min-w-[180px] px-1 sm:px-2">DESCRIÇÃO</TableHead>
                  <TableHead className="w-8 sm:w-12 font-extrabold text-foreground text-center px-0.5 sm:px-2">UN</TableHead>
                  <TableHead className="w-10 sm:w-14 font-extrabold text-foreground text-right px-0.5 sm:px-2">QTDE</TableHead>
                  <TableHead className="w-14 sm:w-20 font-extrabold text-foreground text-right px-0.5 sm:px-2">UNIT.</TableHead>
                  <TableHead className="w-16 sm:w-24 font-extrabold text-foreground text-right px-0.5 sm:px-2 hidden md:table-cell">TOTAL</TableHead>
                  <TableHead className="w-10 sm:w-16 font-extrabold text-right text-emerald-600 dark:text-emerald-400 px-0.5 sm:px-2">MED</TableHead>
                  <TableHead className="w-14 sm:w-24 font-extrabold text-right text-emerald-600 dark:text-emerald-400 px-0.5 sm:px-2">V.MED</TableHead>
                  <TableHead className="w-8 sm:w-14 font-extrabold text-right text-amber-600 dark:text-amber-400 px-0.5 sm:px-2 hidden lg:table-cell">%</TableHead>
                  <TableHead className="w-8 sm:w-14 font-extrabold text-right text-amber-600 dark:text-amber-400 px-0.5 sm:px-2 hidden lg:table-cell">AC%</TableHead>
                  <TableHead className="w-16 sm:w-24 font-extrabold text-right text-sky-600 dark:text-sky-400 px-0.5 sm:px-2 hidden md:table-cell">SALDO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRows.map((item) => {
                  if (item.type === "stage" && item.stage) {
                    const isExp = expandedGroups.has(item.stage.id);
                    return (
                      <TableRow key={`s-${item.stage.id}`} className="bg-primary/10 border-t-2 border-primary/40 cursor-pointer hover:bg-primary/15" onClick={() => toggleGroup(item.stage!.id)}>
                        <TableCell colSpan={11} className="font-black text-[9px] sm:text-xs text-primary py-1 sm:py-2 tracking-wide uppercase px-1 sm:px-2">
                          {isExp ? "▾" : "▸"} {item.stage.code} – {item.stage.name.toUpperCase()}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (item.type === "substage" && item.substage) {
                    const isExp = expandedGroups.has(item.substage.id);
                    return (
                      <TableRow key={`sub-${item.substage.id}`} className="bg-muted/40 border-t border-border cursor-pointer hover:bg-muted/60" onClick={() => toggleGroup(item.substage!.id)}>
                        <TableCell colSpan={11} className="font-bold text-[9px] sm:text-[11px] text-foreground/80 py-1 pl-3 sm:pl-6">
                          {isExp ? "▾" : "▸"} {item.substage.code} – {item.substage.name}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (item.type === "item" && item.row) {
                    const r = item.row;
                    return (
                      <TableRow key={r.event.id} className="text-[9px] sm:text-[11px] hover:bg-muted/30 border-b border-border/50">
                        <TableCell className="font-mono font-semibold pl-4 sm:pl-8 text-foreground px-1 sm:px-2 whitespace-nowrap">{r.event.item_code}</TableCell>
                        <TableCell className="px-1 sm:px-2 min-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate max-w-[100px] sm:max-w-[180px] lg:max-w-xs text-foreground cursor-default">{r.event.description}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px] text-xs">
                              {r.event.description}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground px-0.5 sm:px-2">{r.event.unit}</TableCell>
                        <TableCell className="text-right font-mono text-foreground px-0.5 sm:px-2">{fmt(r.event.quantity)}</TableCell>
                        <TableCell className="text-right font-mono text-foreground px-0.5 sm:px-2 whitespace-nowrap">
                          <span className="hidden sm:inline">{fmtCur(r.event.unit_value)}</span>
                          <span className="sm:hidden">{fmtCurCompact(r.event.unit_value)}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-foreground px-0.5 sm:px-2 whitespace-nowrap hidden md:table-cell">{fmtCur(r.valorPorCasa)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 px-0.5 sm:px-2">
                          {r.qtdMed > 0 ? fmt(r.qtdMed) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 px-0.5 sm:px-2 whitespace-nowrap">
                          {r.qtdMed > 0 ? (
                            <>
                              <span className="hidden sm:inline">{fmtCur(r.valorMed)}</span>
                              <span className="sm:hidden">{fmtCurCompact(r.valorMed)}</span>
                            </>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-0.5 sm:px-2 hidden lg:table-cell">
                          {r.pctItem > 0 ? `${r.pctItem.toFixed(0)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-0.5 sm:px-2 hidden lg:table-cell">
                          {r.pctAcum > 0 ? `${r.pctAcum.toFixed(0)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-sky-600 dark:text-sky-400 px-0.5 sm:px-2 whitespace-nowrap hidden md:table-cell">
                          {fmtCur(r.saldo)}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return null;
                })}
                <TableRow className="bg-muted/80 font-extrabold text-[9px] sm:text-xs border-t-2 border-border">
                  <TableCell colSpan={5} className="text-right text-foreground uppercase tracking-wide px-1 sm:px-2">TOTAIS:</TableCell>
                  <TableCell className="text-right font-mono text-foreground px-0.5 sm:px-2 hidden md:table-cell">{fmtCur(totalContrato)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 px-0.5 sm:px-2">—</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 px-0.5 sm:px-2 whitespace-nowrap">
                    <span className="hidden sm:inline">{fmtCur(totalMedido)}</span>
                    <span className="sm:hidden">{fmtCurCompact(totalMedido)}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-0.5 sm:px-2 hidden lg:table-cell">{totalContrato > 0 ? `${((totalMedido / totalContrato) * 100).toFixed(0)}%` : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-0.5 sm:px-2 hidden lg:table-cell">{totalContrato > 0 ? `${((totalAcum / totalContrato) * 100).toFixed(0)}%` : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sky-600 dark:text-sky-400 px-0.5 sm:px-2 hidden md:table-cell">{fmtCur(totalContrato - totalAcum)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
