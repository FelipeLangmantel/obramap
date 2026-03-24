import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  ComposedChart, BarChart, Bar, Line, AreaChart, Area, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, DollarSign, TrendingUp, TrendingDown, Wallet } from "lucide-react";

/* ═══════════════════════════════════════
   Types (mirrors HoldingDashboardView)
   ═══════════════════════════════════════ */

interface ObraPortfolio {
  id: string;
  nome: string;
  empresa: string | null;
  valor_contrato: number;
  data_inicio: string | null;
  prazo_dias: number;
  aditivo_prazo_dias: number;
  status: "em_andamento" | "nao_iniciada" | "concluida" | "paralisada";
  percentual_andamento: number;
  municipio: string | null;
  estado: string | null;
}

interface ObraEnriched extends ObraPortfolio {
  docs: any;
  latestMedicao: any;
  allMedicoes: any[];
  docsCount: number;
  docsTotal: number;
  health: "green" | "yellow" | "red";
}

interface HoldingAlert {
  id: string;
  obraId: string;
  obraNome: string;
  severity: "critical" | "warning" | "info";
  icon: any;
  message: string;
}

interface Props {
  obras: ObraEnriched[];
  alerts: HoldingAlert[];
  onObraClick: (obraId: string) => void;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return BRL.format(v);
};

/* ═══════════════════════════════════════
   RS State SVG Path (approximate)
   ═══════════════════════════════════════ */

const RS_PATH = "M208.9,4.1 L253.3,2.4 L297.8,3.7 L342.2,8.1 L355.6,17.9 L355.6,48.7 L354.7,81.2 L337.8,109.6 L337.8,125.8 L333.3,142.0 L315.6,162.3 L297.8,182.6 L275.6,202.9 L253.3,223.2 L231.1,243.5 L208.9,263.8 L191.1,273.9 L177.8,273.5 L173.3,267.8 L142.2,263.8 L120.0,251.6 L75.6,235.4 L31.1,215.1 L4.4,186.7 L4.4,154.2 L22.2,129.9 L53.3,105.5 L84.4,73.0 L106.7,40.6 L137.8,16.2 L164.4,8.1 L186.7,4.1 L208.9,4.1 Z";

const MUNICIPIO_COORDS: Record<string, { x: number; y: number }> = {
  "Eldorado do Sul":         { x: 272.3, y: 125.2 },
  "Taquara":                 { x: 307.6, y: 107.6 },
  "Estrela":                 { x: 255.1, y: 101.6 },
  "Lajeado":                 { x: 255.1, y: 100.1 },
  "Encruzilhada do Sul":     { x: 230.1, y: 143.8 },
  "São João do Polêsine":    { x: 191.2, y: 106.2 },
  "São Sebastião do Caí":    { x: 281.5, y: 105.1 },
  "São Francisco de Paula":  { x: 316.4, y:  99.1 },
  "Arroio do Meio":          { x: 255.6, y:  97.4 },
  "Esteio":                  { x: 289.8, y: 115.9 },
  "Tapejara":                { x: 252.9, y:  43.1 },
  "Santa Rosa":              { x: 143.1, y:  35.3 },
  "Tupanciretã":             { x: 171.7, y:  84.4 },
  "Viamão":                  { x: 296.8, y: 125.0 },
  "Porto Alegre":            { x: 287.6, y: 123.1 },
  "Muçum":                   { x: 259.0, y:  87.9 },
};

const HEALTH_PIN: Record<string, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
};

/* ═══════════════════════════════════════
   Month helpers
   ═══════════════════════════════════════ */

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthKey = (mes: string | null, ano: number | null) => {
  if (!mes || !ano) return null;
  const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === mes.substring(0, 3).toLowerCase());
  return idx >= 0 ? `${MONTH_NAMES[idx]}/${String(ano).slice(2)}` : null;
};

/* ═══════════════════════════════════════
   Component
   ═══════════════════════════════════════ */

export default function HoldingAnalyticsView({ obras, alerts, onObraClick }: Props) {
  const [hoveredObra, setHoveredObra] = useState<string | null>(null);
  const [medicoesData, setMedicoesData] = useState<any[]>([]);
  const [despesasData, setDespesasData] = useState<any[]>([]);

  // Load financial data
  const obraIds = obras.map(o => o.id).join(",");
  useEffect(() => {
    if (obras.length === 0) return;
    const ids = obras.map(o => o.id);
    Promise.all([
      supabase.from("medicoes_ple").select("*").in("obra_id", ids),
      supabase.from("despesas_mensais").select("*").in("obra_id", ids),
    ]).then(([medRes, despRes]) => {
      setMedicoesData(medRes.data || []);
      setDespesasData(despRes.data || []);
    });
  }, [obraIds]);

  // PRD chart data
  const prdData = useMemo(() => {
    return obras.map(o => {
      const medAprovadas = medicoesData
        .filter(m => m.obra_id === o.id && m.status_medicao === "aprovada")
        .reduce((s: number, m: any) => s + (m.valor_medicao || 0), 0);
      const despesas = despesasData
        .filter(d => d.obra_id === o.id)
        .reduce((s: number, d: any) => s + (d.valor || 0), 0);
      const roi = medAprovadas > 0 && despesas > 0 ? ((medAprovadas - despesas) / despesas) * 100 : 0;
      return {
        nome: o.nome.length > 14 ? o.nome.slice(0, 12) + "…" : o.nome,
        fullNome: o.nome,
        previsto: o.valor_contrato || 0,
        realizado: medAprovadas,
        despesas,
        roi: Math.round(roi * 10) / 10,
      };
    });
  }, [obras, medicoesData, despesasData]);

  // Monthly evolution data
  const evolutionData = useMemo(() => {
    const monthMap: Record<string, { receita: number; despesa: number; sortKey: number }> = {};

    medicoesData.forEach((m: any) => {
      if (m.status_medicao !== "aprovada") return;
      const key = monthKey(m.mes_referencia, m.ano_referencia);
      if (!key) return;
      if (!monthMap[key]) monthMap[key] = { receita: 0, despesa: 0, sortKey: (m.ano_referencia || 0) * 100 + MONTH_NAMES.indexOf(key.split("/")[0]) };
      monthMap[key].receita += m.valor_medicao || 0;
    });

    despesasData.forEach((d: any) => {
      const key = monthKey(d.mes_referencia, d.ano_referencia);
      if (!key) return;
      if (!monthMap[key]) monthMap[key] = { receita: 0, despesa: 0, sortKey: (d.ano_referencia || 0) * 100 + MONTH_NAMES.indexOf(key.split("/")[0]) };
      monthMap[key].despesa += d.valor || 0;
    });

    return Object.entries(monthMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [medicoesData, despesasData]);

  // Donut data
  const donutData = useMemo(() => {
    const total = obras.length || 1;
    const docsComplete = obras.filter(o => o.docsCount >= 9).length;
    const medicoesOk = obras.filter(o => o.latestMedicao?.status_medicao === "aprovada").length;
    const noPrazo = obras.filter(o => {
      if (o.status !== "em_andamento" || !o.data_inicio) return false;
      const fim = new Date(o.data_inicio);
      fim.setDate(fim.getDate() + o.prazo_dias + o.aditivo_prazo_dias);
      return fim >= new Date();
    }).length;
    const emAndamento = obras.filter(o => o.status === "em_andamento").length || 1;

    return {
      docs: Math.round((docsComplete / total) * 100),
      medicoes: Math.round((medicoesOk / total) * 100),
      prazo: Math.round((noPrazo / emAndamento) * 100),
    };
  }, [obras]);

  // Obras with map pins
  const obrasOnMap = useMemo(() => {
    return obras
      .filter(o => o.municipio && MUNICIPIO_COORDS[o.municipio])
      .map(o => ({
        ...o,
        coords: MUNICIPIO_COORDS[o.municipio!],
      }));
  }, [obras]);

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1">
        <p className="font-semibold text-foreground">{payload[0]?.payload?.fullNome || label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {BRL.format(p.value)}</p>
        ))}
      </div>
    );
  };

  const CustomAreaTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1">
        <p className="font-semibold text-foreground">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {BRL.format(p.value)}</p>
        ))}
      </div>
    );
  };

  const summaryStats = useMemo(() => {
    const totalPortfolio = obras.reduce((s, o) => s + (o.valor_contrato || 0), 0);
    const totalRecebido = prdData.reduce((s, d) => s + d.realizado, 0);
    const totalDespesas = prdData.reduce((s, d) => s + d.despesas, 0);
    const saldo = totalRecebido - totalDespesas;
    return { totalPortfolio, totalRecebido, totalDespesas, saldo };
  }, [obras, prdData]);

  const rankingData = useMemo(() => {
    return [...obras]
      .sort((a, b) => (b.valor_contrato || 0) - (a.valor_contrato || 0))
      .slice(0, 15)
      .map(o => ({
        id: o.id,
        nome: o.nome.length > 22 ? o.nome.slice(0, 20) + "…" : o.nome,
        fullNome: o.nome,
        valor: o.valor_contrato || 0,
        health: o.health,
        status: o.status,
      }));
  }, [obras]);

  const HEALTH_COLORS: Record<string, string> = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" };
  const STATUS_LABELS: Record<string, string> = { em_andamento: "Em Andamento", nao_iniciada: "Não Iniciada", concluida: "Concluída", paralisada: "Paralisada" };

  return (
    <div className="space-y-4">
      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi icon={DollarSign} label="Valor Total do Portfólio" value={BRL.format(summaryStats.totalPortfolio)} className="text-emerald-600 dark:text-emerald-400" />
        <MiniKpi icon={TrendingUp} label="Total Recebido" value={BRL.format(summaryStats.totalRecebido)} className="text-blue-600 dark:text-blue-400" />
        <MiniKpi icon={TrendingDown} label="Total Despesas" value={BRL.format(summaryStats.totalDespesas)} className="text-red-600 dark:text-red-400" />
        <MiniKpi icon={Wallet} label="Saldo Estimado" value={BRL.format(summaryStats.saldo)} className={summaryStats.saldo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
      </div>

      {/* MAPA RS + Lista de obras (full width, dashboard style) */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Mapa de Obras — Rio Grande do Sul
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
            {/* MAP */}
            <div className="relative bg-muted/30 rounded-lg p-2">
              <svg viewBox="0 0 360 280" className="w-full h-auto">
                <path d={RS_PATH} fill="hsl(var(--muted) / 0.5)" stroke="hsl(var(--border))" strokeWidth="1.5" />
                <text x="287" y="137" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="5" opacity="0.5">Porto Alegre</text>
                <text x="15" y="215" textAnchor="start" fill="hsl(var(--muted-foreground))" fontSize="5" opacity="0.4">Uruguaiana</text>
                <text x="330" y="70" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="5" opacity="0.4">Caxias do Sul</text>
                <text x="180" y="170" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="28" fontWeight="700" opacity="0.08">RS</text>
                <text x="345" y="18" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="7" opacity="0.4">N↑</text>
                <text x="340" y="200" textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize="5" opacity="0.3" fontStyle="italic">Oceano Atlântico</text>
                {obrasOnMap.map(obra => {
                  const isHovered = hoveredObra === obra.id;
                  const color = HEALTH_PIN[obra.health] || "#3b82f6";
                  return (
                    <g key={obra.id} style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredObra(obra.id)}
                      onMouseLeave={() => setHoveredObra(null)}
                      onClick={() => onObraClick(obra.id)}
                    >
                      {isHovered && (
                        <circle cx={obra.coords.x} cy={obra.coords.y} r="14" fill="none" stroke={color} strokeWidth="2" opacity="0.4">
                          <animate attributeName="r" from="10" to="18" dur="1s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle cx={obra.coords.x + 0.5} cy={obra.coords.y + 0.5} r={isHovered ? 7 : 5} fill="rgba(0,0,0,0.15)" />
                      <circle cx={obra.coords.x} cy={obra.coords.y} r={isHovered ? 7 : 5} fill={color} stroke="white" strokeWidth="1.5" />
                      {!isHovered && (
                        <text x={obra.coords.x} y={obra.coords.y + 11} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="4" opacity="0.7">
                          {obra.municipio?.split(" ")[0]}
                        </text>
                      )}
                      {isHovered && (
                        <g>
                          <rect x={obra.coords.x - 55} y={obra.coords.y - 42} width="110" height="32" rx="4"
                            fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth="0.5" />
                          <text x={obra.coords.x} y={obra.coords.y - 28} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="5.5" fontWeight="600">
                            {obra.nome.slice(0, 20)}
                          </text>
                          <text x={obra.coords.x} y={obra.coords.y - 19} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="4.5">
                            {BRL_SHORT(obra.valor_contrato)} • {obra.municipio}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
              <div className="flex items-center justify-between mt-2">
                <p className="text-[10px] font-medium text-muted-foreground">{obrasOnMap.length} obra{obrasOnMap.length !== 1 ? "s" : ""} no mapa</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#22c55e" }} /> Sob controle</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#f59e0b" }} /> Atenção</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#ef4444" }} /> Crítico</span>
                </div>
              </div>
              {obrasOnMap.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
                  <p className="text-xs text-muted-foreground text-center px-4">Informe o município ao cadastrar cada obra para visualizá-la no mapa do RS</p>
                </div>
              )}
            </div>

            {/* LISTA DE OBRAS (sidebar like reference image) */}
            <div className="flex flex-col gap-0.5 max-h-[420px] overflow-y-auto pr-1">
              <p className="text-xs font-semibold text-muted-foreground mb-1 sticky top-0 bg-card py-1 z-10">Obras ({obras.length})</p>
              {[...obras]
                .sort((a, b) => (b.valor_contrato || 0) - (a.valor_contrato || 0))
                .map((obra) => {
                  const isHov = hoveredObra === obra.id;
                  const hc = HEALTH_PIN[obra.health] || "#3b82f6";
                  return (
                    <button
                      key={obra.id}
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-muted/60 ${isHov ? "bg-muted/80 ring-1 ring-primary/30" : ""}`}
                      onMouseEnter={() => setHoveredObra(obra.id)}
                      onMouseLeave={() => setHoveredObra(null)}
                      onClick={() => onObraClick(obra.id)}
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: hc }} />
                      <span className="flex-1 truncate font-medium text-foreground">{obra.nome}</span>
                      <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">{BRL_SHORT(obra.valor_contrato)}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row 2: PRD + Evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PRD Chart */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3">Previsto × Realizado × Despesas</h3>
            {prdData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">Nenhuma obra cadastrada</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={prdData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                  <XAxis dataKey="nome" fontSize={9} tick={{ fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-20} textAnchor="end" height={40} />
                  <YAxis yAxisId="left" fontSize={9} tickFormatter={(v) => BRL_SHORT(v)} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="right" orientation="right" fontSize={9} tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="previsto" name="Previsto" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="left" dataKey="realizado" name="Realizado" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="left" dataKey="despesas" name="Despesas" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="roi" name="ROI %" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Evolution Chart */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Evolução Financeira Mensal</h3>
          {evolutionData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
              Cadastre medições e despesas para visualizar a evolução
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={evolutionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDespesa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="month" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis fontSize={10} tickFormatter={(v) => BRL_SHORT(v)} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomAreaTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="receita" name="Receitas" stroke="#22c55e" fill="url(#gradReceita)" strokeWidth={2} />
                <Area type="monotone" dataKey="despesa" name="Despesas" stroke="#ef4444" fill="url(#gradDespesa)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Row 3: Donut KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutKpi label="Documentação" value={donutData.docs} color="#3b82f6" subtitle="obras com docs ≥9/11" />
        <DonutKpi label="Medições OK" value={donutData.medicoes} color="#22c55e" subtitle="obras com medição aprovada" />
        <DonutKpi label="No Prazo" value={donutData.prazo} color="#f59e0b" subtitle="obras em andamento no prazo" />
      </div>

      {/* Row 4: Ranking */}
      {rankingData.length > 0 && (
        <Card className="border-border/60">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3">Top Obras por Valor de Contrato</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, rankingData.length * 36)}>
              <BarChart data={rankingData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" horizontal={false} />
                <XAxis type="number" fontSize={10} tickFormatter={(v) => BRL_SHORT(v)} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="nome" width={180} fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1">
                        <p className="font-semibold text-foreground">{d.fullNome}</p>
                        <p>{BRL.format(d.valor)}</p>
                        <p className="text-muted-foreground">{STATUS_LABELS[d.status] || d.status}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="valor" name="Valor Contrato" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => onObraClick(data.id)}>
                  {rankingData.map((entry, index) => (
                    <Cell key={index} fill={HEALTH_COLORS[entry.health] || "#3b82f6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Donut KPI component
   ═══════════════════════════════════════ */

function DonutKpi({ label, value, color, subtitle }: { label: string; value: number; color: string; subtitle: string }) {
  const data = [
    { name: label, value, fill: color },
    { name: "rest", value: 100 - value, fill: "hsl(var(--muted) / 0.3)" },
  ];

  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex flex-col items-center">
        <div className="relative w-[130px] h-[130px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%" cy="50%"
              innerRadius="72%" outerRadius="100%"
              barSize={10}
              data={[data[0]]}
              startAngle={90} endAngle={-270}
            >
              <RadialBar
                dataKey="value"
                cornerRadius={5}
                background={{ fill: "hsl(var(--muted) / 0.3)" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{value}%</span>
          </div>
        </div>
        <p className="font-semibold text-sm mt-2 text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════
   Mini KPI card for summary stats
   ═══════════════════════════════════════ */

function MiniKpi({ icon: Icon, label, value, className }: { icon: any; label: string; value: string; className?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted/50 ${className}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className={`text-base font-bold ${className}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
