import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  ComposedChart, BarChart, Bar, Line, AreaChart, Area, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MapPin } from "lucide-react";

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

const RS_PATH = "M100,60 L140,55 L170,60 L200,55 L230,65 L260,80 L275,100 L280,130 L270,160 L260,180 L240,200 L220,215 L200,225 L180,220 L160,210 L140,195 L120,180 L105,160 L95,140 L90,120 L85,100 L90,80 Z";

const MUNICIPIO_COORDS: Record<string, { x: number; y: number }> = {
  "Taquara": { x: 195, y: 142 },
  "Estrela": { x: 235, y: 148 },
  "Lajeado": { x: 225, y: 152 },
  "Encruzilhada do Sul": { x: 212, y: 192 },
  "São João do Polêsine": { x: 205, y: 160 },
  "São Sebastião do Caí": { x: 200, y: 143 },
  "São Francisco de Paula": { x: 210, y: 132 },
  "Arroio do Meio": { x: 238, y: 152 },
  "Esteio": { x: 193, y: 148 },
  "Tapejara": { x: 185, y: 108 },
  "Santa Rosa": { x: 115, y: 100 },
  "Tupanciretã": { x: 152, y: 135 },
  "Viamão": { x: 198, y: 155 },
  "Porto Alegre": { x: 197, y: 152 },
  "Muçum": { x: 232, y: 148 },
  "Eldorado do Sul": { x: 196, y: 157 },
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
      return {
        nome: o.nome.length > 14 ? o.nome.slice(0, 12) + "…" : o.nome,
        fullNome: o.nome,
        previsto: o.valor_contrato || 0,
        realizado: medAprovadas,
        despesas,
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

  return (
    <div className="space-y-4">
      {/* Row 1: Map + PRD Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* MAPA RS */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Localização das Obras
            </h3>
            <div className="relative bg-muted/30 rounded-lg p-2">
              <svg viewBox="60 40 240 200" className="w-full h-auto max-h-[320px]">
                {/* RS outline */}
                <path
                  d={RS_PATH}
                  fill="hsl(var(--muted) / 0.5)"
                  stroke="hsl(var(--border))"
                  strokeWidth="1.5"
                />
                {/* State label */}
                <text x="175" y="150" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="16" fontWeight="700" opacity="0.2">
                  RS
                </text>

                {/* Obra pins */}
                {obrasOnMap.map(obra => {
                  const isHovered = hoveredObra === obra.id;
                  const color = HEALTH_PIN[obra.health] || "#3b82f6";
                  return (
                    <g
                      key={obra.id}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredObra(obra.id)}
                      onMouseLeave={() => setHoveredObra(null)}
                      onClick={() => onObraClick(obra.id)}
                    >
                      {/* Pulse ring on hover */}
                      {isHovered && (
                        <circle
                          cx={obra.coords.x} cy={obra.coords.y} r="14"
                          fill="none" stroke={color} strokeWidth="2" opacity="0.4"
                        >
                          <animate attributeName="r" from="10" to="18" dur="1s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                        </circle>
                      )}
                      {/* Pin shadow */}
                      <circle cx={obra.coords.x + 0.5} cy={obra.coords.y + 0.5} r={isHovered ? 7 : 5} fill="rgba(0,0,0,0.15)" />
                      {/* Pin */}
                      <circle
                        cx={obra.coords.x} cy={obra.coords.y}
                        r={isHovered ? 7 : 5}
                        fill={color} stroke="white" strokeWidth="1.5"
                      />
                      {/* Tooltip on hover */}
                      {isHovered && (
                        <g>
                          <rect
                            x={obra.coords.x - 55} y={obra.coords.y - 42}
                            width="110" height="32" rx="4"
                            fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth="0.5"
                          />
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

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#22c55e" }} /> Sob controle</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#f59e0b" }} /> Atenção</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: "#ef4444" }} /> Crítico</span>
              </div>

              {obrasOnMap.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
                  <p className="text-xs text-muted-foreground text-center px-4">
                    Cadastre o município nas obras para visualizá-las no mapa.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PRD Chart */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3">Previsto × Realizado × Despesas</h3>
            {prdData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-xs text-muted-foreground">
                Nenhuma obra cadastrada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={prdData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                  <XAxis dataKey="nome" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis fontSize={10} tickFormatter={(v) => BRL_SHORT(v)} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="previsto" name="Previsto" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="realizado" name="Realizado" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Evolution Chart */}
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

      {/* Row 3: Donut KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DonutKpi label="Documentação" value={donutData.docs} color="#3b82f6" subtitle="obras com docs ≥9/11" />
        <DonutKpi label="Medições OK" value={donutData.medicoes} color="#22c55e" subtitle="obras com medição aprovada" />
        <DonutKpi label="No Prazo" value={donutData.prazo} color="#f59e0b" subtitle="obras em andamento no prazo" />
      </div>
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
