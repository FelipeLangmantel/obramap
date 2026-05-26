import { useMemo, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format, parseISO } from "date-fns";
import { useContractWeights } from "@/hooks/useContractWeights";
import type { Macro } from "@/data/constructionData";

interface DiaryItem {
  id: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_id?: string;
  scope_name: string;
  house_ids: number[];
  percentual_executado: number;
}

interface Props {
  items: DiaryItem[];
  totalCasas: number;
  /** Project id — necessário para calcular % do contrato. */
  projectId?: string | null;
  /** Data do RDO (YYYY-MM-DD) — usada para somar a semana corrente. */
  entryDate?: string;
  macrosTemplate?: Macro[];
}

export function RdoProductionCharts({ items, totalCasas, projectId, entryDate, macrosTemplate = [] }: Props) {
  const { unitValueByScope, contractTotalValue } = useContractWeights(projectId);
  const [weekItems, setWeekItems] = useState<DiaryItem[]>([]);

  // Carrega lançamentos acumulados da semana: segunda-feira até a data do RDO.
  useEffect(() => {
    if (!projectId || !entryDate) {
      setWeekItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const ref = parseISO(entryDate);
      const wkStart = format(startOfWeek(ref, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const wkEnd = format(ref, "yyyy-MM-dd");
      // Busca diary_entries dessa semana e seus diary_items
      const { data: entries } = await (supabase as any)
        .from("diary_entries")
        .select("id")
        .eq("project_id", projectId)
        .gte("entry_date", wkStart)
        .lte("entry_date", wkEnd);
      const ids = (entries || []).map((e: any) => e.id);
      if (ids.length === 0) {
        if (!cancelled) setWeekItems([]);
        return;
      }
      const { data: di } = await (supabase as any)
        .from("diary_items")
        .select("id, macro_id, macro_name, macro_color, scope_id, scope_name, house_ids, percentual_executado")
        .in("diary_entry_id", ids)
        .is("deleted_at", null);
      if (!cancelled) {
        setWeekItems((di || []).map((d: any) => ({
          ...d,
          percentual_executado: Number(d.percentual_executado || 0),
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, entryDate, items.length]);

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

  const physicalWeightByScope = useMemo(() => {
    const weightByScopedKey = new Map<string, number>();
    const weightByScopeId = new Map<string, number>();
    macrosTemplate.forEach((macro) => {
      macro.scopes?.forEach((scope) => {
        const weight = Number(scope.weight) || 0;
        weightByScopedKey.set(`${macro.id}::${scope.id}`, weight);
        weightByScopeId.set(scope.id, weight);
      });
    });
    return { weightByScopedKey, weightByScopeId };
  }, [macrosTemplate]);

  const totalPhysicalWeight = useMemo(
    () => macrosTemplate.reduce((sum, macro) =>
      sum + (macro.scopes || []).reduce((scopeSum, scope) => scopeSum + (Number(scope.weight) || 0), 0), 0),
    [macrosTemplate]
  );

  const computePhysicalPct = useCallback((list: DiaryItem[]) => {
    if (!totalCasas || totalCasas <= 0 || totalPhysicalWeight <= 0) return null;
    let weighted = 0;
    for (const it of list) {
      const weight = physicalWeightByScope.weightByScopedKey.get(`${it.macro_id}::${it.scope_id}`)
        ?? (it.scope_id ? physicalWeightByScope.weightByScopeId.get(it.scope_id) : undefined)
        ?? 0;
      if (!weight) continue;
      const casas = it.house_ids?.length || 0;
      const pct = Math.min(100, Math.max(0, it.percentual_executado || 0)) / 100;
      weighted += weight * casas * pct;
    }
    return (weighted / (totalPhysicalWeight * totalCasas)) * 100;
  }, [physicalWeightByScope, totalCasas, totalPhysicalWeight]);

  const pctFisicoHoje = useMemo(() => computePhysicalPct(items), [computePhysicalPct, items]);
  const pctFisicoSemana = useMemo(() => computePhysicalPct(weekItems), [computePhysicalPct, weekItems]);

  // ─── % do contrato lançado HOJE e ACUMULADO NA SEMANA ───
  const { pctContratoHoje, pctContratoSemana, semPesoCount, totalLancHoje } = useMemo(() => {
    let semPeso = 0;
    let totalHoje = 0;
    const computeContractPct = (list: DiaryItem[], countMissing: boolean) => {
      if (!contractTotalValue || contractTotalValue <= 0) return null;
      let valor = 0;
      for (const it of list) {
        const unitValue = it.scope_id ? (unitValueByScope.get(it.scope_id) || 0) : 0;
        if (countMissing) {
          totalHoje += 1;
          if (!unitValue) semPeso += 1;
        }
        if (!unitValue) continue;
        const casas = it.house_ids?.length || 0;
        const pct = Math.min(100, Math.max(0, it.percentual_executado || 0)) / 100;
        valor += unitValue * casas * pct;
      }
      return (valor / contractTotalValue) * 100;
    };
    const hoje = computeContractPct(items, true);
    const semana = computeContractPct(weekItems, false);
    return { pctContratoHoje: hoje, pctContratoSemana: semana, semPesoCount: semPeso, totalLancHoje: totalHoje };
  }, [items, weekItems, unitValueByScope, contractTotalValue]);

  const fmtPct = (v: number | null) =>
    v == null ? "—" : v < 0.01 ? "<0,01%" : `${v.toFixed(2)}%`;

  const semContrato = !contractTotalValue || contractTotalValue <= 0;

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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[10px] uppercase text-muted-foreground">Lançamentos</p>
            <p className="text-2xl font-bold">{totalLancamentos}</p>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-[10px] uppercase text-muted-foreground">Casas atendidas</p>
            <p className="text-2xl font-bold">
              {totalCasasAtendidas}<span className="text-sm text-muted-foreground">/{totalCasas}</span>
            </p>
          </div>
          <div
            className="rounded-lg border p-3 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300/60"
            title="Avanco fisico lancado hoje, calculado pelos pesos da EAP e casas executadas"
          >
            <p className="text-[10px] uppercase text-indigo-700 dark:text-indigo-300">% Físico EAP (hoje)</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
              {fmtPct(pctFisicoHoje)}
            </p>
          </div>
          <div
            className="rounded-lg border p-3 bg-cyan-50 dark:bg-cyan-950/30 border-cyan-300/60"
            title="Avanco fisico acumulado de segunda-feira ate a data do RDO, calculado pelos pesos da EAP e casas executadas"
          >
            <p className="text-[10px] uppercase text-cyan-700 dark:text-cyan-300">% Físico EAP (semana)</p>
            <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300 tabular-nums">
              {fmtPct(pctFisicoSemana)}
            </p>
          </div>
          <div
            className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-300/60"
            title="Soma do valor financeiro lançado hoje (peso PLE × casas × %) ÷ Valor total do contrato"
          >
            <p className="text-[10px] uppercase text-blue-700 dark:text-blue-300">% Financeiro PLE (hoje)</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
              {fmtPct(pctContratoHoje)}
            </p>
          </div>
          <div
            className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300/60"
            title="Acumulado de segunda-feira ate a data do RDO em % do contrato"
          >
            <p className="text-[10px] uppercase text-emerald-700 dark:text-emerald-300">% Financeiro PLE (semana)</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {fmtPct(pctContratoSemana)}
            </p>
          </div>
        </div>

        {(semContrato || (semPesoCount > 0 && totalLancHoje > 0)) && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
            {semContrato ? (
              <>⚠️ Valor total do contrato não definido. Preencha em <strong>Contrato da Obra</strong> para habilitar o % do contrato.</>
            ) : (
              <>⚠️ {semPesoCount} de {totalLancHoje} serviço(s) lançado(s) hoje sem valor unitário no contrato (PLE) — não entram no cálculo. Ajuste em <strong>Contrato da Obra</strong>.</>
            )}
          </div>
        )}

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
