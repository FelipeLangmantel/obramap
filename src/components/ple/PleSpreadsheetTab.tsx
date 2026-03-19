import { useMemo, useState, useEffect } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronsUpDown, Info } from "lucide-react";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface Props extends PleDataReturn {
  selectedMeasurement: PleMeasurement | null;
}

function ColHeader({ label, formula, className }: { label: string; formula: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-0.5 cursor-help ${className || ""}`}>
          {label}
          <Info className="h-2.5 w-2.5 opacity-50" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs font-normal normal-case tracking-normal">
        <p className="font-bold mb-1">{label}</p>
        <p className="text-muted-foreground">{formula}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function PleSpreadsheetTab({ groups, events, measurements, entries, currentProject, selectedMeasurement }: Props) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCur = (v: number) => `R$ ${fmt(v)}`;

  const isIntegrated = currentProject?.mode === "integrated";

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups.map(g => g.id)));

  useEffect(() => {
    setExpandedGroups(new Set(groups.map(g => g.id)));
  }, [selectedMeasurement, groups]);

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
  const totalHouses = currentProject?.total_houses || 1;

  const rows = useMemo(() => {
    return events.map(event => {
      const valorPorCasa = event.quantity * event.unit_value;
      const totalContrato = valorPorCasa * totalHouses;

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
  }, [events, entries, measurements, selectedMeasurement, totalHouses]);

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

  // Extra column count for integrated mode
  const extraCols = isIntegrated ? 2 : 0;
  const totalColSpan = 11 + extraCols;

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum serviço cadastrado. Use a aba "Orçamento" para adicionar etapas e serviços.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="border border-border rounded-lg overflow-hidden h-full flex flex-col bg-card">
        {currentProject && (
          <div className="bg-muted/50 px-3 sm:px-5 py-2 sm:py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-6 border-b border-border">
            <div className="min-w-0">
              <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] sm:text-[11px]">MUNICÍPIO</span>
              <div className="font-bold text-foreground mt-0.5 text-xs sm:text-sm truncate">{currentProject.location || "—"}</div>
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] sm:text-[11px]">OBRA</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="font-bold text-foreground mt-0.5 text-xs sm:text-sm truncate cursor-default">{currentProject.name}</div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">{currentProject.name}</TooltipContent>
              </Tooltip>
            </div>
            <div>
              <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] sm:text-[11px]">Nº MEDIÇÃO</span>
              <div className="font-extrabold text-primary text-lg sm:text-xl mt-0.5">{selectedMeasurement?.measurement_number || "Todas"}</div>
            </div>
            <div className="min-w-0">
              <span className="text-muted-foreground font-semibold uppercase tracking-wider text-[9px] sm:text-[11px]">PERÍODO</span>
              <div className="font-bold text-foreground mt-0.5 text-xs sm:text-sm truncate">{selectedMeasurement?.period_label || "—"}</div>
            </div>
          </div>
        )}

        <div className="px-3 sm:px-4 py-1.5 border-b border-border flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1.5 text-xs h-7 px-2.5">
            <ChevronsUpDown className="h-3 w-3" /> {allExpanded ? "Recolher" : "Expandir"}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {totalHouses} casas · {events.length} itens
          </span>
        </div>

        <ScrollArea className="flex-1">
          <div className="min-w-[700px] lg:min-w-[1100px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/80 text-[10px] sm:text-xs uppercase tracking-wide border-b-2 border-border">
                  <TableHead className="w-14 sm:w-16 font-extrabold text-foreground px-2">
                    <ColHeader label="ITEM" formula="Código do item no orçamento" />
                  </TableHead>
                  <TableHead className="font-extrabold text-foreground min-w-[140px] sm:min-w-[220px] px-2">
                    <ColHeader label="DESCRIÇÃO" formula="Descrição completa do serviço orçamentário" />
                  </TableHead>
                  <TableHead className="w-10 sm:w-14 font-extrabold text-foreground text-center px-1">
                    <ColHeader label="UN" formula="Unidade de medida do serviço (M, M², UN, etc)" className="justify-center" />
                  </TableHead>
                  <TableHead className="w-14 sm:w-16 font-extrabold text-foreground text-right px-1 sm:px-2">
                    <ColHeader label="QTDE" formula="Quantidade do serviço por unidade habitacional conforme orçamento" className="justify-end" />
                  </TableHead>
                  {isIntegrated && (
                    <>
                      <TableHead className="w-20 sm:w-24 font-extrabold text-foreground text-right px-1 sm:px-2">
                        <ColHeader label="MAT UNIT." formula="Valor unitário de Material por unidade do serviço" className="justify-end" />
                      </TableHead>
                      <TableHead className="w-20 sm:w-24 font-extrabold text-foreground text-right px-1 sm:px-2">
                        <ColHeader label="MO UNIT." formula="Valor unitário de Mão de Obra por unidade do serviço" className="justify-end" />
                      </TableHead>
                    </>
                  )}
                  <TableHead className="w-20 sm:w-24 font-extrabold text-foreground text-right px-1 sm:px-2">
                    <ColHeader label="UNIT." formula="Preço unitário do serviço conforme orçamento (R$/unidade)" className="justify-end" />
                  </TableHead>
                  <TableHead className="w-24 sm:w-28 font-extrabold text-foreground text-right px-1 sm:px-2 hidden md:table-cell">
                    <ColHeader label="TOTAL" formula="Valor total do contrato para este item = (Qtde × Preço Unit.) × Nº de Casas" className="justify-end" />
                  </TableHead>
                  <TableHead className="w-12 sm:w-16 font-extrabold text-right text-emerald-600 dark:text-emerald-400 px-1 sm:px-2">
                    <ColHeader label="MED" formula="Quantidade de casas medidas na medição selecionada" className="justify-end" />
                  </TableHead>
                  <TableHead className="w-24 sm:w-28 font-extrabold text-right text-emerald-600 dark:text-emerald-400 px-1 sm:px-2">
                    <ColHeader label="V.MED" formula="Valor medido = Casas Medidas × (Qtde × Preço Unit.)" className="justify-end" />
                  </TableHead>
                  <TableHead className="w-12 sm:w-14 font-extrabold text-right text-amber-600 dark:text-amber-400 px-1 sm:px-2 hidden lg:table-cell">
                    <ColHeader label="%" formula="Percentual da medição atual = (V.Medido ÷ Total) × 100" className="justify-end" />
                  </TableHead>
                  <TableHead className="w-12 sm:w-14 font-extrabold text-right text-amber-600 dark:text-amber-400 px-1 sm:px-2 hidden lg:table-cell">
                    <ColHeader label="AC%" formula="Percentual acumulado até esta medição = (V.Acumulado ÷ Total) × 100" className="justify-end" />
                  </TableHead>
                  <TableHead className="w-24 sm:w-28 font-extrabold text-right text-sky-600 dark:text-sky-400 px-1 sm:px-2 hidden md:table-cell">
                    <ColHeader label="SALDO" formula="Saldo restante = Total - Valor Acumulado" className="justify-end" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRows.map((item) => {
                  if (item.type === "stage" && item.stage) {
                    const isExp = expandedGroups.has(item.stage.id);
                    return (
                      <TableRow key={`s-${item.stage.id}`} className="bg-primary/10 border-t-2 border-primary/40 cursor-pointer hover:bg-primary/15" onClick={() => toggleGroup(item.stage!.id)}>
                        <TableCell colSpan={totalColSpan} className="font-black text-xs sm:text-sm text-primary py-2 sm:py-2.5 tracking-wide uppercase px-2">
                          {isExp ? "▾" : "▸"} {item.stage.code} – {item.stage.name.toUpperCase()}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (item.type === "substage" && item.substage) {
                    const isExp = expandedGroups.has(item.substage.id);
                    return (
                      <TableRow key={`sub-${item.substage.id}`} className="bg-muted/40 border-t border-border cursor-pointer hover:bg-muted/60" onClick={() => toggleGroup(item.substage!.id)}>
                        <TableCell colSpan={totalColSpan} className="font-bold text-[11px] sm:text-xs text-foreground/80 py-1.5 pl-4 sm:pl-6">
                          {isExp ? "▾" : "▸"} {item.substage.code} – {item.substage.name}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (item.type === "item" && item.row) {
                    const r = item.row;
                    return (
                      <TableRow key={r.event.id} className="text-[11px] sm:text-sm hover:bg-muted/30 border-b border-border/50">
                        <TableCell className="font-mono font-semibold pl-5 sm:pl-8 text-foreground px-2 whitespace-nowrap">{r.event.item_code}</TableCell>
                        <TableCell className="px-2 min-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate max-w-[120px] sm:max-w-[220px] lg:max-w-sm text-foreground cursor-default">{r.event.description}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm text-xs">
                              <p className="font-mono text-muted-foreground text-[10px] mb-0.5">{r.event.item_code}</p>
                              <p>{r.event.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground px-1">{r.event.unit}</TableCell>
                        <TableCell className="text-right font-mono text-foreground px-1 sm:px-2">{fmt(r.event.quantity)}</TableCell>
                        {isIntegrated && (
                          <>
                            <TableCell className="text-right font-mono text-muted-foreground px-1 sm:px-2 whitespace-nowrap">{fmtCur(r.event.mat_unit_value || 0)}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground px-1 sm:px-2 whitespace-nowrap">{fmtCur(r.event.mo_unit_value || 0)}</TableCell>
                          </>
                        )}
                        <TableCell className="text-right font-mono text-foreground px-1 sm:px-2 whitespace-nowrap">{fmtCur(r.event.unit_value)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-foreground px-1 sm:px-2 whitespace-nowrap hidden md:table-cell">{fmtCur(r.totalContrato)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 px-1 sm:px-2">
                          {r.qtdMed > 0 ? r.qtdMed : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 px-1 sm:px-2 whitespace-nowrap">
                          {r.qtdMed > 0 ? fmtCur(r.valorMed) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-1 sm:px-2 hidden lg:table-cell">
                          {r.pctItem > 0 ? `${r.pctItem.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-1 sm:px-2 hidden lg:table-cell">
                          {r.pctAcum > 0 ? `${r.pctAcum.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-sky-600 dark:text-sky-400 px-1 sm:px-2 whitespace-nowrap hidden md:table-cell">
                          {fmtCur(r.saldo)}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return null;
                })}
                {/* Totais */}
                <TableRow className="bg-muted/80 font-extrabold text-xs sm:text-sm border-t-2 border-border">
                  <TableCell colSpan={isIntegrated ? 7 : 5} className="text-right text-foreground uppercase tracking-wide px-2">TOTAIS:</TableCell>
                  <TableCell className="text-right font-mono text-foreground px-1 sm:px-2 hidden md:table-cell">{fmtCur(totalContrato)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 px-1 sm:px-2">—</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 px-1 sm:px-2 whitespace-nowrap">{fmtCur(totalMedido)}</TableCell>
                  <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-1 sm:px-2 hidden lg:table-cell">{totalContrato > 0 ? `${((totalMedido / totalContrato) * 100).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400 px-1 sm:px-2 hidden lg:table-cell">{totalContrato > 0 ? `${((totalAcum / totalContrato) * 100).toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sky-600 dark:text-sky-400 px-1 sm:px-2 hidden md:table-cell">{fmtCur(totalContrato - totalAcum)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
