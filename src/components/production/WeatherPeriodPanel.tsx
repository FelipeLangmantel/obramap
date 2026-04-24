import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sun, CloudRain, Cloud, AlertTriangle, Droplets, CalendarRange } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, CartesianGrid, ComposedChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { format, parseISO, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  projectId: string;
}

type DayClima = "claro" | "nublado" | "chuvoso";
type DayCondicao = "praticavel" | "impraticavel";

interface DiaryDay {
  entry_date: string;
  clima_manha: DayClima | null;
  clima_tarde: DayClima | null;
  clima_noite: DayClima | null;
  condicao_manha: DayCondicao | null;
  condicao_tarde: DayCondicao | null;
  condicao_noite: DayCondicao | null;
  noite_ativa: boolean;
  mm_chuva: number | null;
}

const PERIODS: Record<string, { days: number; label: string }> = {
  "7":   { days: 7,   label: "Últimos 7 dias" },
  "30":  { days: 30,  label: "Últimos 30 dias" },
  "90":  { days: 90,  label: "Últimos 90 dias" },
  "180": { days: 180, label: "Últimos 180 dias" },
  "365": { days: 365, label: "Últimos 12 meses" },
};

/**
 * Classifica o dia inteiro a partir dos turnos.
 *
 * Regra de engenharia (gestão de cronograma):
 * - Praticável: TODOS os turnos preenchidos como "praticavel".
 * - Impraticável: ALGUM turno marcado como "impraticavel" (perde o dia).
 * - Chuvoso: ALGUM turno com clima "chuvoso".
 * - Sol cheio: TODOS os turnos com clima "claro" e praticáveis.
 * Esta classificação alimenta os indicadores de IDC (Índice de Dias
 * Praticáveis) usados em curva-S e replanejamento de prazo.
 */
function classifyDay(d: DiaryDay) {
  const turnos = [
    { c: d.clima_manha, p: d.condicao_manha },
    { c: d.clima_tarde, p: d.condicao_tarde },
    ...(d.noite_ativa ? [{ c: d.clima_noite, p: d.condicao_noite }] : []),
  ].filter(t => t.c || t.p);

  if (turnos.length === 0) return { praticavel: false, impraticavel: false, chuvoso: false, solCheio: false };

  const praticavel = turnos.every(t => t.p === "praticavel");
  const impraticavel = turnos.some(t => t.p === "impraticavel");
  const chuvoso = turnos.some(t => t.c === "chuvoso");
  const solCheio = praticavel && turnos.every(t => t.c === "claro");

  return { praticavel: praticavel && !impraticavel, impraticavel, chuvoso, solCheio };
}

export function WeatherPeriodPanel({ projectId }: Props) {
  const [period, setPeriod] = useState<keyof typeof PERIODS>("30");

  const { data: days = [], isLoading } = useQuery({
    queryKey: ["weather-period", projectId, period],
    queryFn: async () => {
      const since = format(subDays(new Date(), PERIODS[period].days), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("diary_entries")
        .select("entry_date, clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite, noite_ativa, mm_chuva")
        .eq("project_id", projectId)
        .gte("entry_date", since)
        .order("entry_date", { ascending: true });
      if (error) throw error;
      return (data || []) as DiaryDay[];
    },
    enabled: !!projectId,
  });

  const stats = useMemo(() => {
    let praticaveis = 0, impraticaveis = 0, chuvosos = 0, solCheio = 0;
    let mmTotal = 0, diasComMedicaoChuva = 0;
    let diasReportados = days.length;

    const series = days.map(d => {
      const cls = classifyDay(d);
      if (cls.praticavel) praticaveis++;
      if (cls.impraticavel) impraticaveis++;
      if (cls.chuvoso) chuvosos++;
      if (cls.solCheio) solCheio++;
      const mm = Number(d.mm_chuva || 0);
      if (d.mm_chuva != null) { mmTotal += mm; diasComMedicaoChuva++; }
      return {
        date: d.entry_date,
        dateLabel: format(parseISO(d.entry_date), "dd/MM", { locale: ptBR }),
        mm,
        praticavel: cls.praticavel ? 1 : 0,
        impraticavel: cls.impraticavel ? 1 : 0,
        chuvoso: cls.chuvoso ? 1 : 0,
      };
    });

    // Acumulado de chuva (curva contínua)
    let acc = 0;
    const acumulada = series.map(s => {
      acc += s.mm;
      return { ...s, acumulado: Number(acc.toFixed(1)) };
    });

    const idc = diasReportados > 0 ? Math.round((praticaveis / diasReportados) * 100) : 0;
    const mediaMm = diasComMedicaoChuva > 0 ? mmTotal / diasComMedicaoChuva : 0;

    return {
      diasReportados, praticaveis, impraticaveis, chuvosos, solCheio,
      mmTotal: Number(mmTotal.toFixed(1)),
      mediaMm: Number(mediaMm.toFixed(1)),
      idc,
      acumulada,
    };
  }, [days]);

  const pieData = [
    { name: "Praticáveis", value: stats.praticaveis, color: "hsl(142 71% 45%)" },
    { name: "Impraticáveis", value: stats.impraticaveis, color: "hsl(0 84% 60%)" },
    { name: "Chuvosos", value: stats.chuvosos, color: "hsl(210 90% 55%)" },
  ].filter(d => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            Clima e dias praticáveis por período
          </CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIODS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum diário lançado para esta obra no período. Os indicadores de clima são alimentados pelos diários de obra (RDO).
          </p>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <KpiCard label="Dias reportados" value={stats.diasReportados} icon={<CalendarRange className="h-3.5 w-3.5" />} />
              <KpiCard label="Praticáveis" value={stats.praticaveis} cls="text-emerald-600" icon={<Sun className="h-3.5 w-3.5" />} />
              <KpiCard label="Impraticáveis" value={stats.impraticaveis} cls="text-red-600" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
              <KpiCard label="Chuvosos" value={stats.chuvosos} cls="text-blue-600" icon={<CloudRain className="h-3.5 w-3.5" />} />
              <KpiCard label="Chuva acumulada" value={`${stats.mmTotal} mm`} cls="text-cyan-600" icon={<Droplets className="h-3.5 w-3.5" />} />
              <KpiCard
                label="IDC (Índice praticável)"
                value={`${stats.idc}%`}
                cls={stats.idc >= 80 ? "text-emerald-600" : stats.idc >= 60 ? "text-amber-600" : "text-red-600"}
                icon={<Cloud className="h-3.5 w-3.5" />}
              />
            </div>

            {/* Gráfico composto: barras de mm + linha acumulada */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Pluviometria diária e acumulada (mm)
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.acumulada} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: "mm/dia", angle: -90, position: "insideLeft", fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} label={{ value: "Acumulado", angle: 90, position: "insideRight", fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="mm" name="Chuva (mm)" fill="hsl(210 90% 55%)" />
                    <Line yAxisId="right" type="monotone" dataKey="acumulado" name="Acumulado (mm)" stroke="hsl(190 80% 40%)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Distribuição praticáveis x impraticáveis */}
            {pieData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4 items-center">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Distribuição de dias</p>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between border-b pb-1">
                    <span className="text-muted-foreground">Sol pleno (todos os turnos)</span>
                    <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30">
                      {stats.solCheio} dia{stats.solCheio !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-1">
                    <span className="text-muted-foreground">Média de chuva por dia</span>
                    <Badge variant="outline">{stats.mediaMm} mm</Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-1">
                    <span className="text-muted-foreground">Maior chuva em um dia</span>
                    <Badge variant="outline">
                      {Math.max(0, ...stats.acumulada.map(s => s.mm)).toFixed(1)} mm
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cobertura do período</span>
                    <Badge variant="outline">
                      {Math.round((stats.diasReportados / PERIODS[period].days) * 100)}%
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-2">
                    O <strong>IDC</strong> representa o percentual de dias praticáveis sobre os dias com diário lançado e
                    serve como referência para compensação de prazo contratual em obras com cláusula de chuva.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, cls, icon }: { label: string; value: React.ReactNode; cls?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-2 bg-muted/30">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        {icon}{label}
      </div>
      <p className={`text-xl font-bold tabular-nums ${cls || ""}`}>{value}</p>
    </div>
  );
}
