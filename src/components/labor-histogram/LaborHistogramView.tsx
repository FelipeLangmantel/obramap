import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  BarChart3,
  TrendingUp,
  Loader2,
  RefreshCw,
  AlertTriangle,
  HardHat,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LaborNeedV2 {
  period_id: string;
  period_number: number;
  period_start: string;
  period_end: string;
  period_name: string | null;
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  planned_houses: number;
  team_count: number;
  productivity_value: number | null;
  productivity_unit: string | null;
  team_breakdown: {
    role_name: string;
    role_type: "professional" | "helper";
    qty_per_team: number;
    total: number;
  }[];
  total_professionals: number;
  total_helpers: number;
  has_productivity_config: boolean;
  has_team_composition: boolean;
}

interface LaborHistogramViewProps {
  projectId: string;
}

// Paleta consistente para profissões
const ROLE_PALETTE = [
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 65%, 55%)",
  "hsl(180, 55%, 45%)",
  "hsl(60, 70%, 50%)",
  "hsl(330, 60%, 55%)",
  "hsl(120, 50%, 40%)",
  "hsl(240, 60%, 60%)",
];

function colorForRole(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return ROLE_PALETTE[hash % ROLE_PALETTE.length];
}

export function LaborHistogramView({ projectId }: LaborHistogramViewProps) {
  const [open, setOpen] = useState(false);
  const [laborNeeds, setLaborNeeds] = useState<LaborNeedV2[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("calculate_labor_needs_v2" as any, {
      p_project_id: projectId,
    });
    if (!error && data) setLaborNeeds(data as unknown as LaborNeedV2[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  // Lista de profissões únicas que aparecem (para criar barras dinâmicas)
  const allRoles = useMemo(() => {
    const set = new Set<string>();
    laborNeeds.forEach((n) =>
      (n.team_breakdown || []).forEach((b) => set.add(b.role_name))
    );
    return Array.from(set);
  }, [laborNeeds]);

  // Dados do gráfico empilhado por profissão x período
  const chartData = useMemo(() => {
    const grouped: Record<
      string,
      {
        period: string;
        periodNumber: number;
        professionals: number;
        helpers: number;
        services: { name: string; houses: number; teams: number }[];
        // Uma chave por profissão
        [roleName: string]: any;
      }
    > = {};

    laborNeeds.forEach((n) => {
      const key = n.period_id;
      if (!grouped[key]) {
        const start = parseISO(n.period_start);
        const base: any = {
          period: `M${n.period_number}\n${format(start, "dd/MM", { locale: ptBR })}`,
          periodNumber: n.period_number,
          professionals: 0,
          helpers: 0,
          services: [],
        };
        allRoles.forEach((r) => (base[r] = 0));
        grouped[key] = base;
      }
      grouped[key].professionals += Number(n.total_professionals) || 0;
      grouped[key].helpers += Number(n.total_helpers) || 0;
      grouped[key].services.push({
        name: `${n.macro_name} – ${n.scope_name}`,
        houses: n.planned_houses,
        teams: n.team_count,
      });
      (n.team_breakdown || []).forEach((b) => {
        grouped[key][b.role_name] = (grouped[key][b.role_name] || 0) + b.total;
      });
    });

    return Object.values(grouped).sort((a, b) => a.periodNumber - b.periodNumber);
  }, [laborNeeds, allRoles]);

  // Pico por profissão (maior valor em qualquer período)
  const peakByRole = useMemo(() => {
    const map: Record<string, { name: string; type: "professional" | "helper"; peak: number }> = {};
    laborNeeds.forEach((n) =>
      (n.team_breakdown || []).forEach((b) => {
        if (!map[b.role_name])
          map[b.role_name] = { name: b.role_name, type: b.role_type, peak: 0 };
        // pico = soma do período (não soma global)
      })
    );
    chartData.forEach((d) => {
      Object.keys(map).forEach((name) => {
        const v = Number(d[name]) || 0;
        if (v > map[name].peak) map[name].peak = v;
      });
    });
    return Object.values(map).sort((a, b) => b.peak - a.peak);
  }, [laborNeeds, chartData]);

  // Empty-states
  const totalServices = laborNeeds.length;
  const servicesMissingConfig = laborNeeds.filter((n) => !n.has_productivity_config);
  const servicesMissingTeam = laborNeeds.filter(
    (n) => n.has_productivity_config && !n.has_team_composition
  );

  // KPIs cards
  const peakProfs = chartData.reduce((m, d) => Math.max(m, d.professionals), 0);
  const peakHelpers = chartData.reduce((m, d) => Math.max(m, d.helpers), 0);
  const peakTotal = chartData.reduce(
    (m, d) => Math.max(m, d.professionals + d.helpers),
    0
  );

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow border-primary/20"
        onClick={() => setOpen(true)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Histograma de Mão de Obra
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">{peakProfs}</p>
              <p className="text-[11px] text-muted-foreground">Pico Profissionais</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{peakHelpers}</p>
              <p className="text-[11px] text-muted-foreground">Pico Auxiliares</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{peakTotal}</p>
              <p className="text-[11px] text-muted-foreground">Pico Total</p>
            </div>
          </div>
          {servicesMissingConfig.length > 0 && (
            <p className="text-[11px] text-amber-600 mt-2 text-center">
              ⚠ {servicesMissingConfig.length} serviço(s) sem produtividade configurada
            </p>
          )}
          <Button variant="outline" size="sm" className="w-full mt-3 text-xs">
            Ver Detalhes
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Histograma de Mão de Obra
                </DialogTitle>
                <DialogDescription>
                  Necessidade de profissionais por período, baseado no planejamento e na
                  composição de equipe (Produtividade &amp; Equipes).
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`}
                />
                Atualizar
              </Button>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : totalServices === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum serviço planejado nos períodos.</p>
              <p className="text-xs mt-1">
                Cadastre casas/quantidades nos períodos em <strong>Planejamento</strong> para
                que o histograma apareça.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Alertas de configuração */}
              {(servicesMissingConfig.length > 0 || servicesMissingTeam.length > 0) && (
                <Alert className="border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-900 text-sm">
                    Configuração incompleta — gráfico parcial
                  </AlertTitle>
                  <AlertDescription className="text-xs text-amber-800 space-y-1.5">
                    {servicesMissingConfig.length > 0 && (
                      <div>
                        <p>
                          <strong>{servicesMissingConfig.length}</strong> serviço(s) ainda
                          não têm produtividade configurada:
                        </p>
                        <div className="flex flex-wrap gap-1 pl-3 pt-1">
                          {servicesMissingConfig.slice(0, 8).map((s) => (
                            <Badge
                              key={s.scope_id + s.period_id}
                              variant="outline"
                              className="text-[10px] bg-white"
                            >
                              {s.scope_name}
                            </Badge>
                          ))}
                          {servicesMissingConfig.length > 8 && (
                            <Badge variant="outline" className="text-[10px] bg-white">
                              +{servicesMissingConfig.length - 8}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    {servicesMissingTeam.length > 0 && (
                      <div>
                        <p>
                          <strong>{servicesMissingTeam.length}</strong> serviço(s) com
                          produtividade mas <em>sem composição de equipe detalhada</em> —
                          aparecem no total mas não no gráfico por profissão.
                        </p>
                      </div>
                    )}
                    <p className="pt-1">
                      Vá em <strong>Produtividade &amp; Equipes</strong> e adicione as
                      profissões (Pedreiro, Auxiliar de Pedreiro, Carpinteiro etc.) à
                      composição da equipe de cada serviço.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {/* Gráfico empilhado por profissão */}
              {allRoles.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <HardHat className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>Ainda não há composição de equipe cadastrada para nenhum serviço.</p>
                  <p className="text-xs mt-1">
                    Sem isso, o gráfico fica vazio. Configure as profissões em{" "}
                    <strong>Produtividade &amp; Equipes</strong>.
                  </p>
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="period" className="text-xs" tick={{ fontSize: 11 }} />
                      <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const total = payload.reduce(
                            (s: number, p: any) => s + (Number(p.value) || 0),
                            0
                          );
                          return (
                            <div className="bg-popover border rounded-lg p-3 shadow-lg text-xs max-w-[260px]">
                              <p className="font-semibold mb-1.5">{label}</p>
                              {payload
                                .filter((p: any) => Number(p.value) > 0)
                                .sort((a: any, b: any) => b.value - a.value)
                                .map((p: any) => (
                                  <p key={p.name} style={{ color: p.color }}>
                                    {p.name}: <strong>{p.value}</strong>
                                  </p>
                                ))}
                              <div className="border-t mt-1.5 pt-1 font-semibold">
                                Total: {total}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {allRoles.map((role) => (
                        <Bar
                          key={role}
                          dataKey={role}
                          name={role}
                          stackId="stack"
                          fill={colorForRole(role)}
                          radius={[2, 2, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Pico por profissão */}
              {peakByRole.length > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Pico por profissão (maior simultaneidade)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {peakByRole.map((r) => (
                      <div
                        key={r.name}
                        className="rounded-md border bg-muted/30 p-2 flex items-center gap-2"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: colorForRole(r.name) }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {r.type === "professional" ? "Profissional" : "Auxiliar"}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-sm">{r.peak}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detalhamento por período */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Detalhamento por período</h4>
                {chartData.map((period, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-medium text-sm whitespace-pre-line">
                        {period.period}
                      </span>
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="default" className="text-[10px]">
                          {period.professionals} prof.
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {period.helpers} aux.
                        </Badge>
                        <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                          {period.professionals + period.helpers} total
                        </Badge>
                      </div>
                    </div>
                    {/* Profissões neste período */}
                    {allRoles.filter((r) => Number(period[r]) > 0).length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1 border-t">
                        {allRoles
                          .filter((r) => Number(period[r]) > 0)
                          .map((r) => (
                            <Badge
                              key={r}
                              variant="secondary"
                              className="text-[10px] font-mono"
                              style={{
                                backgroundColor: colorForRole(r) + "22",
                                color: colorForRole(r),
                                borderColor: colorForRole(r) + "55",
                              }}
                            >
                              {r}: {period[r]}
                            </Badge>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
