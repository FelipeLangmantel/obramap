import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface DiaryItem {
  id: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_name: string;
  house_ids: number[];
  percentual_executado: number;
}

interface Props {
  items: DiaryItem[];
  totalCasas: number;
}

export function RdoProductionCharts({ items, totalCasas }: Props) {
  const { byMacro, byScope, totalCasasAtendidas, totalLancamentos } = useMemo(() => {
    const macroMap = new Map<string, { name: string; color: string; casas: number; lancamentos: number }>();
    const scopeMap = new Map<string, { name: string; macro: string; color: string; casas: number; pctMedio: number; n: number }>();
    const casasUnicas = new Set<number>();

    for (const it of items) {
      const casas = it.house_ids?.length || 0;
      it.house_ids?.forEach(h => casasUnicas.add(h));

      const m = macroMap.get(it.macro_id) || { name: it.macro_name, color: it.macro_color, casas: 0, lancamentos: 0 };
      m.casas += casas;
      m.lancamentos += 1;
      macroMap.set(it.macro_id, m);

      const skey = `${it.macro_id}|${it.scope_name}`;
      const s = scopeMap.get(skey) || { name: it.scope_name, macro: it.macro_name, color: it.macro_color, casas: 0, pctMedio: 0, n: 0 };
      s.casas += casas;
      s.pctMedio = (s.pctMedio * s.n + it.percentual_executado) / (s.n + 1);
      s.n += 1;
      scopeMap.set(skey, s);
    }

    return {
      byMacro: Array.from(macroMap.values()).sort((a, b) => b.casas - a.casas),
      byScope: Array.from(scopeMap.values()).sort((a, b) => b.casas - a.casas).slice(0, 8),
      totalCasasAtendidas: casasUnicas.size,
      totalLancamentos: items.length,
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Gráficos de produção do dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum lançamento de produção ainda. Os gráficos aparecerão automaticamente após o primeiro registro.
          </p>
        </CardContent>
      </Card>
    );
  }

  const cobertura = totalCasas > 0 ? Math.round((totalCasasAtendidas / totalCasas) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Gráficos de produção do dia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[10px] uppercase text-muted-foreground">Lançamentos</p>
            <p className="text-2xl font-bold">{totalLancamentos}</p>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[10px] uppercase text-muted-foreground">Casas atendidas</p>
            <p className="text-2xl font-bold">{totalCasasAtendidas}<span className="text-sm text-muted-foreground">/{totalCasas}</span></p>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[10px] uppercase text-muted-foreground">Cobertura</p>
            <p className="text-2xl font-bold">{cobertura}%</p>
          </div>
        </div>

        {/* Gráfico de barras: Casas por etapa */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Casas trabalhadas por etapa</p>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMacro} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="casas" name="Casas">
                  {byMacro.map((m, i) => (
                    <Cell key={i} fill={m.color || "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pizza: distribuição por etapa */}
        {byMacro.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Distribuição de casas por etapa</p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byMacro}
                    dataKey="casas"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    label={(e: any) => `${e.casas}`}
                  >
                    {byMacro.map((m, i) => (
                      <Cell key={i} fill={m.color || "hsl(var(--primary))"} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top serviços */}
        {byScope.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Top serviços</p>
            <div className="space-y-1.5">
              {byScope.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-6 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{s.macro}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{s.casas} casas</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{Math.round(s.pctMedio)}% médio</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
