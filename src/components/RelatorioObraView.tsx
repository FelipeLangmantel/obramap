import React, { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Loader2, CalendarDays, Users, ClipboardCheck, Hammer, AlertTriangle, MessageSquare, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Periodo = "semanal" | "quinzenal" | "mensal" | "personalizado";

const PERIODO_DAYS: Record<Exclude<Periodo, "personalizado">, number> = { semanal: 7, quinzenal: 15, mensal: 30 };

interface DiaryEntryRow {
  id: string;
  entry_date: string;
  engineer_name: string;
  clima: string | null;
  equipe_presente: number | null;
  observacao_geral: string | null;
  status: string;
  status_aprovacao?: string | null;
  mm_chuva?: number | null;
}
interface DiaryItemRow {
  id: string;
  diary_entry_id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  house_ids: number[];
  percentual_executado: number;
}
interface DeviationRow {
  id: string;
  scope_name: string;
  macro_name: string;
  planned_count: number;
  actual_count: number;
  missing_house_ids: number[] | null;
  severity: string;
  deviation_reason?: string | null;
  week_start: string;
  week_end: string;
}

const SEVERITY_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  critical: { label: "Crítico", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-300", icon: "🔴" },
  warning: { label: "Alerta", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300", icon: "🟡" },
  info: { label: "Info", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300", icon: "🔵" },
};

export default function RelatorioObraView() {
  const { currentProject } = useConstruction();
  const [periodo, setPeriodo] = useState<Periodo>("semanal");
  const [dataFim, setDataFim] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dataInicioCustom, setDataInicioCustom] = useState<string>(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [entries, setEntries] = useState<DiaryEntryRow[]>([]);
  const [items, setItems] = useState<DiaryItemRow[]>([]);
  const [deviations, setDeviations] = useState<DeviationRow[]>([]);

  const dataInicio = useMemo(() => {
    if (periodo === "personalizado") return dataInicioCustom;
    const fim = parseISO(dataFim);
    return format(subDays(fim, PERIODO_DAYS[periodo] - 1), "yyyy-MM-dd");
  }, [periodo, dataFim, dataInicioCustom]);

  useEffect(() => {
    if (!currentProject?.id) return;
    loadData();
  }, [currentProject?.id, dataInicio, dataFim]);

  // Realtime: recarregar quando diary_items, diary_entries ou desvios mudam
  useEffect(() => {
    if (!currentProject?.id) return;
    const channel = supabase
      .channel(`relatorio-obra-${currentProject.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "diary_items",
      }, () => loadData())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "diary_entries",
        filter: `project_id=eq.${currentProject.id}`,
      }, () => loadData())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "production_deviations",
        filter: `project_id=eq.${currentProject.id}`,
      }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentProject?.id]);

  const loadData = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      // 1. Diary entries
      const { data: entriesData } = await supabase
        .from("diary_entries")
        .select("id, entry_date, engineer_name, clima, equipe_presente, observacao_geral, status, status_aprovacao, mm_chuva")
        .eq("project_id", currentProject.id)
        .gte("entry_date", dataInicio)
        .lte("entry_date", dataFim)
        .order("entry_date", { ascending: false });

      const entryIds = (entriesData || []).map(e => e.id);
      setEntries(entriesData || []);

      // 2. Diary items
      let itemsData: DiaryItemRow[] = [];
      if (entryIds.length > 0) {
        const { data } = await supabase
          .from("diary_items")
          .select("id, diary_entry_id, macro_id, macro_name, scope_id, scope_name, house_ids, percentual_executado")
          .in("diary_entry_id", entryIds);
        itemsData = (data || []).map(d => ({
          ...d,
          house_ids: d.house_ids || [],
          percentual_executado: Number(d.percentual_executado),
        }));
      }
      setItems(itemsData);

      // 3. Deviations
      const { data: devData } = await supabase
        .from("production_deviations")
        .select("id, scope_name, macro_name, planned_count, actual_count, missing_house_ids, severity, deviation_reason, week_start, week_end")
        .eq("project_id", currentProject.id)
        .gte("week_start", dataInicio)
        .lte("week_end", dataFim);
      setDeviations((devData || []) as DeviationRow[]);
    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const diasTrabalhados = new Set(
      entries.filter(e => e.status === "finalizado" || items.some(i => i.diary_entry_id === e.id)).map(e => e.entry_date)
    ).size;
    const casasExecutadas = new Set(items.flatMap(i => i.house_ids)).size;
    const servicos = new Set(items.map(i => i.scope_id)).size;
    const equipes = entries.map(e => e.equipe_presente || 0).filter(n => n > 0);
    const equipeMedia = equipes.length > 0 ? Math.round(equipes.reduce((s, n) => s + n, 0) / equipes.length) : 0;
    return { diasTrabalhados, casasExecutadas, servicos, equipeMedia };
  }, [entries, items]);

  // Atividades agrupadas
  const atividadesAgrupadas = useMemo(() => {
    const map = new Map<string, { macro: string; scope: string; casas: number[]; pcts: number[] }>();
    for (const item of items) {
      const key = `${item.macro_id}|${item.scope_id}`;
      if (!map.has(key)) {
        map.set(key, { macro: item.macro_name, scope: item.scope_name, casas: [], pcts: [] });
      }
      const entry = map.get(key)!;
      entry.casas.push(...item.house_ids);
      entry.pcts.push(item.percentual_executado);
    }
    return Array.from(map.values()).map(g => ({
      macro: g.macro,
      scope: g.scope,
      casasArr: [...new Set(g.casas)].sort((a, b) => a - b),
      casas: [...new Set(g.casas)].sort((a, b) => a - b).map(n => String(n).padStart(2, "0")).join(", "),
      pctMedio: Math.round(g.pcts.reduce((s, p) => s + p, 0) / g.pcts.length),
    }));
  }, [items]);

  const observacoes = useMemo(() => {
    return entries
      .filter(e => e.observacao_geral && e.observacao_geral.trim().length > 0)
      .map(e => ({ data: e.entry_date, texto: e.observacao_geral!, engenheiro: e.engineer_name }));
  }, [entries]);

  // IDC e clima
  const climaStats = useMemo(() => {
    const totalDias = entries.length;
    const chuvosos = entries.filter(e => (e.clima || "").toLowerCase().includes("chuv")).length;
    const praticaveis = totalDias - chuvosos;
    const mmAcumulado = entries.reduce((s, e) => s + Number(e.mm_chuva || 0), 0);
    const idc = totalDias > 0 ? Math.round((praticaveis / totalDias) * 100) : 0;
    return { totalDias, chuvosos, praticaveis, mmAcumulado: Math.round(mmAcumulado * 10) / 10, idc };
  }, [entries]);

  // Status RDOs
  const rdoStatus = useMemo(() => {
    const aprovado = entries.filter(e => e.status_aprovacao === "aprovado").length;
    const revisando = entries.filter(e => e.status_aprovacao === "revisando").length;
    const preenchendo = entries.filter(e => e.status_aprovacao === "preenchendo" || !e.status_aprovacao).length;
    return { aprovado, revisando, preenchendo, total: entries.length };
  }, [entries]);

  // Curva S — % executado acumulado por dia
  const curvaS = useMemo(() => {
    // Soma percentuais por dia, divididos pelo nº de casas, normalizando por casa-serviço
    const byDay = new Map<string, number>();
    for (const e of entries) byDay.set(e.entry_date, 0);
    for (const it of items) {
      const ent = entries.find(e => e.id === it.diary_entry_id);
      if (!ent) continue;
      const peso = (it.percentual_executado / 100) * it.house_ids.length;
      byDay.set(ent.entry_date, (byDay.get(ent.entry_date) || 0) + peso);
    }
    const ordered = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
    let acum = 0;
    return ordered.map(([d, v]) => ({ data: d, dia: v, acum: (acum += v) }));
  }, [entries, items]);

  const handleGeneratePDF = async () => {
    if (!currentProject) return;
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableMod = await import("jspdf-autotable");
      const autoTable = autoTableMod.default;

      const doc = new jsPDF({ orientation: "portrait", format: "a4" });

      // Título
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`Relatório de Obra — ${currentProject.name}`, 14, 22);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Período: ${format(parseISO(dataInicio), "dd/MM/yyyy")} a ${format(parseISO(dataFim), "dd/MM/yyyy")} (${periodo})`,
        14, 30
      );

      // Resumo
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Resumo do período", 14, 40);
      autoTable(doc, {
        startY: 44,
        head: [["Indicador", "Valor"]],
        body: [
          ["Dias trabalhados", String(kpis.diasTrabalhados)],
          ["Total casas executadas", String(kpis.casasExecutadas)],
          ["Serviços distintos", String(kpis.servicos)],
          ["Equipe média/dia", String(kpis.equipeMedia)],
          ["IDC — Índice de Dias Praticáveis", `${climaStats.idc}% (${climaStats.praticaveis}/${climaStats.totalDias})`],
          ["Dias com chuva", String(climaStats.chuvosos)],
          ["Pluviometria acumulada", `${climaStats.mmAcumulado} mm`],
          ["RDOs aprovados", `${rdoStatus.aprovado} / ${rdoStatus.total}`],
          ["RDOs em revisão", String(rdoStatus.revisando)],
          ["RDOs em preenchimento", String(rdoStatus.preenchendo)],
        ],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
      });

      // Atividades
      let cursorY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Atividades executadas", 14, cursorY);
      autoTable(doc, {
        startY: cursorY + 4,
        head: [["Etapa", "Serviço", "Casas", "% Médio"]],
        body: atividadesAgrupadas.length > 0
          ? atividadesAgrupadas.map(a => [a.macro, a.scope, a.casas, `${a.pctMedio}%`])
          : [["—", "Sem lançamentos no período", "—", "—"]],
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8, cellWidth: "auto" },
        columnStyles: { 2: { cellWidth: 70 } },
      });

      // Desvios
      cursorY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Desvios do período", 14, cursorY);
      if (deviations.length > 0) {
        autoTable(doc, {
          startY: cursorY + 4,
          head: [["Severidade", "Etapa", "Serviço", "Planejado", "Executado", "Faltantes"]],
          body: deviations.map(d => [
            (SEVERITY_BADGE[d.severity]?.label || d.severity),
            d.macro_name,
            d.scope_name,
            String(d.planned_count),
            String(d.actual_count),
            (d.missing_house_ids || []).map(n => String(n).padStart(2, "0")).join(", ") || "—",
          ]),
          theme: "grid",
          headStyles: { fillColor: [220, 38, 38] },
          styles: { fontSize: 8 },
        });
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("Nenhum desvio registrado no período.", 14, cursorY + 8);
      }

      // Observações
      cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 12) + 8;
      if (observacoes.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Observações do período", 14, cursorY);
        autoTable(doc, {
          startY: cursorY + 4,
          head: [["Data", "Engenheiro", "Observação"]],
          body: observacoes.map(o => [
            format(parseISO(o.data), "dd/MM/yyyy"),
            o.engenheiro,
            o.texto,
          ]),
          theme: "striped",
          headStyles: { fillColor: [37, 99, 235] },
          styles: { fontSize: 8 },
          columnStyles: { 2: { cellWidth: 110 } },
        });
      }

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(
          `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} • Página ${i} de ${pageCount}`,
          14, doc.internal.pageSize.getHeight() - 8
        );
      }

      const safeName = currentProject.name.replace(/[^\w\-]+/g, "_");
      doc.save(`relatorio-${safeName}-${format(parseISO(dataFim), "yyyy-MM-dd")}.pdf`);
      toast.success("Relatório gerado!");
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + (err.message || ""));
    } finally {
      setExporting(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <FileText className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground">Selecione uma obra para gerar o relatório.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal (7 dias)</SelectItem>
                  <SelectItem value="quinzenal">Quinzenal (15 dias)</SelectItem>
                  <SelectItem value="mensal">Mensal (30 dias)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="mt-1" />
            </div>
            <div className="text-xs text-muted-foreground pb-2">
              Período analisado: <span className="font-semibold">{format(parseISO(dataInicio), "dd/MM/yyyy")}</span> até{" "}
              <span className="font-semibold">{format(parseISO(dataFim), "dd/MM/yyyy")}</span>
            </div>
            <Button onClick={handleGeneratePDF} disabled={exporting || loading} className="ml-auto">
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Gerar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<CalendarDays />} label="Dias trabalhados" value={kpis.diasTrabalhados} color="text-blue-600" />
        <KpiCard icon={<ClipboardCheck />} label="Casas executadas" value={kpis.casasExecutadas} color="text-emerald-600" />
        <KpiCard icon={<Hammer />} label="Serviços distintos" value={kpis.servicos} color="text-amber-600" />
        <KpiCard icon={<Users />} label="Equipe média/dia" value={kpis.equipeMedia} color="text-purple-600" />
      </div>

      {/* Atividades */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Atividades executadas no período</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : atividadesAgrupadas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum lançamento no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Casas executadas</TableHead>
                    <TableHead className="text-right">% médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atividadesAgrupadas.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{a.macro}</TableCell>
                      <TableCell>{a.scope}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[400px]">{a.casas}</TableCell>
                      <TableCell className="text-right font-bold">{a.pctMedio}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desvios */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Desvios do período
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deviations.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">Nenhum desvio no período</div>
                <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Todas as metas planejadas foram atingidas.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {deviations.map(d => {
                const sev = SEVERITY_BADGE[d.severity] || SEVERITY_BADGE.info;
                return (
                  <div key={d.id} className={`p-3 rounded-lg border ${sev.cls}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={sev.cls}>{sev.icon} {sev.label}</Badge>
                          <span className="font-semibold text-sm">{d.macro_name} — {d.scope_name}</span>
                        </div>
                        <div className="text-xs mt-1 opacity-90">
                          Planejado: <strong>{d.planned_count}</strong> casas • Executado: <strong>{d.actual_count}</strong>
                          {d.missing_house_ids && d.missing_house_ids.length > 0 && (
                            <> • Faltantes: {d.missing_house_ids.map(n => String(n).padStart(2, "0")).join(", ")}</>
                          )}
                        </div>
                        {d.deviation_reason && (
                          <div className="text-xs italic opacity-80 mt-1">"{d.deviation_reason}"</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Observações */}
      {observacoes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Observações do período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {observacoes.map((o, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-1">
                    {format(parseISO(o.data), "dd/MM/yyyy", { locale: ptBR })} • {o.engenheiro}
                  </div>
                  <div className="text-sm">{o.texto}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className={`${color}`}>{icon}</div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
