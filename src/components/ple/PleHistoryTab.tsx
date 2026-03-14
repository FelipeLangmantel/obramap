import { useMemo, useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Undo2, ShieldCheck } from "lucide-react";
import { PleAuditDialog } from "./PleAuditDialog";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

export function PleHistoryTab({ measurements, entries, events, groups, currentProject, approveMeasurement, undoMeasurementApproval, glosses, toggleGloss }: PleDataReturn) {
  const contractValue = currentProject?.contract_value || 0;
  const totalHouses = currentProject?.total_houses || 1;
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const [detailMeasurement, setDetailMeasurement] = useState<PleMeasurement | null>(null);
  const [auditMeasurement, setAuditMeasurement] = useState<PleMeasurement | null>(null);

  const rows = useMemo(() => {
    let acumMedido = 0;
    return measurements.map(m => {
      let valorMedido = 0;
      const measuredEntries = entries.filter(e => e.measurement_id === m.id);
      const eventHouseCounts: Record<string, number> = {};
      measuredEntries.forEach(entry => {
        eventHouseCounts[entry.event_id] = (eventHouseCounts[entry.event_id] || 0) + 1;
      });
      Object.entries(eventHouseCounts).forEach(([eventId, houseCount]) => {
        const event = events.find(ev => ev.id === eventId);
        if (event) valorMedido += (event.quantity * event.unit_value) * houseCount;
      });

      acumMedido += valorMedido;
      const totalCasas = new Set(measuredEntries.map(e => e.house_number)).size;
      const pctAvanco = contractValue > 0 ? (acumMedido / contractValue) * 100 : 0;
      const glossCount = glosses.filter(g => g.measurement_id === m.id && !g.resolved).length;

      return { measurement: m, valorMedido, pctAvanco, totalCasas, totalServicos: Object.keys(eventHouseCounts).length, glossCount };
    });
  }, [measurements, entries, events, contractValue, glosses]);

  // Detail data for dialog
  const detailData = useMemo(() => {
    if (!detailMeasurement) return null;
    const measEntries = entries.filter(e => e.measurement_id === detailMeasurement.id);
    const stages = groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order);
    const substages = groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order);

    const eventDetails = events.map(ev => {
      const housesMeasured = measEntries.filter(e => e.event_id === ev.id).map(e => e.house_number).sort((a, b) => a - b);
      if (housesMeasured.length === 0) return null;
      const valorPorCasa = ev.quantity * ev.unit_value;
      const valorTotal = valorPorCasa * housesMeasured.length;
      const totalContratoItem = valorPorCasa * totalHouses;
      const pctEvento = totalContratoItem > 0 ? (valorTotal / totalContratoItem) * 100 : 0;
      return { event: ev, housesMeasured, valorTotal, pctEvento, valorPorCasa };
    }).filter(Boolean) as { event: typeof events[0]; housesMeasured: number[]; valorTotal: number; pctEvento: number; valorPorCasa: number }[];

    const totalValor = eventDetails.reduce((s, d) => s + d.valorTotal, 0);
    const totalCasas = new Set(measEntries.map(e => e.house_number)).size;

    const measurementsUpTo = measurements.filter(m => m.measurement_number <= detailMeasurement.measurement_number);
    const measIdsUpTo = new Set(measurementsUpTo.map(m => m.id));
    const acumEntries = entries.filter(e => measIdsUpTo.has(e.measurement_id));
    let acumValor = 0;
    const acumByEvent: Record<string, number> = {};
    acumEntries.forEach(e => { acumByEvent[e.event_id] = (acumByEvent[e.event_id] || 0) + 1; });
    Object.entries(acumByEvent).forEach(([eventId, count]) => {
      const ev = events.find(e => e.id === eventId);
      if (ev) acumValor += (ev.quantity * ev.unit_value) * count;
    });
    const pctAcum = contractValue > 0 ? (acumValor / contractValue) * 100 : 0;

    return { eventDetails, totalValor, totalCasas, acumValor, pctAcum, stages, substages };
  }, [detailMeasurement, entries, events, groups, measurements, contractValue, totalHouses]);

  const getStatusBadge = (status: string, glossCount: number) => {
    if (status === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-700">APROVADA</Badge>;
    if (status === "approved_with_glosses") return <Badge className="bg-amber-600 hover:bg-amber-700">APROVADA C/ GLOSSAS</Badge>;
    if (glossCount > 0) return <Badge className="bg-destructive hover:bg-destructive/90">{glossCount} GLOSSA(S)</Badge>;
    return <Badge className="bg-sky-600 hover:bg-sky-700">PENDENTE</Badge>;
  };

  if (measurements.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhuma medição registrada ainda.
      </div>
    );
  }

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/80 text-xs">
              <TableHead className="w-10 font-bold">#</TableHead>
              <TableHead className="font-bold">MEDIÇÃO</TableHead>
              <TableHead className="font-bold">PERÍODO</TableHead>
              <TableHead className="font-bold">REGISTRADO EM</TableHead>
              <TableHead className="font-bold text-center">CASAS</TableHead>
              <TableHead className="font-bold text-center">SERVIÇOS</TableHead>
              <TableHead className="font-bold text-right">VALOR MEDIDO</TableHead>
              <TableHead className="font-bold text-center">% AVANÇO ACUM.</TableHead>
              <TableHead className="font-bold text-center">STATUS</TableHead>
              <TableHead className="font-bold text-center">AÇÕES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.measurement.id} className="text-xs">
                <TableCell className="font-bold">{r.measurement.measurement_number}</TableCell>
                <TableCell className="font-semibold">Medição {r.measurement.measurement_number}</TableCell>
                <TableCell>{r.measurement.period_label || "—"}</TableCell>
                <TableCell>{new Date(r.measurement.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-center font-mono">{r.totalCasas}</TableCell>
                <TableCell className="text-center font-mono">{r.totalServicos}</TableCell>
                <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(r.valorMedido)}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/30 font-mono">
                    {r.pctAvanco.toFixed(2)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(r.measurement.status, r.glossCount)}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setDetailMeasurement(r.measurement)}>
                      <Eye className="h-3 w-3" /> Ver
                    </Button>
                    {/* Aferir button - opens audit dialog */}
                    {r.measurement.status !== "approved" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => setAuditMeasurement(r.measurement)}
                      >
                        <ShieldCheck className="h-3 w-3" /> Aferir
                      </Button>
                    )}
                    {/* Undo button (temporary for testing) */}
                    {(r.measurement.status === "approved" || r.measurement.status === "approved_with_glosses") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                        onClick={() => undoMeasurementApproval(r.measurement.id)}
                      >
                        <Undo2 className="h-3 w-3" /> Desfazer
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailMeasurement} onOpenChange={() => setDetailMeasurement(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Detalhes – Medição {detailMeasurement?.measurement_number}
              {detailMeasurement?.period_label && (
                <Badge variant="outline" className="font-normal">{detailMeasurement.period_label}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailData && (
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Casas Medidas</div>
                  <div className="text-xl font-bold text-foreground">{detailData.totalCasas}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Valor Medido</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtCur(detailData.totalValor)}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Acumulado</div>
                  <div className="text-lg font-bold text-sky-600 dark:text-sky-400">{fmtCur(detailData.acumValor)}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">% Avanço Acumulado</div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{detailData.pctAcum.toFixed(2)}%</div>
                </div>
              </div>

              <ScrollArea className="flex-1 border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/80 text-[11px]">
                      <TableHead className="font-bold w-16">ITEM</TableHead>
                      <TableHead className="font-bold">DESCRIÇÃO</TableHead>
                      <TableHead className="font-bold text-center w-14">UNID</TableHead>
                      <TableHead className="font-bold text-right w-24">TOTAL/CASA</TableHead>
                      <TableHead className="font-bold text-center w-20">CASAS MED.</TableHead>
                      <TableHead className="font-bold text-right w-24">VALOR MEDIDO</TableHead>
                      <TableHead className="font-bold text-center w-16">% ITEM</TableHead>
                      <TableHead className="font-bold w-40">CASAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailData.eventDetails.map(d => (
                      <TableRow key={d.event.id} className="text-[11px]">
                        <TableCell className="font-mono">{d.event.item_code}</TableCell>
                        <TableCell className="max-w-xs truncate">{d.event.description}</TableCell>
                        <TableCell className="text-center">{d.event.unit}</TableCell>
                        <TableCell className="text-right font-mono">{fmtCur(d.valorPorCasa)}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{d.housesMeasured.length}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(d.valorTotal)}</TableCell>
                        <TableCell className="text-center font-mono text-amber-600 dark:text-amber-400">{d.pctEvento.toFixed(1)}%</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground truncate" title={d.housesMeasured.join(", ")}>
                          {d.housesMeasured.join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/80 font-bold text-[11px] border-t-2">
                      <TableCell colSpan={4} className="text-right">TOTAL:</TableCell>
                      <TableCell className="text-center font-mono">{detailData.totalCasas}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(detailData.totalValor)}</TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Audit Dialog */}
      {auditMeasurement && (
        <PleAuditDialog
          open={!!auditMeasurement}
          onClose={() => setAuditMeasurement(null)}
          measurement={auditMeasurement}
          entries={entries}
          events={events}
          groups={groups}
          glosses={glosses}
          totalHouses={currentProject?.total_houses || 1}
          onToggleGloss={toggleGloss}
          onApproveMeasurement={(id, hasGlosses) => approveMeasurement(id, hasGlosses)}
        />
      )}
    </>
  );
}
