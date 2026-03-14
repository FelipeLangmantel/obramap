import { useMemo, useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye, Undo2, ShieldCheck, Clock, User, FileText, AlertTriangle } from "lucide-react";
import { PleAuditDialog } from "./PleAuditDialog";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

export function PleHistoryTab({ measurements, entries, events, groups, currentProject, approveMeasurement, undoMeasurementApproval, glosses, toggleGloss, auditLogs }: PleDataReturn) {
  const contractValue = currentProject?.contract_value || 0;
  const totalHouses = currentProject?.total_houses || 1;
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");
  const fmtDateTime = (d: string) => new Date(d).toLocaleString("pt-BR");

  const [detailMeasurement, setDetailMeasurement] = useState<PleMeasurement | null>(null);
  const [auditMeasurement, setAuditMeasurement] = useState<PleMeasurement | null>(null);
  const [historySubTab, setHistorySubTab] = useState("measurements");

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

      return { measurement: m, valorMedido, acumMedido, pctAvanco, totalCasas, totalServicos: Object.keys(eventHouseCounts).length, glossCount };
    });
  }, [measurements, entries, events, contractValue, glosses]);

  const detailData = useMemo(() => {
    if (!detailMeasurement) return null;
    const measEntries = entries.filter(e => e.measurement_id === detailMeasurement.id);
    const measGlosses = glosses.filter(g => g.measurement_id === detailMeasurement.id);

    const eventDetails = events.map(ev => {
      const housesMeasured = measEntries.filter(e => e.event_id === ev.id).map(e => e.house_number).sort((a, b) => a - b);
      if (housesMeasured.length === 0) return null;
      const valorPorCasa = ev.quantity * ev.unit_value;
      const valorTotal = valorPorCasa * housesMeasured.length;
      const totalContratoItem = valorPorCasa * totalHouses;
      const pctEvento = totalContratoItem > 0 ? (valorTotal / totalContratoItem) * 100 : 0;
      const eventGlosses = measGlosses.filter(g => g.event_id === ev.id);
      return { event: ev, housesMeasured, valorTotal, pctEvento, valorPorCasa, glossCount: eventGlosses.length };
    }).filter(Boolean) as any[];

    const totalValor = eventDetails.reduce((s: number, d: any) => s + d.valorTotal, 0);
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

    // Entries with user info for this measurement
    const entryDetails = measEntries.map(e => {
      const ev = events.find(ev => ev.id === e.event_id);
      return { ...e, eventDescription: ev?.description || "", eventCode: ev?.item_code || "" };
    });

    return { eventDetails, totalValor, totalCasas, acumValor, pctAcum, entryDetails, glossCount: measGlosses.length };
  }, [detailMeasurement, entries, events, measurements, contractValue, totalHouses, glosses]);

  // Audit logs for current measurement detail
  const measurementAuditLogs = useMemo(() => {
    if (!detailMeasurement) return [];
    return (auditLogs || []).filter(l => l.measurement_id === detailMeasurement.id);
  }, [detailMeasurement, auditLogs]);

  const getStatusBadge = (status: string, glossCount: number) => {
    if (status === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] sm:text-xs">APROVADA</Badge>;
    if (status === "approved_with_glosses") return <Badge className="bg-amber-600 hover:bg-amber-700 text-[10px] sm:text-xs">C/ GLOSSAS</Badge>;
    if (glossCount > 0) return <Badge className="bg-destructive hover:bg-destructive/90 text-[10px] sm:text-xs">{glossCount} GLOSSA(S)</Badge>;
    return <Badge className="bg-sky-600 hover:bg-sky-700 text-[10px] sm:text-xs">PENDENTE</Badge>;
  };

  const getActionLabel = (action: string) => {
    const map: Record<string, string> = {
      measurement_created: "Medição criada",
      measurement_approved: "Medição aprovada",
      measurement_undo_approval: "Aprovação desfeita",
      gloss_added: "Glossa adicionada",
      gloss_removed: "Glossa removida",
      entry_created: "Lançamento",
      entry_deleted: "Lançamento removido",
    };
    return map[action] || action;
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
      <Tabs value={historySubTab} onValueChange={setHistorySubTab} className="h-full flex flex-col">
        <TabsList className="w-fit mb-2">
          <TabsTrigger value="measurements" className="text-[10px] sm:text-xs gap-1">
            <FileText className="h-3 w-3" /> Medições
          </TabsTrigger>
          <TabsTrigger value="auditlog" className="text-[10px] sm:text-xs gap-1">
            <Clock className="h-3 w-3" /> Log de Auditoria
          </TabsTrigger>
        </TabsList>

        {/* Measurements sub-tab */}
        <TabsContent value="measurements" className="flex-1 min-h-0">
          {/* Mobile card layout */}
          <div className="sm:hidden space-y-3">
            {rows.map(r => (
              <div key={r.measurement.id} className="border border-border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-sm">Medição {r.measurement.measurement_number}</span>
                  {getStatusBadge(r.measurement.status, r.glossCount)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {r.measurement.period_label || "—"} 
                  {r.measurement.start_date && ` • ${fmtDate(r.measurement.start_date)} a ${fmtDate(r.measurement.end_date || r.measurement.start_date)}`}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{(r.measurement as any).registered_by_name || "—"}</span>
                  <Clock className="h-3 w-3 ml-1" />
                  <span>{fmtDateTime(r.measurement.created_at)}</span>
                </div>
                {(r.measurement as any).approved_by_name && (
                  <div className="flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Aprovado por {(r.measurement as any).approved_by_name}</span>
                    {(r.measurement as any).approved_at && <span>em {fmtDateTime((r.measurement as any).approved_at)}</span>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Casas:</span> <span className="font-mono font-bold">{r.totalCasas}</span></div>
                  <div><span className="text-muted-foreground">Serviços:</span> <span className="font-mono font-bold">{r.totalServicos}</span></div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Valor:</span>{" "}
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmtCur(r.valorMedido)}</span>
                  </div>
                  <div><span className="text-muted-foreground">Acumulado:</span> <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{fmtCur(r.acumMedido)}</span></div>
                  <div>
                    <span className="text-muted-foreground">Avanço:</span>{" "}
                    <Badge variant="outline" className="font-mono text-amber-600 border-amber-500/30 text-[10px]">{r.pctAvanco.toFixed(2)}%</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 flex-1" onClick={() => setDetailMeasurement(r.measurement)}>
                    <Eye className="h-3 w-3" /> Ver
                  </Button>
                  {r.measurement.status !== "approved" && (
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 flex-1 border-primary/30 text-primary" onClick={() => setAuditMeasurement(r.measurement)}>
                      <ShieldCheck className="h-3 w-3" /> Aferir
                    </Button>
                  )}
                  {(r.measurement.status === "approved" || r.measurement.status === "approved_with_glosses") && (
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-amber-500/30 text-amber-600" onClick={() => undoMeasurementApproval(r.measurement.id)}>
                      <Undo2 className="h-3 w-3" /> Desfazer
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block border border-border rounded-lg overflow-hidden">
            <ScrollArea className="max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80 text-xs">
                    <TableHead className="w-10 font-bold">#</TableHead>
                    <TableHead className="font-bold">PERÍODO</TableHead>
                    <TableHead className="font-bold">DATAS</TableHead>
                    <TableHead className="font-bold">REGISTRADO POR</TableHead>
                    <TableHead className="font-bold">DATA/HORA</TableHead>
                    <TableHead className="font-bold text-center">CASAS</TableHead>
                    <TableHead className="font-bold text-right">VALOR MEDIDO</TableHead>
                    <TableHead className="font-bold text-right">ACUMULADO</TableHead>
                    <TableHead className="font-bold text-center">% AVANÇO</TableHead>
                    <TableHead className="font-bold text-center">STATUS</TableHead>
                    <TableHead className="font-bold text-center">AÇÕES</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.measurement.id} className="text-xs">
                      <TableCell className="font-bold">{r.measurement.measurement_number}</TableCell>
                      <TableCell>{r.measurement.period_label || "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {r.measurement.start_date ? `${fmtDate(r.measurement.start_date)} – ${fmtDate(r.measurement.end_date || r.measurement.start_date)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span>{(r.measurement as any).registered_by_name || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.measurement.created_at)}</TableCell>
                      <TableCell className="text-center font-mono">{r.totalCasas}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(r.valorMedido)}</TableCell>
                      <TableCell className="text-right font-mono text-sky-600 dark:text-sky-400">{fmtCur(r.acumMedido)}</TableCell>
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
                          {r.measurement.status !== "approved" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10" onClick={() => setAuditMeasurement(r.measurement)}>
                              <ShieldCheck className="h-3 w-3" /> Aferir
                            </Button>
                          )}
                          {(r.measurement.status === "approved" || r.measurement.status === "approved_with_glosses") && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10" onClick={() => undoMeasurementApproval(r.measurement.id)}>
                              <Undo2 className="h-3 w-3" /> Desfazer
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* Audit Log sub-tab */}
        <TabsContent value="auditlog" className="flex-1 min-h-0">
          <ScrollArea className="h-full max-h-[65vh]">
            {(!auditLogs || auditLogs.length === 0) ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Nenhum registro de auditoria encontrado.
              </div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map(log => {
                  const meas = measurements.find(m => m.id === log.measurement_id);
                  return (
                    <div key={log.id} className="border border-border rounded-lg p-2.5 sm:p-3 bg-card flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-1.5 rounded bg-muted shrink-0">
                          {log.action.includes("gloss") ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> :
                           log.action.includes("approved") ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> :
                           <FileText className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground">{getActionLabel(log.action)}</div>
                          {meas && <span className="text-[10px] text-muted-foreground">Medição {meas.measurement_number}</span>}
                          {log.details?.house_number && (
                            <span className="text-[10px] text-muted-foreground ml-2">Casa {log.details.house_number}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {log.performed_by_name || "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {fmtDateTime(log.performed_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!detailMeasurement} onOpenChange={() => setDetailMeasurement(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 sm:gap-3 flex-wrap text-sm sm:text-base">
              Detalhes – Medição {detailMeasurement?.measurement_number}
              {detailMeasurement?.period_label && (
                <Badge variant="outline" className="font-normal text-[10px] sm:text-xs">{detailMeasurement.period_label}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailMeasurement && detailData && (
            <div className="flex flex-col gap-3 sm:gap-4 flex-1 min-h-0">
              {/* Period & Registration Info */}
              <div className="bg-muted/30 rounded-lg p-3 border border-border space-y-1.5 text-xs">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <strong>Período:</strong> {detailMeasurement.start_date ? `${fmtDate(detailMeasurement.start_date)} a ${fmtDate(detailMeasurement.end_date || detailMeasurement.start_date)}` : "—"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <strong>Criado por:</strong> {(detailMeasurement as any).registered_by_name || "—"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <strong>Em:</strong> {fmtDateTime(detailMeasurement.created_at)}
                  </span>
                </div>
                {(detailMeasurement as any).approved_by_name && (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <strong>Aprovado por:</strong> {(detailMeasurement as any).approved_by_name}
                    {(detailMeasurement as any).approved_at && <span className="ml-1">em {fmtDateTime((detailMeasurement as any).approved_at)}</span>}
                  </div>
                )}
                {detailData.glossCount > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <strong>{detailData.glossCount} glossa(s)</strong> registradas nesta medição
                  </div>
                )}
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border border-border">
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">Casas Medidas</div>
                  <div className="text-lg sm:text-xl font-bold text-foreground">{detailData.totalCasas}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border border-border">
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">Valor Medido</div>
                  <div className="text-sm sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtCur(detailData.totalValor)}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border border-border">
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">Acumulado</div>
                  <div className="text-sm sm:text-lg font-bold text-sky-600 dark:text-sky-400">{fmtCur(detailData.acumValor)}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border border-border">
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">% Avanço</div>
                  <div className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400">{detailData.pctAcum.toFixed(2)}%</div>
                </div>
              </div>

              {/* Detail tabs: Services + Audit log */}
              <Tabs defaultValue="services" className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-fit">
                  <TabsTrigger value="services" className="text-[10px] sm:text-xs">Serviços Medidos</TabsTrigger>
                  <TabsTrigger value="timeline" className="text-[10px] sm:text-xs">Linha do Tempo</TabsTrigger>
                </TabsList>

                <TabsContent value="services" className="flex-1 min-h-0 mt-2">
                  <ScrollArea className="h-full max-h-[35vh] border border-border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/80 text-[10px] sm:text-[11px]">
                          <TableHead className="font-bold w-14 sm:w-16">ITEM</TableHead>
                          <TableHead className="font-bold">DESCRIÇÃO</TableHead>
                          <TableHead className="font-bold text-right w-20 sm:w-24">TOTAL/CASA</TableHead>
                          <TableHead className="font-bold text-center w-14 sm:w-20">CASAS</TableHead>
                          <TableHead className="font-bold text-right w-20 sm:w-24">VALOR MED</TableHead>
                          <TableHead className="font-bold text-center w-12 sm:w-16">%</TableHead>
                          <TableHead className="font-bold text-center w-14">GLOSSA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.eventDetails.map((d: any) => (
                          <TableRow key={d.event.id} className="text-[10px] sm:text-[11px]">
                            <TableCell className="font-mono">{d.event.item_code}</TableCell>
                            <TableCell className="max-w-[100px] sm:max-w-xs truncate">{d.event.description}</TableCell>
                            <TableCell className="text-right font-mono">{fmtCur(d.valorPorCasa)}</TableCell>
                            <TableCell className="text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{d.housesMeasured.length}</TableCell>
                            <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(d.valorTotal)}</TableCell>
                            <TableCell className="text-center font-mono text-amber-600 dark:text-amber-400">{d.pctEvento.toFixed(1)}%</TableCell>
                            <TableCell className="text-center">
                              {d.glossCount > 0 ? <Badge className="bg-destructive text-[9px]">{d.glossCount}</Badge> : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/80 font-bold text-[10px] sm:text-[11px] border-t-2">
                          <TableCell colSpan={3} className="text-right">TOTAL:</TableCell>
                          <TableCell className="text-center font-mono">{detailData.totalCasas}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtCur(detailData.totalValor)}</TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="timeline" className="flex-1 min-h-0 mt-2">
                  <ScrollArea className="h-full max-h-[35vh]">
                    {measurementAuditLogs.length === 0 ? (
                      <div className="text-center text-muted-foreground text-sm py-8">Nenhum registro de auditoria.</div>
                    ) : (
                      <div className="space-y-2">
                        {measurementAuditLogs.map(log => (
                          <div key={log.id} className="border border-border rounded-lg p-2.5 bg-card flex items-center gap-2.5 text-xs">
                            <div className="p-1 rounded bg-muted shrink-0">
                              {log.action.includes("gloss") ? <AlertTriangle className="h-3 w-3 text-destructive" /> :
                               log.action.includes("approved") ? <ShieldCheck className="h-3 w-3 text-emerald-600" /> :
                               <FileText className="h-3 w-3 text-primary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{getActionLabel(log.action)}</span>
                              {log.details?.house_number && <span className="text-muted-foreground ml-1">- Casa {log.details.house_number}</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                              <div>{log.performed_by_name || "—"}</div>
                              <div>{fmtDateTime(log.performed_at)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
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
