import { useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { FileText, Plus, Loader2, ListChecks, Pencil, Trash2, X, FlaskConical, CalendarDays, TrendingUp, Clock, BarChart3, Target, AlertTriangle, DollarSign, Upload, Download, File, Lock, CheckCircle2 } from "lucide-react";
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
    // exact: false garante que invalida qualquer variante da chave
    // ex: ["holding-portfolio", company.id] é alcançado por ["holding-portfolio"]
    qc.invalidateQueries({ queryKey: ["holding-portfolio"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-receitas"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-despesas"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-prd"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-documentos"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-aditivos-pendentes"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-insights-data"], exact: false });
  };
}

/**
 * Recalcula e persiste o percentual_financeiro em obras_portfolio
 * com base nas medições aprovadas / valor do contrato.
 * Chamado após qualquer add/update/delete de medição.
 * Só atualiza se valorContrato > 0 — sem contrato não há base de cálculo.
 * Também atualiza percentual_andamento para compatibilidade legada.
 */
async function recalcularPercentualAndamento(
  obraId: string,
  valorContrato: number
): Promise<void> {
  if (valorContrato <= 0) return;
  try {
    const { data: meds } = await supabase
      .from("medicoes_ple")
      .select("valor_medicao, valor_acatado, status_medicao")
      .eq("obra_id", obraId)
      .eq("status_medicao", "aprovada");

    const totalAprovado = (meds || []).reduce(
      (s, m) => s + (Number((m as any).valor_acatado ?? m.valor_medicao) || 0), 0
    );
    const novoPercentual = Math.min(100, (totalAprovado / valorContrato) * 100);
    const rounded = Math.round(novoPercentual * 10) / 10;

    await supabase
      .from("obras_portfolio")
      .update({ 
        percentual_financeiro: rounded,
        percentual_andamento: rounded 
      })
      .eq("id", obraId);
  } catch (e) {
    console.error("[recalcularPercentualAndamento] Erro:", e);
  }
}

async function registrarLog(
  obraId: string,
  tabela: string,
  registroId: string | null,
  acao: string,
  descricao: string,
  userId: string | null,
  userName: string,
  dadosAnteriores?: Record<string, unknown>,
  dadosNovos?: Record<string, unknown>
) {
  try {
    await supabase.from("holding_audit_log").insert([{
      obra_id: obraId,
      tabela,
      registro_id: registroId,
      acao,
      descricao,
      dados_anteriores: (dadosAnteriores || {}) as any,
      dados_novos: (dadosNovos || {}) as any,
      realizado_por: userId,
      realizado_por_nome: userName,
    }]);
  } catch (e) {
    console.error("[AuditLog] Erro ao registrar:", e);
  }
}

export interface ObraDrawerData {
  id: string;
  nome: string;
  uh?: number | null;
  responsavel?: string | null;
  responsavel_nome?: string | null;
  responsavel_telefone?: string | null;
  coordenador_nome?: string | null;
  coordenador_telefone?: string | null;
  planejador_nome?: string | null;
  planejador_telefone?: string | null;
  tipo_contrato?: string | null;
  valor_contrato?: number;
  data_inicio?: string | null;
  prazo_dias?: number;
  aditivo_prazo_dias?: number;
  aditivo_valor_total?: number;
  percentual_andamento?: number;
  percentual_fisico?: number;
  percentual_financeiro?: number;
  has_initial_balance?: boolean;
  valor_medido_inicial?: number;
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
    const valorContrato = (obra.valor_contrato || 0) + (obra.aditivo_valor_total || 0);

    // ── Acatado real (aprovadas excl. Saldo Inicial) — usa valor_acatado ──
    const totalAcatadoReal = medicoes
      .filter(m => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);

    // ── Saldo Inicial — faturamento anterior ao sistema ──
    const totalMedidoInicial = medicoes
      .filter(m => m.num_medicao === "Saldo Inicial" && m.status_medicao === "aprovada")
      .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);

    // ── Total medido = acatado real + saldo inicial (sem fallback de %) ──
    const totalMedido = totalAcatadoReal + totalMedidoInicial;

    // ── Enviado ao fiscal (aguardando análise) ──
    const totalEnviado = medicoes
      .filter(m => m.status_medicao === "enviada")
      .reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0);

    // ── Total em aberto (medido + enviado) — para saldo a medir ──
    const totalEmAberto = totalMedido + totalEnviado;

    // ── Previsto: só medições futuras ainda não enviadas ──
    // Exclui aprovadas e enviadas — elas já viraram realizado
    const totalPrevisto = medicoes
      .filter(m => m.status_medicao !== "aprovada" && m.status_medicao !== "enviada" && m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + (Number(m.valor_previsto_medicao) || 0), 0);

    // ── Previsto das medições que JÁ foram aprovadas (para calcular desvio correto) ──
    const totalPrevistoAprovadas = medicoes
      .filter(m => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + (Number(m.valor_previsto_medicao) || 0), 0);

    const totalAcatado = medicoes.filter(m => Number(m.valor_acatado) > 0).reduce((s, m) => s + Number(m.valor_acatado), 0);
    const totalRecebido = medicoes.filter(m => m.status_nf === "recebido").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
    const pctMedido = valorContrato > 0 ? (totalMedido / valorContrato) * 100 : 0;
    const saldoMedir = valorContrato - totalEmAberto;
    // Glosa = diferença entre o que foi enviado e o que foi acatado nas aprovadas
    const totalGlosa = medicoes
      .filter(m => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial" && Number(m.valor_acatado) > 0)
      .reduce((s, m) => s + Math.max(0, (Number(m.valor_medicao) || 0) - (Number(m.valor_acatado) || 0)), 0);
    const medicoesEnviadas = medicoes.filter(m => m.status_medicao === "enviada").length;
    const medicoesAprovadas = medicoes.filter(m => m.status_medicao === "aprovada").length;
    const medicoesPrevistas = medicoes.filter(m => m.data_previsao_medicao && !m.data_envio).length;
    // Desvio: compara previsto vs acatado APENAS nas medições já aprovadas
    const desvioAprovadas = totalPrevistoAprovadas > 0
      ? ((totalAcatadoReal - totalPrevistoAprovadas) / totalPrevistoAprovadas) * 100
      : null;

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
      valorContrato, totalMedido, totalEnviado, totalEmAberto, totalRecebido,
      totalPrevisto, totalPrevistoAprovadas, totalAcatadoReal,
      pctMedido, saldoMedir, totalGlosa, totalAcatado, desvioAprovadas,
      medicoesEnviadas, medicoesAprovadas, medicoesPrevistas,
      diasRestantes, previsaoFim, pctPrazo,
      totalMedicoes: medicoes.length,
    };
  }, [medicoes, obra]);

  const chartData = useMemo(() => {
    if (medicoes.length === 0) return [];
    const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return medicoes
      .filter(m => m.mes_referencia && m.num_medicao !== "Saldo Inicial")
      .sort((a, b) => {
        const aIdx = MONTHS_SHORT.findIndex(x => x.toLowerCase() === (a.mes_referencia || "").toLowerCase());
        const bIdx = MONTHS_SHORT.findIndex(x => x.toLowerCase() === (b.mes_referencia || "").toLowerCase());
        return (a.ano_referencia - b.ano_referencia) || (aIdx - bIdx);
      })
      .map(m => ({
        name: `${m.mes_referencia}/${String(m.ano_referencia).slice(-2)}`,
        previsto: Number(m.valor_previsto_medicao) || 0,
        realizado: Number(m.valor_acatado ?? m.valor_medicao) || 0,
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
        <MiniKpi icon={<DollarSign className="h-4 w-4" />} label="Valor Contrato" value={BRL.format(kpis.valorContrato)} sub="valor total contratado" color="text-foreground" />
        <MiniKpi icon={<TrendingUp className="h-4 w-4" />} label="Total Medido" value={BRL.format(kpis.totalMedido)} sub={`${kpis.pctMedido.toFixed(1)}% do contrato`} color="text-emerald-600" />
        <MiniKpi icon={<Clock className="h-4 w-4" />} label="Enviado/Pendente" value={BRL.format(kpis.totalEnviado)} sub="aguardando aprovação" color="text-amber-600" />
        <MiniKpi icon={<Target className="h-4 w-4" />} label="Saldo a Medir" value={BRL.format(kpis.saldoMedir)} sub={kpis.valorContrato > 0 ? `${((kpis.saldoMedir / kpis.valorContrato) * 100).toFixed(1)}% restante` : undefined} color="text-blue-600" />
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
              <span className="text-muted-foreground">Andamento financeiro</span>
              <span className="font-semibold">{kpis.pctMedido.toFixed(1)}%</span>
            </div>
            <Progress value={kpis.pctMedido} className="h-2" />

            {kpis.totalGlosa > 0 && (
              <div className="flex items-center justify-between text-sm pt-1">
                <span className="text-amber-600">Glosa acumulada</span>
                <span className="font-semibold text-amber-600">{BRL.format(kpis.totalGlosa)}</span>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Acatado (aprovadas)</span>
              <span className="font-medium text-emerald-600">{BRL.format(kpis.totalAcatadoReal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Previsto (medições futuras)</span>
              <span className="font-medium">{BRL.format(kpis.totalPrevisto)}</span>
            </div>
            {kpis.totalEnviado > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Enviado (aguard. fiscal)</span>
                <span className="font-medium text-blue-600">{BRL.format(kpis.totalEnviado)}</span>
              </div>
            )}
            {kpis.desvioAprovadas !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Desvio prev. × acatado</span>
                <span className={`font-semibold ${kpis.desvioAprovadas >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                  {kpis.desvioAprovadas >= 0 ? "+" : ""}{kpis.desvioAprovadas.toFixed(1)}%
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
            const contacts = [
              { label: "🏗️ Eng.", nome: obra.responsavel_nome || obra.responsavel?.split(" - ")[0] || "", tel: obra.responsavel_telefone || obra.responsavel?.split(" - ")[1] || "" },
              { label: "📋 Coord.", nome: obra.coordenador_nome || "", tel: obra.coordenador_telefone || "" },
              { label: "📐 Plan.", nome: obra.planejador_nome || "", tel: obra.planejador_telefone || "" },
            ].filter(c => c.nome);
            return contacts.map((c, i) => {
              const telLimpo = c.tel.replace(/\D/g, "");
              const waNumber = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
              return (
                <span key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                  {c.label}: {c.nome}
                  {telLimpo && (
                    <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá ${c.nome}, tudo bem?`)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-emerald-600 hover:text-emerald-500 font-medium">📱 {c.tel}</a>
                  )}
                </span>
              );
            });
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
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="resumo" className="mt-0"><ResumoTab obra={obra} /></TabsContent>
          <TabsContent value="documentos" className="mt-0"><DocumentosTab obraId={obra.id} /></TabsContent>
          <TabsContent value="medicoes" className="mt-0"><MedicoesTab obraId={obra.id} valorContrato={(obra.valor_contrato || 0) + (obra.aditivo_valor_total || 0)} hasInitialBalance={obra.has_initial_balance || false} valorMedidoInicial={obra.valor_medido_inicial || 0} obra={obra} /></TabsContent>
          <TabsContent value="financeiro" className="mt-0"><FinanceiroTab obraId={obra.id} /></TabsContent>
          <TabsContent value="aditivos" className="mt-0"><AditivosTab obraId={obra.id} /></TabsContent>
          <TabsContent value="pendencias" className="mt-0"><PendenciasTab obraId={obra.id} /></TabsContent>
          <TabsContent value="historico" className="mt-0"><HistoricoTab obraId={obra.id} /></TabsContent>
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

interface DocFile {
  id: string;
  obra_doc_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

const ACCEPTED_FILE_TYPES = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentosTab({ obraId }: { obraId: string }) {
  const { company, user } = useAuth();
  const invalidateHolding = useInvalidateHolding();

  const [docTipos, setDocTipos] = useState<{ id: string; nome: string; categoria: string; obrigatorio: boolean }[]>([]);
  const [obraDocsMap, setObraDocsMap] = useState<Map<string, any>>(new Map());
  const [docFilesMap, setDocFilesMap] = useState<Map<string, DocFile[]>>(new Map());
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<DocFile | null>(null);

  const [legacyDocs, setLegacyDocs] = useState<Record<string, boolean> | null>(null);
  const [legacyDocId, setLegacyDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company?.id) return;

    const { data: tipos } = await supabase
      .from("holding_doc_tipos")
      .select("id, nome, categoria, obrigatorio")
      .eq("company_id", company.id)
      .eq("ativo", true)
      .order("categoria")
      .order("ordem");

    setDocTipos(tipos || []);

    const { data: obraDocs } = await supabase
      .from("holding_obra_docs")
      .select("*")
      .eq("obra_id", obraId);

    const map = new Map<string, any>();
    (obraDocs || []).forEach((d: any) => map.set(d.doc_tipo_id, d));
    setObraDocsMap(map);

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

    // Load files for all obra docs
    const obraDocIds = Array.from(map.values()).map((d: any) => d.id).filter(Boolean);
    if (obraDocIds.length > 0) {
      const { data: files } = await supabase
        .from("holding_doc_files")
        .select("*")
        .in("obra_doc_id", obraDocIds)
        .order("created_at", { ascending: false });

      const filesMap = new Map<string, DocFile[]>();
      (files || []).forEach((f: any) => {
        const list = filesMap.get(f.obra_doc_id) || [];
        list.push(f);
        filesMap.set(f.obra_doc_id, list);
      });
      setDocFilesMap(filesMap);
    }

    // Legacy
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

  const toggleLegacy = async (key: string, value: boolean) => {
    if (!legacyDocId) return;
    setLegacyDocs(prev => prev ? { ...prev, [key]: value } : prev);
    await supabase.from("documentos_obra").update({ [key]: value } as any).eq("id", legacyDocId);
    invalidateHolding();
  };

  const handleFileUpload = async (docTipoId: string, file: globalThis.File) => {
    const obraDoc = obraDocsMap.get(docTipoId);
    if (!obraDoc?.id || !company?.id) return;

    const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'];
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      toast.error("Tipo de arquivo não permitido. Aceitos: PDF, PNG, JPG, DOC, DOCX, XLS, XLSX");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("Arquivo muito grande. Máximo: 20MB");
      return;
    }

    setUploadingDocId(docTipoId);
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${company.id}/${obraId}/${docTipoId}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("holding-documents")
        .upload(storagePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const profileName = user?.email?.split("@")[0] || "Usuário";

      const { data: inserted, error: insertError } = await supabase
        .from("holding_doc_files")
        .insert({
          obra_doc_id: obraDoc.id,
          file_name: file.name,
          file_path: storagePath,
          file_size: file.size,
          content_type: file.type || "application/octet-stream",
          uploaded_by: user?.id || "",
          uploaded_by_name: profileName,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      // Update local state
      setDocFilesMap(prev => {
        const next = new Map(prev);
        const list = next.get(obraDoc.id) || [];
        next.set(obraDoc.id, [inserted as any, ...list]);
        return next;
      });

      await registrarLog(obraId, "holding_doc_files", (inserted as any)?.id, "upload", `Arquivo "${file.name}" anexado ao documento`, user?.id || null, profileName);

      toast.success(`Arquivo "${file.name}" anexado com sucesso`);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erro ao enviar arquivo: " + (err.message || "erro desconhecido"));
    } finally {
      setUploadingDocId(null);
    }
  };

  const handleFileDownload = async (file: DocFile) => {
    try {
      const { data, error } = await supabase.storage
        .from("holding-documents")
        .createSignedUrl(file.file_path, 60);

      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err: any) {
      toast.error("Erro ao baixar arquivo");
    }
  };

  const handleFileDelete = async (file: DocFile) => {
    setDeletingFile(null);

    try {
      // DB primeiro: se falhar, o arquivo permanece no storage (consistência preferível)
      const { error: dbErr } = await supabase.from("holding_doc_files").delete().eq("id", file.id);
      if (dbErr) throw dbErr;
      // Storage depois: se falhar, o registro DB já foi removido (arquivo órfão no storage, não visível ao usuário)
      await supabase.storage.from("holding-documents").remove([file.file_path]);

      setDocFilesMap(prev => {
        const next = new Map(prev);
        const list = (next.get(file.obra_doc_id) || []).filter(f => f.id !== file.id);
        next.set(file.obra_doc_id, list);
        return next;
      });

      const profileName = user?.email?.split("@")[0] || "Usuário";
      await registrarLog(obraId, "holding_doc_files", file.id, "delete", `Arquivo "${file.file_name}" removido`, user?.id || null, profileName);

      toast.success("Arquivo removido");
    } catch {
      toast.error("Erro ao excluir arquivo");
    }
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
            ? flexibleItems.map(item => {
                const obraDoc = obraDocsMap.get(item.id);
                const files = obraDoc ? (docFilesMap.get(obraDoc.id) || []) : [];
                const isUploading = uploadingDocId === item.id;

                return (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{item.nome}</span>
                      <div className="flex items-center gap-2">
                        {obraDoc && (
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              className="hidden"
                              accept={ACCEPTED_FILE_TYPES}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileUpload(item.id, f);
                                e.target.value = "";
                              }}
                              disabled={isUploading}
                            />
                            {isUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Upload className="h-4 w-4 text-muted-foreground hover:text-primary cursor-pointer" />
                            )}
                          </label>
                        )}
                        <Switch checked={!!obraDoc?.checked} onCheckedChange={(v) => toggleFlexible(item.id, v)} />
                      </div>
                    </div>
                    {/* File list */}
                    {files.length > 0 && (
                      <div className="ml-2 space-y-1">
                        {files.map(f => (
                          <div key={f.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5 gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate font-medium">{f.file_name}</span>
                              <span className="text-muted-foreground shrink-0">({formatFileSize(f.file_size)})</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-muted-foreground hidden md:inline">
                                {f.uploaded_by_name} · {format(new Date(f.created_at), "dd/MM/yy")}
                              </span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleFileDownload(f)} title="Baixar">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              {f.uploaded_by === user?.id && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeletingFile(f)} title="Excluir">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
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
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderDocCard("Pré Obra", <FileText className="h-4 w-4" />, docObraTipos, PRE_OBRA_FIELDS)}
        {renderDocCard("Ensaios e Projetos", <FlaskConical className="h-4 w-4" />, ensaiosTipos, ENSAIOS_PROJETOS_FIELDS)}
      </div>

      <AlertDialog open={!!deletingFile} onOpenChange={(open) => !open && setDeletingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deletingFile?.file_name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingFile && handleFileDelete(deletingFile)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ══════════════════════════════════════════════
   TAB 2 — MEDIÇÕES
   ══════════════════════════════════════════════
   MEASUREMENT LIFECYCLE:
   prevista  → enviada:  requires data_envio + valor_medicao > 0
   enviada   → aprovada: requires data_aprovacao + valor_acatado > 0 + valor_acatado <= valor_medicao
   aprovada  → recebido: requires data_pagamento (status_nf field, not status_medicao)

   BLOCKS:
   - Cannot skip steps
   - Cannot set aprovada without enviada first
   - Cannot set recebido without aprovada first
   - valor_acatado cannot exceed valor_medicao
   - Dates must be chronologically consistent

   DISPLAY-ONLY:
   - 'em_andamento' shown when prevista + current month (stored as prevista)
   ══════════════════════════════════════════════ */

const NF_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  recebido: { label: "Recebido", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  aguardando_aprovacao: { label: "Aguardando", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
};

/**
 * Determines the display status badge based on measurement state.
 * "Em Andamento" is determined by date range: the measurement whose
 * data_previsao_medicao period covers today (between this measurement's
 * forecast date and the next measurement's forecast date).
 * Only ONE measurement can be "Em Andamento" at a time.
 * 
 * MEASUREMENT LIFECYCLE:
 * prevista  → enviada:  requires data_envio + valor_medicao > 0
 * enviada   → aprovada: requires data_aprovacao + valor_acatado > 0 + valor_acatado <= valor_medicao
 * aprovada  → recebido: requires data_pagamento (status_nf field, not status_medicao)
 * 
 * DISPLAY-ONLY:
 * 'em_andamento' shown when prevista + current date within measurement period (stored as prevista)
 */
function getMedicaoDisplayStatus(m: any, allMedicoes?: any[]): { label: string; cls: string; isOverdue?: boolean } {
  if (m.status_medicao === "aprovada") return { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
  if (m.status_medicao === "enviada") return { label: "Enviada", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };

  if (m.status_medicao === "prevista") {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check if overdue: forecast date passed and not yet sent
    const previsaoDate = m.data_previsao_medicao ? new Date(m.data_previsao_medicao + "T12:00:00") : null;
    const isOverdue = previsaoDate ? previsaoDate < today : false;

    // Determine "Em Andamento": use sorted prevista measurements date ranges
    if (allMedicoes && allMedicoes.length > 0) {
      // Get only prevista measurements sorted by data_previsao_medicao
      const previstas = allMedicoes
        .filter(x => x.status_medicao === "prevista" && x.num_medicao !== "Saldo Inicial" && x.data_previsao_medicao)
        .sort((a, b) => a.data_previsao_medicao.localeCompare(b.data_previsao_medicao));

      const idx = previstas.findIndex(x => x.id === m.id);
      if (idx >= 0) {
        const startDate = new Date(previstas[idx].data_previsao_medicao + "T00:00:00");
        const endDate = idx < previstas.length - 1
          ? new Date(previstas[idx + 1].data_previsao_medicao + "T00:00:00")
          : null; // last prevista: open-ended

        // "Em Andamento" if today >= startDate AND (no endDate OR today < endDate)
        const isInRange = today >= startDate && (endDate === null || today < endDate);

        if (isInRange) {
          return { label: "Em Andamento", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", isOverdue };
        }
      }
    }

    if (isOverdue) {
      return { label: "Atrasada", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", isOverdue: true };
    }

    return { label: "Previsão", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  }

  return { label: m.status_medicao || "—", cls: "bg-muted text-muted-foreground" };
}

/** Build WhatsApp message URL for overdue measurement alerts */
function buildWhatsAppUrl(phone: string, obraNome: string, numMedicao: string, dataPrevisao: string): string {
  const cleanPhone = phone.replace(/\D/g, "");
  const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
  const msg = encodeURIComponent(
    `⚠️ *Alerta de Medição Atrasada*\n\n` +
    `Obra: *${obraNome}*\n` +
    `Medição nº: *${numMedicao}*\n` +
    `Data prevista de envio: *${dataPrevisao}*\n\n` +
    `A medição está com a data de previsão vencida e ainda não foi enviada ao fiscal. Por favor, providenciar o envio o mais breve possível.`
  );
  return `https://wa.me/${fullPhone}?text=${msg}`;
}

function ClearableDateInput({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="relative">
        <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="pr-7" disabled={disabled} />
        {value && !disabled && (
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

function MedicoesTab({ obraId, valorContrato, hasInitialBalance, valorMedidoInicial, obra }: { obraId: string; valorContrato: number; hasInitialBalance: boolean; valorMedidoInicial: number; obra: ObraDrawerData }) {
  const { user, profile, requireEdit, isCompanyAdmin, isSystemAdmin } = useAuth();
  const isAdmin = isCompanyAdmin || isSystemAdmin;
  const userName = profile?.display_name || user?.email || "Usuário";
  const userId = user?.id || null;
  const invalidateHolding = useInvalidateHolding();
  const [deletingMedicaoId, setDeletingMedicaoId] = useState<string | null>(null);
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMedicao, setEditingMedicao] = useState<any | null>(null);

  // New measurement form (Step 1 only)
  const [newForm, setNewForm] = useState({
    num_medicao: "", mes_referencia: "", ano_referencia: new Date().getFullYear(),
    data_previsao_medicao: "", valor_previsto_medicao: 0,
  });

  // Edit form sections
  const [editForm, setEditForm] = useState<any>({});

  // Confirmation dialogs
  const [confirmEnvio, setConfirmEnvio] = useState(false);
  const [confirmAcatamento, setConfirmAcatamento] = useState(false);
  const [confirmRecebimento, setConfirmRecebimento] = useState(false);
  const [confirmEnvioEarly, setConfirmEnvioEarly] = useState(false);
  const [confirmPrevisao, setConfirmPrevisao] = useState(false);

  // Correction request
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [correctionSection, setCorrectionSection] = useState("previsao");
  const [correctionReason, setCorrectionReason] = useState("");
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [medRes, reqRes] = await Promise.all([
      supabase.from("medicoes_ple").select("*").eq("obra_id", obraId).order("ano_referencia", { ascending: true }),
      supabase.from("medicao_correction_requests").select("*").eq("obra_id", obraId).eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    const sorted = (medRes.data || []).sort((a, b) => {
      if (a.num_medicao === "Saldo Inicial") return -1;
      if (b.num_medicao === "Saldo Inicial") return 1;
      const na = parseInt(a.num_medicao || "0", 10);
      const nb = parseInt(b.num_medicao || "0", 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return (a.num_medicao || "").localeCompare(b.num_medicao || "");
    });
    setMedicoes(sorted);
    setPendingRequests(reqRes.data || []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const baseJaComprometida = hasInitialBalance ? (valorMedidoInicial || 0) : 0;

  const saldoDisponivel = useMemo(() => {
    if (valorContrato === 0) return Infinity;
    const totalLancado = medicoes
      .filter(m => m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + Math.max(Number(m.valor_medicao) || 0, Number(m.valor_previsto_medicao) || 0), 0);
    return Math.max(0, valorContrato - baseJaComprometida - totalLancado);
  }, [medicoes, valorContrato, baseJaComprometida]);

  const totalJaLancado = useMemo(() => {
    const lancadoNoBanco = medicoes
      .filter(m => m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + Math.max(Number(m.valor_medicao) || 0, Number(m.valor_previsto_medicao) || 0), 0);
    return baseJaComprometida + lancadoNoBanco;
  }, [medicoes, baseJaComprometida]);

  /** Check if a measurement section is locked and whether user can edit it */
  const isSectionLocked = useCallback((m: any, section: string): boolean => {
    if (!m) return false;
    // Check temporary unlock
    if (m.unlocked_section === section && m.unlocked_until) {
      const unlockExpiry = new Date(m.unlocked_until);
      if (unlockExpiry > new Date()) return false; // temporarily unlocked
    }
    const status = m.status_medicao;
    switch (section) {
      case "previsao":
        // Locked after envio is registered (status is enviada or aprovada)
        return status === "enviada" || status === "aprovada";
      case "envio":
        // Locked after envio is registered
        return status === "enviada" || status === "aprovada";
      case "acatamento":
        // Locked after aprovada
        return status === "aprovada";
      case "pagamento":
        // Locked after recebido
        return m.status_nf === "recebido";
      default:
        return false;
    }
  }, []);

  const canEditSection = useCallback((m: any, section: string): boolean => {
    if (isAdmin) return true; // admin can always edit
    return !isSectionLocked(m, section);
  }, [isAdmin, isSectionLocked]);

  // ─── CREATE NEW MEASUREMENT (Step 1: prevista) ───
  const addMedicao = async () => {
    if (!requireEdit()) return;
    if (!newForm.num_medicao || !newForm.mes_referencia || !newForm.data_previsao_medicao || newForm.valor_previsto_medicao <= 0) {
      toast.warning("Preencha todos os campos obrigatórios: Nº, Mês, Ano, Data Previsão e Valor Previsto > 0.");
      return;
    }

    const isDuplicate = medicoes.some(m =>
      m.num_medicao === newForm.num_medicao &&
      m.mes_referencia?.toLowerCase() === newForm.mes_referencia.toLowerCase() &&
      m.ano_referencia === newForm.ano_referencia
    );
    if (isDuplicate) {
      toast.warning(`Já existe uma medição Nº ${newForm.num_medicao} para ${newForm.mes_referencia}/${newForm.ano_referencia}.`);
      return;
    }

    if (valorContrato > 0) {
      const novoValor = newForm.valor_previsto_medicao;
      if (totalJaLancado + novoValor > valorContrato) {
        const disponivel = valorContrato - totalJaLancado;
        toast.error(disponivel <= 0
          ? `❌ Limite atingido. Total já alcançou ${BRL.format(valorContrato)}.`
          : `❌ Valor excede o saldo disponível: ${BRL.format(disponivel)}.`
        );
        return;
      }
    }

    // Show confirmation dialog
    setConfirmPrevisao(true);
  };

  const doAddMedicao = async () => {
    setConfirmPrevisao(false);
    const payload: any = {
      obra_id: obraId,
      num_medicao: newForm.num_medicao,
      mes_referencia: newForm.mes_referencia,
      ano_referencia: newForm.ano_referencia,
      data_previsao_medicao: newForm.data_previsao_medicao,
      valor_previsto_medicao: newForm.valor_previsto_medicao,
      status_medicao: "prevista",
      valor_medicao: 0,
      status_nf: "pendente",
    };

    const { data: inserted, error } = await supabase
      .from("medicoes_ple").insert(payload).select("id").single();
    if (error) { toast.error("Erro ao salvar medição"); return; }

    if (inserted?.id) {
      await supabase.from("medicoes_ple").update({
        created_by_user_id: userId, created_by_name: userName,
      }).eq("id", inserted.id);
    }

    await registrarLog(
      obraId, "medicoes_ple", inserted?.id || null, "criou",
      `Adicionou medição Nº ${newForm.num_medicao} — ${newForm.mes_referencia}/${newForm.ano_referencia} — Previsto: ${BRL.format(newForm.valor_previsto_medicao)}`,
      userId, userName, {}, { ...newForm }
    );

    await recalcularPercentualAndamento(obraId, valorContrato);
    toast.success("Medição criada com status Previsão!");
    invalidateHolding();
    setShowForm(false);
    setNewForm({ num_medicao: "", mes_referencia: "", ano_referencia: new Date().getFullYear(), data_previsao_medicao: "", valor_previsto_medicao: 0 });
    load();
  };

  // ─── SAVE EDIT (Section 1 only — previsão fields) ───
  const saveEditPrevisao = async () => {
    if (!requireEdit() || !editingMedicao) return;

    // Check locking
    if (isSectionLocked(editingMedicao, "previsao") && !isAdmin) {
      toast.error("🔒 Seção bloqueada. Solicite correção ao administrador.");
      return;
    }

    if (valorContrato > 0) {
      const novoValor = Math.max(Number(editForm.valor_medicao) || 0, Number(editForm.valor_previsto_medicao) || 0);
      const totalSemEsta = medicoes
        .filter(m => m.id !== editingMedicao.id && m.num_medicao !== "Saldo Inicial")
        .reduce((s, m) => s + Math.max(Number(m.valor_medicao) || 0, Number(m.valor_previsto_medicao) || 0), 0);
      const totalComBase = totalSemEsta + baseJaComprometida;
      if (novoValor > 0 && totalComBase + novoValor > valorContrato) {
        toast.error(`❌ Valor excede o saldo disponível: ${BRL.format(Math.max(0, valorContrato - totalComBase))}.`);
        return;
      }
    }

    const payload: any = {
      num_medicao: editForm.num_medicao,
      mes_referencia: editForm.mes_referencia,
      ano_referencia: editForm.ano_referencia,
      data_previsao_medicao: editForm.data_previsao_medicao || null,
      valor_previsto_medicao: editForm.valor_previsto_medicao || 0,
    };

    const { error } = await supabase.from("medicoes_ple").update(payload).eq("id", editingMedicao.id);
    if (error) { toast.error("Erro ao atualizar"); return; }

    await supabase.from("medicoes_ple").update({
      updated_by_user_id: userId, updated_by_name: userName, updated_at: new Date().toISOString(),
    }).eq("id", editingMedicao.id);

    await registrarLog(obraId, "medicoes_ple", editingMedicao.id, "editou",
      `Editou previsão Nº ${editForm.num_medicao}`, userId, userName, { ...editingMedicao }, payload);

    await recalcularPercentualAndamento(obraId, valorContrato);
    toast.success("Previsão atualizada!");
    invalidateHolding();
    setEditingMedicao(null);
    load();
  };

  // ─── REGISTER ENVIO (prevista → enviada) ───
  const doRegistrarEnvio = async () => {
    if (!requireEdit() || !editingMedicao) return;
    setConfirmEnvio(false);
    setConfirmEnvioEarly(false);

    const payload: any = {
      data_envio: editForm.data_envio,
      valor_medicao: editForm.valor_medicao,
      status_medicao: "enviada",
    };

    const { error } = await supabase.from("medicoes_ple").update(payload).eq("id", editingMedicao.id);
    if (error) { toast.error("Erro ao registrar envio"); return; }

    await supabase.from("medicoes_ple").update({
      updated_by_user_id: userId, updated_by_name: userName, updated_at: new Date().toISOString(),
    }).eq("id", editingMedicao.id);

    await registrarLog(obraId, "medicoes_ple", editingMedicao.id, "enviou",
      `Registrou envio Nº ${editForm.num_medicao} — ${BRL.format(editForm.valor_medicao)}`, userId, userName,
      { status_medicao: editingMedicao.status_medicao }, payload);

    await recalcularPercentualAndamento(obraId, valorContrato);
    toast.success("Medição registrada como Enviada! Os campos de previsão e envio estão agora bloqueados.");
    invalidateHolding();
    setEditingMedicao(null);
    load();
  };

  const handleRegistrarEnvio = () => {
    if (!editForm.data_envio) { toast.warning("Informe a data de envio."); return; }
    if (!editForm.valor_medicao || editForm.valor_medicao <= 0) { toast.warning("Informe o valor realizado > 0."); return; }
    // Warning if envio date before previsao
    if (editForm.data_previsao_medicao && editForm.data_envio < editForm.data_previsao_medicao) {
      setConfirmEnvioEarly(true);
      return;
    }
    setConfirmEnvio(true);
  };

  // ─── REGISTER ACATAMENTO (enviada → aprovada) ───
  const doRegistrarAcatamento = async () => {
    if (!requireEdit() || !editingMedicao) return;
    setConfirmAcatamento(false);

    const payload: any = {
      data_aprovacao: editForm.data_aprovacao,
      valor_acatado: editForm.valor_acatado,
      status_medicao: "aprovada",
    };

    const { error } = await supabase.from("medicoes_ple").update(payload).eq("id", editingMedicao.id);
    if (error) { toast.error("Erro ao registrar acatamento"); return; }

    await supabase.from("medicoes_ple").update({
      updated_by_user_id: userId, updated_by_name: userName, updated_at: new Date().toISOString(),
    }).eq("id", editingMedicao.id);

    const glosa = editForm.valor_medicao - editForm.valor_acatado;
    await registrarLog(obraId, "medicoes_ple", editingMedicao.id, "aprovou",
      `Acatamento Nº ${editForm.num_medicao} — ${BRL.format(editForm.valor_acatado)}${glosa > 0 ? ` (glosa: ${BRL.format(glosa)})` : ""}`,
      userId, userName, { status_medicao: "enviada" }, payload);

    await recalcularPercentualAndamento(obraId, valorContrato);
    toast.success(glosa > 0 ? "Medição aprovada com glosa! Campos bloqueados." : "Medição aprovada integralmente! Campos bloqueados.");
    invalidateHolding();
    setEditingMedicao(null);
    load();
  };

  const handleRegistrarAcatamento = () => {
    if (!editForm.data_aprovacao) { toast.warning("Informe a data de aprovação."); return; }
    if (!editForm.valor_acatado || editForm.valor_acatado <= 0) { toast.warning("Informe o valor acatado > 0."); return; }
    if (editForm.valor_acatado > editForm.valor_medicao) { toast.error("❌ Valor acatado não pode ser maior que o valor realizado."); return; }
    if (editForm.data_aprovacao < editForm.data_envio) { toast.error("❌ Data de aprovação não pode ser anterior ao envio."); return; }
    setConfirmAcatamento(true);
  };

  // ─── REGISTER RECEBIMENTO (NF + pagamento) ───
  const doRegistrarRecebimento = async () => {
    if (!requireEdit() || !editingMedicao) return;
    setConfirmRecebimento(false);

    const payload: any = {
      num_nf: editForm.num_nf || null,
      data_pagamento: editForm.data_pagamento,
      status_nf: "recebido",
    };

    const { error } = await supabase.from("medicoes_ple").update(payload).eq("id", editingMedicao.id);
    if (error) { toast.error("Erro ao registrar recebimento"); return; }

    await supabase.from("medicoes_ple").update({
      updated_by_user_id: userId, updated_by_name: userName, updated_at: new Date().toISOString(),
    }).eq("id", editingMedicao.id);

    await registrarLog(obraId, "medicoes_ple", editingMedicao.id, "recebeu",
      `Recebimento NF ${editForm.num_nf || "—"} — Pgto: ${editForm.data_pagamento}`,
      userId, userName, { status_nf: editingMedicao.status_nf }, payload);

    toast.success("Recebimento registrado! Medição completamente bloqueada.");
    invalidateHolding();
    setEditingMedicao(null);
    load();
  };

  const handleRegistrarRecebimento = () => {
    if (!editForm.data_pagamento) { toast.warning("Informe a data de pagamento."); return; }
    if (editForm.data_pagamento < editForm.data_aprovacao) { toast.error("❌ Data de pagamento não pode ser anterior à aprovação."); return; }
    if (!editForm.num_nf) { toast.info("💡 Recomendamos informar o Nº da NF."); }
    setConfirmRecebimento(true);
  };

  // ─── CORRECTION REQUEST ───
  const submitCorrectionRequest = async () => {
    if (!editingMedicao || !correctionReason.trim()) {
      toast.warning("Informe o motivo da correção.");
      return;
    }

    const { error } = await supabase.from("medicao_correction_requests").insert({
      obra_id: obraId,
      medicao_id: editingMedicao.id,
      requested_by: userId,
      requested_by_name: userName,
      reason: correctionReason,
      section: correctionSection,
    } as any);

    if (error) { toast.error("Erro ao enviar solicitação."); return; }

    await registrarLog(obraId, "medicao_correction_requests", editingMedicao.id, "solicitou_correcao",
      `Solicitou correção na seção "${correctionSection}" — Motivo: ${correctionReason}`,
      userId, userName);

    toast.success("Solicitação enviada ao administrador da empresa!");
    setShowCorrectionDialog(false);
    setCorrectionReason("");
    load();
  };

  // ─── ADMIN: APPROVE/REJECT CORRECTION REQUEST ───
  const handleCorrectionReview = async (requestId: string, approve: boolean) => {
    const request = pendingRequests.find(r => r.id === requestId);
    if (!request) return;

    if (approve) {
      // Unlock the measurement section for 24 hours
      const unlockUntil = new Date();
      unlockUntil.setHours(unlockUntil.getHours() + 24);

      await supabase.from("medicoes_ple").update({
        unlocked_until: unlockUntil.toISOString(),
        unlocked_by: userId,
        unlocked_section: request.section,
      } as any).eq("id", request.medicao_id);
    }

    await supabase.from("medicao_correction_requests").update({
      status: approve ? "approved" : "rejected",
      reviewed_by: userId,
      reviewed_by_name: userName,
      reviewed_at: new Date().toISOString(),
    } as any).eq("id", requestId);

    await registrarLog(obraId, "medicao_correction_requests", requestId,
      approve ? "aprovou_correcao" : "rejeitou_correcao",
      `${approve ? "Aprovou" : "Rejeitou"} solicitação de correção — Medição: ${request.medicao_id}`,
      userId, userName);

    toast.success(approve ? "Solicitação aprovada! Medição desbloqueada por 24h." : "Solicitação rejeitada.");
    load();
  };

  const deleteMedicao = async (id: string) => {
    if (!requireEdit()) return;
    const medicaoSnap = medicoes.find(m => m.id === id);

    // Non-admins can't delete locked measurements
    if (!isAdmin && (medicaoSnap?.status_medicao === "enviada" || medicaoSnap?.status_medicao === "aprovada")) {
      toast.error("🔒 Medição bloqueada. Somente o administrador pode excluir.");
      return;
    }

    setDeletingMedicaoId(null);
    const { error } = await supabase.from("medicoes_ple").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir medição"); return; }

    await registrarLog(
      obraId, "medicoes_ple", id, "excluiu",
      `Excluiu medição ${medicaoSnap?.num_medicao ? `Nº ${medicaoSnap.num_medicao}` : ""} — ${medicaoSnap?.mes_referencia}/${medicaoSnap?.ano_referencia}`,
      userId, userName, { ...medicaoSnap }, {}
    );

    await recalcularPercentualAndamento(obraId, valorContrato);
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
      num_nf: m.num_nf || "",
    });
    setShowForm(false);
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const status = editForm.status_medicao || "prevista";
  const glosaValue = (editForm.valor_medicao || 0) - (editForm.valor_acatado || 0);

  // Lock status checks for the current editing measurement
  const previsaoLocked = editingMedicao ? isSectionLocked(editingMedicao, "previsao") : false;
  const envioLocked = editingMedicao ? isSectionLocked(editingMedicao, "envio") : false;
  const acatamentoLocked = editingMedicao ? isSectionLocked(editingMedicao, "acatamento") : false;
  const pagamentoLocked = editingMedicao ? isSectionLocked(editingMedicao, "pagamento") : false;

  const canEditPrevisao = editingMedicao ? canEditSection(editingMedicao, "previsao") : true;
  const canEditEnvio = editingMedicao ? canEditSection(editingMedicao, "envio") : true;
  const canEditAcatamento = editingMedicao ? canEditSection(editingMedicao, "acatamento") : true;
  const canEditPagamento = editingMedicao ? canEditSection(editingMedicao, "pagamento") : true;

  // ─── RENDER STAGED EDIT FORM ───
  const renderStagedEditForm = () => {
    if (!editingMedicao) return null;

    // Check for pending correction request for this measurement
    const hasPendingRequest = pendingRequests.some(r => r.medicao_id === editingMedicao.id);

    return (
      <Card className="border-primary">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Editando Medição Nº {editForm.num_medicao || "—"}</h4>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingMedicao(null); setEditForm({}); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* SECTION 1 — Previsão */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> 1. Previsão
              {previsaoLocked && !isAdmin && <Lock className="h-3 w-3 text-amber-500 ml-1" />}
              {previsaoLocked && isAdmin && <Badge variant="outline" className="text-[9px] ml-1 text-amber-600">Admin: desbloqueado</Badge>}
            </p>
            {previsaoLocked && !isAdmin ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded p-3 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-amber-500" />
                  <span>Seção bloqueada após registro do envio. Somente o administrador da empresa pode editar.</span>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setCorrectionSection("previsao"); setShowCorrectionDialog(true); }}>
                  Solicitar Correção
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div><label className="text-xs text-muted-foreground">Nº Medição</label><Input value={editForm.num_medicao || ""} onChange={(e) => setEditForm({ ...editForm, num_medicao: e.target.value })} disabled={!canEditPrevisao} /></div>
                  <div><label className="text-xs text-muted-foreground">Mês Ref.</label>
                    <Select value={editForm.mes_referencia || ""} onValueChange={(v) => setEditForm({ ...editForm, mes_referencia: v })} disabled={!canEditPrevisao}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><label className="text-xs text-muted-foreground">Ano Ref.</label><Input type="number" value={editForm.ano_referencia || ""} onChange={(e) => setEditForm({ ...editForm, ano_referencia: Number(e.target.value) })} disabled={!canEditPrevisao} /></div>
                  <ClearableDateInput label="Previsão Envio" value={editForm.data_previsao_medicao || ""} onChange={(v) => setEditForm({ ...editForm, data_previsao_medicao: v })} disabled={!canEditPrevisao} />
                  <div><label className="text-xs text-muted-foreground">Valor Previsto (R$)</label>
                    <CurrencyInput value={editForm.valor_previsto_medicao || 0} onChange={(v) => setEditForm({ ...editForm, valor_previsto_medicao: v })} />
                  </div>
                </div>
                {canEditPrevisao && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={saveEditPrevisao}>Salvar Previsão</Button>
                  </div>
                )}
              </>
            )}
          </div>

          <Separator />

          {/* SECTION 2 — Envio ao Fiscal */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> 2. Envio ao Fiscal
              {envioLocked && !isAdmin && <Lock className="h-3 w-3 text-amber-500 ml-1" />}
              {envioLocked && isAdmin && <Badge variant="outline" className="text-[9px] ml-1 text-amber-600">Admin: desbloqueado</Badge>}
            </p>
            {status === "prevista" && !editForm.data_envio ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-3">
                <Lock className="h-3.5 w-3.5" />
                Preencha quando enviar ao fiscal
              </div>
            ) : null}
            {envioLocked && !isAdmin ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded p-3 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-amber-500" />
                  <span>Seção bloqueada após registro do envio.</span>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setCorrectionSection("envio"); setShowCorrectionDialog(true); }}>
                  Solicitar Correção
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <ClearableDateInput label="Data Envio" value={editForm.data_envio || ""} onChange={(v) => setEditForm({ ...editForm, data_envio: v })} disabled={!canEditEnvio} />
                  <div><label className="text-xs text-muted-foreground">Valor Realizado (R$)</label>
                    <CurrencyInput value={editForm.valor_medicao || 0} onChange={(v) => setEditForm({ ...editForm, valor_medicao: v })} />
                  </div>
                </div>
                {status === "prevista" && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleRegistrarEnvio}>Registrar Envio</Button>
                  </div>
                )}
              </>
            )}
          </div>

          <Separator />

          {/* SECTION 3 — Acatamento */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> 3. Acatamento
              {acatamentoLocked && !isAdmin && <Lock className="h-3 w-3 text-amber-500 ml-1" />}
              {acatamentoLocked && isAdmin && <Badge variant="outline" className="text-[9px] ml-1 text-amber-600">Admin: desbloqueado</Badge>}
            </p>
            {status === "prevista" ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-3">
                <Lock className="h-3.5 w-3.5" />
                Disponível após registrar o envio
              </div>
            ) : acatamentoLocked && !isAdmin ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded p-3 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-amber-500" />
                  <span>Seção bloqueada após aprovação.</span>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setCorrectionSection("acatamento"); setShowCorrectionDialog(true); }}>
                  Solicitar Correção
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <ClearableDateInput label="Data Aprovação" value={editForm.data_aprovacao || ""} onChange={(v) => setEditForm({ ...editForm, data_aprovacao: v })} disabled={!canEditAcatamento} />
                  <div><label className="text-xs text-muted-foreground">Valor Acatado (R$)</label>
                    <CurrencyInput value={editForm.valor_acatado || 0} onChange={(v) => setEditForm({ ...editForm, valor_acatado: v })} />
                    {editForm.valor_acatado > 0 && editForm.valor_medicao > 0 && editForm.valor_acatado !== editForm.valor_medicao && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Glosa: {BRL.format(Math.abs(glosaValue))}</p>
                    )}
                  </div>
                </div>
                {status === "enviada" && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleRegistrarAcatamento}>Registrar Acatamento</Button>
                  </div>
                )}
              </>
            )}
          </div>

          <Separator />

          {/* SECTION 4 — NF e Pagamento */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> 4. NF e Pagamento
              {pagamentoLocked && !isAdmin && <Lock className="h-3 w-3 text-amber-500 ml-1" />}
              {pagamentoLocked && isAdmin && <Badge variant="outline" className="text-[9px] ml-1 text-amber-600">Admin: desbloqueado</Badge>}
            </p>
            {status !== "aprovada" ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-3">
                <Lock className="h-3.5 w-3.5" />
                Disponível após acatamento
              </div>
            ) : pagamentoLocked && !isAdmin ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded p-3 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-amber-500" />
                  <span>Seção bloqueada após recebimento.</span>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setCorrectionSection("pagamento"); setShowCorrectionDialog(true); }}>
                  Solicitar Correção
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className="text-xs text-muted-foreground">Nº NF</label><Input value={editForm.num_nf || ""} onChange={(e) => setEditForm({ ...editForm, num_nf: e.target.value })} disabled={!canEditPagamento} /></div>
                  <ClearableDateInput label="Data Pagamento" value={editForm.data_pagamento || ""} onChange={(v) => setEditForm({ ...editForm, data_pagamento: v })} disabled={!canEditPagamento} />
                  <div className="flex items-end">
                    {editForm.status_nf !== "recebido" ? (
                      <Button size="sm" onClick={handleRegistrarRecebimento}>Confirmar Recebimento</Button>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">✓ Recebido</Badge>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Correction request button (visible for non-admins when any section is locked) */}
          {!isAdmin && hasPendingRequest && (
            <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/30 rounded p-3 border border-blue-200 dark:border-blue-800">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-blue-700 dark:text-blue-300">Você já possui uma solicitação de correção pendente para esta medição.</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // ─── ADMIN: PENDING CORRECTION REQUESTS PANEL ───
  const renderAdminRequests = () => {
    if (!isAdmin || pendingRequests.length === 0) return null;

    const SECTION_LABELS: Record<string, string> = {
      previsao: "Previsão", envio: "Envio", acatamento: "Acatamento", pagamento: "Pagamento",
    };

    return (
      <Card className="border-amber-300 dark:border-amber-700">
        <CardContent className="p-4 space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Solicitações de Correção Pendentes ({pendingRequests.length})
          </h4>
          {pendingRequests.map(req => {
            const med = medicoes.find(m => m.id === req.medicao_id);
            return (
              <div key={req.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">Medição Nº {med?.num_medicao || "—"}</span>
                    <Badge variant="outline" className="text-[10px] ml-2">{SECTION_LABELS[req.section] || req.section}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(req.created_at), "dd/MM/yy HH:mm")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>{req.requested_by_name}</strong>: {req.reason}
                </p>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => handleCorrectionReview(req.id, false)}>
                    Rejeitar
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleCorrectionReview(req.id, true)}>
                    Aprovar (desbloquear 24h)
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Medições ({medicoes.length})</h4>
        <Button size="sm" variant="outline" onClick={() => { setShowForm(!showForm); setEditingMedicao(null); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Medição
        </Button>
      </div>

      {/* ADMIN: Pending correction requests */}
      {renderAdminRequests()}

      {/* NEW MEASUREMENT FORM (Step 1 only) */}
      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h4 className="font-semibold text-sm">Nova Medição — Previsão</h4>

            {valorContrato > 0 && (
              <div className={`flex items-center justify-between text-xs p-2 rounded-md ${
                saldoDisponivel <= 0 ? "bg-destructive/10 text-destructive"
                  : saldoDisponivel < valorContrato * 0.1 ? "bg-amber-500/10 text-amber-700"
                  : "bg-emerald-500/10 text-emerald-700"
              }`}>
                <span>Saldo disponível para medições:</span>
                <span className="font-semibold">{saldoDisponivel <= 0 ? "Limite atingido" : BRL.format(saldoDisponivel)}</span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><label className="text-xs text-muted-foreground">Nº Medição *</label><Input value={newForm.num_medicao} onChange={(e) => setNewForm({ ...newForm, num_medicao: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Mês Ref. *</label>
                <Select value={newForm.mes_referencia} onValueChange={(v) => setNewForm({ ...newForm, mes_referencia: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground">Ano Ref. *</label><Input type="number" value={newForm.ano_referencia} onChange={(e) => setNewForm({ ...newForm, ano_referencia: Number(e.target.value) })} /></div>
              <ClearableDateInput label="Previsão Envio *" value={newForm.data_previsao_medicao} onChange={(v) => setNewForm({ ...newForm, data_previsao_medicao: v })} />
              <div><label className="text-xs text-muted-foreground">Valor Previsto (R$) *</label>
                <CurrencyInput value={newForm.valor_previsto_medicao} onChange={(v) => setNewForm({ ...newForm, valor_previsto_medicao: v })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={addMedicao}>Salvar Previsão</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* OVERDUE ALERTS CARD */}
      {(() => {
        const overdueMedicoes = medicoes.filter(m => {
          const ds = getMedicaoDisplayStatus(m, medicoes);
          return ds.isOverdue;
        });
        if (overdueMedicoes.length === 0) return null;
        const contacts: { name: string; phone: string; role: string }[] = [];
        if (obra.responsavel_telefone) contacts.push({ name: obra.responsavel_nome || "Engenheiro", phone: obra.responsavel_telefone, role: "Engenheiro Residente" });
        if (obra.coordenador_telefone) contacts.push({ name: obra.coordenador_nome || "Coordenador", phone: obra.coordenador_telefone, role: "Coordenador" });
        if (obra.planejador_telefone) contacts.push({ name: obra.planejador_nome || "Planejador", phone: obra.planejador_telefone, role: "Planejador" });
        return (
          <Card className="border-destructive/50 bg-red-50/50 dark:bg-red-900/10">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-semibold text-destructive">
                  {overdueMedicoes.length} medição(ões) com previsão vencida
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                As medições abaixo passaram da data de previsão de envio e ainda não foram enviadas ao fiscal.
              </p>
              <ul className="text-xs space-y-1">
                {overdueMedicoes.map(m => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="font-medium">Medição {m.num_medicao}</span>
                    <span className="text-muted-foreground">
                      — prevista para {m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yyyy") : "—"}
                    </span>
                    <span className="text-destructive font-medium">
                      ({differenceInDays(new Date(), new Date(m.data_previsao_medicao + "T12:00:00"))} dias atrás)
                    </span>
                  </li>
                ))}
              </ul>
              {contacts.length > 0 && (
                <div className="pt-1 border-t border-destructive/20">
                  <span className="text-[10px] text-muted-foreground block mb-1">Enviar alerta via WhatsApp:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {contacts.map((c) => {
                      const overdueSummary = overdueMedicoes.map(m => `  • Medição ${m.num_medicao} (prevista: ${m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yyyy") : "—"})`).join("\n");
                      const cleanPhone = c.phone.replace(/\D/g, "");
                      const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                      const msg = encodeURIComponent(
                        `⚠️ *Alerta de Medição Atrasada*\n\nObra: *${obra.nome}*\n\nMedições com previsão vencida:\n${overdueSummary}\n\nPor favor, providenciar o envio ao fiscal o mais breve possível.`
                      );
                      return (
                        <a
                          key={c.phone}
                          href={`https://wa.me/${fullPhone}?text=${msg}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:opacity-80 transition-opacity"
                        >
                          📱 {c.role}: {c.name}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* STAGED EDIT FORM */}
      {renderStagedEditForm()}

      {/* TABLE */}
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
              const displayStatus = getMedicaoDisplayStatus(m, medicoes);
              const ns = NF_STATUS_BADGE[m.status_nf] || NF_STATUS_BADGE.pendente;
              const previsto = Number(m.valor_previsto_medicao) || 0;
              const realizado = Number(m.valor_medicao) || 0;
              const acatado = Number(m.valor_acatado) || 0;
              const showNF = m.status_medicao === "enviada" || m.status_medicao === "aprovada";
              const hasGlosa = acatado > 0 && acatado !== realizado;
              const isLocked = m.status_medicao === "enviada" || m.status_medicao === "aprovada";

              // Build WhatsApp contacts for overdue alerts
              const whatsappContacts: { name: string; phone: string; role: string }[] = [];
              if (displayStatus.isOverdue) {
                if (obra.responsavel_telefone) whatsappContacts.push({ name: obra.responsavel_nome || "Engenheiro", phone: obra.responsavel_telefone, role: "Eng." });
                if (obra.coordenador_telefone) whatsappContacts.push({ name: obra.coordenador_nome || "Coordenador", phone: obra.coordenador_telefone, role: "Coord." });
                if (obra.planejador_telefone) whatsappContacts.push({ name: obra.planejador_nome || "Planejador", phone: obra.planejador_telefone, role: "Plan." });
              }
              const dataPrevisaoFormatted = m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yyyy") : "";

              return (
                <TableRow key={m.id} className={displayStatus.isOverdue ? "bg-red-50/50 dark:bg-red-900/10" : ""}>
                  <TableCell className="font-medium">
                    {m.num_medicao || "—"}
                    {isLocked && !isAdmin && <Lock className="h-3 w-3 text-amber-500 inline ml-1" />}
                  </TableCell>
                  <TableCell>
                    <span>{m.mes_referencia}/{m.ano_referencia}</span>
                    {m.created_by_name && (
                      <span className="text-[10px] text-muted-foreground ml-1">por {m.created_by_name}</span>
                    )}
                    {m.updated_by_name && (
                      <span className="text-[10px] text-amber-600 ml-1">· editado por {m.updated_by_name}</span>
                    )}
                  </TableCell>
                  <TableCell>{m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell>{m.data_envio ? format(new Date(m.data_envio + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell>{m.data_aprovacao ? format(new Date(m.data_aprovacao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${displayStatus.cls}`}>{displayStatus.label}</Badge>
                    {displayStatus.isOverdue && (
                      <div className="mt-1 space-y-0.5">
                        <span className="flex items-center gap-1 text-[9px] text-destructive font-medium">
                          <AlertTriangle className="h-3 w-3" /> Previsão vencida
                        </span>
                        {whatsappContacts.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {whatsappContacts.map((c) => (
                              <a
                                key={c.phone}
                                href={buildWhatsAppUrl(c.phone, obra.nome, m.num_medicao || "", dataPrevisaoFormatted)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:opacity-80"
                                title={`Enviar alerta WhatsApp para ${c.name}`}
                              >
                                📱 {c.role}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
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
                      {(isAdmin || m.status_medicao === "prevista") && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingMedicaoId(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
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

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deletingMedicaoId} onOpenChange={(open) => !open && setDeletingMedicaoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir medição</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir esta medição? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingMedicaoId && deleteMedicao(deletingMedicaoId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRM NEW PREVISÃO */}
      <AlertDialog open={confirmPrevisao} onOpenChange={setConfirmPrevisao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirmar lançamento de medição</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Você está criando a medição:</p>
              <p><strong>Nº {newForm.num_medicao}</strong> — {newForm.mes_referencia}/{newForm.ano_referencia}</p>
              <p>Previsão: {newForm.data_previsao_medicao} | Valor: {BRL.format(newForm.valor_previsto_medicao)}</p>
              <p className="text-amber-600 font-medium mt-2">
                ⚠️ Após o lançamento, os campos somente poderão ser editados enquanto o status for "Previsão".
                Após registrar o envio ao fiscal, os dados serão bloqueados e somente poderão ser editados pelo administrador da empresa.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doAddMedicao}>Confirmar Lançamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRM ENVIO */}
      <AlertDialog open={confirmEnvio} onOpenChange={setConfirmEnvio}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirmar envio ao fiscal</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Confirma o envio desta medição ao fiscal?</p>
              <p>Data: {editForm.data_envio} | Valor: {BRL.format(editForm.valor_medicao || 0)}</p>
              <p className="text-amber-600 font-medium">
                ⚠️ Após confirmar, o status mudará para "Enviada" e os campos de previsão e envio serão BLOQUEADOS.
                Somente o administrador da empresa poderá editar estes dados.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRegistrarEnvio}>Confirmar Envio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRM ENVIO EARLY (date before previsao) */}
      <AlertDialog open={confirmEnvioEarly} onOpenChange={setConfirmEnvioEarly}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Data de envio anterior à previsão</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>A data de envio ({editForm.data_envio}) é anterior à data de previsão ({editForm.data_previsao_medicao}). Confirma o envio mesmo assim?</p>
              <p className="text-amber-600 font-medium">
                ⚠️ Após confirmar, os campos serão BLOQUEADOS e somente o administrador poderá editar.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRegistrarEnvio}>Confirmar Envio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRM ACATAMENTO */}
      <AlertDialog open={confirmAcatamento} onOpenChange={setConfirmAcatamento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirmar acatamento</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {editForm.valor_acatado < editForm.valor_medicao ? (
                <>
                  <p>⚠️ Glosa detectada de {BRL.format(Math.abs(glosaValue))}.</p>
                  <p>Valor enviado: {BRL.format(editForm.valor_medicao || 0)} | Valor acatado: {BRL.format(editForm.valor_acatado || 0)}</p>
                  <p>Confirma o acatamento com glosa?</p>
                </>
              ) : (
                <p>Confirma o acatamento integral de {BRL.format(editForm.valor_acatado || 0)}?</p>
              )}
              <p className="text-amber-600 font-medium">
                ⚠️ Após confirmar, todos os campos da medição (previsão, envio e acatamento) serão BLOQUEADOS.
                Somente o administrador da empresa poderá editar.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRegistrarAcatamento}>Confirmar Acatamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONFIRM RECEBIMENTO */}
      <AlertDialog open={confirmRecebimento} onOpenChange={setConfirmRecebimento}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirmar recebimento</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Confirma o recebimento do pagamento?</p>
              <p>NF: {editForm.num_nf || "—"} | Data: {editForm.data_pagamento}</p>
              <p className="text-amber-600 font-medium">
                ⚠️ Esta ação marca a medição como paga. Todos os campos serão PERMANENTEMENTE BLOQUEADOS.
                Somente o administrador da empresa poderá editar.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRegistrarRecebimento}>Confirmar Recebimento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CORRECTION REQUEST DIALOG */}
      <AlertDialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar correção ao administrador</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Descreva o motivo da correção necessária. O administrador da empresa receberá esta solicitação e poderá desbloquear temporariamente a medição para edição.</p>
              <div>
                <label className="text-xs font-medium">Seção a corrigir</label>
                <Select value={correctionSection} onValueChange={setCorrectionSection}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="previsao">Previsão</SelectItem>
                    <SelectItem value="envio">Envio ao Fiscal</SelectItem>
                    <SelectItem value="acatamento">Acatamento</SelectItem>
                    <SelectItem value="pagamento">NF e Pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Motivo da correção *</label>
                <Input
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Ex: Valor realizado informado incorretamente..."
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCorrectionReason("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={submitCorrectionRequest}>Enviar Solicitação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  const { user, profile, requireEdit } = useAuth();
  const userName = profile?.display_name || user?.email || "Usuário";
  const userId = user?.id || null;
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
    if (!requireEdit()) return;
    if (!newDespesa.mes_referencia || !newDespesa.valor) {
      toast.warning("Preencha mês e valor.");
      return;
    }
    setSavingDespesa(true);
    const { data: ins, error } = await supabase.from("despesas_mensais").insert({
      obra_id: obraId,
      mes_referencia: newDespesa.mes_referencia,
      ano_referencia: Number(newDespesa.ano_referencia),
      valor: Number(newDespesa.valor),
      status: newDespesa.status as any,
    }).select("id").single();
    setSavingDespesa(false);
    if (error) { toast.error("Erro ao salvar despesa."); return; }

    // Audit: gravar autoria no registro inserido (ID garantido pelo .select)
    if (ins?.id) {
      await supabase.from("despesas_mensais").update({
        created_by_user_id: userId,
        created_by_name: userName,
      }).eq("id", ins.id);
    }

    await registrarLog(
      obraId, "despesas_mensais", ins?.id || null,
      "criou",
      `Adicionou despesa — ${newDespesa.mes_referencia}/${newDespesa.ano_referencia} — ${BRL.format(Number(newDespesa.valor))}`,
      userId, userName
    );

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
    entry.receita += Number(m.valor_acatado ?? m.valor_medicao) || 0;
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
                  <TableCell>
                    <span>{d.mes_referencia}/{d.ano_referencia}</span>
                    {d.created_by_name && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        por {d.created_by_name}
                      </span>
                    )}
                  </TableCell>
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
  const { user, profile, requireEdit } = useAuth();
  const userName = profile?.display_name || user?.email || "Usuário";
  const userId = user?.id || null;
  const invalidateHolding = useInvalidateHolding();
  const [deletingAditivoId, setDeletingAditivoId] = useState<string | null>(null);
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
    if (!requireEdit()) return;
    const payload: any = {
      obra_id: obraId,
      num_aditivo: form.num_aditivo || null,
      aditivo_prazo_dias: form.aditivo_prazo_dias || 0,
      aditivo_valor: form.aditivo_valor || 0,
      supressao_valor: form.supressao_valor || 0,
      status: form.status,
    };
    if (form.data) payload.data = form.data;
    const { data: ins, error } = await supabase
      .from("aditivos_contratos").insert(payload).select("id").single();
    if (error) { toast.error("Erro ao salvar aditivo"); return; }

    await registrarLog(
      obraId, "aditivos_contratos", ins?.id || null,
      "criou",
      `Adicionou aditivo ${form.num_aditivo || ""} — ${BRL.format(form.aditivo_valor)} — prazo +${form.aditivo_prazo_dias} dias`,
      userId, userName
    );

    toast.success("Aditivo adicionado!");
    invalidateHolding();
    setShowForm(false);
    setForm({ num_aditivo: "", aditivo_prazo_dias: 0, aditivo_valor: 0, supressao_valor: 0, data: "", status: "pendente" });
    load();
  };

  const deleteAditivo = async (id: string) => {
    if (!requireEdit()) return;
    setDeletingAditivoId(null);
    const aditivoSnap = aditivos.find(a => a.id === id);
    const { error } = await supabase.from("aditivos_contratos").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }

    await registrarLog(
      obraId, "aditivos_contratos", id,
      "excluiu",
      `Excluiu aditivo ${aditivoSnap?.num_aditivo || ""} — ${BRL.format(aditivoSnap?.aditivo_valor || 0)}`,
      userId, userName,
      { ...aditivoSnap }, {}
    );

    toast.success("Aditivo excluído.");
    invalidateHolding();
    load();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const totalDias = aditivos.reduce((s, a) => s + (a.aditivo_prazo_dias || 0), 0);
  const totalValor = aditivos.reduce((s, a) => s + (a.aditivo_valor || 0), 0);
  const totalSupressao = aditivos.reduce((s, a) => s + (a.supressao_valor || 0), 0);

  return (
    <>
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
                <TableCell className="font-medium">
                  <span>{a.num_aditivo || "—"}</span>
                  {a.created_by_name && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      por {a.created_by_name}
                    </span>
                  )}
                </TableCell>
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
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingAditivoId(a.id)}>
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

      <AlertDialog open={!!deletingAditivoId} onOpenChange={(open) => !open && setDeletingAditivoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aditivo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este aditivo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingAditivoId && deleteAditivo(deletingAditivoId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

/* ══════════════════════════════════════════════
   TAB 6 — HISTÓRICO (Audit Log)
   ══════════════════════════════════════════════ */

function HistoricoTab({ obraId }: { obraId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("holding_audit_log")
      .select("*")
      .eq("obra_id", obraId)
      .order("realizado_em", { ascending: false })
      .limit(100)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, [obraId]);

  const ACAO_ICON: Record<string, string> = {
    criou: "✅", editou: "✏️", excluiu: "🗑️",
    aprovou: "✔️", cancelou: "❌",
  };
  const ACAO_COLOR: Record<string, string> = {
    criou: "text-emerald-600", editou: "text-amber-600",
    excluiu: "text-destructive", aprovou: "text-blue-600", cancelou: "text-muted-foreground",
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (logs.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">
      Nenhuma ação registrada ainda.
    </div>
  );

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        Histórico completo de alterações — {logs.length} registro{logs.length !== 1 ? "s" : ""}
      </p>
      <div className="relative pl-4">
        <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-border" />
        {logs.map((log) => {
          const data = new Date(log.realizado_em);
          const dataFmt = data.toLocaleDateString("pt-BR");
          const horaFmt = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={log.id} className="relative flex gap-3 pb-4">
              <div className="absolute left-[-9px] top-[4px] w-[10px] h-[10px] rounded-full bg-background border-2 border-border" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs">
                    <span className={`font-semibold ${ACAO_COLOR[log.acao] || ""}`}>
                      {ACAO_ICON[log.acao] || "•"} {log.realizado_por_nome}
                    </span>
                    {" "}<span className="text-muted-foreground">{log.descricao}</span>
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                    {dataFmt} {horaFmt}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
