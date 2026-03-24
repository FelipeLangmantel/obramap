import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import ObraDetailDrawer from "./ObraDetailDrawer";

import {
  Crown,
  DollarSign,
  ClipboardCheck,
  Building2,
  AlertTriangle,
  
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  
} from "lucide-react";
import { addDays, format, differenceInDays } from "date-fns";


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
  periodo_medicao: string | null;
  prazo_pagamento: string | null;
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
  status_medicao: "aprovada" | "enviada" | "pendente" | "nao_iniciada";
  valor_medicao: number;
  num_nf: string | null;
  data_pagamento: string | null;
  status_nf: "recebido" | "aguardando_aprovacao" | "pendente";
}

interface ObraEnriched extends ObraPortfolio {
  docs: DocumentosObra | null;
  latestMedicao: MedicaoPle | null;
  allMedicoes: MedicaoPle[];
  docsCount: number;
  docsTotal: number;
  health: "green" | "yellow" | "red";
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
};

function countDocs(docs: DocumentosObra | null): { count: number; total: number } {
  if (!docs) return { count: 0, total: 11 };
  const fields: (keyof DocumentosObra)[] = [
    "ata", "ois", "art", "cno", "impl", "scp",
    "sondagem_spt", "planta_localizacao", "plano_altimetrico",
    "painel_bordo", "checklist_seguranca",
  ];
  const total = fields.length;
  const count = fields.filter((f) => docs[f] === true).length;
  return { count, total };
}

function calcHealth(
  docsCount: number,
  docsTotal: number,
  latestMedicao: MedicaoPle | null
): "green" | "yellow" | "red" {
  const docsRatio = docsCount / docsTotal;
  const medicaoStatus = latestMedicao?.status_medicao;

  // Red conditions
  if (docsRatio < 3 / 11) return "red";
  if (medicaoStatus === "pendente") {
    if (latestMedicao?.data_envio) {
      const days = differenceInDays(new Date(), new Date(latestMedicao.data_envio));
      if (days > 30) return "red";
    }
    return "red";
  }

  // Yellow conditions
  if (docsRatio < 5 / 11) return "yellow";
  if (medicaoStatus === "enviada") return "yellow";

  // Green
  if (docsRatio >= 5 / 11 && (!medicaoStatus || medicaoStatus === "aprovada")) return "green";

  return "yellow";
}

export default function HoldingDashboardView() {
  const { company } = useAuth();
  const [selectedObra, setSelectedObra] = useState<ObraEnriched | null>(null);

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ["holding-portfolio", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];

      const [obrasRes, docsRes, medicoesRes] = await Promise.all([
        supabase.from("obras_portfolio").select("*").eq("company_id", company.id).order("nome"),
        supabase.from("documentos_obra").select("*"),
        supabase.from("medicoes_ple").select("*").order("ano_referencia", { ascending: false }),
      ]);

      const obrasData = (obrasRes.data || []) as ObraPortfolio[];
      const docsData = (docsRes.data || []) as DocumentosObra[];
      const medicoesData = (medicoesRes.data || []) as MedicaoPle[];

      const docsMap = new Map<string, DocumentosObra>();
      docsData.forEach((d) => docsMap.set(d.obra_id, d));

      const medicoesMap = new Map<string, MedicaoPle[]>();
      medicoesData.forEach((m) => {
        const arr = medicoesMap.get(m.obra_id) || [];
        arr.push(m);
        medicoesMap.set(m.obra_id, arr);
      });

      return obrasData.map((obra): ObraEnriched => {
        const docs = docsMap.get(obra.id) || null;
        const allMedicoes = medicoesMap.get(obra.id) || [];
        const latestMedicao = allMedicoes[0] || null;
        const { count: docsCount, total: docsTotal } = countDocs(docs);
        const health = calcHealth(docsCount, docsTotal, latestMedicao);

        return { ...obra, docs, latestMedicao, allMedicoes, docsCount, docsTotal, health };
      });
    },
    enabled: !!company?.id,
  });

  const kpis = useMemo(() => {
    const totalContratos = obras.reduce((s, o) => s + (o.valor_contrato || 0), 0);
    const totalMedicoesAprovadas = obras.reduce(
      (s, o) => s + o.allMedicoes.filter((m) => m.status_medicao === "aprovada").reduce((ss, m) => ss + m.valor_medicao, 0),
      0
    );
    const obrasAtivas = obras.filter((o) => o.status === "em_andamento").length;
    const alertasCriticos = obras.filter((o) => o.health === "red").length;

    return { totalContratos, totalMedicoesAprovadas, obrasAtivas, alertasCriticos };
  }, [obras]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Total em Contratos"
          value={BRL.format(kpis.totalContratos)}
          color="text-emerald-600 dark:text-emerald-400"
          bgColor="bg-emerald-100 dark:bg-emerald-900/30"
        />
        <KpiCard
          icon={ClipboardCheck}
          label="Medições Aprovadas"
          value={BRL.format(kpis.totalMedicoesAprovadas)}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-100 dark:bg-blue-900/30"
        />
        <KpiCard
          icon={Building2}
          label="Obras Ativas"
          value={String(kpis.obrasAtivas)}
          color="text-primary"
          bgColor="bg-primary/10"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Alertas Críticos"
          value={String(kpis.alertasCriticos)}
          color={kpis.alertasCriticos > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}
          bgColor={kpis.alertasCriticos > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-muted/50"}
        />
      </div>

      {/* Obras Grid */}
      {obras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Crown className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhuma obra cadastrada no portfólio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {obras.map((obra) => (
            <ObraCard key={obra.id} obra={obra} onClick={() => setSelectedObra(obra)} />
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      <ObraDetailDrawer
        obraId={selectedObra?.id || null}
        obraNome={selectedObra?.nome || ""}
        onClose={() => setSelectedObra(null)}
      />
    </div>
  );
}

/* ────────── KPI Card ────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bgColor}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-lg font-bold ${color} truncate`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────── Obra Card ────────── */

function ObraCard({ obra, onClick }: { obra: ObraEnriched; onClick: () => void }) {
  const statusCfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.nao_iniciada;
  const previsaoFim =
    obra.data_inicio
      ? format(addDays(new Date(obra.data_inicio), obra.prazo_dias + obra.aditivo_prazo_dias), "dd/MM/yyyy")
      : "—";

  return (
    <Card
      className="border-border/60 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${HEALTH_COLORS[obra.health]}`} />
              <h3 className="font-semibold text-sm text-foreground truncate">{obra.nome}</h3>
            </div>
            {obra.empresa && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{obra.empresa}</p>
            )}
          </div>
          <Badge className={`text-[10px] shrink-0 ${statusCfg.className}`} variant="secondary">
            {statusCfg.label}
          </Badge>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Andamento</span>
            <span className="font-medium text-foreground">{obra.percentual_andamento}%</span>
          </div>
          <Progress value={obra.percentual_andamento} className="h-2" />
        </div>

        {/* Info row */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <span className="text-muted-foreground">Contrato</span>
            <p className="font-medium text-foreground truncate">{obra.num_contrato || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Valor</span>
            <p className="font-medium text-foreground truncate">{BRL.format(obra.valor_contrato)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Previsão Fim</span>
            <p className="font-medium text-foreground">{previsaoFim}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Docs</span>
            <p className="font-medium text-foreground">{obra.docsCount}/{obra.docsTotal}</p>
          </div>
        </div>

        {/* Bottom badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {obra.parceria_scp && (
            <Badge variant="outline" className="text-[10px]">SCP: {obra.parceria_scp}</Badge>
          )}
          {obra.latestMedicao && (
            <Badge variant="outline" className="text-[10px]">
              Última: {obra.latestMedicao.mes_referencia}/{obra.latestMedicao.ano_referencia}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
