import { useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, Plus, Loader2, ListChecks, Pencil, Trash2, X, FlaskConical, CalendarDays, TrendingUp, DollarSign, Clock, BarChart3, Target, AlertTriangle } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import { useAuth } from "@/contexts/AuthContext";
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { format, differenceInDays, addDays } from "date-fns";
import { Progress } from "@/components/ui/progress";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return BRL.format(v);
};

function useInvalidateHolding() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["holding-portfolio"] });
    qc.invalidateQueries({ queryKey: ["holding-receitas"] });
    qc.invalidateQueries({ queryKey: ["holding-despesas"] });
    qc.invalidateQueries({ queryKey: ["holding-prd"] });
    qc.invalidateQueries({ queryKey: ["holding-documentos"] });
    qc.invalidateQueries({ queryKey: ["holding-insights-data"] });
  };
}

export interface ObraDrawerData {
  id: string;
  nome: string;
  uh?: number | null;
  responsavel?: string | null;
  responsavel_nome?: string | null;
  responsavel_telefone?: string | null;
  tipo_contrato?: string | null;
  valor_contrato?: number;
  data_inicio?: string | null;
  prazo_dias?: number;
  aditivo_prazo_dias?: number;
  percentual_andamento?: number;
  status?: string;
  prazo_pagamento?: string | null;
  empresa?: string | null;
}

interface ObraDetailDrawerProps {
  obra: ObraDrawerData | null;
  onClose: () => void;
}

export default function ObraDetailDrawer({ obra, onClose }: ObraDetailDrawerProps) {
  return (
    <Sheet open={!!obra} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[75vw] lg:max-w-[70vw] overflow-y-auto p-0">
        {obra && <ObraDetailContent obra={obra} />}
      </SheetContent>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════
   RESUMO TAB — Mini Dashboard
   ══════════════════════════════════════════════ */

function ResumoTab({ obra }: { obra: ObraDrawerData }) {
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("medicoes_ple")
        .select("*")
        .eq("obra_id", obra.id)
        .order("ano_referencia", { ascending: true });
      setMedicoes(data || []);
      setLoading(false);
    })();
  }, [obra.id]);

  const kpis = useMemo(() => {
    const valorContrato = obra.valor_contrato || 0;
    // Medido/Faturado = aprovadas (igual ao card do painel e à tabela de obras)
    const totalMedido = medicoes
      .filter(m => m.status_medicao === "aprovada")
      .reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0);

    // Enviado (aguardando aprovação) — separado
    const totalEnviado = medicoes
      .filter(m => m.status_medicao === "enviada")
      .reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0);

    // Total em aberto (aprovado + enviado) — para o saldo a medir
    const totalEmAberto = totalMedido + totalEnviado;

    const totalAcatado = medicoes.filter(m => Number(m.valor_acatado) > 0).reduce((s, m) => s + Number(m.valor_acatado), 0);
    const totalRecebido = medicoes.filter(m => m.status_nf === "recebido").reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0);
    const totalPrevisto = medicoes.reduce((s, m) => s + (Number(m.valor_previsto_medicao) || 0), 0);
    const pctMedido = valorContrato > 0 ? (totalMedido / valorContrato) * 100 : 0;
    const saldoMedir = valorContrato - totalEmAberto;
    const totalGlosa = totalAcatado > 0 ? totalMedido - totalAcatado : 0;
    const medicoesEnviadas = medicoes.filter(m => m.status_medicao === "enviada").length;
    const medicoesAprovadas = medicoes.filter(m => m.status_medicao === "aprovada").length;
    const medicoesPrevistas = medicoes.filter(m => m.data_previsao_medicao && !m.data_envio).length;

    // Contract timeline
    let diasRestantes: number | null = null;
    let previsaoFim: string | null = null;
    let pctPrazo = 0;
    if (obra.data_inicio) {
      const inicio = new Date(obra.data_inicio + "T12:00:00");
      const prazoTotal = (obra.prazo_dias || 0) + (obra.aditivo_prazo_dias || 0);
      const fim = addDays(inicio, prazoTotal);
      previsaoFim = format(fim, "dd/MM/yyyy");
      diasRestantes = differenceInDays(fim, new Date());
      const diasDecorridos = differenceInDays(new Date(), inicio);
      pctPrazo = prazoTotal > 0 ? Math.min(100, (diasDecorridos / prazoTotal) * 100) : 0;
    }

    return {
      valorContrato, totalMedido, totalRecebido, totalPrevisto,
      pctMedido, saldoMedir, totalGlosa, totalAcatado,
      medicoesEnviadas, medicoesAprovadas, medicoesPrevistas,
      diasRestantes, previsaoFim, pctPrazo,
      totalMedicoes: medicoes.length,
    };
  }, [medicoes, obra]);

  const chartData = useMemo(() => {
    if (medicoes.length === 0) return [];
    const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return medicoes
      .filter(m => m.mes_referencia)
      .sort((a, b) => {
        const aIdx = MONTHS_SHORT.findIndex(x => x.toLowerCase() === (a.mes_referencia || "").toLowerCase());
        const bIdx = MONTHS_SHORT.findIndex(x => x.toLowerCase() === (b.mes_referencia || "").toLowerCase());
        return (a.ano_referencia - b.ano_referencia) || (aIdx - bIdx);
      })
      .map(m => ({
        name: `${m.mes_referencia}/${String(m.ano_referencia).slice(-2)}`,
        previsto: Number(m.valor_previsto_medicao) || 0,
        realizado: Number(m.valor_medicao) || 0,
        acatado: Number(m.valor_acatado) || 0,
      }));
  }, [medicoes]);

  // Próximas medições previstas
  const proximasMedicoes = useMemo(() => {
    return medicoes
      .filter(m => m.data_previsao_medicao && !m.data_envio)
      .sort((a, b) => a.data_previsao_medicao.localeCompare(b.data_previsao_medicao))
      .slice(0, 4);
  }, [medicoes]);

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  return (
    <div className="space-y-4">
      {/* KPI Row 1 — Financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi icon={<DollarSign className="h-4 w-4" />} label="Valor Contrato" value={BRL.format(kpis.valorContrato)} color="text-primary" />
        <MiniKpi icon={<TrendingUp className="h-4 w-4" />} label="Total Medido" value={BRL.format(kpis.totalMedido)} sub={`${kpis.pctMedido.toFixed(1)}% do contrato`} color="text-blue-600" />
        <MiniKpi icon={<Target className="h-4 w-4" />} label="Saldo a Medir" value={BRL.format(kpis.saldoMedir)} color="text-amber-600" />
        <MiniKpi icon={<DollarSign className="h-4 w-4" />} label="Total Recebido" value={BRL.format(kpis.totalRecebido)} color="text-emerald-600" />
      </div>

      {/* Contract Timeline */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Prazo do Contrato</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {obra.data_inicio && <span>Início: {format(new Date(obra.data_inicio + "T12:00:00"), "dd/MM/yyyy")}</span>}
              {kpis.previsaoFim && <span>Fim: {kpis.previsaoFim}</span>}
              {(obra.aditivo_prazo_dias || 0) > 0 && <Badge variant="outline" className="text-[10px]">+{obra.aditivo_prazo_dias}d aditivo</Badge>}
            </div>
          </div>
          <Progress value={kpis.pctPrazo} className="h-2.5" />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-muted-foreground">{kpis.pctPrazo.toFixed(0)}% do prazo decorrido</span>
            {kpis.diasRestantes !== null && (
              <span className={`text-xs font-semibold ${kpis.diasRestantes > 0 ? "text-emerald-600" : "text-destructive"}`}>
                {kpis.diasRestantes > 0 ? `${kpis.diasRestantes} dias restantes` : "Prazo encerrado"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Row 2 — Medições */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi icon={<BarChart3 className="h-4 w-4" />} label="Total Medições" value={String(kpis.totalMedicoes)} color="text-foreground" />
        <MiniKpi icon={<Clock className="h-4 w-4" />} label="Enviadas" value={String(kpis.medicoesEnviadas)} sub="aguardando aprovação" color="text-blue-600" />
        <MiniKpi icon={<Target className="h-4 w-4" />} label="Aprovadas" value={String(kpis.medicoesAprovadas)} color="text-emerald-600" />
        <MiniKpi icon={<CalendarDays className="h-4 w-4" />} label="Previstas" value={String(kpis.medicoesPrevistas)} sub="a enviar" color="text-indigo-600" />
      </div>

      {/* Chart — Previsto vs Realizado */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Medições — Previsto × Realizado</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => BRL_SHORT(v)} />
                <Tooltip formatter={(v: number) => BRL.format(v)} />
                <Bar dataKey="previsto" name="Previsto" fill="hsl(var(--primary) / 0.3)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="realizado" name="Realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Line dataKey="acatado" name="Acatado" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Próximas medições & Glosa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Próximas Previsões */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> Próximas Medições Previstas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {proximasMedicoes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Nenhuma previsão cadastrada</p>
            ) : (
              <div className="space-y-2">
                {proximasMedicoes.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm border rounded-lg p-2">
                    <div>
                      <span className="font-medium">Nº {m.num_medicao || "—"}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{m.mes_referencia}/{m.ano_referencia}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yyyy")}
                      </div>
                      {Number(m.valor_previsto_medicao) > 0 && (
                        <div className="text-xs font-medium text-primary">{BRL.format(Number(m.valor_previsto_medicao))}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Indicadores de Saúde */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Indicadores
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Andamento físico</span>
              <span className="font-semibold">{obra.percentual_andamento || 0}%</span>
            </div>
            <Progress value={obra.percentual_andamento || 0} className="h-2" />

            {kpis.totalGlosa > 0 && (
              <div className="flex items-center justify-between text-sm pt-2">
                <span className="text-amber-600">Glosa acumulada</span>
                <span className="font-semibold text-amber-600">{BRL.format(kpis.totalGlosa)}</span>
              </div>
            )}

            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Previsto total</span>
              <span className="font-medium">{BRL.format(kpis.totalPrevisto)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Medido total</span>
              <span className="font-medium">{BRL.format(kpis.totalMedido)}</span>
            </div>
            {kpis.totalPrevisto > 0 && kpis.totalMedido > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Desvio prev. × medido</span>
                <span className={`font-semibold ${kpis.totalMedido >= kpis.totalPrevisto ? "text-emerald-600" : "text-amber-600"}`}>
                  {((kpis.totalMedido - kpis.totalPrevisto) / kpis.totalPrevisto * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniKpi({ icon, label, value, sub, color }: { icon: ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div className={`${color} mt-0.5`}>{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={`text-sm font-bold ${color} break-words`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ObraDetailContent({ obra }: { obra: ObraDrawerData }) {
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-6 pt-6 pb-4">
        <SheetTitle className="text-lg">{obra.nome}</SheetTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {obra.tipo_contrato && <Badge variant="outline" className="text-[10px]">{obra.tipo_contrato}</Badge>}
          {obra.uh && <Badge variant="secondary" className="text-[10px]">{obra.uh} UH</Badge>}
          {obra.empresa && <Badge variant="outline" className="text-[10px]">{obra.empresa}</Badge>}
          {(() => {
            const nome = obra.responsavel_nome || obra.responsavel?.split(" - ")[0] || "";
            const tel = obra.responsavel_telefone || obra.responsavel?.split(" - ")[1] || "";
            const telLimpo = tel.replace(/\D/g, "");
            const waNumber = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
            if (!nome) return null;
            return (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                👤 {nome}
                {telLimpo && (
                  <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá ${nome}, tudo bem?`)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-emerald-600 hover:text-emerald-500 font-medium">📱 {tel}</a>
                )}
              </span>
            );
          })()}
        </div>
      </SheetHeader>
      <Tabs defaultValue="resumo" className="flex-1 flex flex-col">
        <TabsList className="mx-6 w-fit">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="medicoes">Medições</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="aditivos">Aditivos</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="resumo" className="mt-0"><ResumoTab obra={obra} /></TabsContent>
          <TabsContent value="documentos" className="mt-0"><DocumentosTab obraId={obra.id} /></TabsContent>
          <TabsContent value="medicoes" className="mt-0"><MedicoesTab obraId={obra.id} /></TabsContent>
          <TabsContent value="financeiro" className="mt-0"><FinanceiroTab obraId={obra.id} /></TabsContent>
          <TabsContent value="aditivos" className="mt-0"><AditivosTab obraId={obra.id} /></TabsContent>
          <TabsContent value="pendencias" className="mt-0"><PendenciasTab obraId={obra.id} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 1 — DOCUMENTOS
   ══════════════════════════════════════════════ */

const PRE_OBRA_FIELDS: { key: string; label: string }[] = [
  { key: "ata", label: "Ata" },
  { key: "ois", label: "OIS" },
  { key: "art", label: "ART" },
  { key: "cno", label: "CNO" },
  { key: "impl", label: "Implantação" },
  { key: "scp", label: "SCP" },
];

const ENSAIOS_PROJETOS_FIELDS: { key: string; label: string }[] = [
  { key: "sondagem_spt", label: "Sondagem e SPT" },
  { key: "planta_localizacao", label: "Planta Localização" },
  { key: "plano_altimetrico", label: "Plano Altimétrico" },
  { key: "painel_bordo", label: "Painel de Bordo" },
  { key: "checklist_seguranca", label: "Checklist Segurança" },
];

function DocumentosTab({ obraId }: { obraId: string }) {
  const { company } = useAuth();
  const invalidateHolding = useInvalidateHolding();

  // Fetch configured doc types for this company
  const [docTipos, setDocTipos] = useState<{ id: string; nome: string; categoria: string; obrigatorio: boolean }[]>([]);
  const [obraDocsMap, setObraDocsMap] = useState<Map<string, any>>(new Map());

  // Legacy documentos_obra for backwards compatibility
  const [legacyDocs, setLegacyDocs] = useState<Record<string, boolean> | null>(null);
  const [legacyDocId, setLegacyDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company?.id) return;

    // Load configured doc types
    const { data: tipos } = await supabase
      .from("holding_doc_tipos")
      .select("id, nome, categoria, obrigatorio")
      .eq("company_id", company.id)
      .eq("ativo", true)
      .order("categoria")
      .order("ordem");

    setDocTipos(tipos || []);

    // Load obra docs (flexible system)
    const { data: obraDocs } = await supabase
      .from("holding_obra_docs")
      .select("*")
      .eq("obra_id", obraId);

    const map = new Map<string, any>();
    (obraDocs || []).forEach((d: any) => map.set(d.doc_tipo_id, d));
    setObraDocsMap(map);

    // Auto-create missing entries
    if (tipos && tipos.length > 0) {
      const missingTipos = tipos.filter(t => !map.has(t.id));
      if (missingTipos.length > 0) {
        const { data: created } = await supabase
          .from("holding_obra_docs")
          .insert(missingTipos.map(t => ({ obra_id: obraId, doc_tipo_id: t.id, checked: false })) as any)
          .select();
        if (created) {
          created.forEach((d: any) => map.set(d.doc_tipo_id, d));
          setObraDocsMap(new Map(map));
        }
      }
    }

    // Legacy documentos_obra
    const { data: legacy } = await supabase
      .from("documentos_obra")
      .select("*")
      .eq("obra_id", obraId)
      .maybeSingle();

    if (legacy) {
      setLegacyDocId(legacy.id);
      const { id: _id, obra_id: _oid, ...fields } = legacy as any;
      setLegacyDocs(fields);
    } else {
      // Create legacy doc row if none exists
      const { data: created } = await supabase
        .from("documentos_obra")
        .insert({ obra_id: obraId } as any)
        .select()
        .single();
      if (created) {
        setLegacyDocId(created.id);
        const { id: _id2, obra_id: _oid2, ...fields } = created as any;
        setLegacyDocs(fields);
      }
    }

    setLoading(false);
  }, [obraId, company?.id]);

  useEffect(() => { load(); }, [load]);

  // Toggle for flexible system
  const toggleFlexible = async (docTipoId: string, value: boolean) => {
    const existing = obraDocsMap.get(docTipoId);
    setObraDocsMap(prev => {
      const next = new Map(prev);
      const cur = next.get(docTipoId);
      if (cur) next.set(docTipoId, { ...cur, checked: value });
      return next;
    });

    if (existing?.id) {
      await supabase.from("holding_obra_docs").update({ checked: value } as any).eq("id", existing.id);
    } else {
      await supabase.from("holding_obra_docs").insert({ obra_id: obraId, doc_tipo_id: docTipoId, checked: value } as any);
    }
    invalidateHolding();
  };

  // Toggle for legacy system
  const toggleLegacy = async (key: string, value: boolean) => {
    if (!legacyDocId) return;
    setLegacyDocs(prev => prev ? { ...prev, [key]: value } : prev);
    await supabase.from("documentos_obra").update({ [key]: value } as any).eq("id", legacyDocId);
    invalidateHolding();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const docObraTipos = docTipos.filter(t => t.categoria === "doc_obra");
  const ensaiosTipos = docTipos.filter(t => t.categoria === "ensaios_projetos");
  const hasFlexible = docTipos.length > 0;

  const renderDocCard = (
    title: string,
    icon: ReactNode,
    flexibleItems: typeof docTipos,
    legacyFields: { key: string; label: string }[],
  ) => {
    const useFlexible = hasFlexible && flexibleItems.length > 0;
    const items = useFlexible ? flexibleItems : legacyFields;
    const count = useFlexible
      ? flexibleItems.filter(i => obraDocsMap.get(i.id)?.checked).length
      : legacyFields.filter(i => legacyDocs?.[i.key]).length;
    const total = items.length;

    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              {icon} {title}
            </h4>
            <Badge variant={count === total && total > 0 ? "default" : "secondary"} className={count === total && total > 0 ? "bg-emerald-600" : ""}>
              {count}/{total}
            </Badge>
          </div>
          {total === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum documento configurado. Acesse Configurações → {title} para adicionar.
            </p>
          )}
          {useFlexible
            ? flexibleItems.map(item => (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-sm">{item.nome}</span>
                  <Switch checked={!!obraDocsMap.get(item.id)?.checked} onCheckedChange={(v) => toggleFlexible(item.id, v)} />
                </div>
              ))
            : legacyFields.map(f => (
                <div key={f.key} className="flex items-center justify-between">
                  <span className="text-sm">{f.label}</span>
                  <Switch checked={!!legacyDocs?.[f.key]} onCheckedChange={(v) => toggleLegacy(f.key, v)} />
                </div>
              ))
          }
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {renderDocCard("Pré Obra", <FileText className="h-4 w-4" />, docObraTipos, PRE_OBRA_FIELDS)}
      {renderDocCard("Ensaios e Projetos", <FlaskConical className="h-4 w-4" />, ensaiosTipos, ENSAIOS_PROJETOS_FIELDS)}
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 2 — MEDIÇÕES
   ══════════════════════════════════════════════ */

const MEDICAO_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  aprovada: { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  enviada: { label: "Enviada", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  pendente: { label: "Pendente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  nao_iniciada: { label: "Não Iniciada", cls: "bg-muted text-muted-foreground" },
  previsao: { label: "Previsão", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
};

const NF_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  recebido: { label: "Recebido", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  aguardando_aprovacao: { label: "Aguardando", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
};

/** Determines the display status badge based on measurement state */
function getMedicaoDisplayStatus(m: any): { label: string; cls: string } {
  // If already sent/approved, use real status
  if (m.status_medicao === "aprovada" || m.status_medicao === "enviada" || m.status_medicao === "pendente") {
    return MEDICAO_STATUS_BADGE[m.status_medicao];
  }
  // If has previsao date and no envio, treat as "Previsão"
  if (m.data_previsao_medicao && !m.data_envio && m.status_medicao === "nao_iniciada") {
    return MEDICAO_STATUS_BADGE.previsao;
  }
  return MEDICAO_STATUS_BADGE.nao_iniciada;
}

/** Whether NF columns should be shown for this measurement */
function shouldShowNF(m: any): boolean {
  return m.status_medicao === "enviada" || m.status_medicao === "aprovada";
}

function ClearableDateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="pr-7" />
        {value && (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("")}
            title="Limpar data"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function MedicoesTab({ obraId }: { obraId: string }) {
  const invalidateHolding = useInvalidateHolding();
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMedicao, setEditingMedicao] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [form, setForm] = useState({
    num_medicao: "", mes_referencia: "", ano_referencia: new Date().getFullYear(),
    data_previsao_medicao: "", data_envio: "", data_aprovacao: "",
    status_medicao: "nao_iniciada",
    valor_previsto_medicao: 0, valor_medicao: 0, valor_acatado: 0,
    num_nf: "", data_pagamento: "", status_nf: "pendente",
  });

  const resetForm = () => setForm({
    num_medicao: "", mes_referencia: "", ano_referencia: new Date().getFullYear(),
    data_previsao_medicao: "", data_envio: "", data_aprovacao: "",
    status_medicao: "nao_iniciada", valor_previsto_medicao: 0, valor_medicao: 0, valor_acatado: 0,
    num_nf: "", data_pagamento: "", status_nf: "pendente",
  });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("medicoes_ple")
      .select("*")
      .eq("obra_id", obraId)
      .order("ano_referencia", { ascending: false });
    setMedicoes(data || []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const addMedicao = async () => {
    if (form.num_medicao && form.mes_referencia) {
      const isDuplicate = medicoes.some(m =>
        m.num_medicao === form.num_medicao &&
        m.mes_referencia?.toLowerCase() === form.mes_referencia.toLowerCase() &&
        m.ano_referencia === form.ano_referencia
      );
      if (isDuplicate) {
        toast.warning(`Já existe uma medição Nº ${form.num_medicao} para ${form.mes_referencia}/${form.ano_referencia} nesta obra.`);
        return;
      }
    }
    const payload: any = { obra_id: obraId, ...form };
    if (!payload.data_previsao_medicao) delete payload.data_previsao_medicao;
    if (!payload.data_envio) delete payload.data_envio;
    if (!payload.data_aprovacao) delete payload.data_aprovacao;
    if (!payload.data_pagamento) delete payload.data_pagamento;
    const { error } = await supabase.from("medicoes_ple").insert(payload);
    if (error) { toast.error("Erro ao salvar medição"); return; }
    toast.success("Medição adicionada");
    invalidateHolding();
    setShowForm(false);
    resetForm();
    load();
  };

  const updateMedicao = async () => {
    if (!editingMedicao) return;
    const payload: any = { ...editForm };
    delete payload.id; delete payload.obra_id; delete payload.created_at;
    // Allow clearing dates by setting to null
    if (payload.data_previsao_medicao === "") payload.data_previsao_medicao = null;
    if (payload.data_envio === "") payload.data_envio = null;
    if (payload.data_aprovacao === "") payload.data_aprovacao = null;
    if (payload.data_pagamento === "") payload.data_pagamento = null;
    const { error } = await supabase.from("medicoes_ple").update(payload).eq("id", editingMedicao.id);
    if (error) { toast.error("Erro ao atualizar medição"); return; }
    toast.success("Medição atualizada!");
    invalidateHolding();
    setEditingMedicao(null);
    setEditForm({});
    load();
  };

  const deleteMedicao = async (id: string) => {
    if (!confirm("Excluir esta medição? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("medicoes_ple").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir medição"); return; }
    toast.success("Medição excluída.");
    invalidateHolding();
    load();
  };

  const startEdit = (m: any) => {
    setEditingMedicao(m);
    setEditForm({
      ...m,
      data_previsao_medicao: m.data_previsao_medicao || "",
      data_envio: m.data_envio || "",
      data_aprovacao: m.data_aprovacao || "",
      data_pagamento: m.data_pagamento || "",
      valor_previsto_medicao: Number(m.valor_previsto_medicao) || 0,
      valor_medicao: Number(m.valor_medicao) || 0,
      valor_acatado: Number(m.valor_acatado) || 0,
    });
    setShowForm(false);
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const renderMedicaoForm = (
    data: any,
    setData: (d: any) => void,
    onSave: () => void,
    title: string,
    onClose?: () => void,
  ) => (
    <Card className={onClose ? "border-primary" : ""}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">{title}</h4>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* IDENTIFICAÇÃO */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Identificação</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-muted-foreground">Nº Medição</label><Input value={data.num_medicao || ""} onChange={(e) => setData({ ...data, num_medicao: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Mês Ref.</label>
              <Select value={data.mes_referencia || ""} onValueChange={(v) => setData({ ...data, mes_referencia: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">Ano Ref.</label><Input type="number" value={data.ano_referencia || ""} onChange={(e) => setData({ ...data, ano_referencia: Number(e.target.value) })} /></div>
            <div>
              <label className="text-xs text-muted-foreground">Status Medição</label>
              <Select value={data.status_medicao || "nao_iniciada"} onValueChange={(v) => setData({ ...data, status_medicao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="enviada">Enviada</SelectItem>
                  <SelectItem value="aprovada">Aprovada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* ENGENHARIA */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Engenharia — Datas e Valores</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ClearableDateInput label="Previsão Envio" value={data.data_previsao_medicao || ""} onChange={(v) => setData({ ...data, data_previsao_medicao: v })} />
            <ClearableDateInput label="Data Envio" value={data.data_envio || ""} onChange={(v) => setData({ ...data, data_envio: v })} />
            <ClearableDateInput label="Data Aprovação" value={data.data_aprovacao || ""} onChange={(v) => setData({ ...data, data_aprovacao: v })} />
            <div>
              <label className="text-xs text-muted-foreground">Valor Previsto (R$)</label>
              <CurrencyInput value={data.valor_previsto_medicao || 0} onChange={(v) => setData({ ...data, valor_previsto_medicao: v })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Valor Realizado (R$)</label>
              <CurrencyInput value={data.valor_medicao || 0} onChange={(v) => setData({ ...data, valor_medicao: v })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Valor Acatado (R$)</label>
              <CurrencyInput value={data.valor_acatado || 0} onChange={(v) => setData({ ...data, valor_acatado: v })} />
              {data.valor_acatado > 0 && data.valor_medicao > 0 && data.valor_acatado !== data.valor_medicao && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Glosa: {BRL.format(Math.abs(data.valor_medicao - data.valor_acatado))}
                </p>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* FINANCEIRO */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Financeiro — NF e Pagamento</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-muted-foreground">Nº NF</label><Input value={data.num_nf || ""} onChange={(e) => setData({ ...data, num_nf: e.target.value })} /></div>
            <ClearableDateInput label="Data Pagamento" value={data.data_pagamento || ""} onChange={(v) => setData({ ...data, data_pagamento: v })} />
            <div>
              <label className="text-xs text-muted-foreground">Status NF</label>
              <Select value={data.status_nf || "pendente"} onValueChange={(v) => setData({ ...data, status_nf: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aguardando_aprovacao">Aguardando</SelectItem>
                  <SelectItem value="recebido">Recebido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={onSave}>
            {onClose ? "Salvar Edição" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Medições ({medicoes.length})</h4>
        <Button size="sm" variant="outline" onClick={() => { setShowForm(!showForm); setEditingMedicao(null); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Medição
        </Button>
      </div>

      {showForm && renderMedicaoForm(form, setForm, addMedicao, "Nova Medição")}

      {editingMedicao && renderMedicaoForm(
        editForm,
        setEditForm,
        updateMedicao,
        `Editando Medição Nº ${editingMedicao.num_medicao || "—"}`,
        () => { setEditingMedicao(null); setEditForm({}); }
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Mês/Ano</TableHead>
              <TableHead>Prev. Envio</TableHead>
              <TableHead>Envio</TableHead>
              <TableHead>Aprovação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Previsto</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Acatado</TableHead>
              <TableHead className="text-right">Desvio</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Status NF</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medicoes.map((m) => {
              const displayStatus = getMedicaoDisplayStatus(m);
              const ns = NF_STATUS_BADGE[m.status_nf] || NF_STATUS_BADGE.pendente;
              const previsto = Number(m.valor_previsto_medicao) || 0;
              const realizado = Number(m.valor_medicao) || 0;
              const acatado = Number(m.valor_acatado) || 0;
              const showNF = shouldShowNF(m);
              const hasGlosa = acatado > 0 && acatado !== realizado;

              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.num_medicao || "—"}</TableCell>
                  <TableCell>{m.mes_referencia}/{m.ano_referencia}</TableCell>
                  <TableCell>{m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell>{m.data_envio ? format(new Date(m.data_envio + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell>{m.data_aprovacao ? format(new Date(m.data_aprovacao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className={`text-[10px] ${displayStatus.cls}`}>{displayStatus.label}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{previsto > 0 ? BRL.format(previsto) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{realizado > 0 ? BRL.format(realizado) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">
                    {acatado > 0 ? (
                      <span className={hasGlosa ? "text-amber-600" : ""}>
                        {BRL.format(acatado)}
                        {hasGlosa && <span className="block text-[9px]">Glosa</span>}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {/* Desvio only when realizado > 0 */}
                    {realizado > 0 && previsto > 0 ? (() => {
                      const desvio = realizado - previsto;
                      const pct = ((desvio / previsto) * 100).toFixed(1);
                      return <span className={desvio >= 0 ? "text-emerald-600" : "text-red-500"}>{desvio >= 0 ? "+" : ""}{pct}%</span>;
                    })() : "—"}
                  </TableCell>
                  <TableCell>{showNF ? (m.num_nf || "—") : ""}</TableCell>
                  <TableCell>{showNF ? <Badge variant="secondary" className={`text-[10px] ${ns.cls}`}>{ns.label}</Badge> : ""}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMedicao(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {medicoes.length === 0 && (
              <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">Nenhuma medição.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
/* ══════════════════════════════════════════════
   TAB 3 — FINANCEIRO
   ══════════════════════════════════════════════ */

const DESPESA_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  fechado: { label: "Fechado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  em_fechamento: { label: "Em Fechamento", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  nao_iniciado: { label: "Não Iniciado", cls: "bg-muted text-muted-foreground" },
};

function FinanceiroTab({ obraId }: { obraId: string }) {
  const invalidateHolding = useInvalidateHolding();
  const [despesas, setDespesas] = useState<any[]>([]);
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDespesa, setShowNewDespesa] = useState(false);
  const [newDespesa, setNewDespesa] = useState({ mes_referencia: "", ano_referencia: String(new Date().getFullYear()), valor: "", status: "nao_iniciado" });
  const [savingDespesa, setSavingDespesa] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase.from("despesas_mensais").select("*").eq("obra_id", obraId).order("ano_referencia").order("mes_referencia"),
      supabase.from("medicoes_ple").select("*").eq("obra_id", obraId).eq("status_medicao", "aprovada"),
    ]).then(([dRes, mRes]) => {
      setDespesas(dRes.data || []);
      setMedicoes(mRes.data || []);
      setLoading(false);
    });
  }, [obraId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveDespesa = async () => {
    if (!newDespesa.mes_referencia || !newDespesa.valor) {
      toast.warning("Preencha mês e valor.");
      return;
    }
    setSavingDespesa(true);
    const { error } = await supabase.from("despesas_mensais").insert({
      obra_id: obraId,
      mes_referencia: newDespesa.mes_referencia,
      ano_referencia: Number(newDespesa.ano_referencia),
      valor: Number(newDespesa.valor),
      status: newDespesa.status as any,
    });
    setSavingDespesa(false);
    if (error) { toast.error("Erro ao salvar despesa."); return; }
    toast.success("Despesa adicionada!");
    invalidateHolding();
    setNewDespesa({ mes_referencia: "", ano_referencia: String(new Date().getFullYear()), valor: "", status: "nao_iniciado" });
    setShowNewDespesa(false);
    loadData();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const monthMap = new Map<string, { despesa: number; receita: number }>();
  despesas.forEach((d) => {
    const key = `${d.mes_referencia}/${d.ano_referencia}`;
    const entry = monthMap.get(key) || { despesa: 0, receita: 0 };
    entry.despesa += d.valor || 0;
    monthMap.set(key, entry);
  });
  medicoes.forEach((m) => {
    const key = `${m.mes_referencia}/${m.ano_referencia}`;
    const entry = monthMap.get(key) || { despesa: 0, receita: 0 };
    entry.receita += m.valor_medicao || 0;
    monthMap.set(key, entry);
  });
  const chartData = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));

  return (
    <div className="space-y-6">
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-3">Despesas × Receitas</h4>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => BRL.format(v)} />
                <Bar dataKey="despesa" fill="hsl(var(--destructive))" name="Despesas" radius={[4, 4, 0, 0]} />
                <Line dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={2} name="Receitas" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Despesas</h4>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewDespesa(!showNewDespesa)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Despesa
        </Button>
      </div>

      {showNewDespesa && (
        <Card className="border-dashed">
          <CardContent className="p-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Mês</label>
                <Select value={newDespesa.mes_referencia} onValueChange={(v) => setNewDespesa(p => ({ ...p, mes_referencia: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ano</label>
                <Input type="number" value={newDespesa.ano_referencia} onChange={(e) => setNewDespesa(p => ({ ...p, ano_referencia: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Valor (R$)</label>
                <Input type="number" value={newDespesa.valor} onChange={(e) => setNewDespesa(p => ({ ...p, valor: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={newDespesa.status} onValueChange={(v) => setNewDespesa(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_iniciado">Não Iniciado</SelectItem>
                    <SelectItem value="em_fechamento">Em Fechamento</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveDespesa} disabled={savingDespesa}>
                {savingDespesa ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês/Ano</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {despesas.map((d) => {
              const s = DESPESA_STATUS_BADGE[d.status] || DESPESA_STATUS_BADGE.nao_iniciado;
              return (
                <TableRow key={d.id}>
                  <TableCell>{d.mes_referencia}/{d.ano_referencia}</TableCell>
                  <TableCell className="text-right font-mono">{BRL.format(d.valor)}</TableCell>
                  <TableCell><Badge variant="secondary" className={`text-[10px] ${s.cls}`}>{s.label}</Badge></TableCell>
                </TableRow>
              );
            })}
            {despesas.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhuma despesa registrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 4 — ADITIVOS
   ══════════════════════════════════════════════ */

function AditivosTab({ obraId }: { obraId: string }) {
  const invalidateHolding = useInvalidateHolding();
  const [aditivos, setAditivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    num_aditivo: "", aditivo_prazo_dias: 0, aditivo_valor: 0,
    supressao_valor: 0, data: "", status: "pendente" as string,
  });

  const load = useCallback(async () => {
    const { data } = await supabase.from("aditivos_contratos").select("*").eq("obra_id", obraId).order("data");
    setAditivos(data || []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const addAditivo = async () => {
    const payload: any = {
      obra_id: obraId,
      num_aditivo: form.num_aditivo || null,
      aditivo_prazo_dias: form.aditivo_prazo_dias || 0,
      aditivo_valor: form.aditivo_valor || 0,
      supressao_valor: form.supressao_valor || 0,
      status: form.status,
    };
    if (form.data) payload.data = form.data;
    const { error } = await supabase.from("aditivos_contratos").insert(payload);
    if (error) { toast.error("Erro ao salvar aditivo"); return; }
    toast.success("Aditivo adicionado!");
    invalidateHolding();
    setShowForm(false);
    setForm({ num_aditivo: "", aditivo_prazo_dias: 0, aditivo_valor: 0, supressao_valor: 0, data: "", status: "pendente" });
    load();
  };

  const deleteAditivo = async (id: string) => {
    if (!confirm("Excluir este aditivo?")) return;
    const { error } = await supabase.from("aditivos_contratos").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Aditivo excluído.");
    invalidateHolding();
    load();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const totalDias = aditivos.reduce((s, a) => s + (a.aditivo_prazo_dias || 0), 0);
  const totalValor = aditivos.reduce((s, a) => s + (a.aditivo_valor || 0), 0);
  const totalSupressao = aditivos.reduce((s, a) => s + (a.supressao_valor || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <Badge variant="outline" className="text-xs">Total dias aditivados: {totalDias}</Badge>
          <Badge variant="outline" className="text-xs">Total valor: {BRL.format(totalValor)}</Badge>
          {totalSupressao > 0 && <Badge variant="outline" className="text-xs text-red-600">Supressão: {BRL.format(totalSupressao)}</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Aditivo
        </Button>
      </div>

      {showForm && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-sm">Novo Aditivo</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><label className="text-xs text-muted-foreground">Nº Aditivo</label><Input value={form.num_aditivo} onChange={(e) => setForm({ ...form, num_aditivo: e.target.value })} placeholder="Ex: 01" /></div>
              <div><label className="text-xs text-muted-foreground">Prazo (dias)</label><Input type="number" value={form.aditivo_prazo_dias || ""} onChange={(e) => setForm({ ...form, aditivo_prazo_dias: Number(e.target.value) })} /></div>
              <div><label className="text-xs text-muted-foreground">Valor Aditivo (R$)</label>
                <CurrencyInput value={form.aditivo_valor} onChange={(v) => setForm({ ...form, aditivo_valor: v })} />
              </div>
              <div><label className="text-xs text-muted-foreground">Supressão (R$)</label>
                <CurrencyInput value={form.supressao_valor} onChange={(v) => setForm({ ...form, supressao_valor: v })} />
              </div>
              <div><label className="text-xs text-muted-foreground">Data</label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={addAditivo}>Salvar Aditivo</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Prazo (dias)</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Supressão</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aditivos.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.num_aditivo || "—"}</TableCell>
                <TableCell>{a.aditivo_prazo_dias > 0 ? `+${a.aditivo_prazo_dias}` : "—"}</TableCell>
                <TableCell className="text-right font-mono">{a.aditivo_valor > 0 ? BRL.format(a.aditivo_valor) : "—"}</TableCell>
                <TableCell className="text-right font-mono">{a.supressao_valor > 0 ? BRL.format(a.supressao_valor) : "—"}</TableCell>
                <TableCell>{a.data ? format(new Date(a.data + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`text-[10px] ${a.status === "aprovado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                    {a.status === "aprovado" ? "Aprovado" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAditivo(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {aditivos.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum aditivo.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 5 — PENDÊNCIAS
   ══════════════════════════════════════════════ */

function PendenciasTab({ obraId }: { obraId: string }) {
  const invalidateHolding = useInvalidateHolding();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTipo, setNewTipo] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("pendencias_projeto").select("*").eq("obra_id", obraId).order("concluido").order("tipo");
    setItems(data || []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const toggleConcluido = async (id: string, value: boolean) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, concluido: value } : i));
    await supabase.from("pendencias_projeto").update({ concluido: value } as any).eq("id", id);
    invalidateHolding();
  };

  const addPendencia = async () => {
    if (!newDesc.trim()) { toast.warning("Preencha a descrição"); return; }
    await supabase.from("pendencias_projeto").insert({ obra_id: obraId, tipo: newTipo || null, descricao: newDesc } as any);
    setNewTipo(""); setNewDesc("");
    toast.success("Pendência adicionada");
    invalidateHolding();
    load();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const pendentes = items.filter((i) => !i.concluido).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" /> Pendências
          {pendentes > 0 && <Badge variant="destructive" className="text-[10px] ml-1">{pendentes}</Badge>}
        </h4>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className={`flex items-start gap-3 rounded-md border px-3 py-2 ${item.concluido ? "bg-muted/30 opacity-60" : ""}`}>
            <Checkbox checked={item.concluido} onCheckedChange={(v) => toggleConcluido(item.id, !!v)} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              {item.tipo && <Badge variant="outline" className="text-[10px] mr-1.5">{item.tipo}</Badge>}
              <span className={`text-sm ${item.concluido ? "line-through text-muted-foreground" : ""}`}>{item.descricao}</span>
            </div>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex items-end gap-2">
        <div className="flex-shrink-0">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Input value={newTipo} onChange={(e) => setNewTipo(e.target.value)} placeholder="Ex: Alvará" className="w-32" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Descrição</label>
          <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descreva a pendência..." />
        </div>
        <Button size="sm" onClick={addPendencia}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </div>
    </div>
  );
}
