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
import { supabase } from "@/integrations/supabase/client";
import { Users, BarChart3, TrendingUp, Loader2, RefreshCw } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LaborNeed {
  period_id: string;
  period_number: number;
  period_start: string;
  period_end: string;
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  planned_houses: number;
  productivity: number;
  productivity_type: string;
  team_composition: { role: string; quantity: number; unit: string }[];
  duration_days: number;
  total_professionals: number;
  total_helpers: number;
}

interface LaborHistogramViewProps {
  projectId: string;
}

export function LaborHistogramView({ projectId }: LaborHistogramViewProps) {
  const [open, setOpen] = useState(false);
  const [laborNeeds, setLaborNeeds] = useState<LaborNeed[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("calculate_labor_needs", {
      p_project_id: projectId,
    });

    if (!error && data) {
      setLaborNeeds(data as LaborNeed[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  // Group by period
  const chartData = useMemo(() => {
    const grouped: Record<string, {
      period: string;
      periodNumber: number;
      professionals: number;
      helpers: number;
      services: { name: string; houses: number; days: number }[];
    }> = {};

    laborNeeds.forEach((n) => {
      const key = n.period_id;
      if (!grouped[key]) {
        const start = parseISO(n.period_start);
        const end = parseISO(n.period_end);
        grouped[key] = {
          period: `P${n.period_number}\n${format(start, "dd/MM", { locale: ptBR })}`,
          periodNumber: n.period_number,
          professionals: 0,
          helpers: 0,
          services: [],
        };
      }
      grouped[key].professionals += n.total_professionals;
      grouped[key].helpers += n.total_helpers;
      grouped[key].services.push({
        name: `${n.macro_name} - ${n.scope_name}`,
        houses: n.planned_houses,
        days: n.duration_days,
      });
    });

    return Object.values(grouped).sort((a, b) => a.periodNumber - b.periodNumber);
  }, [laborNeeds]);

  // Role breakdown
  const roleBreakdown = useMemo(() => {
    const roles: Record<string, { total: number; unit: string }> = {};
    laborNeeds.forEach((n) => {
      (n.team_composition || []).forEach((t) => {
        if (!roles[t.role]) roles[t.role] = { total: 0, unit: t.unit };
        roles[t.role].total += t.quantity;
      });
    });
    return roles;
  }, [laborNeeds]);

  const totalProfs = chartData.reduce((s, d) => Math.max(s, d.professionals), 0);
  const totalHelpers = chartData.reduce((s, d) => Math.max(s, d.helpers), 0);
  const peakTotal = chartData.reduce((s, d) => Math.max(s, d.professionals + d.helpers), 0);

  const unconfiguredCount = laborNeeds.filter(
    (n) => n.total_professionals === 0 && n.total_helpers === 0
  ).length;

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
              <p className="text-2xl font-bold text-primary">{totalProfs}</p>
              <p className="text-[11px] text-muted-foreground">Pico Profissionais</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{totalHelpers}</p>
              <p className="text-[11px] text-muted-foreground">Pico Auxiliares</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{peakTotal}</p>
              <p className="text-[11px] text-muted-foreground">Pico Total</p>
            </div>
          </div>
          {unconfiguredCount > 0 && (
            <p className="text-[11px] text-amber-600 mt-2 text-center">
              ⚠ {unconfiguredCount} serviço(s) sem produtividade configurada
            </p>
          )}
          <Button variant="outline" size="sm" className="w-full mt-3 text-xs">
            Ver Detalhes
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Histograma de Mão de Obra
                </DialogTitle>
                <DialogDescription>
                  Necessidade de profissionais por período baseado no planejamento estratégico
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum dado de planejamento encontrado.</p>
              <p className="text-xs mt-1">Configure produtividades nos serviços e planeje casas nos períodos.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Chart */}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="period" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-popover border rounded-lg p-3 shadow-lg text-xs">
                            <p className="font-semibold mb-1">{label}</p>
                            {payload.map((p: any) => (
                              <p key={p.name} style={{ color: p.color }}>
                                {p.name}: <strong>{p.value}</strong>
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="professionals"
                      name="Profissionais"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      stackId="stack"
                    />
                    <Bar
                      dataKey="helpers"
                      name="Auxiliares"
                      fill="hsl(var(--primary) / 0.4)"
                      radius={[4, 4, 0, 0]}
                      stackId="stack"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Role breakdown */}
              {Object.keys(roleBreakdown).length > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Detalhamento por Função (acumulado)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(roleBreakdown).map(([role, info]) => (
                      <Badge
                        key={role}
                        variant={info.unit === "profissional" ? "default" : "outline"}
                        className="text-xs"
                      >
                        {role}: {info.total}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Period details */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Detalhamento por Período</h4>
                {chartData.map((period, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{period.period}</span>
                      <div className="flex gap-2">
                        <Badge variant="default" className="text-xs">
                          {period.professionals} prof.
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {period.helpers} aux.
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {period.services.map((svc, i) => (
                        <div key={i} className="flex justify-between text-xs text-muted-foreground">
                          <span>{svc.name}</span>
                          <span>{svc.houses} casas • {svc.days} dias</span>
                        </div>
                      ))}
                    </div>
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
