import { useMemo, useState, useCallback, useEffect, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import ObraDetailDrawer from "./ObraDetailDrawer";
import HoldingAnalyticsView from "./HoldingAnalyticsView";
import HoldingManualView from "./HoldingManualView";
import { OnboardingDialog } from "./OnboardingDialog";
import { ObraDocConfigDialog } from "./ObraDocConfigDialog";
import { CurrencyInput } from "./CurrencyInput";
import { EditRequestDialog } from "./EditRequestDialog";
import { useOnboarding } from "@/hooks/useOnboarding";
import { geocodeMunicipio } from "@/lib/geocode";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import {
  Crown,
  DollarSign,
  ClipboardCheck,
  Building2,
  AlertTriangle,
  Loader2,
  LayoutGrid,
  GanttChart,
  BarChart3,
  Eye,
  
  ChevronDown,
  ChevronUp,
  Clock,
  CalendarClock,
  FileCheck2,
  Plus,
  FileDown,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
  BookOpen,
  TableIcon,
  Download,
  Search,
  X,
  TrendingUp,
  Pause,
  FileText,
  Home,
  Wallet,
  Lock,
} from "lucide-react";
import { addDays, format, differenceInDays, differenceInMonths } from "date-fns";

/** Parse YYYY-MM-DD as local date (avoids UTC offset shifting the day) */
const parseLocalDate = (d: string) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); };

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

interface ObraPortfolio {
  id: string;
  company_id: string;
  nome: string;
  empresa: string | null;
  num_contrato: string | null;
  parceria_scp: string | null;
  valor_contrato: number;
  data_inicio: string | null;
  prazo_dias: number;
  aditivo_prazo_dias: number;
  status: "em_andamento" | "nao_iniciada" | "concluida" | "paralisada";
  percentual_andamento: number;
  percentual_fisico: number;
  percentual_financeiro: number;
  periodo_medicao: string | null;
  prazo_pagamento: string | null;
  municipio: string | null;
  estado: string | null;
  uh: number | null;
  responsavel: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  coordenador_nome: string | null;
  coordenador_telefone: string | null;
  planejador_nome: string | null;
  planejador_telefone: string | null;
  tipo_contrato: string | null;
  has_initial_balance: boolean;
  valor_medido_inicial: number;
  aditivo_valor_total: number;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

interface DocumentosObra {
  id: string;
  obra_id: string;
  ata: boolean;
  ois: boolean;
  art: boolean;
  cno: boolean;
  impl: boolean;
  scp: boolean;
  sondagem_spt: boolean;
  planta_localizacao: boolean;
  plano_altimetrico: boolean;
  painel_bordo: boolean;
  checklist_seguranca: boolean;
}

interface MedicaoPle {
  id: string;
  obra_id: string;
  num_medicao: string | null;
  mes_referencia: string | null;
  ano_referencia: number | null;
  data_envio: string | null;
  data_aprovacao: string | null;
  status_medicao: "aprovada" | "enviada" | "pendente" | "nao_iniciada" | "prevista";
  valor_medicao: number;
  valor_acatado: number | null;
  valor_previsto_medicao: number | null;
  data_previsao_medicao: string | null;
  num_nf: string | null;
  data_pagamento: string | null;
  status_nf: "recebido" | "aguardando_aprovacao" | "pendente";
}

export interface ObraEnriched extends ObraPortfolio {
  docs: DocumentosObra | null;
  latestMedicao: MedicaoPle | null;
  allMedicoes: MedicaoPle[];
  docsCount: number;
  docsTotal: number;
  health: "green" | "yellow" | "red" | "gray";
  pendingNotifCount?: number;
  despesasDaObra?: { id: string; obra_id: string; valor: number; tipo_despesa: string }[];
}

export interface HoldingAlert {
  id: string;
  obraId: string;
  obraNome: string;
  severity: "critical" | "warning" | "info";
  icon: any;
  message: string;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return BRL.format(v);
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  em_andamento: { label: "Em Andamento", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  nao_iniciada: { label: "Não Iniciada", className: "bg-muted text-muted-foreground" },
  concluida: { label: "Concluída", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  paralisada: { label: "Paralisada", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

const HEALTH_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

const HEALTH_BORDER: Record<string, string> = {
  green: "border-l-emerald-500",
  yellow: "border-l-amber-500",
  red: "border-l-red-500",
  gray: "border-l-slate-400",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  em_andamento: "hsl(217, 91%, 60%)",
  nao_iniciada: "hsl(220, 9%, 70%)",
  concluida: "hsl(142, 71%, 45%)",
  paralisada: "hsl(0, 72%, 50%)",
};

const SEVERITY_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Crítico", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  warning: { label: "Atenção", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  info: { label: "Info", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

function countDocs(docs: DocumentosObra | null): { count: number; total: number } {
  if (!docs) return { count: 0, total: 11 };
  const fields: (keyof DocumentosObra)[] = [
    "ata", "ois", "art", "cno", "impl", "scp",
    "sondagem_spt", "planta_localizacao", "plano_altimetrico",
    "painel_bordo", "checklist_seguranca",
  ];
  return { count: fields.filter((f) => docs[f] === true).length, total: fields.length };
}

// ─── Configuração de thresholds de saúde da obra ───────────────────────────
// Baseado em Earned Value Management (EVM — ISO 21508 / PMI PMBOK)
export const DEFAULT_HEALTH_THRESHOLDS = {
  idc_yellow: 0.85,
  idc_red:    0.70,
  idp_yellow: 0.90,
  idp_red:    0.70,
  dias_sem_medicao_yellow: 30,
  dias_sem_medicao_red:    60,
  glosa_yellow: 0.05,
  glosa_red:    0.15,
};

export type HealthThresholds = typeof DEFAULT_HEALTH_THRESHOLDS;

/** Carrega thresholds do localStorage (se existirem) ou retorna os padrões */
export function loadHealthThresholds(companyId?: string): HealthThresholds {
  if (!companyId) return { ...DEFAULT_HEALTH_THRESHOLDS };
  try {
    const stored = localStorage.getItem(`obramap_health_thresholds_${companyId}`);
    if (stored) return { ...DEFAULT_HEALTH_THRESHOLDS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_HEALTH_THRESHOLDS };
}

// Mutable reference used by calcHealth / calcHealthDetails
export let HEALTH_THRESHOLDS = { ...DEFAULT_HEALTH_THRESHOLDS };

/**
 * Calcula a saúde da obra com base em indicadores de Engenharia de Custos (EVM).
 *
 * Indicadores considerados (em ordem de prioridade):
 *  1. IDC — Índice de Desempenho de Custo
 *  2. IDP — Índice de Desempenho de Prazo
 *  3. Dias sem medição aprovada
 *  4. Glosa acumulada
 *
 * Obras não iniciadas ou sem dados suficientes retornam amarelo (neutro).
 */
function getThresholdsDiasPorPeriodo(periodo: string | null): { yellow: number; red: number } {
  switch (periodo?.toLowerCase()) {
    case "semanal":   return { yellow: 10, red: 21 };
    case "quinzenal": return { yellow: 20, red: 45 };
    case "mensal":    return { yellow: 35, red: 75 };
    default:          return { yellow: 30, red: 60 };
  }
}

export function calcHealth(
  obra: ObraPortfolio,
  allMedicoes: MedicaoPle[]
): "green" | "yellow" | "red" | "gray" {
  const T = HEALTH_THRESHOLDS;
  const now = new Date();

  // Obras não iniciadas ou paralisadas: não penalizar
  if (obra.status === "nao_iniciada") return "gray";  // sem dados para avaliar
  if (obra.status === "paralisada") return "red";
  if (obra.status === "concluida") return "green";

  const valorContrato = (obra.valor_contrato || 0) + (obra.aditivo_valor_total || 0);
  const pctFisico = (obra.percentual_fisico || 0) / 100;
  const pctFinanceiro = (obra.percentual_financeiro || 0) / 100;
  const nMedicoesAprovadas = allMedicoes.filter(m => m.status_medicao === "aprovada").length;

  // ── IDC — Índice de Desempenho de Custo ──────────────────────────────────
  // IDC compara valor medido aprovado vs valor planejado (% físico × contrato)
  // Inclui valor_medido_inicial — faturamento anterior ao sistema é receita real
  // Só avalia se: (a) físico > 5%, (b) existe discrepância entre físico e financeiro
  // porque no domínio Previbras físico ≈ financeiro — IDC sempre ~1 quando iguais
  const totalMedidoAprovado = allMedicoes
    .filter(m => m.status_medicao === "aprovada")
    .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0)
    + (Number(obra.valor_medido_inicial) || 0);

  if (pctFisico > 0.05 && valorContrato > 0 && Math.abs(pctFisico - pctFinanceiro) > 0.05) {
    const valorPlanejado = pctFisico * valorContrato;
    const idc = totalMedidoAprovado / valorPlanejado;
    if (idc < T.idc_red) return "red";
    if (idc < T.idc_yellow) return "yellow";
  }

  // ── IDP — Índice de Desempenho de Prazo ──────────────────────────────────
  // Guards obrigatórios para evitar falsos alarmes:
  // 1. pctTempo > 15%: fase de mobilização (~10-15% do prazo) nunca é penalizada
  // 2. percentual_financeiro > 0: precisa de dado real, não apenas cadastro
  // 3. pelo menos 1 medição aprovada: confirma que o sistema tem dados da obra
  // Se percentual_financeiro = 0 com > 15% do prazo → gray (sem dados suficientes)
  if (obra.data_inicio && obra.prazo_dias > 0) {
    const inicio = new Date(obra.data_inicio + "T12:00:00");
    const prazoTotal = obra.prazo_dias + (obra.aditivo_prazo_dias || 0);
    const diasDecorridos = differenceInDays(now, inicio);
    const pctTempo = Math.min(1, diasDecorridos / prazoTotal);

    if (pctTempo > 0.15) {
      // Evidência financeira real = medições aprovadas no sistema OU faturamento pré-sistema
      // "Sem dados" só quando ambos são zero — obras novas que ainda não têm nenhuma execução registrada
      const hasFinancialEvidence = nMedicoesAprovadas > 0 || (Number(obra.valor_medido_inicial) > 0);

      if (!hasFinancialEvidence) {
        // Nenhum dado após fase de mobilização → green (obra em andamento, sem penalizar)
        return "green";
      }
      // Tem evidência financeira — avaliar IDP normalmente
      // Obra com prazo 100% consumido e sem conclusão → sempre vermelho
      if (pctTempo >= 1 && pctFinanceiro < 1) return "red";
      const idp = pctTempo > 0 ? pctFinanceiro / pctTempo : 1;
      if (idp < T.idp_red) return "red";
      if (idp < T.idp_yellow) return "yellow";
    }
  }

  // ── Dias sem medição aprovada ─────────────────────────────────────────────
  // Só avalia se já houve pelo menos 1 medição aprovada anteriormente.
  // Obras que nunca foram medidas não são penalizadas por "dias sem medição".
  const ultimaAprovada = allMedicoes
    .filter(m => m.status_medicao === "aprovada" && m.data_aprovacao)
    .sort((a, b) => new Date(b.data_aprovacao!).getTime() - new Date(a.data_aprovacao!).getTime())[0];

  if (ultimaAprovada?.data_aprovacao) {
    const diasSemMedicao = differenceInDays(now, new Date(ultimaAprovada.data_aprovacao + "T12:00:00"));
    const diasT = getThresholdsDiasPorPeriodo(obra.periodo_medicao);
    if (diasSemMedicao > diasT.red) return "red";
    if (diasSemMedicao > diasT.yellow) return "yellow";
  }
  // Removido: else if (pctFisico > 0.1) → gerava falsos amarelos em obras sem dados

  // ── Glosa acumulada ───────────────────────────────────────────────────────
  const totalGlosa = allMedicoes
    .filter(m => Number(m.valor_acatado) > 0 && Number(m.valor_medicao) > 0)
    .reduce((s, m) => s + Math.max(0, Number(m.valor_medicao) - Number(m.valor_acatado)), 0);

  if (totalMedidoAprovado > 0 && totalGlosa > 0) {
    const pctGlosa = totalGlosa / totalMedidoAprovado;
    if (pctGlosa > T.glosa_red) return "red";
    if (pctGlosa > T.glosa_yellow) return "yellow";
  }

  // "Sem previsão de medição" removido — saúde baseada apenas em IDC, IDP, dias sem medição e glosa

  // ── Verde: todos os indicadores dentro do limite ──────────────────────────
  return "green";
}

export interface HealthIndicator {
  id: "idc" | "idp" | "dias_medicao" | "glosa";
  label: string;
  description: string;
  value: number | null;       // valor calculado (ex: 0.92 para IDC)
  displayValue: string;       // valor formatado para exibição (ex: "92%")
  status: "green" | "yellow" | "red" | "gray" | "na"; // "na" = sem dados suficientes
  threshold_yellow: number;
  threshold_red: number;
  unit: string;               // "índice", "dias", "%"
  higherIsBetter: boolean;    // true: IDC/IDP mais alto = melhor | false: dias/glosa menor = melhor
  rawValues?: Record<string, number | string>;
}

/**
 * Retorna o detalhamento de cada indicador de saúde para exibição no card.
 * Usa os mesmos cálculos do calcHealth — nenhuma duplicação de lógica.
 */
export function calcHealthDetails(
  obra: ObraPortfolio,
  allMedicoes: MedicaoPle[]
): HealthIndicator[] {
  const T = HEALTH_THRESHOLDS;
  const now = new Date();
  const valorContrato = (obra.valor_contrato || 0) + (obra.aditivo_valor_total || 0);
  const pctFisico = (obra.percentual_fisico || 0) / 100;
  const pctFinanceiro = (obra.percentual_financeiro || 0) / 100;
  const nMedicoesAprovadas = allMedicoes.filter(m => m.status_medicao === "aprovada").length;

  // Usa valor_acatado para IDC — valor real aceito pelo governo
  // Inclui valor_medido_inicial — faturamento anterior ao sistema é receita real
  const totalMedidoAprovado = allMedicoes
    .filter(m => m.status_medicao === "aprovada")
    .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0)
    + (Number(obra.valor_medido_inicial) || 0);

  // ── IDC ──────────────────────────────────────────────────────────────────
  // Só avalia se há discrepância entre físico e financeiro (> 5%)
  // Quando físico ≈ financeiro, IDC ≈ 1.0 — não gera alarme
  let idcValue: number | null = null;
  let idcStatus: HealthIndicator["status"] = "na";
  if (pctFisico > 0.05 && valorContrato > 0 && Math.abs(pctFisico - pctFinanceiro) > 0.05) {
    const valorPlanejado = pctFisico * valorContrato;
    idcValue = totalMedidoAprovado / valorPlanejado;
    idcStatus = idcValue < T.idc_red ? "red" : idcValue < T.idc_yellow ? "yellow" : "green";
  }

  // ── IDP ──────────────────────────────────────────────────────────────────
  // Guard: pctTempo > 15%, percentual_financeiro > 0, pelo menos 1 medição aprovada
  let idpValue: number | null = null;
  let idpStatus: HealthIndicator["status"] = "na";
  let idpPctTempo = 0;
  let idpDiasDecorridos = 0;
  let idpPrazoTotal = 0;
  if (obra.data_inicio && obra.prazo_dias > 0) {
    const inicio = new Date(obra.data_inicio + "T12:00:00");
    idpPrazoTotal = obra.prazo_dias + (obra.aditivo_prazo_dias || 0);
    idpDiasDecorridos = differenceInDays(now, inicio);
    idpPctTempo = Math.min(1, idpDiasDecorridos / idpPrazoTotal);
    if (idpPctTempo > 0.15) {
      const hasFinancialEvidence = nMedicoesAprovadas > 0 || (Number(obra.valor_medido_inicial) > 0);
      if (!hasFinancialEvidence) {
        idpStatus = "na"; // sem dados reais após mobilização
      } else {
        idpValue = idpPctTempo > 0 ? pctFinanceiro / idpPctTempo : 1;
        idpStatus = idpValue < T.idp_red ? "red" : idpValue < T.idp_yellow ? "yellow" : "green";
      }
    }
  }

  // ── Dias sem medição ─────────────────────────────────────────────────────
  // Só avalia se já houve pelo menos 1 medição aprovada anteriormente
  const ultimaAprovada = allMedicoes
    .filter(m => m.status_medicao === "aprovada" && m.data_aprovacao)
    .sort((a, b) => new Date(b.data_aprovacao!).getTime() - new Date(a.data_aprovacao!).getTime())[0];
  let diasValue: number | null = null;
  let diasStatus: HealthIndicator["status"] = "na";
  if (ultimaAprovada?.data_aprovacao) {
    const diasT = getThresholdsDiasPorPeriodo(obra.periodo_medicao);
    diasValue = differenceInDays(now, new Date(ultimaAprovada.data_aprovacao + "T12:00:00"));
    diasStatus = diasValue > diasT.red ? "red" : diasValue > diasT.yellow ? "yellow" : "green";
  }
  // Removido: else if (pctFisico > 0.1) → gerava falsos amarelos em obras sem dados

  // ── Glosa ────────────────────────────────────────────────────────────────
  const totalGlosa = allMedicoes
    .filter(m => Number(m.valor_acatado) > 0 && Number(m.valor_medicao) > 0)
    .reduce((s, m) => s + Math.max(0, Number(m.valor_medicao) - Number(m.valor_acatado)), 0);
  let glosaValue: number | null = null;
  let glosaStatus: HealthIndicator["status"] = "na";
  if (totalMedidoAprovado > 0) {
    glosaValue = totalGlosa / totalMedidoAprovado;
    glosaStatus = glosaValue > T.glosa_red ? "red" : glosaValue > T.glosa_yellow ? "yellow" : "green";
  }

  const valorPlanejado = pctFisico * valorContrato;

  const diasT = getThresholdsDiasPorPeriodo(obra.periodo_medicao);

  return [
    {
      id: "idc" as const,
      label: "IDC — Desempenho de Custo",
      description: "Compara o valor medido com o esperado dado o andamento físico. IDC < 1 significa que a obra está medindo menos do que deveria.",
      value: idcValue,
      displayValue: idcValue !== null ? `${(idcValue * 100).toFixed(1)}%` : "—",
      status: idcStatus,
      threshold_yellow: T.idc_yellow,
      threshold_red: T.idc_red,
      unit: "índice",
      higherIsBetter: true,
      rawValues: { medidoAprovado: totalMedidoAprovado, planejado: valorPlanejado },
    },
    {
      id: "idp" as const,
      label: "IDP — Desempenho de Prazo",
      description: "Compara o % de execução física com o % do prazo contratual consumido. IDP < 1 indica atraso.",
      value: idpValue,
      displayValue: idpValue !== null ? `${(idpValue * 100).toFixed(1)}%` : "—",
      status: idpStatus,
      threshold_yellow: T.idp_yellow,
      threshold_red: T.idp_red,
      unit: "índice",
      higherIsBetter: true,
      rawValues: { pctFisico: pctFisico * 100, pctTempo: idpPctTempo * 100, diasDecorridos: idpDiasDecorridos, prazoTotal: idpPrazoTotal },
    },
    {
      id: "dias_medicao" as const,
      label: "Dias sem Medição",
      description: `Dias desde a última medição aprovada. Thresholds ajustados pelo período: ${obra.periodo_medicao || "padrão"}.`,
      value: diasValue,
      displayValue: diasValue !== null ? `${diasValue}d` : "—",
      status: diasStatus,
      threshold_yellow: diasT.yellow,
      threshold_red: diasT.red,
      unit: "dias",
      higherIsBetter: false,
      rawValues: { ultimaAprovadaDate: ultimaAprovada?.data_aprovacao || '', periodo: obra.periodo_medicao || 'padrão' },
    },
    {
      id: "glosa" as const,
      label: "Glosa Acumulada",
      description: "Percentual do valor medido que foi glosado (não acatado). Alta glosa indica conflito com o contratante.",
      value: glosaValue,
      displayValue: glosaValue !== null ? `${(glosaValue * 100).toFixed(1)}%` : "—",
      status: glosaStatus,
      threshold_yellow: T.glosa_yellow,
      threshold_red: T.glosa_red,
      unit: "%",
      higherIsBetter: false,
      rawValues: { totalGlosa, totalMedidoAprovado },
    },
  ];
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function HoldingDashboardView() {
  const { company, isCompanyAdmin, canEdit, user, profile } = useAuth();

  // Load thresholds from localStorage on mount
  useEffect(() => {
    HEALTH_THRESHOLDS = loadHealthThresholds(company?.id);
  }, [company?.id]);
  const queryClient = useQueryClient();
  const [selectedObra, setSelectedObra] = useState<ObraEnriched | null>(null);

  const [mainView, setMainView] = useState<"portfolio" | "analytics" | "manual">("portfolio");
  const [viewMode, setViewMode] = useState<"cards" | "gantt" | "tabela">("cards");
  const [showNewObraDialog, setShowNewObraDialog] = useState(false);
  const [newObraForm, setNewObraForm] = useState({
    nome: "", empresa: "", num_contrato: "", parceria_scp: "",
    valor_contrato: "", data_inicio: "", prazo_dias: "",
    status: "nao_iniciada" as "nao_iniciada" | "em_andamento" | "concluida" | "paralisada",
    percentual_andamento: 0,
    percentual_fisico: 0,
    periodo_medicao: "", prazo_pagamento: "",
    municipio: "", estado: "RS",
    uh: "", responsavel: "", responsavel_nome: "", responsavel_telefone: "",
    coordenador_nome: "", coordenador_telefone: "",
    planejador_nome: "", planejador_telefone: "",
    tipo_contrato: "",
    valor_medido_inicial: 0,
  });
  const [savingObra, setSavingObra] = useState(false);
  const [editingObra, setEditingObra] = useState<ObraEnriched | null>(null);
  const [deletingObraId, setDeletingObraId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteNameConfirm, setDeleteNameConfirm] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteVerifying, setDeleteVerifying] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showEditRequestDialog, setShowEditRequestDialog] = useState(false);
  const [showDocConfigDialog, setShowDocConfigDialog] = useState(false);
  const [docConfigObraId, setDocConfigObraId] = useState<string>("");
  const [docConfigObraNome, setDocConfigObraNome] = useState<string>("");
  const onboarding = useOnboarding("cadastro_obra");
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Holding empresas for select
  const { data: holdingEmpresas = [] } = useQuery({
    queryKey: ["holding-empresas-list", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data } = await supabase
        .from("holding_empresas")
        .select("id, nome")
        .eq("company_id", company.id)
        .eq("ativo", true)
        .order("nome");
      return (data || []) as { id: string; nome: string }[];
    },
    enabled: !!company?.id,
  });

  // Global company filter (persists across all views)
  const [globalEmpresa, setGlobalEmpresa] = useState("all");

  // Filters
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSaude, setFilterSaude] = useState("all");
  const [searchNome, setSearchNome] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterResponsavel, setFilterResponsavel] = useState("all");
  const [filterCargo, setFilterCargo] = useState<"all" | "eng" | "coord" | "plan">("all");

  const exportarPDF = async () => {
    setIsPrinting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const today = format(new Date(), "dd/MM/yyyy");
      const companyName = (company as any)?.name || "Holding";

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 297, 210, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.text("Relatório de Portfólio", 148, 55, { align: "center" });
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text(companyName, 148, 70, { align: "center" });
      doc.setFontSize(11);
      doc.setTextColor(160, 160, 160);
      doc.text(`Gerado em ${today}`, 148, 82, { align: "center" });
      const kpiBoxes = [
        { label: "Total Contratos", value: BRL.format(kpis.totalContratos) },
        { label: "Medições Aprovadas", value: BRL.format(kpis.totalMedicoesAprovadas) },
        { label: "Obras Ativas", value: String(kpis.obrasAtivas) },
        { label: "Alertas Críticos", value: String(kpis.alertasCriticos) },
      ];
      kpiBoxes.forEach((k, i) => {
        const x = 18 + i * 66;
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(x, 108, 60, 28, 3, 3, "F");
        doc.setTextColor(120, 160, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(k.label, x + 30, 118, { align: "center" });
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(k.value, x + 30, 129, { align: "center" });
      });

      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Portfólio Detalhado", 14, 16);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(today, 283, 16, { align: "right" });

      const statusLbl: Record<string, string> = { em_andamento: "Em Andamento", nao_iniciada: "Não Iniciada", concluida: "Concluída", paralisada: "Paralisada" };
      const healthLbl: Record<string, string> = { green: "Verde", yellow: "Amarelo", red: "Vermelho", gray: "Neutro" };
      const sorted = [...obras].sort((a, b) => ({ em_andamento: 0, nao_iniciada: 1, concluida: 2, paralisada: 3 }[a.status] ?? 9) - ({ em_andamento: 0, nao_iniciada: 1, concluida: 2, paralisada: 3 }[b.status] ?? 9));

      autoTable(doc, {
        startY: 22,
        head: [["Obra", "Contrato", "Empresa", "Valor", "Status", "%", "Prev. Fim", "Docs", "Saúde"]],
        body: sorted.map((o) => {
          const fim = o.data_inicio ? format(addDays(parseLocalDate(o.data_inicio!), o.prazo_dias + o.aditivo_prazo_dias), "dd/MM/yy") : "—";
          return [o.nome, o.num_contrato || "—", o.empresa || "—", BRL.format(o.valor_contrato), statusLbl[o.status], `${o.percentual_andamento}%`, fim, `${o.docsCount}/${o.docsTotal}`, healthLbl[o.health]];
        }),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
        columnStyles: { 3: { halign: "right" }, 5: { halign: "center" }, 7: { halign: "center" } },
        didParseCell: (data: any) => {
          if (data.section !== "body") return;
          if (data.column.index === 4) {
            const v = data.cell.raw;
            if (v === "Em Andamento") data.cell.styles.textColor = [37, 99, 235];
            else if (v === "Concluída") data.cell.styles.textColor = [22, 163, 74];
            else if (v === "Paralisada") data.cell.styles.textColor = [220, 38, 38];
          }
          if (data.column.index === 8) {
            const v = data.cell.raw;
            if (v === "Verde") data.cell.styles.textColor = [22, 163, 74];
            else if (v === "Amarelo") data.cell.styles.textColor = [202, 138, 4];
            else if (v === "Vermelho") data.cell.styles.textColor = [220, 38, 38];
          }
        },
      });

      const alertsToShow = alerts.filter((a) => a.severity !== "info");
      if (alertsToShow.length > 0) {
        doc.addPage();
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Alertas do Portfólio", 14, 16);
        autoTable(doc, {
          startY: 22,
          head: [["Severidade", "Mensagem"]],
          body: alertsToShow.map((a) => [a.severity === "critical" ? "CRÍTICO" : "ATENÇÃO", a.message]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [15, 23, 42], textColor: 255 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 0) {
              data.cell.styles.textColor = data.cell.raw === "CRÍTICO" ? [220, 38, 38] : [202, 138, 4];
            }
          },
        });
      }

      doc.save(`portfolio-holding-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (e) {
      toast.error("Erro ao gerar PDF. Tente novamente.");
      console.error(e);
    }
    setIsPrinting(false);
  };

  const resetNewObraForm = () => setNewObraForm({
    nome: "", empresa: "", num_contrato: "", parceria_scp: "",
    valor_contrato: "", data_inicio: "", prazo_dias: "",
    status: "nao_iniciada", percentual_andamento: 0, percentual_fisico: 0,
    periodo_medicao: "", prazo_pagamento: "",
    municipio: "", estado: "RS",
    uh: "", responsavel: "", responsavel_nome: "", responsavel_telefone: "",
    coordenador_nome: "", coordenador_telefone: "",
    planejador_nome: "", planejador_telefone: "",
    tipo_contrato: "",
    valor_medido_inicial: 0,
  });

  const validateObraForm = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!newObraForm.nome.trim()) errs.nome = "Nome é obrigatório";
    if (!newObraForm.municipio.trim()) errs.municipio = "Município é obrigatório";
    if (!newObraForm.estado.trim()) errs.estado = "Estado é obrigatório";
    if (!newObraForm.uh || Number(newObraForm.uh) <= 0) errs.uh = "UH deve ser > 0";
    if (!newObraForm.status) errs.status = "Status é obrigatório";
    if (!newObraForm.num_contrato.trim()) errs.num_contrato = "Nº Contrato é obrigatório";
    if (!newObraForm.data_inicio) errs.data_inicio = "Data Início é obrigatória";
    if (!newObraForm.prazo_dias || Number(newObraForm.prazo_dias) <= 0) errs.prazo_dias = "Prazo deve ser > 0";
    if (!newObraForm.empresa?.trim()) errs.empresa = "Empresa é obrigatória";
    if (!newObraForm.tipo_contrato) errs.tipo_contrato = "Tipo de contrato é obrigatório";
    if (!newObraForm.periodo_medicao.trim()) errs.periodo_medicao = "Período de Medição é obrigatório";
    if (!newObraForm.prazo_pagamento.trim()) errs.prazo_pagamento = "Prazo de Pagamento é obrigatório";
    if (!newObraForm.responsavel_nome.trim()) errs.responsavel_nome = "Eng. Residente é obrigatório (se não houver, digite 'Contratar')";
    return errs;
  };

  const isEditorRestricted = !isCompanyAdmin && canEdit;

  const handlePreSave = () => {
    if (!canEdit) {
      toast.error("Você não tem permissão para cadastrar ou editar obras.");
      return;
    }
    if (!company?.id) return;
    const errs = validateObraForm();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setShowConfirmSave(true);
  };

  const handleSaveObra = async () => {
    setShowConfirmSave(false);
    if (!canEdit || !company?.id) return;
    setSavingObra(true);
    const payload = {
      company_id: company.id,
      nome: newObraForm.nome.trim(),
      empresa: newObraForm.empresa || null,
      num_contrato: newObraForm.num_contrato || null,
      parceria_scp: newObraForm.parceria_scp || null,
      valor_contrato: Number(newObraForm.valor_contrato) || 0,
      data_inicio: newObraForm.data_inicio || null,
      prazo_dias: Number(newObraForm.prazo_dias) || 0,
      status: newObraForm.status,
      percentual_andamento: newObraForm.percentual_andamento,
      percentual_fisico: newObraForm.percentual_fisico,
      periodo_medicao: newObraForm.periodo_medicao || null,
      prazo_pagamento: newObraForm.prazo_pagamento || null,
      municipio: newObraForm.municipio || null,
      estado: newObraForm.estado || "RS",
      uh: Number(newObraForm.uh) || null,
      responsavel_nome: newObraForm.responsavel_nome || null,
      responsavel_telefone: newObraForm.responsavel_telefone?.replace(/\D/g, "") || null,
      responsavel: [newObraForm.responsavel_nome, newObraForm.responsavel_telefone].filter(Boolean).join(" - ") || null,
      coordenador_nome: newObraForm.coordenador_nome || null,
      coordenador_telefone: newObraForm.coordenador_telefone?.replace(/\D/g, "") || null,
      planejador_nome: newObraForm.planejador_nome || null,
      planejador_telefone: newObraForm.planejador_telefone?.replace(/\D/g, "") || null,
      tipo_contrato: newObraForm.tipo_contrato || null,
      valor_medido_inicial: newObraForm.valor_medido_inicial || 0,
      // Se há valor faturado fora do sistema e valor de contrato, calcular % financeiro inicial
      // Evita que nova obra entre com percentual_financeiro = 0 quando já tem execução prévia
      ...(newObraForm.valor_medido_inicial > 0 && (Number(newObraForm.valor_contrato) || 0) > 0
        ? { percentual_financeiro: Math.min(100, (newObraForm.valor_medido_inicial / (Number(newObraForm.valor_contrato) || 1)) * 100) }
        : {}),
    } as any;

    // Geocode if municipio changed or coordinates are missing
    const needsGeocode =
      newObraForm.municipio &&
      (!editingObra || editingObra.municipio !== newObraForm.municipio ||
       !editingObra.latitude || !editingObra.longitude);

    if (needsGeocode) {
      const coords = await geocodeMunicipio(newObraForm.municipio, newObraForm.estado || "RS");
      if (coords) {
        payload.latitude = coords.lat;
        payload.longitude = coords.lng;
      }
    }

    if (editingObra) {
      const { error } = await supabase.from("obras_portfolio").update(payload).eq("id", editingObra.id);
      if (error) { toast.error("Erro ao atualizar obra."); setSavingObra(false); return; }

      // Se admin alterou percentual de obra com saldo inicial, recalcular medição inicial
      if (
        isCompanyAdmin &&
        editingObra.has_initial_balance &&
        newObraForm.percentual_andamento !== editingObra.percentual_andamento &&
        Number(newObraForm.valor_contrato) > 0
      ) {
        const novoValorInicial = Number(newObraForm.valor_contrato) * newObraForm.percentual_andamento / 100;

        // Atualizar a medição de saldo inicial existente
        const { error: errMed } = await supabase.from("medicoes_ple")
          .update({ valor_medicao: novoValorInicial })
          .eq("obra_id", editingObra.id)
          .eq("num_medicao", "Saldo Inicial");
        if (errMed) {
          toast.error("Obra atualizada, mas erro ao recalcular saldo inicial da medição. Verifique os valores.");
          setSavingObra(false);
          return;
        }

        // Atualizar o valor_medido_inicial na obra
        const { error: errObra } = await supabase.from("obras_portfolio").update({
          valor_medido_inicial: novoValorInicial,
        }).eq("id", editingObra.id);
        if (errObra) {
          toast.error("Medição atualizada, mas erro ao sincronizar valor_medido_inicial na obra.");
          setSavingObra(false);
          return;
        }

        toast.success(`Obra atualizada! Saldo inicial recalculado para ${BRL.format(novoValorInicial)}.`);
      } else {
        // Recalcular percentual_financeiro se valor_medido_inicial foi alterado
        if (isCompanyAdmin && newObraForm.valor_medido_inicial > 0) {
          const vc = (Number(newObraForm.valor_contrato) || 0);
          if (vc > 0) {
            const medicoesAprovadas = editingObra.allMedicoes
              .filter(m => m.status_medicao === "aprovada")
              .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
            const totalMedido = medicoesAprovadas + newObraForm.valor_medido_inicial;
            const pctFin = Math.min(100, (totalMedido / vc) * 100);
            await supabase.from("obras_portfolio").update({ percentual_financeiro: pctFin }).eq("id", editingObra.id);
          }
        }
        toast.success("Obra atualizada!");
      }
    } else {
      const { data, error } = await supabase.from("obras_portfolio").insert(payload).select("id").single();
      if (error || !data) { toast.error("Erro ao cadastrar obra."); setSavingObra(false); return; }
      await supabase.from("documentos_obra").insert({ obra_id: data.id });
      // Audit log — nova obra
      await supabase.from("holding_audit_log").insert({
        obra_id: data.id, tabela: "obras_portfolio", registro_id: data.id,
        acao: "criou", descricao: `Cadastrou obra "${newObraForm.nome}" — ${newObraForm.tipo_contrato || "N/A"} — ${newObraForm.municipio || ""}`,
        dados_anteriores: {}, dados_novos: { nome: newObraForm.nome, valor_contrato: newObraForm.valor_contrato, empresa: newObraForm.empresa },
        realizado_por: user?.id, realizado_por_nome: profile?.display_name || user?.email || "Usuário",
      } as any);
      toast.success("Obra cadastrada com sucesso!");
    }
    // Audit log — edição (quando editingObra)
    if (editingObra) {
      await supabase.from("holding_audit_log").insert({
        obra_id: editingObra.id, tabela: "obras_portfolio", registro_id: editingObra.id,
        acao: "editou", descricao: `Editou obra "${newObraForm.nome}"`,
        dados_anteriores: { nome: editingObra.nome, valor_contrato: editingObra.valor_contrato },
        dados_novos: { nome: newObraForm.nome, valor_contrato: newObraForm.valor_contrato, empresa: newObraForm.empresa },
        realizado_por: user?.id, realizado_por_nome: profile?.display_name || user?.email || "Usuário",
      } as any);
    }
    queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
    queryClient.invalidateQueries({ queryKey: ["holding-aditivos-pendentes", company?.id] });
    setShowNewObraDialog(false);
    setEditingObra(null);
    resetNewObraForm();
    setSavingObra(false);
  };

  const handleDeleteObra = async () => {
    if (!deletingObraId || !company?.id) return;
    await supabase.from("obras_portfolio").delete().eq("id", deletingObraId);
    queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
    queryClient.invalidateQueries({ queryKey: ["holding-aditivos-pendentes", company?.id] });
    toast.success("Obra excluída.");
    setDeletingObraId(null);
  };

  const handleImportObras = async () => {
    if (!company?.id || !importText.trim()) return;
    setImporting(true);
    try {
      const lines = importText.trim().split("\n").filter(l => l.trim());
      const obrasToInsert = lines.map((line, idx) => {
        const parts = line.split(",").map(s => s.trim());
        const [nome, empresa, num_contrato, parceria_scp, valor_contrato, data_inicio, prazo_dias, status, percentual_andamento, municipio, estado, uh, responsavel, tipo_contrato] = parts;
        return {
          company_id: company.id,
          nome: nome || `Obra ${idx + 1}`,
          empresa: empresa || null,
          num_contrato: num_contrato || null,
          parceria_scp: parceria_scp || null,
          valor_contrato: Number(valor_contrato) || 0,
          data_inicio: data_inicio || null,
          prazo_dias: Number(prazo_dias) || 0,
          status: (["em_andamento", "nao_iniciada", "concluida", "paralisada"].includes(status) ? status : "nao_iniciada") as "em_andamento" | "nao_iniciada" | "concluida" | "paralisada",
          percentual_andamento: Number(percentual_andamento) || 0,
          municipio: municipio || null,
          estado: estado || "RS",
          uh: Number(uh?.trim()) || null,
          responsavel: responsavel?.trim() || null,
          tipo_contrato: tipo_contrato?.trim() || null,
        };
      });

      // Duplicate check
      const existingNames = obras.map(o => o.nome.toLowerCase().trim());
      const newObras = obrasToInsert.filter(o => !existingNames.includes(o.nome.toLowerCase().trim()));
      const skipped = obrasToInsert.length - newObras.length;
      if (skipped > 0 && newObras.length > 0) {
        const duplicateNames = obrasToInsert
          .filter(o => existingNames.includes(o.nome.toLowerCase().trim()))
          .map(o => o.nome)
          .join(", ");
        toast.info(`Ignorando duplicadas: ${duplicateNames}`);
      }
      if (newObras.length === 0) {
        toast.warning("Todas as obras já estão cadastradas.");
        setImporting(false);
        return;
      }

      const { data: inserted, error } = await supabase.from("obras_portfolio").insert(newObras).select("id");
      if (error) throw error;

      if (inserted && inserted.length > 0) {
        const docsRows = inserted.map(o => ({ obra_id: o.id }));
        await supabase.from("documentos_obra").insert(docsRows);
      }

      queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
      queryClient.invalidateQueries({ queryKey: ["holding-aditivos-pendentes", company?.id] });
      if (skipped > 0) toast.success(`${inserted?.length || 0} obras importadas. ${skipped} já existiam e foram ignoradas.`);
      else toast.success(`${inserted?.length || 0} obras importadas com sucesso!`);
      setShowImportDialog(false);
      setImportText("");
    } catch (e: any) {
      toast.error(`Erro na importação: ${e.message || "Verifique os dados"}`);
      console.error(e);
    }
    setImporting(false);
  };

  const exportarCSV = () => {
    const header = "Obra;Empresa;Contrato;SCP;UH;Tipo Contrato;Responsável;Telefone;Valor Contrato;Receitas;Saldo;% Financ.;Data Início;Prazo;Previsão Fim;Status;% And.;Docs;Saúde";
    const rows = obrasFiltradas.map((o) => {
      const fim = o.data_inicio ? format(addDays(parseLocalDate(o.data_inicio!), o.prazo_dias + o.aditivo_prazo_dias), "dd/MM/yyyy") : "—";
      const statusLbl = STATUS_CONFIG[o.status]?.label || o.status;
      const healthLbl = o.health === "green" ? "Verde" : o.health === "yellow" ? "Amarelo" : o.health === "red" ? "Vermelho" : "Neutro";
      const recAprov = o.allMedicoes.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
      const vc = (o.valor_contrato || 0) + (o.aditivo_valor_total || 0);
      const receitas = recAprov + (Number(o.valor_medido_inicial) || 0);
      const saldo = vc - receitas;
      const pctFin = o.valor_contrato > 0 && receitas > 0 ? (receitas / o.valor_contrato * 100).toFixed(1) + "%" : "—";
      return `${o.nome};${o.empresa || "—"};${o.num_contrato || "—"};${o.parceria_scp || "—"};${o.uh || "—"};${o.tipo_contrato || "—"};${o.responsavel_nome || o.responsavel || "—"};${o.responsavel_telefone || "—"};${o.valor_contrato};${receitas};${saldo};${pctFin};${o.data_inicio || "—"};${o.prazo_dias || "—"};${fim};${statusLbl};${o.percentual_andamento}%;${o.docsCount}/${o.docsTotal};${healthLbl}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-holding-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const { data: obras = [], isLoading, isError } = useQuery({
    queryKey: ["holding-portfolio", company?.id],
    staleTime: 30_000,          // 30s — realtime já atualiza quando há mudanças reais
    gcTime: 120_000,            // 2min em cache após desmonte
    refetchOnWindowFocus: false, // realtime cobre mudanças de outros usuários
    queryFn: async () => {
      if (!company?.id) return [];
      // 1. Buscar obras primeiro para ter os IDs
      const { data: obrasRaw } = await supabase
        .from("obras_portfolio").select(
          "id, nome, empresa, num_contrato, parceria_scp, municipio, estado, uh, " +
          "tipo_contrato, status, valor_contrato, aditivo_valor_total, aditivo_prazo_dias, " +
          "data_inicio, prazo_dias, periodo_medicao, prazo_pagamento, " +
          "percentual_andamento, percentual_fisico, percentual_financeiro, " +
          "valor_medido_inicial, has_initial_balance, " +
          "responsavel, responsavel_nome, responsavel_telefone, " +
          "coordenador_nome, coordenador_telefone, " +
          "planejador_nome, planejador_telefone, " +
          "obramap_project_id, company_id"
        ).eq("company_id", company.id).order("nome");
      const obrasTyped = (obrasRaw || []) as unknown as ObraPortfolio[];
      const obraIds = obrasTyped.map(o => o.id);

      // 2. Buscar docs, medições, notificações e despesas em paralelo
      const [docsRes, medicoesRes, notifRes, despesasRes] = await Promise.all([
        obraIds.length > 0
          ? supabase.from("documentos_obra").select("*").in("obra_id", obraIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        obraIds.length > 0
          ? supabase.from("medicoes_ple").select(
              "id, obra_id, num_medicao, status_medicao, valor_medicao, valor_acatado, valor_previsto_medicao, data_previsao_medicao, data_envio, data_aprovacao, status_nf, data_pagamento"
            ).in("obra_id", obraIds).order("ano_referencia", { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),
        obraIds.length > 0
          ? supabase.from("system_notifications").select("obra_id").in("obra_id", obraIds).eq("resolvida", false).eq("lida", false)
          : Promise.resolve({ data: [] as any[], error: null }),
        obraIds.length > 0
          ? supabase.from("despesas_mensais").select("id, obra_id, valor, tipo_despesa").in("obra_id", obraIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      const obrasData = obrasTyped;
      const docsData = (docsRes.data || []) as DocumentosObra[];
      const medicoesData = (medicoesRes.data || []) as MedicaoPle[];
      const despesasData = (despesasRes.data || []) as { id: string; obra_id: string; valor: number; tipo_despesa: string }[];

      // Build notification count map
      const notifCountMap = new Map<string, number>();
      (notifRes.data || []).forEach((n: any) => {
        notifCountMap.set(n.obra_id, (notifCountMap.get(n.obra_id) || 0) + 1);
      });

      const docsMap = new Map<string, DocumentosObra>();
      docsData.forEach((d) => docsMap.set(d.obra_id, d));

      const medicoesMap = new Map<string, MedicaoPle[]>();
      medicoesData.forEach((m) => {
        const arr = medicoesMap.get(m.obra_id) || [];
        arr.push(m);
        medicoesMap.set(m.obra_id, arr);
      });

      // Build despesas map
      const despesasMap = new Map<string, typeof despesasData>();
      despesasData.forEach((d) => {
        const arr = despesasMap.get(d.obra_id) || [];
        arr.push(d);
        despesasMap.set(d.obra_id, arr);
      });

      return obrasData.map((obra): ObraEnriched => {
        const docs = docsMap.get(obra.id) || null;
        const allMedicoes = (medicoesMap.get(obra.id) || []).sort((a, b) => {
          if (a.num_medicao === "Saldo Inicial") return -1;
          if (b.num_medicao === "Saldo Inicial") return 1;
          const na = parseInt(a.num_medicao || "0", 10);
          const nb = parseInt(b.num_medicao || "0", 10);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return (a.num_medicao || "").localeCompare(b.num_medicao || "");
        });
        const latestMedicao = allMedicoes.length > 0 ? allMedicoes[allMedicoes.length - 1] : null;
        const { count: docsCount, total: docsTotal } = countDocs(docs);
        const health = calcHealth(obra, allMedicoes);
        const pendingNotifCount = notifCountMap.get(obra.id) || 0;
        const despesasDaObra = despesasMap.get(obra.id) || [];
        return { ...obra, docs, latestMedicao, allMedicoes, docsCount, docsTotal, health, pendingNotifCount, despesasDaObra };
      });
    },
    enabled: !!company?.id,
  });

  // Realtime: auto-refresh portfolio when medicoes or obras change
  // Debounced 2s to avoid 787KB re-fetch cascade when multiple users work simultaneously
  useEffect(() => {
    if (!company?.id) return;
    let realtimeTimer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel(`holding-dashboard-${company.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "medicoes_ple" }, () => {
        clearTimeout(realtimeTimer);
        realtimeTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
        }, 2000); // debounce 2s — evita re-fetch em cascata com múltiplos usuários
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "obras_portfolio" }, () => {
        clearTimeout(realtimeTimer);
        realtimeTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
        }, 2000);
      })
      .subscribe();
    return () => { clearTimeout(realtimeTimer); supabase.removeChannel(channel); };
  }, [company?.id, queryClient]);

  // Manter selectedObra sincronizada quando obras re-fetcha após invalidate
  useEffect(() => {
    if (!selectedObra) return;
    const updated = obras.find(o => o.id === selectedObra.id);
    if (updated) setSelectedObra(updated);
  }, [obras]);

  const { data: aditivosPendentes = [] } = useQuery({
    queryKey: ["holding-aditivos-pendentes", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const obraIds = obras.map((o) => o.id);
      if (obraIds.length === 0) return [];
      const { data } = await supabase
        .from("aditivos_contratos")
        .select("id, obra_id, num_aditivo")
        .in("obra_id", obraIds)
        .eq("status", "pendente");
      return data || [];
    },
    enabled: !!company?.id && obras.length > 0,
  });

  // Filters — must be before kpis/alerts so they can use obrasFiltradas
  const empresas = useMemo(() => [...new Set(obras.map(o => o.empresa).filter(Boolean))].sort(), [obras]);

  const normalizeStr = (str: string): string =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const obrasFiltradas = useMemo(() => {
    return obras.filter(o => {
      if (globalEmpresa !== "all" && o.empresa !== globalEmpresa) return false;
      if (filterEmpresa !== "all" && o.empresa !== filterEmpresa) return false;
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      if (filterSaude !== "all" && o.health !== filterSaude) return false;
      if (filterTipo !== "all" && o.tipo_contrato !== filterTipo) return false;
      if (filterResponsavel !== "all") {
        const camposCargo =
          filterCargo === "eng"   ? [o.responsavel_nome] :
          filterCargo === "coord" ? [o.coordenador_nome] :
          filterCargo === "plan"  ? [o.planejador_nome]  :
          [o.responsavel_nome, o.coordenador_nome, o.planejador_nome];
        if (!camposCargo.some(n => n === filterResponsavel)) return false;
      } else if (filterCargo !== "all") {
        const temCargo =
          filterCargo === "eng"   ? !!o.responsavel_nome :
          filterCargo === "coord" ? !!o.coordenador_nome :
          filterCargo === "plan"  ? !!o.planejador_nome  : true;
        if (!temCargo) return false;
      }
      if (searchNome) {
        const term = normalizeStr(searchNome);
        const matchNome = normalizeStr(o.nome).includes(term);
        const matchEmpresa = o.empresa ? normalizeStr(o.empresa).includes(term) : false;
        const matchMunicipio = o.municipio ? normalizeStr(o.municipio).includes(term) : false;
        if (!matchNome && !matchEmpresa && !matchMunicipio) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.status === "nao_iniciada" && b.status !== "nao_iniciada") return 1;
      if (b.status === "nao_iniciada" && a.status !== "nao_iniciada") return -1;
      const da = a.data_inicio ? new Date(a.data_inicio).getTime() : 0;
      const db = b.data_inicio ? new Date(b.data_inicio).getTime() : 0;
      return da - db;
    });
  }, [obras, globalEmpresa, filterEmpresa, filterStatus, filterSaude, filterTipo, filterResponsavel, filterCargo, searchNome]);

  const hasActiveFilter = filterEmpresa !== "all" || filterStatus !== "all" || filterSaude !== "all" || filterTipo !== "all" || filterResponsavel !== "all" || filterCargo !== "all" || searchNome !== "";

  const clearFilters = () => {
    setFilterEmpresa("all");
    setFilterStatus("all");
    setFilterSaude("all");
    setFilterTipo("all");
    setFilterResponsavel("all");
    setFilterCargo("all");
    setSearchNome("");
  };

  const responsaveisEng = useMemo(() => {
    const names = obras.map(o => o.responsavel_nome).filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [obras]);

  const responsaveisCoord = useMemo(() => {
    const names = obras.map(o => o.coordenador_nome).filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [obras]);

  const responsaveisPlan = useMemo(() => {
    const names = obras.map(o => o.planejador_nome).filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [obras]);

  // Lista ativa baseada no cargo selecionado
  const responsaveisAtivos = useMemo(() => {
    if (filterCargo === "eng")   return responsaveisEng;
    if (filterCargo === "coord") return responsaveisCoord;
    if (filterCargo === "plan")  return responsaveisPlan;
    // "all": todos os nomes combinados
    const all = obras.flatMap(o => [o.responsavel_nome, o.coordenador_nome, o.planejador_nome]).filter(Boolean) as string[];
    return [...new Set(all)].sort();
  }, [obras, filterCargo, responsaveisEng, responsaveisCoord, responsaveisPlan]);

  const temResponsaveis = responsaveisEng.length > 0 || responsaveisCoord.length > 0 || responsaveisPlan.length > 0;

  const kpis = useMemo(() => {
    const base = obrasFiltradas;
    const emAndamento = base.filter((o) => o.status === "em_andamento");
    const naoIniciadas = base.filter((o) => o.status === "nao_iniciada");

    // Total de todos os contratos (ativos + não iniciados + concluídos)
    const totalContratos = base.reduce((s, o) => s + (o.valor_contrato || 0) + (o.aditivo_valor_total || 0), 0);
    // Total apenas de contratos ativos
    const totalContratosAtivos = emAndamento.reduce((s, o) => s + (o.valor_contrato || 0) + (o.aditivo_valor_total || 0), 0);
    // Total contratos não iniciados
    const totalContratosNaoIniciados = naoIniciadas.reduce((s, o) => s + (o.valor_contrato || 0) + (o.aditivo_valor_total || 0), 0);

    // Total medido (apenas obras ativas)
    const totalMedido = emAndamento.reduce((s, o) => {
      const aprovadas = o.allMedicoes
        .filter((m) => m.status_medicao === "aprovada")
        .reduce((ss, m) => ss + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
      return s + aprovadas + (Number(o.valor_medido_inicial) || 0);
    }, 0);

    // Saldo a faturar = contratos ativos - medido ativo
    const saldoFaturar = totalContratosAtivos - totalMedido;
    const totalMedicoesAprovadas = totalMedido;

    const obrasAtivas = emAndamento.length;
    const obrasNaoIniciadas = naoIniciadas.length;
    const alertasCriticos = base.filter((o) => o.health === "red").length;

    // Andamento médio apenas sobre obras ativas
    const andamentoMedio = emAndamento.length > 0 ? Math.round(
      emAndamento.reduce((s, o) => {
        const vc = (o.valor_contrato || 0) + (o.aditivo_valor_total || 0);
        if (vc <= 0) return s + (o.percentual_andamento || 0);
        const aprovadas = o.allMedicoes
          .filter((m) => m.status_medicao === "aprovada")
          .reduce((ss, m) => ss + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
        const totalFinanceiro = aprovadas + (o.valor_medido_inicial || 0);
        const pct = totalFinanceiro > 0 ? (totalFinanceiro / vc) * 100 : (o.percentual_andamento || 0);
        return s + Math.min(100, pct);
      }, 0) / emAndamento.length
    ) : 0;

    // UH separadas
    const totalUH = base.reduce((s, o) => s + (o.uh || 0), 0);
    const uhAtivas = emAndamento.reduce((s, o) => s + (o.uh || 0), 0);
    const uhNaoIniciadas = naoIniciadas.reduce((s, o) => s + (o.uh || 0), 0);

    return {
      totalContratos, totalContratosAtivos, totalContratosNaoIniciados,
      totalMedido, saldoFaturar, totalMedicoesAprovadas,
      obrasAtivas, obrasNaoIniciadas, alertasCriticos, andamentoMedio,
      totalUH, uhAtivas, uhNaoIniciadas,
    };
  }, [obrasFiltradas]);

  const alerts = useMemo((): HoldingAlert[] => {
    const result: HoldingAlert[] = [];
    const now = new Date();

    for (const obra of obrasFiltradas) {

      if (obra.latestMedicao?.status_medicao === "enviada" && obra.latestMedicao.data_envio) {
        const days = differenceInDays(now, new Date(obra.latestMedicao.data_envio));
        if (days > 30) {
          result.push({
            id: `med-${obra.id}`, obraId: obra.id, obraNome: obra.nome,
            severity: days > 60 ? "critical" : "warning",
            icon: Clock,
            message: `${obra.nome} — medição pendente há ${days} dias`,
          });
        }
      }

      if (obra.data_inicio && obra.status === "em_andamento") {
        const fimPrevisto = addDays(parseLocalDate(obra.data_inicio!), obra.prazo_dias + obra.aditivo_prazo_dias);
        const diasRestantes = differenceInDays(fimPrevisto, now);
        if (diasRestantes >= 0 && diasRestantes < 30) {
          result.push({
            id: `prazo-${obra.id}`, obraId: obra.id, obraNome: obra.nome,
            severity: diasRestantes < 7 ? "critical" : "warning",
            icon: CalendarClock,
            message: `${obra.nome} — vence em ${diasRestantes} dias (${format(fimPrevisto, "dd/MM/yyyy")})`,
          });
        } else if (diasRestantes < 0) {
          result.push({
            id: `prazo-${obra.id}`, obraId: obra.id, obraNome: obra.nome,
            severity: "critical", icon: CalendarClock,
            message: `${obra.nome} — prazo vencido há ${Math.abs(diasRestantes)} dias`,
          });
        }
      }
    }

    for (const adit of aditivosPendentes) {
      const obra = obras.find((o) => o.id === adit.obra_id);
      if (obra) {
        result.push({
          id: `adit-${adit.id}`, obraId: obra.id, obraNome: obra.nome,
          severity: "info", icon: FileCheck2,
          message: `${obra.nome} — aditivo ${adit.num_aditivo || ""} pendente de aprovação`,
        });
      }
    }

    const order = { critical: 0, warning: 1, info: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [obrasFiltradas, aditivosPendentes, obras]);

  const openObra = useCallback((obraId: string) => {
    const obra = obras.find((o) => o.id === obraId);
    if (obra) setSelectedObra(obra);
  }, [obras]);

  // Summary stats for filtered obras
  const summaryStats = useMemo(() => {
    const valorTotal = obrasFiltradas.reduce((s, o) => s + (o.valor_contrato || 0) + (o.aditivo_valor_total || 0), 0);
    const emDia = obrasFiltradas.filter(o => o.health === "green").length;
    const emAtencao = obrasFiltradas.filter(o => o.health === "yellow").length;
    const totalDocs = obrasFiltradas.reduce((s, o) => s + o.docsCount, 0);
    const totalDocsMax = obrasFiltradas.reduce((s, o) => s + o.docsTotal, 0);
    const docMedia = totalDocsMax > 0 ? Math.round((totalDocs / totalDocsMax) * 100) : 0;
    return { valorTotal, emDia, emAtencao, docMedia };
  }, [obrasFiltradas]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground text-sm">Erro ao carregar dados.</p>
          <Button variant="outline" size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company?.id] })}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
    {/* Global Company Filter */}
      {empresas.length > 1 && (
        <div className="flex items-center gap-3 pb-2 border-b border-border mb-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Visualizando:</span>
          {empresas.map(emp => (
            <button
              key={emp}
              onClick={() => setGlobalEmpresa(globalEmpresa === emp ? "all" : emp)}
              className={`px-3 py-1 text-xs rounded-full border transition-all ${
                globalEmpresa === emp
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {emp}
            </button>
          ))}
          {globalEmpresa !== "all" && (
            <button onClick={() => setGlobalEmpresa("all")} className="text-xs text-muted-foreground hover:text-foreground">
              × Limpar
            </button>
          )}
        </div>
      )}

      {/* KPI Row — 10 cards em 2 linhas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Linha 1 — Financeiro */}
        <KpiCard icon={DollarSign} label="Total em Contratos" value={BRL.format(kpis.totalContratos)} sub={`${kpis.totalUH} UH total`} borderColor="border-b-emerald-500" valueColor="text-emerald-600 dark:text-emerald-400" />
        <KpiCard icon={ClipboardCheck} label="Contratos Ativos" value={BRL.format(kpis.totalContratosAtivos)} sub={`${kpis.obrasAtivas} obras · ${kpis.uhAtivas} UH`} borderColor="border-b-cyan-500" valueColor="text-cyan-600 dark:text-cyan-400" />
        <KpiCard icon={Pause} label="Contratos Não Iniciados" value={BRL.format(kpis.totalContratosNaoIniciados)} sub={`${kpis.obrasNaoIniciadas} obras · ${kpis.uhNaoIniciadas} UH`} borderColor="border-b-gray-400" valueColor="text-muted-foreground" />
        <KpiCard icon={Wallet} label="Saldo a Faturar" value={BRL.format(Math.max(0, kpis.saldoFaturar))} sub={kpis.totalContratosAtivos > 0 ? `${((Math.max(0, kpis.saldoFaturar) / kpis.totalContratosAtivos) * 100).toFixed(1)}% restante (ativos)` : ""} borderColor="border-b-blue-500" valueColor="text-blue-600 dark:text-blue-400" />
        <KpiCard icon={TrendingUp} label="Andamento Médio" value={`${kpis.andamentoMedio}%`} sub="obras ativas" borderColor="border-b-violet-500" valueColor="text-violet-600 dark:text-violet-400" />

        {/* Linha 2 — Operacional */}
        <KpiCard icon={Building2} label="Obras Ativas" value={String(kpis.obrasAtivas)} sub="em andamento" borderColor="border-b-blue-400" valueColor="text-blue-600 dark:text-blue-400" />
        <KpiCard icon={Pause} label="Não Iniciadas" value={String(kpis.obrasNaoIniciadas)} sub="aguardando início" borderColor="border-b-gray-400" valueColor="text-muted-foreground" />
        <KpiCard icon={Home} label="UH Ativas" value={kpis.uhAtivas > 0 ? kpis.uhAtivas.toLocaleString("pt-BR") : "—"} sub="em andamento" borderColor="border-b-amber-500" valueColor="text-amber-600 dark:text-amber-400" />
        <KpiCard icon={Home} label="UH Não Iniciadas" value={kpis.uhNaoIniciadas > 0 ? kpis.uhNaoIniciadas.toLocaleString("pt-BR") : "—"} sub="aguardando início" borderColor="border-b-orange-400" valueColor="text-orange-600 dark:text-orange-400" />
        <KpiCard icon={AlertTriangle} label="Alertas Críticos" value={String(kpis.alertasCriticos)} sub={kpis.alertasCriticos > 0 ? "requerem atenção" : "tudo sob controle"} borderColor={kpis.alertasCriticos > 0 ? "border-b-red-500" : "border-b-gray-300"} valueColor={kpis.alertasCriticos > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"} />
      </div>

      {/* Main View Tabs + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          <button onClick={() => setMainView("portfolio")} className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${mainView === "portfolio" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Crown className="h-4 w-4" /> Portfólio
          </button>
          <button onClick={() => setMainView("analytics")} className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${mainView === "analytics" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <BarChart3 className="h-4 w-4" /> Mapa
          </button>
          <button onClick={() => setMainView("manual")} className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${mainView === "manual" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <BookOpen className="h-4 w-4" /> Manual
          </button>
        </div>
        {mainView !== "manual" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewObraDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Nova Obra
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Importar
            </Button>
            {viewMode === "tabela" && mainView === "portfolio" && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportarCSV}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportarPDF} disabled={isPrinting || obras.length === 0}>
              {isPrinting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />}
              Exportar PDF
            </Button>
          </div>
        )}
      </div>

      {/* Filter Bar — only in portfolio */}
      {mainView === "portfolio" && obras.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar obra..."
              value={searchNome}
              onChange={(e) => setSearchNome(e.target.value)}
              className="h-8 w-48 text-xs pl-8"
            />
          </div>
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Todas Empresas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Empresas</SelectItem>
              {empresas.map(e => <SelectItem key={e} value={e!}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Todos Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="paralisada">Paralisada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSaude} onValueChange={setFilterSaude}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Toda Saúde" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda Saúde</SelectItem>
              <SelectItem value="green">🟢 Verde</SelectItem>
              <SelectItem value="yellow">🟡 Amarelo</SelectItem>
              <SelectItem value="red">🔴 Vermelho</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Tipo Contrato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              <SelectItem value="Ata Estado RS">Ata Estado RS</SelectItem>
              <SelectItem value="Licitação">Licitação</SelectItem>
              <SelectItem value="Adesão">Adesão</SelectItem>
              <SelectItem value="Moradia Popular">Moradia Popular</SelectItem>
              <SelectItem value="Moradia Faixa I">Moradia Faixa I</SelectItem>
              <SelectItem value="Moradia Faixa II">Moradia Faixa II</SelectItem>
              <SelectItem value="Alto Padrão">Alto Padrão</SelectItem>
              <SelectItem value="Projeto de Obra">Projeto de Obra</SelectItem>
            </SelectContent>
          </Select>
          {temResponsaveis && (
            <>
              {/* Select 1: cargo */}
              <Select value={filterCargo} onValueChange={(v) => {
                setFilterCargo(v as "all" | "eng" | "coord" | "plan");
                setFilterResponsavel("all"); // resetar nome ao trocar cargo
              }}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Cargo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Cargos</SelectItem>
                  {responsaveisEng.length   > 0 && <SelectItem value="eng">Eng. Residente</SelectItem>}
                  {responsaveisCoord.length > 0 && <SelectItem value="coord">Coordenador</SelectItem>}
                  {responsaveisPlan.length  > 0 && <SelectItem value="plan">Planejador</SelectItem>}
                </SelectContent>
              </Select>
              {/* Select 2: nome — só aparece quando há mais de 1 opção no cargo */}
              {responsaveisAtivos.length > 0 && (
                <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Todos Resp." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {responsaveisAtivos.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
          <Badge variant="secondary" className="text-xs h-6">{obrasFiltradas.length} obras</Badge>
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
      )}

      {mainView === "portfolio" ? (
        <>
          {/* Portfolio Sub-Toggle */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Obras do Portfólio ({obrasFiltradas.length})</h3>
            {obrasFiltradas.length > 0 && (
              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "cards" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Cards
                </button>
                <button onClick={() => setViewMode("gantt")} className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "gantt" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <GanttChart className="h-3.5 w-3.5" /> Gantt
                </button>
                <button onClick={() => setViewMode("tabela")} className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "tabela" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <TableIcon className="h-3.5 w-3.5" /> Tabela
                </button>
              </div>
            )}
          </div>

          {/* Obras View */}
          {obrasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Crown className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{hasActiveFilter ? "Nenhuma obra encontrada com os filtros aplicados." : "Nenhuma obra cadastrada no portfólio."}</p>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {obrasFiltradas.map((obra) => (
                <ObraCard
                  key={obra.id}
                  obra={obra}
                  onClick={() => setSelectedObra(obra)}
                  onEdit={() => {
                    setNewObraForm({
                      nome: obra.nome, empresa: obra.empresa || "", num_contrato: obra.num_contrato || "",
                      parceria_scp: obra.parceria_scp || "", valor_contrato: String(obra.valor_contrato || ""),
                      data_inicio: obra.data_inicio || "", prazo_dias: String(obra.prazo_dias || ""),
                      status: obra.status, percentual_andamento: obra.percentual_andamento, percentual_fisico: obra.percentual_fisico || 0,
                      periodo_medicao: obra.periodo_medicao || "", prazo_pagamento: obra.prazo_pagamento || "",
                      municipio: obra.municipio || "", estado: obra.estado || "RS",
                      uh: String(obra.uh || ""), responsavel: obra.responsavel || "",
                      responsavel_nome: obra.responsavel_nome || (obra.responsavel?.split(" - ")[0] || ""),
                      responsavel_telefone: obra.responsavel_telefone || (obra.responsavel?.split(" - ")[1] || ""),
                      coordenador_nome: obra.coordenador_nome || "",
                      coordenador_telefone: obra.coordenador_telefone || "",
                      planejador_nome: obra.planejador_nome || "",
                      planejador_telefone: obra.planejador_telefone || "",
                      tipo_contrato: obra.tipo_contrato || "",
                      valor_medido_inicial: obra.valor_medido_inicial || 0,
                    });
                    setEditingObra(obra);
                    setShowNewObraDialog(true);
                  }}
                  onDelete={() => setDeletingObraId(obra.id)}
                />
              ))}
            </div>
          ) : viewMode === "gantt" ? (
            <GanttTimeline obras={obrasFiltradas} onObraClick={openObra} />
          ) : (
            <ObraTable obras={obrasFiltradas} onObraClick={openObra} />
          )}

          {/* Summary Bar */}
          {obrasFiltradas.length > 0 && (
            <div className="bg-muted/30 rounded-lg px-6 py-3 flex items-center justify-between flex-wrap gap-3 text-sm">
              <div><span className="text-muted-foreground text-xs">Valor Portfólio</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{BRL_SHORT(summaryStats.valorTotal)}</p></div>
              <div><span className="text-muted-foreground text-xs">Obras em dia</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{summaryStats.emDia}</p></div>
              <div><span className="text-muted-foreground text-xs">Em atenção</span><p className="font-semibold text-amber-600 dark:text-amber-400">{summaryStats.emAtencao}</p></div>
              <div><span className="text-muted-foreground text-xs">Doc. média</span><p className="font-semibold text-foreground">{summaryStats.docMedia}%</p></div>
            </div>
          )}
        </>
      ) : mainView === "manual" ? (
        <HoldingManualView />
      ) : (
        <HoldingAnalyticsView obras={obrasFiltradas} alerts={alerts} onObraClick={openObra} />
      )}

      {/* Central de Alertas */}
      {alerts.length > 0 && mainView === "portfolio" && (
        <Card className="border-border/60">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertas que precisam de atenção
              </h3>
              <Badge variant="destructive" className="text-xs">{alerts.length}</Badge>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {alerts.map((alert) => {
                const sev = SEVERITY_CONFIG[alert.severity];
                const Icon = alert.icon;
                return (
                  <div key={alert.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm flex-1 min-w-0">{alert.message}</span>
                    <Badge variant="secondary" className={`text-[10px] shrink-0 ${sev.cls}`}>{sev.label}</Badge>
                    <Button size="sm" variant="ghost" className="text-xs shrink-0 h-7 px-2" onClick={() => openObra(alert.obraId)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Drawer */}
      <ObraDetailDrawer obra={selectedObra ? { id: selectedObra.id, nome: selectedObra.nome, uh: selectedObra.uh, responsavel: selectedObra.responsavel, responsavel_nome: selectedObra.responsavel_nome, responsavel_telefone: selectedObra.responsavel_telefone, coordenador_nome: selectedObra.coordenador_nome, coordenador_telefone: selectedObra.coordenador_telefone, planejador_nome: selectedObra.planejador_nome, planejador_telefone: selectedObra.planejador_telefone, tipo_contrato: selectedObra.tipo_contrato, valor_contrato: selectedObra.valor_contrato, data_inicio: selectedObra.data_inicio, prazo_dias: selectedObra.prazo_dias, aditivo_prazo_dias: selectedObra.aditivo_prazo_dias, aditivo_valor_total: selectedObra.aditivo_valor_total, percentual_andamento: selectedObra.percentual_andamento, has_initial_balance: selectedObra.has_initial_balance, valor_medido_inicial: selectedObra.valor_medido_inicial, status: selectedObra.status, prazo_pagamento: selectedObra.prazo_pagamento, empresa: selectedObra.empresa } : null} onClose={() => setSelectedObra(null)} />

      {/* Onboarding Dialog */}
      <OnboardingDialog
        actionKey="cadastro_obra"
        open={showOnboarding}
        onComplete={() => { onboarding.markAsSeen(); setShowOnboarding(false); }}
      />

      {/* Doc Config Dialog */}
      <ObraDocConfigDialog
        open={showDocConfigDialog}
        onOpenChange={setShowDocConfigDialog}
        obraId={docConfigObraId}
        obraNome={docConfigObraNome}
      />

      {/* Edit Request Dialog (for editors) */}
      <EditRequestDialog
        open={showEditRequestDialog}
        onOpenChange={setShowEditRequestDialog}
        obraId={editingObra?.id || ""}
        obraNome={editingObra?.nome || ""}
      />

      {/* Nova Obra Dialog */}
      <Dialog open={showNewObraDialog} onOpenChange={(o) => { if (!o) { setShowNewObraDialog(false); setEditingObra(null); resetNewObraForm(); setFormErrors({}); } else if (!editingObra && onboarding.shouldShow) { setShowOnboarding(true); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingObra ? "Editar Obra" : "Cadastrar Nova Obra"}</DialogTitle>
            {editingObra && isEditorRestricted && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠️ Como Editor, você pode alterar apenas Responsáveis e Nº Contrato. Para outros campos, solicite permissão.</p>
            )}
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={newObraForm.nome} onChange={(e) => setNewObraForm(p => ({ ...p, nome: e.target.value }))} disabled={editingObra && isEditorRestricted} className={formErrors.nome ? "border-destructive" : ""} />
              {formErrors.nome && <p className="text-[10px] text-destructive mt-0.5">{formErrors.nome}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Empresa *</Label>
                {holdingEmpresas.length > 0 ? (
                  <Select value={newObraForm.empresa} onValueChange={(v) => setNewObraForm(p => ({ ...p, empresa: v }))} disabled={!!(editingObra && isEditorRestricted)}>
                    <SelectTrigger className={`h-9 ${formErrors.empresa ? "border-destructive" : ""}`}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {holdingEmpresas.map(e => (
                        <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <Input value={newObraForm.empresa} onChange={(e) => setNewObraForm(p => ({ ...p, empresa: e.target.value }))} placeholder="Digite o nome" disabled={!!(editingObra && isEditorRestricted)} className={formErrors.empresa ? "border-destructive" : ""} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">💡 Cadastre empresas em Configurações para usar o seletor.</p>
                  </div>
                )}
                {formErrors.empresa && <p className="text-[10px] text-destructive mt-0.5">{formErrors.empresa}</p>}
              </div>
              <div>
                <Label className="text-xs">Nº Contrato *</Label>
                <Input value={newObraForm.num_contrato} onChange={(e) => setNewObraForm(p => ({ ...p, num_contrato: e.target.value }))} className={formErrors.num_contrato ? "border-destructive" : ""} />
                {formErrors.num_contrato && <p className="text-[10px] text-destructive mt-0.5">{formErrors.num_contrato}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Parceria SCP</Label><Input value={newObraForm.parceria_scp} onChange={(e) => setNewObraForm(p => ({ ...p, parceria_scp: e.target.value }))} disabled={editingObra && isEditorRestricted} /></div>
              <div><Label className="text-xs">Valor Contrato (R$)</Label><CurrencyInput value={Number(newObraForm.valor_contrato) || 0} onChange={(v) => setNewObraForm(p => ({ ...p, valor_contrato: String(v) }))} disabled={!!(editingObra && isEditorRestricted)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Início *</Label>
                <Input type="date" value={newObraForm.data_inicio} onChange={(e) => setNewObraForm(p => ({ ...p, data_inicio: e.target.value }))} disabled={editingObra && isEditorRestricted} className={formErrors.data_inicio ? "border-destructive" : ""} />
                {formErrors.data_inicio && <p className="text-[10px] text-destructive mt-0.5">{formErrors.data_inicio}</p>}
              </div>
              <div>
                <Label className="text-xs">Prazo (dias) *</Label>
                <Input type="number" value={newObraForm.prazo_dias} onChange={(e) => setNewObraForm(p => ({ ...p, prazo_dias: e.target.value }))} disabled={editingObra && isEditorRestricted} className={formErrors.prazo_dias ? "border-destructive" : ""} />
                {formErrors.prazo_dias && <p className="text-[10px] text-destructive mt-0.5">{formErrors.prazo_dias}</p>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Status *</Label>
              <Select value={newObraForm.status} onValueChange={(v) => setNewObraForm(p => ({ ...p, status: v as typeof p.status }))} disabled={editingObra && isEditorRestricted}>
                <SelectTrigger className={formErrors.status ? "border-destructive" : ""}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="paralisada">Paralisada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">% Físico (inserido pelo engenheiro)</Label>
              <div className="flex items-center gap-3 mt-2">
                <Slider
                  value={[newObraForm.percentual_fisico]}
                  onValueChange={([v]) => setNewObraForm(p => ({ ...p, percentual_fisico: v }))}
                  max={100} step={0.5} className="flex-1"
                  disabled={editingObra && isEditorRestricted}
                />
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} step={0.5} value={newObraForm.percentual_fisico}
                    onChange={(e) => { const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)); setNewObraForm(p => ({ ...p, percentual_fisico: v })); }}
                    className="w-20 text-sm text-right" disabled={editingObra && isEditorRestricted}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              {newObraForm.valor_contrato && Number(newObraForm.valor_contrato) > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Valor executado estimado: <span className="font-medium text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(newObraForm.valor_contrato) * newObraForm.percentual_fisico / 100)}</span>
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">% Financeiro (calculado automaticamente)</Label>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, editingObra?.percentual_financeiro || editingObra?.percentual_andamento || 0)}%` }} />
                </div>
                <span className="text-sm font-medium w-16 text-right">{(editingObra?.percentual_financeiro || editingObra?.percentual_andamento || 0).toFixed(1)}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Baseado nas medições aprovadas / valor do contrato</p>
            </div>
            {(newObraForm.status === "em_andamento" || (editingObra && editingObra.status === "em_andamento")) && (
              <div>
                <Label className="text-xs">Valor já faturado fora do sistema (R$)</Label>
                <CurrencyInput
                  value={newObraForm.valor_medido_inicial || 0}
                  onChange={(v) => setNewObraForm(p => ({ ...p, valor_medido_inicial: v }))}
                  disabled={!isCompanyAdmin}
                  placeholder="0,00"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Execução medida antes de entrar no ObraMap. Usado apenas para calcular o saldo a faturar e o % financeiro. Não entra nos relatórios de receitas.
                </p>
                {!isCompanyAdmin && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">🔒 Somente administradores podem editar este campo.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Período Medição *</Label>
                <Select
                  value={newObraForm.periodo_medicao}
                  onValueChange={(v) => setNewObraForm(p => ({ ...p, periodo_medicao: v }))}
                  disabled={!!(editingObra && isEditorRestricted)}
                >
                  <SelectTrigger className={formErrors.periodo_medicao ? "border-destructive" : ""}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Semanal">Semanal</SelectItem>
                    <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.periodo_medicao && <p className="text-[10px] text-destructive mt-0.5">{formErrors.periodo_medicao}</p>}
              </div>
              <div>
                <Label className="text-xs">Prazo Pagamento *</Label>
                <Input value={newObraForm.prazo_pagamento} onChange={(e) => setNewObraForm(p => ({ ...p, prazo_pagamento: e.target.value }))} disabled={editingObra && isEditorRestricted} className={formErrors.prazo_pagamento ? "border-destructive" : ""} />
                {formErrors.prazo_pagamento && <p className="text-[10px] text-destructive mt-0.5">{formErrors.prazo_pagamento}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Município *</Label>
                <Input value={newObraForm.municipio} onChange={(e) => setNewObraForm(p => ({ ...p, municipio: e.target.value }))} disabled={editingObra && isEditorRestricted} className={formErrors.municipio ? "border-destructive" : ""} />
                {formErrors.municipio && <p className="text-[10px] text-destructive mt-0.5">{formErrors.municipio}</p>}
              </div>
              <div>
                <Label className="text-xs">Estado *</Label>
                <Input value={newObraForm.estado} onChange={(e) => setNewObraForm(p => ({ ...p, estado: e.target.value }))} disabled={editingObra && isEditorRestricted} className={formErrors.estado ? "border-destructive" : ""} />
                {formErrors.estado && <p className="text-[10px] text-destructive mt-0.5">{formErrors.estado}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">UH (Unidades Hab.) *</Label>
                <Input type="number" value={newObraForm.uh} onChange={(e) => setNewObraForm(p => ({ ...p, uh: e.target.value }))} disabled={editingObra && isEditorRestricted} className={formErrors.uh ? "border-destructive" : ""} />
                {formErrors.uh && <p className="text-[10px] text-destructive mt-0.5">{formErrors.uh}</p>}
              </div>
              <div>
                <Label className="text-xs">Tipo de Contrato *</Label>
                <Select value={newObraForm.tipo_contrato} onValueChange={(v) => setNewObraForm(p => ({ ...p, tipo_contrato: v }))} disabled={!!(editingObra && isEditorRestricted)}>
                  <SelectTrigger className={formErrors.tipo_contrato ? "border-destructive" : ""}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ata Estado RS">Ata Estado RS</SelectItem>
                    <SelectItem value="Licitação">Licitação</SelectItem>
                    <SelectItem value="Adesão">Adesão</SelectItem>
                    <SelectItem value="Moradia Popular">Moradia Popular</SelectItem>
                    <SelectItem value="Moradia Faixa I">Moradia Faixa I</SelectItem>
                    <SelectItem value="Moradia Faixa II">Moradia Faixa II</SelectItem>
                    <SelectItem value="Alto Padrão">Alto Padrão</SelectItem>
                    <SelectItem value="Projeto de Obra">Projeto de Obra</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.tipo_contrato && <p className="text-[10px] text-destructive mt-0.5">{formErrors.tipo_contrato}</p>}
              </div>
            </div>
            <div className="border-t border-border/40 pt-3 mt-1">
              <p className="text-xs font-medium text-foreground mb-2">Responsáveis</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Eng. Residente *</Label>
                  <Input value={newObraForm.responsavel_nome} onChange={(e) => setNewObraForm(p => ({ ...p, responsavel_nome: e.target.value }))} className={formErrors.responsavel_nome ? "border-destructive" : ""} />
                  {formErrors.responsavel_nome && <p className="text-[10px] text-destructive mt-0.5">{formErrors.responsavel_nome}</p>}
                </div>
                <div><Label className="text-xs">Tel. Eng. Residente</Label><Input type="tel" value={newObraForm.responsavel_telefone} onChange={(e) => setNewObraForm(p => ({ ...p, responsavel_telefone: e.target.value }))} /></div>
                <div><Label className="text-xs">Coordenador</Label><Input value={newObraForm.coordenador_nome} onChange={(e) => setNewObraForm(p => ({ ...p, coordenador_nome: e.target.value }))} /></div>
                <div><Label className="text-xs">Tel. Coordenador</Label><Input type="tel" value={newObraForm.coordenador_telefone} onChange={(e) => setNewObraForm(p => ({ ...p, coordenador_telefone: e.target.value }))} /></div>
                <div><Label className="text-xs">Planejador</Label><Input value={newObraForm.planejador_nome} onChange={(e) => setNewObraForm(p => ({ ...p, planejador_nome: e.target.value }))} /></div>
                <div><Label className="text-xs">Tel. Planejador</Label><Input type="tel" value={newObraForm.planejador_telefone} onChange={(e) => setNewObraForm(p => ({ ...p, planejador_telefone: e.target.value }))} /></div>
              </div>
            </div>
            {editingObra && isEditorRestricted && (
              <Button variant="outline" className="w-full mt-2" onClick={() => setShowEditRequestDialog(true)}>
                <Lock className="h-4 w-4 mr-2" /> Solicitar permissão de edição
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewObraDialog(false); setEditingObra(null); resetNewObraForm(); setFormErrors({}); }}>Cancelar</Button>
            <Button onClick={handlePreSave} disabled={savingObra}>
              {savingObra ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingObra ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation AlertDialog */}
      <AlertDialog open={showConfirmSave} onOpenChange={setShowConfirmSave}>
        <AlertDialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirme os dados antes de salvar</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-1 text-xs bg-muted/50 rounded-lg p-3">
                  <span className="text-muted-foreground">Nome:</span><span className="font-medium">{newObraForm.nome}</span>
                  <span className="text-muted-foreground">Município:</span><span className="font-medium">{newObraForm.municipio}/{newObraForm.estado}</span>
                  <span className="text-muted-foreground">Nº Contrato:</span><span className="font-medium">{newObraForm.num_contrato}</span>
                  <span className="text-muted-foreground">UH:</span><span className="font-medium">{newObraForm.uh}</span>
                  <span className="text-muted-foreground">Valor:</span><span className="font-medium">{newObraForm.valor_contrato ? BRL.format(Number(newObraForm.valor_contrato)) : "—"}</span>
                  <span className="text-muted-foreground">Data Início:</span><span className="font-medium">{newObraForm.data_inicio || "—"}</span>
                  <span className="text-muted-foreground">Prazo:</span><span className="font-medium">{newObraForm.prazo_dias} dias</span>
                  <span className="text-muted-foreground">Status:</span><span className="font-medium">{STATUS_CONFIG[newObraForm.status]?.label}</span>
                  <span className="text-muted-foreground">Eng. Residente:</span><span className="font-medium">{newObraForm.responsavel_nome}</span>
                </div>
                {!editingObra && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                    ⚠️ Após salvar, somente o Administrador da empresa poderá editar esta obra. Editores precisarão solicitar autorização.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveObra}>Confirmar e Salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation — 3-step */}
      <Dialog open={!!deletingObraId} onOpenChange={(o) => { if (!o) { setDeletingObraId(null); setDeleteStep(1); setDeleteNameConfirm(""); setDeletePassword(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">⚠️ Excluir Obra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Step 1 — Warning */}
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
              ⚠️ <strong>ATENÇÃO: Esta ação é irreversível.</strong> Todos os dados da obra serão permanentemente excluídos, incluindo medições, documentos, despesas, restrições e histórico.
            </div>

            {/* Step 2 — Type name */}
            <div className="space-y-2">
              <Label className="text-xs">Digite o nome exato da obra para confirmar:</Label>
              <p className="text-xs font-medium text-muted-foreground">"{obras.find(o => o.id === deletingObraId)?.nome}"</p>
              <Input value={deleteNameConfirm} onChange={(e) => setDeleteNameConfirm(e.target.value)} placeholder="Digite o nome da obra..." />
            </div>

            {/* Step 3 — Password */}
            <div className="space-y-2">
              <Label className="text-xs">Confirme com sua senha de acesso:</Label>
              <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Sua senha..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletingObraId(null); setDeleteStep(1); setDeleteNameConfirm(""); setDeletePassword(""); }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={
                deleteVerifying ||
                deleteNameConfirm !== (obras.find(o => o.id === deletingObraId)?.nome || "") ||
                !deletePassword
              }
              onClick={async () => {
                if (!deletingObraId || !user?.email) return;
                setDeleteVerifying(true);
                try {
                  const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: deletePassword });
                  if (authErr) { toast.error("Senha incorreta. Exclusão bloqueada."); setDeleteVerifying(false); return; }
                  await handleDeleteObra();
                  toast.success("Obra excluída. Os logs de auditoria serão mantidos por 90 dias.");
                  setDeleteStep(1); setDeleteNameConfirm(""); setDeletePassword("");
                } catch { toast.error("Erro ao excluir obra."); }
                setDeleteVerifying(false);
              }}
            >
              {deleteVerifying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Importar Obras em Lote</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Uma obra por linha, separada por vírgulas:<br />
            <code className="text-[10px] bg-muted px-1 rounded">nome, empresa, num_contrato, parceria_scp, valor_contrato, data_inicio, prazo_dias, status, percentual_andamento, municipio, estado, uh, responsavel, tipo_contrato</code>
          </p>
          <Button variant="ghost" size="sm" className="h-7 text-xs mt-1 mb-2"
            onClick={() => setImportText("Nome da Obra,Empresa,Nº Contrato,SCP Parceria,Valor,Data Início (YYYY-MM-DD),Prazo dias,Status,% Andamento,Município,Estado,UH,Responsável,Tipo Contrato\n,PreviBras,,SCP Nome,0,,120,nao_iniciada,0,Cidade,RS,0,Nome - 51 99999-9999,Ata Estado RS")}>
            <FileText className="h-3.5 w-3.5 mr-1" /> Carregar modelo
          </Button>
          <textarea className="w-full h-64 text-xs font-mono border rounded-md p-2 bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring" value={importText} onChange={(e) => setImportText(e.target.value)} />
          {importText.trim() && (
            <p className="text-xs text-muted-foreground mt-1">
              {importText.trim().split("\n").filter(l => l.trim()).length} linhas detectadas
              {obras.length > 0 && ` · ${importText.trim().split("\n").filter(l => {
                const nome = l.split(",")[0]?.trim().toLowerCase();
                return nome && obras.some(o => o.nome.toLowerCase() === nome);
              }).length} já cadastradas (serão ignoradas)`}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowImportDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleImportObras} disabled={importing || !importText.trim()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Processar e Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════
   GANTT TIMELINE
   ══════════════════════════════════════════════ */

const GANTT_START = new Date(2025, 0, 1);
const GANTT_END = new Date(2026, 11, 31);
const TOTAL_MONTHS = differenceInMonths(GANTT_END, GANTT_START) + 1;

function dateToMonthIndex(date: Date): number {
  return Math.max(0, Math.min(TOTAL_MONTHS, differenceInMonths(date, GANTT_START)));
}

function GanttTimeline({ obras, onObraClick }: { obras: ObraEnriched[]; onObraClick: (id: string) => void }) {
  const obrasWithDates = obras.filter((o) => o.data_inicio);
  if (obrasWithDates.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma obra com data de início cadastrada.</p>
        </CardContent>
      </Card>
    );
  }
  const todayIndex = dateToMonthIndex(new Date());
  const chartData = obrasWithDates.map((obra) => {
    const start = parseLocalDate(obra.data_inicio!);
    const end = addDays(start, obra.prazo_dias + obra.aditivo_prazo_dias);
    const startIdx = dateToMonthIndex(start);
    const endIdx = dateToMonthIndex(end);
    const duration = Math.max(endIdx - startIdx, 0.5);
    return {
      nome: obra.nome.length > 25 ? obra.nome.slice(0, 23) + "…" : obra.nome,
      fullNome: obra.nome, obraId: obra.id, start: startIdx, duration,
      status: obra.status, andamento: obra.percentual_andamento,
      inicio: format(start, "dd/MM/yyyy"), fim: format(end, "dd/MM/yyyy"),
    };
  });

  const monthLabels = Array.from({ length: TOTAL_MONTHS }, (_, i) => format(new Date(2025, i, 1), "MMM/yy"));
  const ticks = Array.from({ length: TOTAL_MONTHS }, (_, i) => i);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1">
        <p className="font-semibold">{d.fullNome}</p>
        <p>Início: {d.inicio}</p><p>Fim previsto: {d.fim}</p><p>Andamento: {d.andamento}%</p>
      </div>
    );
  };

  const barHeight = Math.max(32 * chartData.length + 60, 200);

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 800 }}>
            <ResponsiveContainer width="100%" height={barHeight}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
                onClick={(e: any) => { if (e?.activePayload?.[0]?.payload?.obraId) onObraClick(e.activePayload[0].payload.obraId); }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/40" />
                <XAxis type="number" domain={[0, TOTAL_MONTHS]} ticks={ticks} tickFormatter={(v) => monthLabels[v] || ""} tick={{ fontSize: 9 }} interval={1} />
                <YAxis type="category" dataKey="nome" width={160} tick={{ fontSize: 11 }} />
                <ReTooltip content={<CustomTooltip />} />
                <ReferenceLine x={todayIndex} stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="4 4" label={{ value: "Hoje", position: "top", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                <Bar dataKey="start" stackId="gantt" fill="transparent" radius={0} />
                <Bar dataKey="duration" stackId="gantt" radius={[4, 4, 4, 4]} cursor="pointer">
                  {chartData.map((entry, idx) => (<Cell key={idx} fill={STATUS_BAR_COLORS[entry.status] || STATUS_BAR_COLORS.nao_iniciada} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.em_andamento }} /> Em Andamento</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.concluida }} /> Concluída</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.nao_iniciada }} /> Não Iniciada</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.paralisada }} /> Paralisada</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   KPI Card (compact with bottom border)
   ══════════════════════════════════════════════ */

function KpiCard({ icon: Icon, label, value, sub, borderColor, valueColor }: {
  icon: any; label: string; value: string; sub?: string;
  borderColor: string; valueColor: string
}) {
  return (
    <div className={`bg-card rounded-xl border border-border/60 border-b-4 ${borderColor} p-4 space-y-1`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════
   Obra Card (redesigned, denser)
   ══════════════════════════════════════════════ */

const ObraCard = memo(function ObraCard({ obra, onClick, onEdit, onDelete }: { obra: ObraEnriched; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const { isCompanyAdmin, canEdit } = useAuth();
  const [healthOpen, setHealthOpen] = useState(false);
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null);
  const statusCfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.nao_iniciada;
  const previsaoFim = obra.data_inicio ? format(addDays(parseLocalDate(obra.data_inicio!), obra.prazo_dias + obra.aditivo_prazo_dias), "dd/MM/yyyy") : "—";
  // Faturado real = medições aprovadas (incl. Saldo Inicial) com valor_acatado
  // Se não há medições aprovadas mas há valor_medido_inicial, usa ele (faturamento pré-sistema)
  // Nunca usa % × contrato como fallback — isso não é dinheiro faturado
  const receitasAprovadas = obra.allMedicoes.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
  const valorContrato = (obra.valor_contrato || 0) + (obra.aditivo_valor_total || 0);
  // Receita total = acatado em medições + valor faturado antes do sistema (ambos somados sempre)
  // Bug anterior: usava OR exclusivo — ignorava valor_medido_inicial após a 1ª aprovação
  const receitas = receitasAprovadas + (obra.valor_medido_inicial || 0);
  const percentualFinanceiro = valorContrato > 0 && receitas > 0 ? Math.min(100, (receitas / valorContrato) * 100) : 0;
  const saldoContrato = valorContrato - receitas;

  const healthIndicators = useMemo(() => calcHealthDetails(obra, obra.allMedicoes), [obra]);

  const INDICATOR_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    green: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700" },
    yellow: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-300 dark:border-amber-700" },
    red: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
    gray: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
    na: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
  };

  return (
    <Card className={`border-border/60 border-l-4 ${HEALTH_BORDER[obra.health]} hover:border-primary/40 hover:shadow-md transition-all cursor-pointer`} onClick={onClick}>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${HEALTH_COLORS[obra.health]}`} />
              <h3 className="font-semibold text-sm text-foreground truncate">{obra.nome}</h3>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {obra.empresa && <p className="text-xs text-muted-foreground truncate">{obra.empresa}</p>}
              {obra.tipo_contrato && <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">{obra.tipo_contrato}</Badge>}
            </div>
            {obra.municipio && <p className="text-[10px] text-muted-foreground truncate">📍 {obra.municipio} / {obra.estado || "RS"}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(obra.pendingNotifCount || 0) > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center" title="Pendências de despesas">
                {(obra.pendingNotifCount || 0) > 9 ? "9+" : obra.pendingNotifCount}
              </span>
            )}
            <Badge className={`text-[10px] ${statusCfg.className}`} variant="secondary">{statusCfg.label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-md hover:bg-muted" onClick={(e) => e.stopPropagation()}><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Editar</DropdownMenuItem>
                )}
                {isCompanyAdmin && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir</DropdownMenuItem>
                )}
                {!canEdit && (
                  <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                    Somente visualização
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Evolução Financeira</span>
            <span className="font-medium text-foreground">{percentualFinanceiro.toFixed(1)}%</span>
          </div>
          <Progress value={percentualFinanceiro} className="h-1.5" />
        </div>

        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
          <div className="col-span-2"><span className="text-muted-foreground">Valor Contrato</span><p className="font-semibold text-foreground break-words">{BRL.format(obra.valor_contrato)}</p></div>
          <div><span className="text-muted-foreground">UH</span><p className="font-medium text-foreground truncate">{obra.uh || "—"}</p></div>
          <div><span className="text-muted-foreground">Contrato</span><p className="font-medium text-foreground truncate">{obra.num_contrato || "—"}</p></div>
          <div><span className="text-muted-foreground">Início</span><p className="font-medium text-foreground">{obra.data_inicio ? format(parseLocalDate(obra.data_inicio!), "dd/MM/yy") : "—"}</p></div>
          <div><span className="text-muted-foreground">Prev. Fim</span><p className="font-medium text-foreground">{previsaoFim}</p></div>
        </div>

        {(() => {
          const contacts = [
            { label: "🏗️", nome: obra.responsavel_nome || obra.responsavel?.split(" - ")[0] || "", tel: obra.responsavel_telefone || obra.responsavel?.split(" - ")[1] || "" },
            { label: "📋", nome: obra.coordenador_nome || "", tel: obra.coordenador_telefone || "" },
            { label: "📐", nome: obra.planejador_nome || "", tel: obra.planejador_telefone || "" },
          ].filter(c => c.nome);
          if (contacts.length === 0) return null;
          return (
            <div className="space-y-0.5">
              {contacts.map((c, i) => {
                const telLimpo = c.tel.replace(/\D/g, "");
                const waNumber = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{c.label} {c.nome}</span>
                    {telLimpo && (
                      <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Olá ${c.nome}, tudo bem? Preciso falar sobre a obra ${obra.nome}.`)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-0.5 text-emerald-600 hover:text-emerald-500 font-medium transition-colors">
                        📱 {c.tel}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {valorContrato > 0 && (
          <div className="space-y-1.5 border-t border-border/40 pt-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Físico: {obra.percentual_andamento}%</span>
              {percentualFinanceiro > 0 && (
                <span className="text-muted-foreground">Financeiro: {percentualFinanceiro.toFixed(1)}%</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-muted-foreground">Medido/Faturado</span>
                <p className="font-medium text-emerald-600 dark:text-emerald-400">{receitas > 0 ? BRL_SHORT(receitas) : "R$ 0,00"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Saldo a Faturar</span>
                <p className={`font-medium ${saldoContrato > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>{BRL_SHORT(Math.max(0, saldoContrato))}</p>
              </div>
            </div>
          </div>
        )}

        {valorContrato === 0 && receitas > 0 && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ {BRL_SHORT(receitas)} recebido</p>
        )}

        {/* ── Resultado Projetado ── */}
        {(() => {
          const despesas = obra.despesasDaObra || [];
          if (despesas.length === 0 || valorContrato <= 0) return null;
          const receitaProjetada = valorContrato;
          const custoProjetado = despesas.reduce((s, d) => s + (d.valor || 0), 0);
          const resultadoProjetado = receitaProjetada - custoProjetado;
          const margemPct = receitaProjetada > 0 ? (resultadoProjetado / receitaProjetada) * 100 : 0;
          const margemColor = margemPct < 0 ? "text-destructive" : margemPct < 5 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
          return (
            <div className="space-y-1.5 border-t border-border/40 pt-2">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Resultado Projetado</span>
                  <p className={`font-medium ${margemColor}`}>{BRL_SHORT(resultadoProjetado)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Margem</span>
                  <p className={`font-medium ${margemColor}`}>{margemPct.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Health Indicators Expandable Section ── */}
        <div className="border-t border-border/40 pt-1.5">
          <button
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
            onClick={(e) => { e.stopPropagation(); setHealthOpen(!healthOpen); }}
          >
            <span className={`h-2 w-2 rounded-full ${HEALTH_COLORS[obra.health]}`} />
            <span className="font-medium">Saúde da Obra</span>
            <span className="ml-auto text-[10px]">{healthOpen ? "▲" : "▼"}</span>
          </button>
          {healthOpen && (
            <div className="mt-2 space-y-2" onClick={e => e.stopPropagation()}>
              {healthIndicators.map(ind => {
                const colors = INDICATOR_STATUS_COLORS[ind.status];
                // Bar visualization: compute position of value relative to thresholds
                const barMax = ind.higherIsBetter
                  ? Math.max(1.2, (ind.value || 0) * 1.3)
                  : Math.max(ind.threshold_red * 2, (ind.value || 0) * 1.3);
                const barPct = ind.value !== null ? Math.min(100, (ind.value / barMax) * 100) : 0;
                const yellowPct = (ind.threshold_yellow / barMax) * 100;
                const redPct = (ind.threshold_red / barMax) * 100;

                const isExpanded = expandedIndicator === ind.id;
                const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
                const rv = ind.rawValues || {};

                const renderDetails = () => {
                  if (ind.id === "idc") {
                    return (
                      <>
                        <div><span className="text-muted-foreground">Valor Medido Aprovado:</span> <span className="font-medium text-foreground">{BRL.format(Number(rv.medidoAprovado) || 0)}</span></div>
                        <div><span className="text-muted-foreground">Valor Planejado (% físico × contrato):</span> <span className="font-medium text-foreground">{BRL.format(Number(rv.planejado) || 0)}</span></div>
                        <div><span className="text-muted-foreground">IDC = medido / planejado =</span> <span className="font-medium text-foreground">{ind.value !== null ? ind.value.toFixed(2) : "—"}</span></div>
                        <div className="flex gap-2 flex-wrap"><span className="text-emerald-600 dark:text-emerald-400">Verde ≥ 85%</span><span className="text-amber-600 dark:text-amber-400">Amarelo ≥ 70%</span><span className="text-red-600 dark:text-red-400">Vermelho &lt; 70%</span></div>
                      </>
                    );
                  }
                  if (ind.id === "idp") {
                    return (
                      <>
                        <div><span className="text-muted-foreground">Execução Física:</span> <span className="font-medium text-foreground">{Number(rv.pctFisico || 0).toFixed(1)}%</span></div>
                        <div><span className="text-muted-foreground">Prazo Consumido:</span> <span className="font-medium text-foreground">{Number(rv.pctTempo || 0).toFixed(1)}% ({rv.diasDecorridos} dias de {rv.prazoTotal} dias)</span></div>
                        <div><span className="text-muted-foreground">IDP = físico / prazo =</span> <span className="font-medium text-foreground">{ind.value !== null ? ind.value.toFixed(2) : "—"}</span></div>
                        <div className="flex gap-2 flex-wrap"><span className="text-emerald-600 dark:text-emerald-400">Verde ≥ 90%</span><span className="text-amber-600 dark:text-amber-400">Amarelo ≥ 70%</span><span className="text-red-600 dark:text-red-400">Vermelho &lt; 70%</span></div>
                      </>
                    );
                  }
                  if (ind.id === "dias_medicao") {
                    const dtStr = rv.ultimaAprovadaDate ? format(new Date(String(rv.ultimaAprovadaDate) + "T12:00:00"), "dd/MM/yyyy") : "Nenhuma";
                    return (
                      <>
                        <div><span className="text-muted-foreground">Última medição aprovada:</span> <span className="font-medium text-foreground">{dtStr}</span></div>
                        <div><span className="text-muted-foreground">Dias sem medição:</span> <span className="font-medium text-foreground">{ind.value !== null ? `${ind.value} dias` : "—"}</span></div>
                        <div className="flex gap-2 flex-wrap"><span className="text-emerald-600 dark:text-emerald-400">Verde &lt; 30 dias</span><span className="text-amber-600 dark:text-amber-400">Amarelo &lt; 60 dias</span><span className="text-red-600 dark:text-red-400">Vermelho ≥ 60 dias</span></div>
                      </>
                    );
                  }
                  if (ind.id === "glosa") {
                    return (
                      <>
                        <div><span className="text-muted-foreground">Total Medido Aprovado:</span> <span className="font-medium text-foreground">{BRL.format(Number(rv.totalMedidoAprovado) || 0)}</span></div>
                        <div><span className="text-muted-foreground">Total Glosado:</span> <span className="font-medium text-foreground">{BRL.format(Number(rv.totalGlosa) || 0)}</span></div>
                        <div><span className="text-muted-foreground">Glosa = glosado / medido =</span> <span className="font-medium text-foreground">{ind.value !== null ? `${(ind.value * 100).toFixed(1)}%` : "—"}</span></div>
                        <div className="flex gap-2 flex-wrap"><span className="text-emerald-600 dark:text-emerald-400">Verde &lt; 5%</span><span className="text-amber-600 dark:text-amber-400">Amarelo &lt; 15%</span><span className="text-red-600 dark:text-red-400">Vermelho ≥ 15%</span></div>
                      </>
                    );
                  }
                  return null;
                };

                return (
                  <div key={ind.id} className={`rounded-md border p-2 ${colors.border} ${colors.bg} cursor-pointer`} onClick={() => setExpandedIndicator(isExpanded ? null : ind.id)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-foreground">{ind.label}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className={`text-[9px] h-4 px-1.5 ${colors.bg} ${colors.text} border ${colors.border}`}>
                          {ind.displayValue}
                        </Badge>
                        {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </div>
                    {/* Threshold bar */}
                    {ind.value !== null && (
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-1">
                        {ind.higherIsBetter ? (
                          <>
                            <div className="absolute top-0 h-full bg-red-300/40 dark:bg-red-800/40" style={{ left: 0, width: `${redPct}%` }} />
                            <div className="absolute top-0 h-full bg-amber-300/40 dark:bg-amber-800/40" style={{ left: `${redPct}%`, width: `${yellowPct - redPct}%` }} />
                            <div className="absolute top-0 h-full bg-emerald-300/40 dark:bg-emerald-800/40" style={{ left: `${yellowPct}%`, width: `${100 - yellowPct}%` }} />
                          </>
                        ) : (
                          <>
                            <div className="absolute top-0 h-full bg-emerald-300/40 dark:bg-emerald-800/40" style={{ left: 0, width: `${yellowPct}%` }} />
                            <div className="absolute top-0 h-full bg-amber-300/40 dark:bg-amber-800/40" style={{ left: `${yellowPct}%`, width: `${redPct - yellowPct}%` }} />
                            <div className="absolute top-0 h-full bg-red-300/40 dark:bg-red-800/40" style={{ left: `${redPct}%`, width: `${100 - redPct}%` }} />
                          </>
                        )}
                        <div
                          className={`absolute top-0 h-full rounded-full ${ind.status === "green" ? "bg-emerald-500" : ind.status === "yellow" ? "bg-amber-500" : ind.status === "red" ? "bg-red-500" : "bg-muted-foreground"}`}
                          style={{ width: `${barPct}%`, maxWidth: "100%" }}
                        />
                      </div>
                    )}
                    <p className="text-[9px] text-muted-foreground leading-tight">{ind.description}</p>
                    {isExpanded && (
                      <div className="bg-background/60 rounded p-2 mt-1 text-[9px] space-y-0.5">
                        {renderDetails()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}); // memo(ObraCard)

/* ══════════════════════════════════════════════
   Obra Table (full data table view)
   ══════════════════════════════════════════════ */

function ObraTable({ obras, onObraClick }: { obras: ObraEnriched[]; onObraClick: (id: string) => void }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-[10px] font-semibold w-8 sticky top-0 bg-muted/90 z-10">#</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 min-w-[160px]">Obra</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Empresa</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Contrato</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">UH</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Tipo</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Responsável</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">WhatsApp</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">SCP</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-right">Valor Contrato</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-right">Receitas</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-right">Saldo</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">% Financ.</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Data Início</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">Prazo</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Prev. Fim</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Status</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">% And.</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">Docs</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">Saúde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {obras.map((obra, idx) => {
                const statusCfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.nao_iniciada;
                const previsaoFim = obra.data_inicio ? format(addDays(parseLocalDate(obra.data_inicio!), obra.prazo_dias + obra.aditivo_prazo_dias), "dd/MM/yy") : "—";
                const recAprov = obra.allMedicoes.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                const vc = (obra.valor_contrato || 0) + (obra.aditivo_valor_total || 0);
                const receitas = recAprov + (Number(obra.valor_medido_inicial) || 0);
                return (
                  <TableRow
                    key={obra.id}
                    className={`cursor-pointer hover:bg-muted/40 ${idx % 2 === 0 ? "bg-muted/10" : ""}`}
                    onClick={() => onObraClick(obra.id)}
                  >
                    <TableCell className="text-[10px] text-muted-foreground py-2">{idx + 1}</TableCell>
                    <TableCell className="text-xs font-medium py-2 text-primary hover:underline">{obra.nome}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.empresa || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.num_contrato || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2 text-center">{obra.uh || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.tipo_contrato || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.responsavel_nome || obra.responsavel?.split(" - ")[0] || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">
                      {(() => {
                        const tel = obra.responsavel_telefone || obra.responsavel?.split(" - ")[1] || "";
                        const telLimpo = tel.replace(/\D/g, "");
                        if (!telLimpo) return "—";
                        const waNumber = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
                        return <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-emerald-600 hover:underline">{tel}</a>;
                      })()}
                    </TableCell>
                    <TableCell className="text-[10px] py-2">{obra.parceria_scp || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2 text-right font-mono">{BRL.format(obra.valor_contrato)}</TableCell>
                    <TableCell className="text-[10px] py-2 text-right font-mono">{receitas > 0 ? BRL.format(receitas) : "—"}</TableCell>
                    <TableCell className="text-[10px] py-2 text-right font-mono">{(() => { const s = obra.valor_contrato - receitas; return s > 0 ? BRL.format(s) : "—"; })()}</TableCell>
                    <TableCell className="text-[10px] py-2 text-center">{(() => { const p = obra.valor_contrato > 0 && receitas > 0 ? (receitas / obra.valor_contrato * 100).toFixed(1) : null; return p ? <span className="font-medium">{p}%</span> : "—"; })()}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.data_inicio ? format(parseLocalDate(obra.data_inicio!), "dd/MM/yy") : "—"}</TableCell>
                    <TableCell className="text-[10px] py-2 text-center">{obra.prazo_dias ? `${obra.prazo_dias}d` : "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{previsaoFim}</TableCell>
                    <TableCell className="py-2"><Badge className={`text-[9px] ${statusCfg.className}`} variant="secondary">{statusCfg.label}</Badge></TableCell>
                    <TableCell className="text-[10px] py-2 text-center font-medium">{obra.percentual_andamento}%</TableCell>
                    <TableCell className="text-[10px] py-2 text-center">{obra.docsCount}/{obra.docsTotal}</TableCell>
                    <TableCell className="py-2 text-center"><span className={`inline-block h-3 w-3 rounded-full ${HEALTH_COLORS[obra.health]}`} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
