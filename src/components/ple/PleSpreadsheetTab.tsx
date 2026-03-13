import { useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface Props extends PleDataReturn {
  selectedMeasurement: PleMeasurement | null;
}

export function PleSpreadsheetTab({ groups, events, measurements, entries, currentProject, selectedMeasurement }: Props) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCur = (v: number) => `R$ ${fmt(v)}`;

  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substages = useMemo(() => groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);

  // Build rows — unit_value is per house, so multiply by number of houses measured
  const rows = useMemo(() => {
    return events.map(event => {
      // Total contract value for this item = quantity * unit_value (represents 1 unit)
      const totalValue = event.quantity * event.unit_value;

      // Count houses measured for this event
      let qtdMed = 0;
      if (selectedMeasurement) {
        qtdMed = entries.filter(e => e.event_id === event.id && e.measurement_id === selectedMeasurement.id).length;
      } else {
        qtdMed = entries.filter(e => e.event_id === event.id).length;
      }
      // Value measured = unit_value * number of houses measured
      const valorMed = qtdMed * event.unit_value;
      const pctItem = totalValue > 0 ? (valorMed / totalValue) * 100 : 0;

      // Accumulated
      let qtdAcum = entries.filter(e => e.event_id === event.id).length;
      if (selectedMeasurement) {
        const measurementsUpTo = measurements.filter(m => m.measurement_number <= selectedMeasurement.measurement_number);
        const measurementIds = new Set(measurementsUpTo.map(m => m.id));
        qtdAcum = entries.filter(e => e.event_id === event.id && measurementIds.has(e.measurement_id)).length;
      }
      const valorAcum = qtdAcum * event.unit_value;
      const pctAcum = totalValue > 0 ? (valorAcum / totalValue) * 100 : 0;
      const saldo = totalValue - valorAcum;

      return { event, totalValue, qtdMed, valorMed, pctItem, qtdAcum, valorAcum, pctAcum, saldo };
    });
  }, [events, entries, measurements, selectedMeasurement]);

  // Build 3-level grouped structure
  const groupedRows = useMemo(() => {
    const result: { type: "stage" | "substage" | "item"; stage?: typeof stages[0]; substage?: typeof substages[0]; row?: typeof rows[0] }[] = [];
    stages.forEach(stage => {
      result.push({ type: "stage", stage });
      const subs = substages.filter(s => s.parent_id === stage.id);
      subs.forEach(sub => {
        result.push({ type: "substage", substage: sub });
        const subRows = rows.filter(r => r.event.group_id === sub.id).sort((a, b) => a.event.display_order - b.event.display_order);
        subRows.forEach(row => result.push({ type: "item", row }));
      });
    });
    const orphanRows = rows.filter(r => !r.event.group_id || !groups.find(g => g.id === r.event.group_id));
    orphanRows.forEach(row => result.push({ type: "item", row }));
    return result;
  }, [rows, stages, substages, groups]);

  const totalContrato = rows.reduce((sum, r) => sum + r.totalValue, 0);
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
    <div className="border rounded-lg overflow-hidden h-full flex flex-col">
      {currentProject && (
        <div className="bg-accent/30 px-4 py-2 text-xs grid grid-cols-4 gap-4 border-b">
          <div><span className="text-muted-foreground">MUNICÍPIO:</span><br /><span className="font-semibold">{currentProject.location || "—"}</span></div>
          <div><span className="text-muted-foreground">OBRA:</span><br /><span className="font-semibold">{currentProject.name}</span></div>
          <div><span className="text-muted-foreground">NÚMERO DA MEDIÇÃO:</span><br /><span className="font-bold text-primary text-lg">{selectedMeasurement?.measurement_number || "Todas"}</span></div>
          <div><span className="text-muted-foreground">PERÍODO DA MEDIÇÃO:</span><br /><span className="font-semibold">{selectedMeasurement?.period_label || "—"}</span></div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-accent/50 text-[11px]">
              <TableHead className="w-16 font-bold">ITEM</TableHead>
              <TableHead className="w-24 font-bold">DISCRIMINAÇÃO</TableHead>
              <TableHead className="w-20 font-bold">CÓD. SINAPI</TableHead>
              <TableHead className="font-bold">DESCRIÇÃO SINAPI</TableHead>
              <TableHead className="w-12 font-bold text-center">UNID</TableHead>
              <TableHead className="w-16 font-bold text-right">QTDE</TableHead>
              <TableHead className="w-20 font-bold text-right">UNIT. (R$)</TableHead>
              <TableHead className="w-24 font-bold text-right">TOTAL (R$)</TableHead>
              <TableHead className="w-16 font-bold text-right text-green-500">QTD MED</TableHead>
              <TableHead className="w-24 font-bold text-right text-green-500">VALOR MED</TableHead>
              <TableHead className="w-16 font-bold text-right text-amber-500">% ITEM</TableHead>
              <TableHead className="w-16 font-bold text-right text-amber-500">% ACUM</TableHead>
              <TableHead className="w-24 font-bold text-right text-blue-500">SALDO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedRows.map((item) => {
              if (item.type === "stage" && item.stage) {
                return (
                  <TableRow key={`s-${item.stage.id}`} className="bg-primary/15 border-t-2 border-primary/30">
                    <TableCell colSpan={13} className="font-extrabold text-xs text-primary py-2 tracking-wide">
                      {item.stage.code} – {item.stage.name.toUpperCase()}
                    </TableCell>
                  </TableRow>
                );
              }
              if (item.type === "substage" && item.substage) {
                return (
                  <TableRow key={`sub-${item.substage.id}`} className="bg-accent/40 border-t border-accent">
                    <TableCell colSpan={13} className="font-bold text-[11px] text-foreground py-1.5 pl-6">
                      {item.substage.code} – {item.substage.name}
                    </TableCell>
                  </TableRow>
                );
              }
              if (item.type === "item" && item.row) {
                const r = item.row;
                return (
                  <TableRow key={r.event.id} className="text-[11px] hover:bg-accent/20">
                    <TableCell className="font-mono pl-8">{r.event.item_code}</TableCell>
                    <TableCell className="text-muted-foreground">{r.event.discrimination || "—"}</TableCell>
                    <TableCell className="font-mono">{r.event.sinapi_code || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.event.description}</TableCell>
                    <TableCell className="text-center">{r.event.unit}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.event.quantity)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCur(r.event.unit_value)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCur(r.totalValue)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-green-500">{r.qtdMed > 0 ? r.qtdMed : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-green-500">{r.qtdMed > 0 ? fmtCur(r.valorMed) : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-amber-500">{r.pctItem > 0 ? `${r.pctItem.toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-amber-500">{r.pctAcum > 0 ? `${r.pctAcum.toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-blue-500">{fmtCur(r.saldo)}</TableCell>
                  </TableRow>
                );
              }
              return null;
            })}
            <TableRow className="bg-accent/50 font-bold text-xs border-t-2">
              <TableCell colSpan={7} className="text-right">TOTAIS:</TableCell>
              <TableCell className="text-right font-mono">{fmtCur(totalContrato)}</TableCell>
              <TableCell className="text-right font-mono text-green-500">—</TableCell>
              <TableCell className="text-right font-mono text-green-500">{fmtCur(totalMedido)}</TableCell>
              <TableCell className="text-right font-mono text-amber-500">{totalContrato > 0 ? `${((totalMedido / totalContrato) * 100).toFixed(1)}%` : "—"}</TableCell>
              <TableCell className="text-right font-mono text-amber-500">{totalContrato > 0 ? `${((totalAcum / totalContrato) * 100).toFixed(1)}%` : "—"}</TableCell>
              <TableCell className="text-right font-mono text-blue-500">{fmtCur(totalContrato - totalAcum)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
