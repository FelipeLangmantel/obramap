import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Target,
  Layers,
  Clock,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GanttService } from './hooks/useStrategicGanttData';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface PlanningDashboardProps {
  stages: any[];
  teams: any[];
  ganttServices: GanttService[];
  overallProgress: number;
  projectedEndDate: Date | null;
  expectedEndDate: string;
  totalUnits: number;
  unresolvedAlerts: any[];
}

export function PlanningDashboard({
  stages,
  teams,
  ganttServices,
  overallProgress,
  projectedEndDate,
  expectedEndDate,
  totalUnits,
  unresolvedAlerts,
}: PlanningDashboardProps) {
  // Delay analysis
  const delayInfo = useMemo(() => {
    if (!projectedEndDate || !expectedEndDate) return null;
    const expected = new Date(expectedEndDate);
    const diff = differenceInCalendarDays(projectedEndDate, expected);
    return {
      days: diff,
      isDelayed: diff > 0,
      isAhead: diff < 0,
    };
  }, [projectedEndDate, expectedEndDate]);

  const projectionSourceLabel = useMemo(() => {
    if (!ganttServices.length) return 'Sem pacotes';
    if (ganttServices.some((service) => service.schedule_source === 'macroflow')) return 'Fonte: Macrofluxo';
    if (ganttServices.some((service) => service.has_explicit_predecessor)) return 'Fonte: predecessoras definidas';
    if (ganttServices.some((service) => service.schedule_source === 'official_productivity')) {
      return 'Fonte: estimativa por produtividade oficial';
    }
    if (ganttServices.some((service) => service.schedule_source === 'legacy_fallback')) {
      return 'Fonte: fallback legado';
    }
    return 'Sem macrofluxo definido';
  }, [ganttServices]);

  // Service progress data for chart
  const serviceProgressData = useMemo(() => {
    return ganttServices.map((s) => ({
      name: s.name.length > 25 ? s.name.substring(0, 25) + '…' : s.name,
      fullName: s.name,
      completed: s.completion_percent,
      remaining: 100 - s.completion_percent,
      color: s.color,
      executed: s.executed_houses,
      total: s.total_houses,
    }));
  }, [ganttServices]);

  // Restrictions: services without predecessor, bottlenecks, critical path
  const restrictions = useMemo(() => {
    const items: { type: 'critical' | 'warning' | 'info'; title: string; description: string }[] = [];

    // Services with 0 productivity
    ganttServices.forEach((s) => {
      if (s.productivity <= 0) {
        items.push({
          type: 'critical',
          title: `Sem produtividade: ${s.name}`,
          description: 'Configure a produtividade para calcular duração corretamente.',
        });
      }
    });

    // Sequential bottleneck: services that block many others
    const dependencyCount = new Map<string, number>();
    ganttServices.forEach((s) => {
      if (s.depends_on) {
        dependencyCount.set(s.depends_on, (dependencyCount.get(s.depends_on) || 0) + 1);
      }
    });

    dependencyCount.forEach((count, stageId) => {
      if (count >= 2) {
        const blocker = ganttServices.find((s) => s.stage_id === stageId);
        if (blocker) {
          items.push({
            type: 'warning',
            title: `Gargalo: ${blocker.name}`,
            description: `Esta atividade bloqueia ${count} serviços subsequentes.`,
          });
        }
      }
    });

    // Services with long duration
    ganttServices.forEach((s) => {
      if (s.duration_days > 60) {
        items.push({
          type: 'warning',
          title: `Duração elevada: ${s.name}`,
          description: `${s.duration_days} dias — considere aumentar equipes ou produtividade.`,
        });
      }
    });

    // Delay alert
    if (delayInfo?.isDelayed) {
      items.push({
        type: 'critical',
        title: `Atraso projetado de ${delayInfo.days} dias`,
        description: 'A data de término projetada ultrapassa a data prevista.',
      });
    }

    // No services configured
    if (ganttServices.length === 0) {
      items.push({
        type: 'info',
        title: 'Nenhum serviço no planejamento',
        description: 'Configure o planejamento estratégico para gerar o cronograma.',
      });
    }

    return items;
  }, [ganttServices, delayInfo]);

  // Top critical services (lowest progress, highest remaining)
  const criticalServices = useMemo(() => {
    return [...ganttServices]
      .filter((s) => s.remaining_houses > 0)
      .sort((a, b) => a.completion_percent - b.completion_percent)
      .slice(0, 5);
  }, [ganttServices]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Progresso Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallProgress.toFixed(1)}%</div>
            <Progress value={overallProgress} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Serviços / Equipes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ganttServices.length}</div>
            <p className="text-xs text-muted-foreground">
              {teams.length} equipes ativas • {totalUnits} unidades
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Término Projetado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projectedEndDate
                ? format(projectedEndDate, 'dd/MM/yyyy', { locale: ptBR })
                : '-'}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {delayInfo ? (
                delayInfo.isDelayed ? (
                  <Badge variant="destructive" className="text-xs">
                    +{delayInfo.days} dias de atraso
                  </Badge>
                ) : delayInfo.isAhead ? (
                  <Badge className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">
                    {Math.abs(delayInfo.days)} dias adiantado
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">No prazo</Badge>
                )
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{projectionSourceLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Restrições
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {restrictions.filter((r) => r.type === 'critical').length + unresolvedAlerts.filter((a) => a.severity === 'critical').length}
            </div>
            <p className="text-xs text-muted-foreground">
              {restrictions.filter((r) => r.type === 'warning').length} avisos •{' '}
              {unresolvedAlerts.length} alertas
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Progress Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              % Acompanhamento por Serviço
            </CardTitle>
          </CardHeader>
          <CardContent>
            {serviceProgressData.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">
                Nenhum serviço configurado.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, serviceProgressData.length * 36)}>
                <BarChart data={serviceProgressData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    fontSize={11}
                    tick={{ fill: 'hsl(var(--foreground))' }}
                  />
                  <Tooltip
                    formatter={(value: number, _name: string, props: any) => [
                      `${value.toFixed(1)}% (${props.payload.executed}/${props.payload.total} un)`,
                      'Executado',
                    ]}
                    labelFormatter={(label: string, payload: any) =>
                      payload?.[0]?.payload?.fullName || label
                    }
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="completed" stackId="a" radius={[0, 4, 4, 0]} barSize={20}>
                    {serviceProgressData.map((entry, index) => (
                      <Cell key={index} fill={entry.color !== '#6b7280' ? entry.color : 'hsl(var(--primary))'} />
                    ))}
                  </Bar>
                  <Bar dataKey="remaining" stackId="a" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Restrictions Panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Principais Restrições
            </CardTitle>
          </CardHeader>
          <CardContent>
            {restrictions.length === 0 && unresolvedAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm text-muted-foreground">Nenhuma restrição identificada</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {restrictions.map((item, i) => (
                  <div
                    key={`r-${i}`}
                    className={`p-3 rounded-lg border text-sm ${
                      item.type === 'critical'
                        ? 'border-destructive/50 bg-destructive/5'
                        : item.type === 'warning'
                        ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/10'
                        : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {item.type === 'critical' ? (
                        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      ) : item.type === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Unresolved alerts from planning system */}
                {unresolvedAlerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border text-sm ${
                      alert.severity === 'critical'
                        ? 'border-destructive/50 bg-destructive/5'
                        : 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/10'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">{alert.title}</p>
                        <p className="text-xs text-muted-foreground">{alert.description}</p>
                        {alert.impact_days && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            +{alert.impact_days} dias
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Critical Services - lowest progress */}
      {criticalServices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Serviços com Menor Avanço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {criticalServices.map((svc) => (
                <div key={svc.id} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: svc.color !== '#6b7280' ? svc.color : 'hsl(var(--primary))' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate">{svc.name}</p>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                        {svc.executed_houses}/{svc.total_houses} un ({svc.completion_percent.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress value={svc.completion_percent} className="h-1.5" />
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                    {svc.duration_days}d restantes
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
