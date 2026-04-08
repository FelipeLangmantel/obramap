import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ComposedChart, BarChart, Bar, Line, AreaChart, Area, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, DollarSign, TrendingUp, TrendingDown, Wallet, Filter } from "lucide-react";
import HoldingMap, { MapObra, HoldingMapHandle } from "./HoldingMap";

const parseLocalDate = (d: string) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); };
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
  percentual_fisico: number;
  percentual_financeiro: number;
  municipio: string | null;
  estado: string | null;
  uh: number | null;
  tipo_contrato: string | null;
  aditivo_valor_total: number;
  latitude: number | null;
  longitude: number | null;
}

interface ObraEnriched extends ObraPortfolio {
  docs: any;
  latestMedicao: any;
  allMedicoes: any[];
  docsCount: number;
  docsTotal: number;
  health: "green" | "yellow" | "red" | "gray";
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
   RS State SVG Path
   ═══════════════════════════════════════ */

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Porto Alegre":            { lat: -30.0346, lng: -51.2177 },
  "Gravataí":                { lat: -29.9441, lng: -50.9914 },
  "Esteio":                  { lat: -29.8578, lng: -51.1775 },
  "São Leopoldo":            { lat: -29.7597, lng: -51.1503 },
  "Novo Hamburgo":           { lat: -29.6783, lng: -51.1306 },
  "Dois Irmãos":             { lat: -29.5836, lng: -51.0906 },
  "Viamão":                  { lat: -30.0811, lng: -51.0228 },
  "Parobé":                  { lat: -29.6261, lng: -50.8322 },
  "Tapejara":                { lat: -28.0667, lng: -52.0167 },
  "Santa Rosa":              { lat: -27.8714, lng: -54.4806 },
  "Tupanciretã":             { lat: -29.0839, lng: -53.8419 },
  "Uruguaiana":              { lat: -29.7553, lng: -57.0883 },
  "Dom Pedrito":             { lat: -30.9803, lng: -54.6681 },
  "Pelotas":                 { lat: -31.7654, lng: -52.3376 },
  "Encruzilhada do Sul":     { lat: -30.5425, lng: -52.5225 },
  "Rosário do Sul":          { lat: -30.2569, lng: -54.9172 },
  "Rio Pardo":               { lat: -29.9875, lng: -52.3708 },
  "Venâncio Aires":          { lat: -29.6106, lng: -52.1906 },
  "Arroio do Meio":          { lat: -29.3964, lng: -51.9483 },
  "Muçum":                   { lat: -29.1667, lng: -51.8667 },
  "Encantado":               { lat: -29.2333, lng: -51.8667 },
  "Roca Sales":              { lat: -29.3333, lng: -51.8667 },
  "São Francisco de Paula":  { lat: -29.4422, lng: -50.5833 },
  "São Sebastião do Caí":    { lat: -29.5833, lng: -51.3667 },
  "São João do Polêsine":    { lat: -29.6167, lng: -53.3 },
  "Dona Francisca":          { lat: -29.6167, lng: -53.3583 },
  "Caxias do Sul":           { lat: -29.1678, lng: -51.1794 },
  "São José do Norte":       { lat: -32.0169, lng: -52.0322 },
  "Eldorado do Sul":         { lat: -30.085,  lng: -51.5681 },
  "Alvorada":                { lat: -29.9878, lng: -51.0822 },
  "Canoas":                  { lat: -29.9178, lng: -51.1836 },
  "Porto Alegre - Zona Norte":{ lat: -29.9,   lng: -51.1 },
  "Taquara":                 { lat: -29.6506, lng: -50.7792 },
  "Estrela":                 { lat: -29.5006, lng: -51.9611 },
  "Lajeado":                 { lat: -29.4669, lng: -51.9614 },
  "Campo Bom":               { lat: -29.6747, lng: -51.0603 },
  "Sapucaia do Sul":         { lat: -29.8275, lng: -51.1492 },
  "São Lourenço do Sul":     { lat: -31.3650, lng: -51.9778 },
  // São Paulo
  "Ribeirão Preto":          { lat: -21.1775, lng: -47.8103 },
  "São Paulo":               { lat: -23.5505, lng: -46.6333 },
  "Campinas":                { lat: -22.9056, lng: -47.0608 },
  "Sorocaba":                { lat: -23.5015, lng: -47.4526 },
  "São José dos Campos":     { lat: -23.1896, lng: -45.8841 },
  "Santos":                  { lat: -23.9608, lng: -46.3336 },
  "Bauru":                   { lat: -22.3246, lng: -49.0713 },
  "Jundiaí":                 { lat: -23.1864, lng: -46.8981 },
  "Piracicaba":              { lat: -22.7253, lng: -47.6492 },
  "Franca":                  { lat: -20.5386, lng: -47.4006 },
  "Marília":                 { lat: -22.2122, lng: -49.9453 },
  "Presidente Prudente":     { lat: -22.1256, lng: -51.3889 },
  "Araçatuba":               { lat: -21.2092, lng: -50.4322 },
  "São José do Rio Preto":   { lat: -20.8197, lng: -49.3794 },
  "Araraquara":              { lat: -21.7942, lng: -48.1756 },
  "Botucatu":                { lat: -22.8869, lng: -48.4444 },
  "Guarulhos":               { lat: -23.4543, lng: -46.5333 },
  "Osasco":                  { lat: -23.5325, lng: -46.7919 },
  // Mato Grosso do Sul
  "Campo Grande":            { lat: -20.4697, lng: -54.6201 },
  "Dourados":                { lat: -22.2211, lng: -54.8056 },
  "Três Lagoas":             { lat: -20.7519, lng: -51.6783 },
  "Corumbá":                 { lat: -19.0078, lng: -57.6531 },
  "Ponta Porã":              { lat: -22.5356, lng: -55.7258 },
  "Naviraí":                 { lat: -23.0647, lng: -54.1908 },
  "Nova Andradina":          { lat: -22.2339, lng: -53.3433 },
  "Aquidauana":              { lat: -20.4706, lng: -55.7867 },
  "Bonito":                  { lat: -21.1261, lng: -56.4839 },
  "Coxim":                   { lat: -18.5069, lng: -54.7597 },
  // Outros estados relevantes
  "Curitiba":                { lat: -25.4284, lng: -49.2733 },
  "Florianópolis":           { lat: -27.5954, lng: -48.5480 },
  "Belo Horizonte":          { lat: -19.9167, lng: -43.9345 },
  "Brasília":                { lat: -15.7801, lng: -47.9292 },
  "Rio de Janeiro":          { lat: -22.9068, lng: -43.1729 },
  "Goiânia":                 { lat: -16.6869, lng: -49.2648 },
  "Cuiabá":                  { lat: -15.6014, lng: -56.0979 },
};

const HEALTH_PIN: Record<string, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#94a3b8",
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
  const mapRef = useRef<HoldingMapHandle>(null);
  const [hoveredObra, setHoveredObra] = useState<string | null>(null);
  const [medicoesData, setMedicoesData] = useState<any[]>([]);
  const [despesasData, setDespesasData] = useState<any[]>([]);
  const [analyticsFilter, setAnalyticsFilter] = useState("all");

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

  // Filter obras by empresa
  const empresas = useMemo(() => [...new Set(obras.map(o => o.empresa).filter(Boolean))].sort(), [obras]);
  const filteredObras = useMemo(() => {
    if (analyticsFilter === "all") return obras;
    return obras.filter(o => o.empresa === analyticsFilter);
  }, [obras, analyticsFilter]);

  // PRD chart data
  const prdData = useMemo(() => {
    return filteredObras.map(o => {
      const medAprovadas = medicoesData
        .filter(m => m.obra_id === o.id && m.status_medicao === "aprovada")
        .reduce((s: number, m: any) => s + (m.valor_medicao || 0), 0);
      const despesas = despesasData
        .filter(d => d.obra_id === o.id)
        .reduce((s: number, d: any) => s + (d.valor || 0), 0);
      const roi = medAprovadas > 0 && despesas > 0 ? ((medAprovadas - despesas) / despesas) * 100 : 0;
      return {
        nome: o.uh ? `${o.nome.slice(0, 12)}… (${o.uh}UH)` : (o.nome.length > 14 ? o.nome.slice(0, 12) + "…" : o.nome),
        fullNome: o.nome,
        previsto: o.valor_contrato || 0,
        realizado: medAprovadas,
        despesas,
        roi: Math.round(roi * 10) / 10,
      };
    });
  }, [filteredObras, medicoesData, despesasData]);

  // Monthly evolution data
  const evolutionData = useMemo(() => {
    const filteredIds = new Set(filteredObras.map(o => o.id));
    const monthMap: Record<string, { receita: number; despesa: number; sortKey: number }> = {};

    medicoesData.forEach((m: any) => {
      if (!filteredIds.has(m.obra_id)) return;
      if (m.status_medicao !== "aprovada") return;
      const key = monthKey(m.mes_referencia, m.ano_referencia);
      if (!key) return;
      if (!monthMap[key]) monthMap[key] = { receita: 0, despesa: 0, sortKey: (m.ano_referencia || 0) * 100 + MONTH_NAMES.indexOf(key.split("/")[0]) };
      monthMap[key].receita += m.valor_medicao || 0;
    });

    despesasData.forEach((d: any) => {
      if (!filteredIds.has(d.obra_id)) return;
      const key = monthKey(d.mes_referencia, d.ano_referencia);
      if (!key) return;
      if (!monthMap[key]) monthMap[key] = { receita: 0, despesa: 0, sortKey: (d.ano_referencia || 0) * 100 + MONTH_NAMES.indexOf(key.split("/")[0]) };
      monthMap[key].despesa += d.valor || 0;
    });

    return Object.entries(monthMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [filteredObras, medicoesData, despesasData]);

  // Donut data
  const donutData = useMemo(() => {
    const total = filteredObras.length || 1;
    const docsComplete = filteredObras.filter(o => o.docsCount >= 9).length;
    const medicoesOk = filteredObras.filter(o => o.latestMedicao?.status_medicao === "aprovada").length;
    const noPrazo = filteredObras.filter(o => {
      if (o.status !== "em_andamento" || !o.data_inicio) return false;
      const fim = parseLocalDate(o.data_inicio!);
      fim.setDate(fim.getDate() + o.prazo_dias + o.aditivo_prazo_dias);
      return fim >= new Date();
    }).length;
    const emAndamento = filteredObras.filter(o => o.status === "em_andamento").length || 1;

    return {
      docs: Math.round((docsComplete / total) * 100),
      medicoes: Math.round((medicoesOk / total) * 100),
      prazo: Math.round((noPrazo / emAndamento) * 100),
    };
  }, [filteredObras]);

  // Build a case-insensitive + trimmed lookup for CITY_COORDS
  const cityLookup = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const [key, val] of Object.entries(CITY_COORDS)) {
      map.set(key.trim().toLowerCase(), val);
    }
    return map;
  }, []);

  const getCityCoords = (municipio: string | null) => {
    if (!municipio) return null;
    return cityLookup.get(municipio.trim().toLowerCase()) || null;
  };

  // Obras with map pins
  const obrasOnMap = useMemo(() => {
    return filteredObras.filter(o =>
      (o.latitude && o.longitude) || (o.municipio && getCityCoords(o.municipio))
    );
  }, [filteredObras, cityLookup]);

  const mapObras: MapObra[] = useMemo(() => {
    return obrasOnMap
      .map(obra => {
        const dbCoords = obra.latitude && obra.longitude
          ? { lat: obra.latitude, lng: obra.longitude }
          : null;
        const staticCoords = getCityCoords(obra.municipio);
        const coords = dbCoords || staticCoords;
        if (!coords) return null;
        return {
          id: obra.id,
          nome: obra.nome,
          municipio: obra.municipio || "",
          lat: coords.lat,
          lng: coords.lng,
          health: obra.health,
          valor_contrato: obra.valor_contrato,
          status: obra.status,
        };
      })
      .filter(Boolean) as MapObra[];
  }, [obrasOnMap]);

  // Map stats
  const mapStats = useMemo(() => ({
    total: filteredObras.length,
    mapeadas: obrasOnMap.length,
    valorTotal: filteredObras.reduce((s, o) => s + (o.valor_contrato || 0) + (o.aditivo_valor_total || 0), 0),
    criticas: filteredObras.filter(o => o.health === "red").length,
  }), [filteredObras, obrasOnMap]);

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
    const totalPortfolio = filteredObras.reduce((s, o) => s + (o.valor_contrato || 0) + (o.aditivo_valor_total || 0), 0);
    const totalRecebido = prdData.reduce((s, d) => s + d.realizado, 0);
    const totalDespesas = prdData.reduce((s, d) => s + d.despesas, 0);
    const saldo = totalRecebido - totalDespesas;
    return { totalPortfolio, totalRecebido, totalDespesas, saldo };
  }, [filteredObras, prdData]);

  const rankingData = useMemo(() => {
    return [...filteredObras]
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
  }, [filteredObras]);

  const HEALTH_COLORS: Record<string, string> = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" };
  const STATUS_LABELS: Record<string, string> = { em_andamento: "Em Andamento", nao_iniciada: "Não Iniciada", concluida: "Concluída", paralisada: "Paralisada" };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={analyticsFilter} onValueChange={setAnalyticsFilter}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Todas Empresas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Empresas</SelectItem>
            {empresas.map(e => <SelectItem key={e} value={e!}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        {analyticsFilter !== "all" && (
          <span className="text-xs text-muted-foreground">{filteredObras.length} obras filtradas</span>
        )}
      </div>

      {/* Mini Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-foreground">{mapStats.total}</p>
          <p className="text-[10px] text-muted-foreground">Total Obras</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{mapStats.mapeadas}</p>
          <p className="text-[10px] text-muted-foreground">Obras no Mapa</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{BRL_SHORT(mapStats.valorTotal)}</p>
          <p className="text-[10px] text-muted-foreground">Valor Total Portfólio</p>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <p className={`text-lg font-bold ${mapStats.criticas > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{mapStats.criticas}</p>
          <p className="text-[10px] text-muted-foreground">Obras Críticas</p>
        </div>
      </div>

      {/* MAPA RS + Sidebar List */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            {/* Map */}
            <div className="relative bg-muted/30 rounded-lg p-2">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Obras no Rio Grande do Sul
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">
                {obrasOnMap.length} obra{obrasOnMap.length !== 1 ? "s" : ""} mapeada{obrasOnMap.length !== 1 ? "s" : ""} · clique para abrir
              </p>
              <HoldingMap ref={mapRef} obras={mapObras} onObraClick={onObraClick} />
              {obrasOnMap.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
                  <p className="text-xs text-muted-foreground text-center px-4">Informe o município ao cadastrar cada obra para visualizá-la no mapa do RS</p>
                </div>
              )}
            </div>

            {/* Sidebar List — Grouped by City */}
            <div className="flex flex-col border-l border-border/40 pl-3">
              <p className="text-xs font-semibold text-foreground mb-2 sticky top-0 bg-card py-1 z-10 flex items-center justify-between">
                <span>Cidades ({cityGroups.length})</span>
              </p>
              <div className="flex flex-col gap-0.5 max-h-[450px] overflow-y-auto pr-1">
                {cityGroups.map(({ municipio, obras: cityObras, coords }) => {
                  const totalValor = cityObras.reduce((s, o) => s + (o.valor_contrato || 0), 0);
                  const dominant = cityObras.some(o => o.health === "red") ? "red" : cityObras.some(o => o.health === "yellow") ? "yellow" : "green";
                  const hc = HEALTH_PIN[dominant] || "#3b82f6";
                  return (
                    <div key={municipio} className="border-b border-border/30 last:border-0">
                      <button
                        className="flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors hover:bg-muted/60"
                        onClick={() => {
                          if (coords) mapRef.current?.flyTo(coords.lat, coords.lng, 11);
                        }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: hc }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-xs">{municipio || "Sem município"} <span className="text-muted-foreground">({cityObras.length})</span></p>
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                          {totalValor >= 1_000_000
                            ? `R$ ${(totalValor / 1_000_000).toFixed(1)}M`
                            : `R$ ${(totalValor / 1_000).toFixed(0)}k`}
                        </p>
                      </button>
                      <div className="pl-5 pb-1">
                        {cityObras.map(obra => (
                          <button
                            key={obra.id}
                            className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-[10px] transition-colors hover:bg-muted/40"
                            onClick={() => onObraClick(obra.id)}
                          >
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: HEALTH_PIN[obra.health] || "#3b82f6" }} />
                            <span className="truncate flex-1 text-muted-foreground">{obra.nome}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
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
              <div className="h-[300px] flex items-center justify-center text-xs text-muted-foreground">Nenhuma obra cadastrada</div>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(400, prdData.length * 60) }}>
                  <ResponsiveContainer width="100%" height={300}>
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
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evolution Chart */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3">Evolução Financeira Mensal</h3>
            {evolutionData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-xs text-muted-foreground">
                Cadastre medições e despesas para visualizar a evolução
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
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

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi icon={DollarSign} label="Valor Total do Portfólio" value={BRL.format(summaryStats.totalPortfolio)} className="text-emerald-600 dark:text-emerald-400" />
        <MiniKpi icon={TrendingUp} label="Total Recebido" value={BRL.format(summaryStats.totalRecebido)} className="text-blue-600 dark:text-blue-400" />
        <MiniKpi icon={TrendingDown} label="Total Despesas" value={BRL.format(summaryStats.totalDespesas)} className="text-red-600 dark:text-red-400" />
        <MiniKpi icon={Wallet} label="Saldo Estimado" value={BRL.format(summaryStats.saldo)} className={summaryStats.saldo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
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
            <RadialBarChart cx="50%" cy="50%" innerRadius="72%" outerRadius="100%" barSize={10} data={[data[0]]} startAngle={90} endAngle={-270}>
              <RadialBar dataKey="value" cornerRadius={5} background={{ fill: "hsl(var(--muted) / 0.3)" }} />
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
