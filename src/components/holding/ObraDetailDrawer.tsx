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
import { FileText, Plus, Loader2, ListChecks, Pencil, Trash2, X, FlaskConical, CalendarDays, TrendingUp, Clock, BarChart3, Target, AlertTriangle, DollarSign, Upload, Download, File } from "lucide-react";
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

    // Medições aprovadas reais (excluindo Saldo Inicial)
    const totalMedidoReal = medicoes
      .filter(m => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0);

    // Saldo Inicial (% executado ao cadastrar a obra)
    const totalMedidoInicial = medicoes
      .filter(m => m.num_medicao === "Saldo Inicial" && m.status_medicao === "aprovada")
      .reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0);

    // Total medido = medições reais + saldo inicial
    // Se não há nada no banco, usa fallback do % (consistente com ObraCard)
    const totalMedido = (totalMedidoReal + totalMedidoInicial) > 0
      ? totalMedidoReal + totalMedidoInicial
      : (valorContrato > 0 && (obra.percentual_andamento || 0) > 0
        ? ((obra.percentual_andamento || 0) / 100) * valorContrato
        : 0);

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
      valorContrato, totalMedido, totalEnviado, totalEmAberto, totalRecebido, totalPrevisto,
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
          <TabsContent value="medicoes" className="mt-0"><MedicoesTab obraId={obra.id} valorContrato={(obra.valor_contrato || 0) + (obra.aditivo_valor_total || 0)} hasInitialBalance={obra.has_initial_balance || false} valorMedidoInicial={obra.valor_medido_inicial || 0} /></TabsContent>
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

function MedicoesTab({ obraId, valorContrato, hasInitialBalance, valorMedidoInicial }: { obraId: string; valorContrato: number; hasInitialBalance: boolean; valorMedidoInicial: number }) {
  const { user, profile, requireEdit } = useAuth();
  const userName = profile?.display_name || user?.email || "Usuário";
  const userId = user?.id || null;
  const invalidateHolding = useInvalidateHolding();
  const [deletingMedicaoId, setDeletingMedicaoId] = useState<string | null>(null);
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

  // Valor já comprometido pelo % de execução inicial (opção B: já faturado informalmente)
  const baseJaComprometida = hasInitialBalance ? (valorMedidoInicial || 0) : 0;

  const saldoDisponivel = useMemo(() => {
    if (valorContrato === 0) return Infinity;
    const totalLancado = medicoes
      .filter(m => m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + (Number(m.valor_medicao) || 0) + (Number(m.valor_previsto_medicao) || 0), 0);
    return Math.max(0, valorContrato - baseJaComprometida - totalLancado);
  }, [medicoes, valorContrato, baseJaComprometida]);

  const totalJaLancado = useMemo(() => {
    const lancadoNoBanco = medicoes
      .filter(m => m.num_medicao !== "Saldo Inicial")
      .reduce((s, m) => s + (Number(m.valor_medicao) || 0) + (Number(m.valor_previsto_medicao) || 0), 0);
    // Inclui o valor inicial já comprometido para fins de validação de limite
    return baseJaComprometida + lancadoNoBanco;
  }, [medicoes, baseJaComprometida]);

  const addMedicao = async () => {
    if (!requireEdit()) return;
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

    // Validar limite do contrato
    if (valorContrato > 0) {
      const novoValorMedicao = Number(form.valor_medicao) || 0;
      const novoValorPrevisto = Number(form.valor_previsto_medicao) || 0;
      const novoValorTotal = novoValorMedicao + novoValorPrevisto;

      if (novoValorTotal > 0 && totalJaLancado + novoValorTotal > valorContrato) {
        const disponivel = valorContrato - totalJaLancado;
        toast.error(
          disponivel <= 0
            ? `❌ Limite atingido. O total de medições já alcançou o valor do contrato (${BRL.format(valorContrato)}).`
            : `❌ Valor excede o saldo disponível. Saldo restante: ${BRL.format(disponivel)}. Valor lançado: ${BRL.format(novoValorTotal)}.`
        );
        return;
      }
    }
    const payload: any = { obra_id: obraId, ...form };
    if (!payload.data_previsao_medicao) delete payload.data_previsao_medicao;
    if (!payload.data_envio) delete payload.data_envio;
    if (!payload.data_aprovacao) delete payload.data_aprovacao;
    if (!payload.data_pagamento) delete payload.data_pagamento;
    const { data: inserted, error } = await supabase
      .from("medicoes_ple").insert(payload).select("id").single();
    if (error) { toast.error("Erro ao salvar medição"); return; }

    // Audit: gravar campos de autoria no mesmo registro inserido
    if (inserted?.id) {
      await supabase.from("medicoes_ple").update({
        created_by_user_id: userId,
        created_by_name: userName,
      }).eq("id", inserted.id);
    }

    await registrarLog(
      obraId, "medicoes_ple", inserted?.id || null,
      "criou",
      `Adicionou medição ${form.num_medicao ? `Nº ${form.num_medicao}` : ""} — ${form.mes_referencia}/${form.ano_referencia} — ${BRL.format(Number(form.valor_medicao) || 0)}`,
      userId, userName,
      {}, { ...form }
    );

    toast.success("Medição adicionada");
    invalidateHolding();
    setShowForm(false);
    resetForm();
    load();
  };

  const updateMedicao = async () => {
    if (!requireEdit()) return;
    if (!editingMedicao) return;

    // Validar limite do contrato (mesmo critério do addMedicao: desconta baseJaComprometida)
    if (valorContrato > 0) {
      const novoValor = (Number(editForm.valor_medicao) || 0) + (Number(editForm.valor_previsto_medicao) || 0);
      const totalSemEsta = medicoes
        .filter(m => m.id !== editingMedicao.id && m.num_medicao !== "Saldo Inicial")
        .reduce((s, m) => s + (Number(m.valor_medicao) || 0) + (Number(m.valor_previsto_medicao) || 0), 0);
      // Inclui baseJaComprometida — igual ao addMedicao — para consistência
      const totalComBase = totalSemEsta + baseJaComprometida;

      if (novoValor > 0 && totalComBase + novoValor > valorContrato) {
        const disponivel = Math.max(0, valorContrato - totalComBase);
        toast.error(`❌ Valor excede o saldo disponível. Saldo restante para esta medição: ${BRL.format(disponivel)}.`);
        return;
      }
    }

    const payload: any = { ...editForm };
    // Remover campos de sistema que não devem ser sobrescritos pelo update
    delete payload.id; delete payload.obra_id; delete payload.created_at;
    delete payload.created_by_user_id; delete payload.created_by_name;
    delete payload.updated_by_user_id; delete payload.updated_by_name; delete payload.updated_at;
    // Allow clearing dates by setting to null
    if (payload.data_previsao_medicao === "") payload.data_previsao_medicao = null;
    if (payload.data_envio === "") payload.data_envio = null;
    if (payload.data_aprovacao === "") payload.data_aprovacao = null;
    if (payload.data_pagamento === "") payload.data_pagamento = null;
    const { error } = await supabase.from("medicoes_ple").update(payload).eq("id", editingMedicao.id);
    if (error) { toast.error("Erro ao atualizar medição"); return; }

    // Audit
    await supabase.from("medicoes_ple").update({
      updated_by_user_id: userId,
      updated_by_name: userName,
      updated_at: new Date().toISOString(),
    }).eq("id", editingMedicao.id);

    await registrarLog(
      obraId, "medicoes_ple", editingMedicao.id,
      "editou",
      `Editou medição ${editingMedicao.num_medicao ? `Nº ${editingMedicao.num_medicao}` : ""} — ${editingMedicao.mes_referencia}/${editingMedicao.ano_referencia}`,
      userId, userName,
      { ...editingMedicao }, { ...editForm }
    );

    toast.success("Medição atualizada!");
    invalidateHolding();
    setEditingMedicao(null);
    setEditForm({});
    load();
  };

  const deleteMedicao = async (id: string) => {
    if (!requireEdit()) return;
    setDeletingMedicaoId(null);
    const medicaoSnap = medicoes.find(m => m.id === id);
    const { error } = await supabase.from("medicoes_ple").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir medição"); return; }

    await registrarLog(
      obraId, "medicoes_ple", id,
      "excluiu",
      `Excluiu medição ${medicaoSnap?.num_medicao ? `Nº ${medicaoSnap.num_medicao}` : ""} — ${medicaoSnap?.mes_referencia}/${medicaoSnap?.ano_referencia}`,
      userId, userName,
      { ...medicaoSnap }, {}
    );

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

        {valorContrato > 0 && (
          <div className={`flex items-center justify-between text-xs p-2 rounded-md ${
            saldoDisponivel <= 0
              ? "bg-destructive/10 text-destructive"
              : saldoDisponivel < valorContrato * 0.1
                ? "bg-amber-500/10 text-amber-700"
                : "bg-emerald-500/10 text-emerald-700"
          }`}>
            <span>Saldo disponível para medições:</span>
            <span className="font-semibold">
              {saldoDisponivel <= 0 ? "Limite atingido" : BRL.format(saldoDisponivel)}
            </span>
          </div>
        )}

        <Separator />

        {/* ENGENHARIA */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Engenharia — Datas e Valores</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ClearableDateInput label="Previsão Envio" value={data.data_previsao_medicao || ""} onChange={(v) => setData({ ...data, data_previsao_medicao: v })} />
            <ClearableDateInput label="Data Envio" value={data.data_envio || ""} onChange={(v) => setData({ ...data, data_envio: v })} />
            <ClearableDateInput label="Data Aprovação" value={data.data_aprovacao || ""} onChange={(v) => {
              const updates: any = { ...data, data_aprovacao: v };
              // Auto-avança status para 'aprovada' ao preencher a data de aprovação
              if (v && data.status_medicao === "enviada") {
                updates.status_medicao = "aprovada";
              }
              // Reverte para 'enviada' se a data for apagada (e data_envio existir)
              if (!v && data.status_medicao === "aprovada" && data.data_envio) {
                updates.status_medicao = "enviada";
              }
              setData(updates);
            }} />
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
                  <TableCell>
                    <span>{m.mes_referencia}/{m.ano_referencia}</span>
                    {m.created_by_name && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        por {m.created_by_name}
                      </span>
                    )}
                    {m.updated_by_name && (
                      <span className="text-[10px] text-amber-600 ml-1">
                        · editado por {m.updated_by_name}
                      </span>
                    )}
                  </TableCell>
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
    if (!confirm("Excluir este aditivo?")) return;
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
