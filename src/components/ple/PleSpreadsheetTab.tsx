import { useMemo, useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
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

  // Build rows — totalValue = quantity * unit_value = value for 1 HOUSE
  // When a house is measured, the full totalValue is received per house
  const rows = useMemo(() => {
    return events.map(event => {
      // Total contract value for this item per house = quantity * unit_value
      const valorPorCasa = event.quantity * event.unit_value;
      // Total contract = valorPorCasa * total_houses
      const totalContrato = valorPorCasa * (currentProject?.total_houses || 1);

      // Count houses measured for this event in selected measurement
      let qtdMed = 0;
      if (selectedMeasurement) {
        qtdMed = entries.filter(e => e.event_id === event.id && e.measurement_id === selectedMeasurement.id).length;
      } else {
        qtdMed = entries.filter(e => e.event_id === event.id).length;
      }
      // Value measured = valorPorCasa * number of houses measured
      const valorMed = qtdMed * valorPorCasa;
      const pctItem = totalContrato > 0 ? (valorMed / totalContrato) * 100 : 0;

      // Accumulated
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

  // Build 3-level grouped structure with expand/collapse
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
  }, [rows, stages, substages, groups]);

  const totalContrato = rows.reduce((sum, r) => sum + r.totalContrato, 0);
  const totalMedido = rows.reduce((sum, r) => sum + r.valorMed, 0);
  const totalAcum = rows.reduce((sum, r) => sum + r.valorAcum, 0);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum serviço cadastrado. Use "Lançamento do Contrato" para adicionar etapas e serviços.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden h-full flex flex-col bg-card">
      {/* Project info header */}
      {currentProject && (
        <div className="bg-muted/50 px-4 py-2.5 grid grid-cols-4 gap-6 border-b border-border text-xs">
          <div>
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">MUNICÍPIO</span>
            <div className="font-bold text-foreground mt-0.5">{currentProject.location || "—"}</div>
          </div>
          <div>
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">OBRA</span>
            <div className="font-bold text-foreground mt-0.5">{currentProject.name}</div>
          </div>
          <div>
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">NÚMERO DA MEDIÇÃO</span>
            <div className="font-extrabold text-primary text-lg mt-0.5">{selectedMeasurement?.measurement_number || "Todas"}</div>
          </div>
          <div>
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">PERÍODO DA MEDIÇÃO</span>
            <div className="font-bold text-foreground mt-0.5">{selectedMeasurement?.period_label || "—"}</div>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/80 text-[10px] uppercase tracking-wide border-b-2 border-border">
              <TableHead className="w-14 font-extrabold text-foreground">ITEM</TableHead>
              <TableHead className="w-24 font-extrabold text-foreground">DISCRIMINAÇÃO</TableHead>
              <TableHead className="w-20 font-extrabold text-foreground">CÓD. SINAPI</TableHead>
              <TableHead className="font-extrabold text-foreground">DESCRIÇÃO SINAPI</TableHead>
              <TableHead className="w-12 font-extrabold text-foreground text-center">UNID</TableHead>
              <TableHead className="w-14 font-extrabold text-foreground text-right">QTDE</TableHead>
              <TableHead className="w-20 font-extrabold text-foreground text-right">UNIT. (R$)</TableHead>
              <TableHead className="w-24 font-extrabold text-foreground text-right">TOTAL (R$)</TableHead>
              <TableHead className="w-16 font-extrabold text-right text-emerald-600 dark:text-emerald-400">QTD MED</TableHead>
              <TableHead className="w-24 font-extrabold text-right text-emerald-600 dark:text-emerald-400">VALOR MED</TableHead>
              <TableHead className="w-14 font-extrabold text-right text-amber-600 dark:text-amber-400">% ITEM</TableHead>
              <TableHead className="w-14 font-extrabold text-right text-amber-600 dark:text-amber-400">% ACUM</TableHead>
              <TableHead className="w-24 font-extrabold text-right text-sky-600 dark:text-sky-400">SALDO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedRows.map((item) => {
              if (item.type === "stage" && item.stage) {
                return (
                  <TableRow key={`s-${item.stage.id}`} className="bg-primary/10 border-t-2 border-primary/40">
                    <TableCell colSpan={13} className="font-black text-xs text-primary py-2 tracking-wide uppercase">
                      {item.stage.code} – {item.stage.name.toUpperCase()}
                    </TableCell>
                  </TableRow>
                );
              }
              if (item.type === "substage" && item.substage) {
                return (
                  <TableRow key={`sub-${item.substage.id}`} className="bg-muted/40 border-t border-border">
                    <TableCell colSpan={13} className="font-bold text-[11px] text-foreground/80 py-1.5 pl-6">
                      {item.substage.code} – {item.substage.name}
                    </TableCell>
                  </TableRow>
                );
              }
              if (item.type === "item" && item.row) {
                const r = item.row;
                return (
                  <TableRow key={r.event.id} className="text-[11px] hover:bg-muted/30 border-b border-border/50">
                    <TableCell className="font-mono font-semibold pl-8 text-foreground">{r.event.item_code}</TableCell>
                    <TableCell className="text-muted-foreground">{r.event.discrimination || "—"}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{r.event.sinapi_code || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-foreground">{r.event.description}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{r.event.unit}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{fmt(r.event.quantity)}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{fmtCur(r.event.unit_value)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-foreground">{fmtCur(r.valorPorCasa)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {r.qtdMed > 0 ? fmt(r.qtdMed) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {r.qtdMed > 0 ? fmtCur(r.valorMed) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                      {r.pctItem > 0 ? `${r.pctItem.toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                      {r.pctAcum > 0 ? `${r.pctAcum.toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sky-600 dark:text-sky-400">
                      {fmtCur(r.saldo)}
                    </TableCell>
                  </TableRow>
                );
              }
              return null;
            })}
            <TableRow className="bg-muted/80 font-extrabold text-xs border-t-2 border-border">
              <TableCell colSpan={7} className="text-right text-foreground uppercase tracking-wide">TOTAIS:</TableCell>
              <TableCell className="text-right font-mono text-foreground">{fmtCur(totalContrato)}</TableCell>
              <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">—</TableCell>
              <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(totalMedido)}</TableCell>
              <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{totalContrato > 0 ? `${((totalMedido / totalContrato) * 100).toFixed(1)}%` : "—"}</TableCell>
              <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">{totalContrato > 0 ? `${((totalAcum / totalContrato) * 100).toFixed(1)}%` : "—"}</TableCell>
              <TableCell className="text-right font-mono text-sky-600 dark:text-sky-400">{fmtCur(totalContrato - totalAcum)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
