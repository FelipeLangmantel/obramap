import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CalendarClock, FileText, Printer, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project } from '@/contexts/ConstructionContext';
import type { PlanningOfficialViewResult } from './hooks/usePlanningOfficialView';
import {
  usePlanningCapacityModel,
  type CapacityDiagnosticStatus,
} from './hooks/usePlanningCapacityModel';
import {
  usePlanningForecast,
  type ForecastStatus,
  type RecommendedActionSeverity,
  type StageForecastStatus,
  type TeamRequirementStatus,
} from './hooks/usePlanningForecast';

interface PlanningForecastViewProps {
  project: Project;
  companyName?: string | null;
  officialView: PlanningOfficialViewResult;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return isValid(date) ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : 'Sem data';
};

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return isValid(date) ? format(date, 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Sem data';
};

const formatNumber = (value: number | null | undefined, digits = 0) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '-';

const formatPercent = (value: number | null | undefined) =>
  `${formatNumber(value, 1)}%`;

const statusLabel = (status: ForecastStatus) => {
  const labels: Record<ForecastStatus, string> = {
    on_track: 'No prazo',
    attention: 'Atencao',
    delayed: 'Atrasado',
    insufficient_data: 'Dados insuficientes',
  };
  return labels[status];
};

const statusVariant = (status: ForecastStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'delayed') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'on_track') return 'default';
  return 'outline';
};

const teamStatusLabel = (status: TeamRequirementStatus) => {
  const labels: Record<TeamRequirementStatus, string> = {
    ok: 'OK',
    overloaded: 'Sobrecarga',
    missing_productivity: 'Sem produtividade',
  };
  return labels[status];
};

const capacityStatusLabel = (status: CapacityDiagnosticStatus) => {
  const labels: Record<CapacityDiagnosticStatus, string> = {
    ok: 'OK',
    attention: 'Atencao',
    overloaded: 'Sobrecarga',
    missing_productivity: 'Sem produtividade',
  };
  return labels[status];
};

const capacityStatusVariant = (status: CapacityDiagnosticStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'overloaded') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
};

const stageStatusLabel = (status: StageForecastStatus) => {
  const labels: Record<StageForecastStatus, string> = {
    ok: 'OK',
    attention: 'Atencao',
    delayed: 'Atrasada',
    missing_data: 'Dados incompletos',
  };
  return labels[status];
};

const stageStatusVariant = (status: StageForecastStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'delayed') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
};

const actionSeverityVariant = (severity: RecommendedActionSeverity): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'secondary';
  return 'outline';
};

const actionSeverityLabel = (severity: RecommendedActionSeverity) => {
  const labels: Record<RecommendedActionSeverity, string> = {
    critical: 'Critico',
    warning: 'Atencao',
    info: 'Informativo',
  };
  return labels[severity];
};

const getTopRisksText = (items: { service: string }[]) => {
  const services = items.slice(0, 3).map((item) => item.service);
  return services.length ? services.join(', ') : 'sem riscos criticos identificados';
};

const getConfidence = (missingProductivityCount: number, totalServices: number, missingDateCount: number) => {
  if (totalServices <= 0) {
    return {
      label: 'Baixa',
      reason: 'Nao ha pacotes suficientes para estimar a previsao.',
      variant: 'outline' as const,
    };
  }

  const missingRatio = missingProductivityCount / Math.max(totalServices, 1);
  if (missingRatio <= 0.1 && missingDateCount <= 2) {
    return {
      label: 'Alta',
      reason: 'Poucos servicos sem produtividade e datas suficientes para leitura executiva.',
      variant: 'default' as const,
    };
  }

  if (missingRatio <= 0.3) {
    return {
      label: 'Media',
      reason: `${missingProductivityCount} servico(s) sem produtividade ou datas incompletas.`,
      variant: 'secondary' as const,
    };
  }

  return {
    label: 'Baixa',
    reason: `${missingProductivityCount} servico(s) sem produtividade reduzem a confiabilidade da previsao.`,
    variant: 'destructive' as const,
  };
};

const getRecommendedAction = (reason: string, fallback: string) => {
  const normalized = reason.toLowerCase();
  if (normalized.includes('sem produtividade')) return 'Cadastrar produtividade do servico.';
  if (normalized.includes('equipe') || normalized.includes('capacidade')) return 'Avaliar reforco de equipe ou reduzir a meta do periodo.';
  if (normalized.includes('saldo')) return 'Reprogramar saldo pendente no proximo periodo.';
  if (normalized.includes('atras')) return 'Criar plano de recuperacao.';
  if (normalized.includes('dados')) return 'Revisar planejamento e datas do servico.';
  return fallback || 'Revisar produtividade, equipe e sequencia do servico.';
};

export function PlanningForecastView({ project, companyName, officialView }: PlanningForecastViewProps) {
  const forecast = usePlanningForecast(project.id, officialView, project);
  const capacityModel = usePlanningCapacityModel(project.id);
  const {
    forecastSummary,
    serviceForecasts,
    teamRequirements,
    criticalItems,
    stageForecasts,
    laborDemandByPeriod,
    progressCurve,
    recommendedActions,
    deviations,
    loading,
  } = forecast;

  const missingProductivity = serviceForecasts.filter((item) => item.remainingQuantity > 0 && !item.productivityValue);
  const overloadedTeams = teamRequirements.filter((item) => item.status === 'overloaded');
  const sharedCapacityOverloads = capacityModel.overloadDiagnostics.filter((item) => item.status === 'overloaded');
  const activeCapacityGroups = capacityModel.workGroups.filter((group) => group.active);
  const capacityGroupsWithServices = activeCapacityGroups.filter((group) => group.services.length > 0);
  const missingDateCount = serviceForecasts.filter((item) => item.remainingQuantity > 0 && !item.estimatedFinishDate).length;
  const confidence = getConfidence(forecastSummary.missingProductivityCount, forecastSummary.totalServices, missingDateCount);
  const generatedAt = new Date();
  const totalLabor = laborDemandByPeriod.reduce(
    (acc, period) => ({
      teams: acc.teams + period.totalTeams,
      professionals: acc.professionals + period.totalProfessionals,
      helpers: acc.helpers + period.totalHelpers,
      people: acc.people + period.totalPeople,
      overloaded: acc.overloaded + period.overloadedServicesCount,
      missingProductivity: acc.missingProductivity + period.missingProductivityCount,
    }),
    { teams: 0, professionals: 0, helpers: 0, people: 0, overloaded: 0, missingProductivity: 0 },
  );
  const criticalStagesText = stageForecasts
    .filter((stage) => stage.status === 'delayed' || stage.status === 'missing_data')
    .slice(0, 3)
    .map((stage) => stage.macroName)
    .join(', ') || 'sem etapas criticas identificadas';
  const delayText = forecastSummary.delayDays === null
    ? 'estimada sem base completa'
    : `${forecastSummary.delayDays} dia(s)`;
  const printReport = () => window.print();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Montando previsao de equipes e prazo...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 planning-forecast-page">
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 12mm;
            }

            body {
              background: #fff !important;
              color: #111827 !important;
            }

            body * {
              visibility: hidden !important;
            }

            #planning-executive-report,
            #planning-executive-report * {
              visibility: visible !important;
            }

            #planning-executive-report {
              position: absolute !important;
              inset: 0 auto auto 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              color: #111827 !important;
              box-shadow: none !important;
              border: 0 !important;
            }

            .print-section {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .print-table {
              width: 100% !important;
              border-collapse: collapse !important;
              font-size: 10px !important;
            }

            .print-table th,
            .print-table td {
              border: 1px solid #d1d5db !important;
              padding: 5px 6px !important;
              vertical-align: top !important;
            }

            .print-table th {
              background: #f3f4f6 !important;
              font-weight: 700 !important;
            }

            .print-muted {
              color: #4b5563 !important;
            }

            .print-card {
              border: 1px solid #d1d5db !important;
              background: #fff !important;
              break-inside: avoid;
            }

            .print-footer {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              font-size: 9px;
              color: #6b7280;
              border-top: 1px solid #d1d5db;
              padding-top: 4px;
            }
          }
        `}
      </style>

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Previsao e Equipes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Visao somente leitura para prazo, capacidade e relatorio executivo. Nao salva dados e nao altera o planejamento oficial.
            </p>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={printReport}>
            <Printer className="h-4 w-4" />
            Imprimir relatorio
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
            {[
              ['Progresso planejado', formatPercent(forecastSummary.plannedProgress)],
              ['Progresso realizado', formatPercent(forecastSummary.realProgress)],
              ['Desvio', formatPercent(forecastSummary.realProgress - forecastSummary.plannedProgress)],
              ['Previsao de termino', formatDate(forecastSummary.estimatedFinishDate)],
              ['Atraso/adiantamento', delayText],
              ['Sem produtividade', forecastSummary.missingProductivityCount],
              ['Equipes com sobrecarga', overloadedTeams.length],
              ['Confiabilidade', confidence.label],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />
            Previsao estimada com base nas produtividades cadastradas. Servicos sem produtividade reduzem a confiabilidade.
            Frentes compartilhadas ainda estao em diagnostico e nao unem lancamentos de producao, diario, desvios ou Mapa 3D.
          </div>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Diagnostico de capacidade por frente
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Este diagnostico ainda nao altera Gantt, Linha de Balanco, Planejamento Semanal, Producao ou Diario. Ele apenas calcula capacidade.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            {[
              ['Frentes', capacityModel.summary.totalWorkGroups],
              ['Frentes ativas', capacityModel.summary.activeWorkGroups],
              ['Servicos com frente', capacityModel.summary.servicesWithWorkGroup],
              ['Servicos sem frente', capacityModel.summary.servicesWithoutWorkGroup],
              ['Sem capacidade', capacityModel.summary.servicesWithoutCapacity],
              ['Sobrecargas', capacityModel.summary.overloadedPeriods],
              ['Pessoas planejadas', capacityModel.summary.totalPeoplePlanned],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{formatNumber(Number(value))}</p>
              </div>
            ))}
          </div>

          {capacityModel.diagnostics.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Algumas fontes de capacidade nao puderam ser lidas agora. O diagnostico segue com fallback seguro.
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Frente</th>
                    <th className="p-2">Capacidade semanal</th>
                    <th className="p-2">Equipes</th>
                    <th className="p-2">Pessoas</th>
                    <th className="p-2">Servicos vinculados</th>
                  </tr>
                </thead>
                <tbody>
                  {capacityGroupsWithServices.slice(0, 8).map((group) => {
                    const groupCapacity = capacityModel.serviceCapacityMap.find((entry) => entry.groupId === group.id);
                    return (
                      <tr key={group.id} className="border-b last:border-0">
                        <td className="p-2 font-medium">{group.name}</td>
                        <td className="p-2">
                          {groupCapacity?.weeklyCapacity === null || groupCapacity?.weeklyCapacity === undefined
                            ? 'Sem produtividade'
                            : `${formatNumber(groupCapacity.weeklyCapacity, 1)} ${group.productivityUnit || group.baseUnit || ''}/semana`}
                        </td>
                        <td className="p-2">{group.simultaneousTeamCount}</td>
                        <td className="p-2">{group.totalPeople}</td>
                        <td className="p-2">
                          {group.services.slice(0, 4).map((service) => service.serviceName || service.scopeId || 'Servico').join(', ')}
                          {group.services.length > 4 ? ` +${group.services.length - 4}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                  {capacityGroupsWithServices.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        Nenhuma frente ativa com servicos vinculados para diagnosticar capacidade compartilhada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Periodo</th>
                    <th className="p-2">Frente</th>
                    <th className="p-2">Demanda</th>
                    <th className="p-2">Capacidade</th>
                    <th className="p-2">Sobrecarga</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Servicos competindo</th>
                  </tr>
                </thead>
                <tbody>
                  {capacityModel.overloadDiagnostics.slice(0, 10).map((item) => (
                    <tr key={`${item.periodLabel}-${item.groupId ?? item.groupName}`} className="border-b last:border-0">
                      <td className="p-2">{item.periodLabel}</td>
                      <td className="p-2">{item.groupName}</td>
                      <td className="p-2">{formatNumber(item.plannedQuantity, 1)}</td>
                      <td className="p-2">{item.availableCapacity === null ? '-' : formatNumber(item.availableCapacity, 1)}</td>
                      <td className="p-2">
                        {item.overloadQuantity > 0
                          ? `${formatNumber(item.overloadQuantity, 1)} (${formatNumber(item.overloadPercent, 1)}%)`
                          : '-'}
                      </td>
                      <td className="p-2">
                        <Badge variant={capacityStatusVariant(item.status)}>
                          {capacityStatusLabel(item.status)}
                        </Badge>
                      </td>
                      <td className="p-2">{item.servicesCompetingForSameGroup.slice(0, 3).join(', ') || '-'}</td>
                    </tr>
                  ))}
                  {capacityModel.overloadDiagnostics.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                        Nenhuma meta semanal vinculada a frente compartilhada foi encontrada para calcular sobrecarga.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {sharedCapacityOverloads.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {sharedCapacityOverloads.length} periodo(s) com sobrecarga em frentes compartilhadas. A leitura e somente diagnostica e nao bloqueia o Planejamento Semanal.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Resumo por etapa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Etapa</th>
                  <th className="p-2">Servicos</th>
                  <th className="p-2">Planejado</th>
                  <th className="p-2">Realizado</th>
                  <th className="p-2">Saldo</th>
                  <th className="p-2">Desvio</th>
                  <th className="p-2">Criticos</th>
                  <th className="p-2">Sem produtividade</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {stageForecasts.slice(0, 14).map((stage) => (
                  <tr key={stage.macroId} className="border-b last:border-0">
                    <td className="p-2 font-medium">{stage.macroName}</td>
                    <td className="p-2">{stage.servicesCount}</td>
                    <td className="p-2">{formatNumber(stage.plannedQuantity)}</td>
                    <td className="p-2">{formatNumber(stage.realizedQuantity)}</td>
                    <td className="p-2">{formatNumber(stage.remainingQuantity)}</td>
                    <td className="p-2">{formatPercent(stage.deviation)}</td>
                    <td className="p-2">{stage.criticalServicesCount}</td>
                    <td className="p-2">{stage.missingProductivityCount}</td>
                    <td className="p-2">
                      <Badge variant={stageStatusVariant(stage.status)}>
                        {stageStatusLabel(stage.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {stageForecasts.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-muted-foreground" colSpan={9}>
                      Ainda nao ha etapas suficientes para montar o resumo executivo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Mao de obra prevista
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                ['Equipes', totalLabor.teams],
                ['Profissionais', totalLabor.professionals],
                ['Auxiliares', totalLabor.helpers],
                ['Total pessoas', totalLabor.people],
                ['Sobrecargas', totalLabor.overloaded],
                ['Sem produtividade', totalLabor.missingProductivity],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{formatNumber(Number(value))}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Periodo</th>
                    <th className="p-2">Equipes</th>
                    <th className="p-2">Profissionais</th>
                    <th className="p-2">Auxiliares</th>
                    <th className="p-2">Total pessoas</th>
                    <th className="p-2">Sobrecargas</th>
                    <th className="p-2">Sem produtividade</th>
                  </tr>
                </thead>
                <tbody>
                  {laborDemandByPeriod.slice(0, 10).map((period) => (
                    <tr key={period.periodLabel} className="border-b last:border-0">
                      <td className="p-2">{period.periodLabel}</td>
                      <td className="p-2">{formatNumber(period.totalTeams)}</td>
                      <td className="p-2">{formatNumber(period.totalProfessionals)}</td>
                      <td className="p-2">{formatNumber(period.totalHelpers)}</td>
                      <td className="p-2">{formatNumber(period.totalPeople)}</td>
                      <td className="p-2">{period.overloadedServicesCount}</td>
                      <td className="p-2">{period.missingProductivityCount}</td>
                    </tr>
                  ))}
                  {laborDemandByPeriod.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                        Nenhuma meta semanal ou periodo com equipe suficiente para montar mao de obra prevista.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Curva planejado x realizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Data/periodo</th>
                    <th className="p-2">Planejado</th>
                    <th className="p-2">Realizado</th>
                    <th className="p-2">Desvio</th>
                    <th className="p-2">Base</th>
                  </tr>
                </thead>
                <tbody>
                  {progressCurve.slice(0, 12).map((point) => (
                    <tr key={point.dateLabel} className="border-b last:border-0">
                      <td className="p-2">{point.dateLabel}</td>
                      <td className="p-2">{formatPercent(point.plannedProgress)}</td>
                      <td className="p-2">{formatPercent(point.realProgress)}</td>
                      <td className="p-2">{formatPercent(point.deviation)}</td>
                      <td className="p-2">{point.estimated ? 'Estimado' : 'Planejado'}</td>
                    </tr>
                  ))}
                  {progressCurve.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        Nao ha datas suficientes para montar uma curva historica confiavel.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Plano de acao recomendado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recommendedActions.map((action) => (
              <div key={action.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{action.title}</p>
                  <Badge variant={actionSeverityVariant(action.severity)}>
                    {actionSeverityLabel(action.severity)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>
                {(action.relatedStage || action.relatedService) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[action.relatedStage, action.relatedService].filter(Boolean).join(' / ')}
                  </p>
                )}
              </div>
            ))}
            {recommendedActions.length === 0 && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Nenhuma acao recomendada foi gerada com os dados atuais.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Servicos criticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Etapa</th>
                    <th className="p-2">Servico</th>
                    <th className="p-2">Saldo</th>
                    <th className="p-2">Produtividade</th>
                    <th className="p-2">Equipe</th>
                    <th className="p-2">Duracao</th>
                    <th className="p-2">Risco</th>
                    <th className="p-2">Acao sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalItems.slice(0, 12).map((item) => {
                    const service = serviceForecasts.find((forecastItem) => `${forecastItem.macroName} / ${forecastItem.scopeName}` === item.service);
                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-2">{service?.macroName || '-'}</td>
                        <td className="p-2">{service?.scopeName || item.service}</td>
                        <td className="p-2">{formatNumber(service?.remainingQuantity)}</td>
                        <td className="p-2">
                          {service?.productivityValue
                            ? `${formatNumber(service.productivityValue, 2)} ${service.productivityUnit}`
                            : 'Sem produtividade'}
                        </td>
                        <td className="p-2">{service ? `${service.teamCount} equipe(s)` : '-'}</td>
                        <td className="p-2">{service?.estimatedDurationDays ?? '-'} dias</td>
                        <td className="p-2">{item.reason}</td>
                        <td className="p-2">{getRecommendedAction(item.reason, item.recommendedAction)}</td>
                      </tr>
                    );
                  })}
                  {criticalItems.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={8}>
                        Nenhum servico critico identificado com os dados atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Necessidade de equipes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Servico</th>
                    <th className="p-2">Meta</th>
                    <th className="p-2">Capacidade atual</th>
                    <th className="p-2">Equipes atuais</th>
                    <th className="p-2">Necessarias</th>
                    <th className="p-2">Diferenca</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRequirements.slice(0, 16).map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-2">{item.scopeName}</td>
                      <td className="p-2">{formatNumber(item.plannedQuantity)}</td>
                      <td className="p-2">{item.capacityWithCurrentTeams === null ? '-' : formatNumber(item.capacityWithCurrentTeams, 1)}</td>
                      <td className="p-2">{item.currentTeams}</td>
                      <td className="p-2">{item.requiredTeams ?? '-'}</td>
                      <td className="p-2">{item.teamGap ?? '-'}</td>
                      <td className="p-2">
                        <Badge variant={item.status === 'overloaded' ? 'destructive' : item.status === 'missing_productivity' ? 'outline' : 'default'}>
                          {teamStatusLabel(item.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {teamRequirements.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                        Nenhuma meta semanal encontrada para calcular necessidade de equipes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Servicos sem produtividade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Etapa</th>
                  <th className="p-2">Servico</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Acao</th>
                </tr>
              </thead>
              <tbody>
                {missingProductivity.slice(0, 20).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-2">{item.macroName}</td>
                    <td className="p-2">{item.scopeName}</td>
                    <td className="p-2">Nao ha produtividade ativa para estimar o saldo.</td>
                    <td className="p-2">
                      <Button type="button" variant="outline" size="sm" disabled>
                        Cadastrar produtividade
                      </Button>
                    </td>
                  </tr>
                ))}
                {missingProductivity.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                      Todos os servicos com saldo possuem produtividade para esta previsao.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="print:shadow-none print:border-0 print-card" id="planning-executive-report">
        <CardContent className="space-y-6 p-6">
          <section className="print-section border-b pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground print-muted">ObraMap</p>
                <h1 className="mt-1 text-2xl font-bold">Relatorio Executivo de Planejamento e Previsao de Termino</h1>
                <p className="mt-2 text-sm text-muted-foreground print-muted">
                  Relatorio tecnico gerado automaticamente a partir dos dados disponiveis no Planejamento Inteligente.
                </p>
              </div>
              <Badge variant={statusVariant(forecastSummary.status)} className="w-fit">
                Situacao: {statusLabel(forecastSummary.status)}
              </Badge>
            </div>

            <div className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div><strong>Obra:</strong> {project.name}</div>
              <div><strong>Localizacao:</strong> {[project.location, project.municipio, project.estado].filter(Boolean).join(' / ') || 'Nao informado'}</div>
              <div><strong>Unidades/casas:</strong> {project.totalHouses || 'Nao informado'}</div>
              <div><strong>Empresa:</strong> {companyName || 'Nao informada'}</div>
              <div><strong>Data-base:</strong> {formatDate(new Date().toISOString())}</div>
              <div><strong>Emissao:</strong> {formatDateTime(generatedAt)}</div>
              <div><strong>Prazo planejado:</strong> {formatDate(forecastSummary.currentPlannedFinishDate)}</div>
              <div><strong>Previsao atual:</strong> {formatDate(forecastSummary.estimatedFinishDate)}</div>
            </div>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">1. Resumo executivo</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              {[
                ['Progresso planejado', formatPercent(forecastSummary.plannedProgress)],
                ['Progresso realizado', formatPercent(forecastSummary.realProgress)],
                ['Desvio', formatPercent(forecastSummary.realProgress - forecastSummary.plannedProgress)],
                ['Previsao de termino', formatDate(forecastSummary.estimatedFinishDate)],
                ['Situacao', statusLabel(forecastSummary.status)],
                ['Servicos criticos', criticalItems.length],
                ['Sem produtividade', forecastSummary.missingProductivityCount],
                ['Confiabilidade', confidence.label],
              ].map(([label, value]) => (
                <div key={String(label)} className="print-card rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground print-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground print-muted">
              Confiabilidade: {confidence.label} - {confidence.reason}
            </p>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">2. Resumo por etapa</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servicos</th>
                  <th>Planejado</th>
                  <th>Realizado</th>
                  <th>Saldo</th>
                  <th>Desvio</th>
                  <th>Criticos</th>
                  <th>Sem prod.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stageForecasts.slice(0, 10).map((stage) => (
                  <tr key={stage.macroId}>
                    <td>{stage.macroName}</td>
                    <td>{stage.servicesCount}</td>
                    <td>{formatNumber(stage.plannedQuantity)}</td>
                    <td>{formatNumber(stage.realizedQuantity)}</td>
                    <td>{formatNumber(stage.remainingQuantity)}</td>
                    <td>{formatPercent(stage.deviation)}</td>
                    <td>{stage.criticalServicesCount}</td>
                    <td>{stage.missingProductivityCount}</td>
                    <td>{stageStatusLabel(stage.status)}</td>
                  </tr>
                ))}
                {stageForecasts.length === 0 && (
                  <tr><td colSpan={9}>Nao ha etapas suficientes para o resumo por etapa.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">3. Mao de obra prevista</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Equipes</th>
                  <th>Profissionais</th>
                  <th>Auxiliares</th>
                  <th>Total pessoas</th>
                  <th>Sobrecargas</th>
                  <th>Sem produtividade</th>
                </tr>
              </thead>
              <tbody>
                {laborDemandByPeriod.slice(0, 10).map((period) => (
                  <tr key={period.periodLabel}>
                    <td>{period.periodLabel}</td>
                    <td>{formatNumber(period.totalTeams)}</td>
                    <td>{formatNumber(period.totalProfessionals)}</td>
                    <td>{formatNumber(period.totalHelpers)}</td>
                    <td>{formatNumber(period.totalPeople)}</td>
                    <td>{period.overloadedServicesCount}</td>
                    <td>{period.missingProductivityCount}</td>
                  </tr>
                ))}
                {laborDemandByPeriod.length === 0 && (
                  <tr><td colSpan={7}>Nao ha metas por periodo suficientes para calcular mao de obra prevista.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">4. Curva planejado x realizado</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Data/periodo</th>
                  <th>Planejado</th>
                  <th>Realizado</th>
                  <th>Desvio</th>
                  <th>Base</th>
                </tr>
              </thead>
              <tbody>
                {progressCurve.slice(0, 10).map((point) => (
                  <tr key={point.dateLabel}>
                    <td>{point.dateLabel}</td>
                    <td>{formatPercent(point.plannedProgress)}</td>
                    <td>{formatPercent(point.realProgress)}</td>
                    <td>{formatPercent(point.deviation)}</td>
                    <td>{point.estimated ? 'Estimado' : 'Planejado'}</td>
                  </tr>
                ))}
                {progressCurve.length === 0 && (
                  <tr><td colSpan={5}>Nao ha datas suficientes para gerar curva historica confiavel.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">5. Plano de acao recomendado</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Prioridade</th>
                  <th>Acao</th>
                  <th>Descricao</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {recommendedActions.slice(0, 8).map((action) => (
                  <tr key={action.id}>
                    <td>{actionSeverityLabel(action.severity)}</td>
                    <td>{action.title}</td>
                    <td>{action.description}</td>
                    <td>{[action.relatedStage, action.relatedService].filter(Boolean).join(' / ') || '-'}</td>
                  </tr>
                ))}
                {recommendedActions.length === 0 && (
                  <tr><td colSpan={4}>Nenhuma acao recomendada foi gerada com os dados atuais.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">6. Analise de prazo</h2>
            <p className="mt-2 text-sm text-muted-foreground print-muted">
              Com base nos dados disponiveis ate a data-base, produtividade cadastrada e saldo de servicos pendentes,
              a previsao atual de termino da obra e {formatDate(forecastSummary.estimatedFinishDate)}.
            </p>
            {forecastSummary.delayDays !== null && forecastSummary.delayDays > 0 && (
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                A previsao indica atraso estimado de {forecastSummary.delayDays} dia(s) em relacao ao prazo planejado.
              </p>
            )}
            {forecastSummary.status === 'insufficient_data' && (
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                A previsao possui confiabilidade limitada porque existem servicos sem produtividade cadastrada ou sem datas planejadas suficientes.
              </p>
            )}
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">7. Servicos criticos</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servico</th>
                  <th>Saldo</th>
                  <th>Produtividade</th>
                  <th>Equipe atual</th>
                  <th>Duracao</th>
                  <th>Risco</th>
                  <th>Acao recomendada</th>
                </tr>
              </thead>
              <tbody>
                {criticalItems.slice(0, 10).map((item) => {
                  const service = serviceForecasts.find((forecastItem) => `${forecastItem.macroName} / ${forecastItem.scopeName}` === item.service);
                  return (
                    <tr key={item.id}>
                      <td>{service?.macroName || '-'}</td>
                      <td>{service?.scopeName || item.service}</td>
                      <td>{formatNumber(service?.remainingQuantity)}</td>
                      <td>{service?.productivityValue ? `${formatNumber(service.productivityValue, 2)} ${service.productivityUnit}` : 'Sem produtividade'}</td>
                      <td>{service ? `${service.teamCount} equipe(s)` : '-'}</td>
                      <td>{service?.estimatedDurationDays ?? '-'} dias</td>
                      <td>{item.reason}</td>
                      <td>{getRecommendedAction(item.reason, item.recommendedAction)}</td>
                    </tr>
                  );
                })}
                {criticalItems.length === 0 && (
                  <tr><td colSpan={8}>Nenhum servico critico identificado.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">8. Necessidade de equipes</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servico</th>
                  <th>Meta periodo/semana</th>
                  <th>Capacidade atual</th>
                  <th>Equipes atuais</th>
                  <th>Equipes necessarias</th>
                  <th>Diferenca</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teamRequirements.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td>{item.macroName}</td>
                    <td>{item.scopeName}</td>
                    <td>{formatNumber(item.plannedQuantity)}</td>
                    <td>{item.capacityWithCurrentTeams === null ? '-' : formatNumber(item.capacityWithCurrentTeams, 1)}</td>
                    <td>{item.currentTeams}</td>
                    <td>{item.requiredTeams ?? '-'}</td>
                    <td>{item.teamGap ?? '-'}</td>
                    <td>{teamStatusLabel(item.status)}</td>
                  </tr>
                ))}
                {teamRequirements.length === 0 && (
                  <tr><td colSpan={8}>Nenhuma meta semanal encontrada para calcular necessidade de equipes.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">9. Servicos sem produtividade</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servico</th>
                  <th>Impacto</th>
                  <th>Acao recomendada</th>
                </tr>
              </thead>
              <tbody>
                {missingProductivity.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td>{item.macroName}</td>
                    <td>{item.scopeName}</td>
                    <td>Reduz a confiabilidade da previsao e impede estimar duracao do saldo.</td>
                    <td>Cadastrar produtividade do servico.</td>
                  </tr>
                ))}
                {missingProductivity.length === 0 && (
                  <tr><td colSpan={4}>Nao ha servicos pendentes sem produtividade nesta previsao.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">10. Desvios e justificativas</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Servico/meta</th>
                  <th>Casa/unidade</th>
                  <th>Motivo</th>
                  <th>Data</th>
                  <th>Responsavel</th>
                  <th>Observacoes</th>
                </tr>
              </thead>
              <tbody>
                {deviations.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td>{item.weeklyPlanServiceId || item.plannedProductionId || 'Meta nao identificada'}</td>
                    <td>{[...item.missingHouseIds, ...item.executedHouseIds, ...item.outOfPlanHouseIds].slice(0, 8).join(', ') || '-'}</td>
                    <td>{item.reason || 'Sem motivo informado'}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>Nao informado</td>
                    <td>{item.notes || 'Sem observacoes'}</td>
                  </tr>
                ))}
                {deviations.length === 0 && (
                  <tr><td colSpan={6}>Nao ha desvios registrados para o periodo analisado.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section grid gap-3 md:grid-cols-2">
            <div className="print-card rounded-lg border p-3">
              <h2 className="text-base font-semibold">11. Gantt resumido</h2>
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                O cronograma detalhado encontra-se disponivel na aba Gantt do Planejamento Inteligente.
              </p>
            </div>
            <div className="print-card rounded-lg border p-3">
              <h2 className="text-base font-semibold">12. Linha de Balanco</h2>
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                A Linha de Balanco detalhada encontra-se disponivel na aba Linha de Balanco do Planejamento Inteligente.
              </p>
            </div>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">13. Conclusao tecnica</h2>
            <p className="mt-2 text-sm text-muted-foreground print-muted">
              Com base nos dados disponiveis ate a data-base, a obra apresenta progresso realizado de {formatPercent(forecastSummary.realProgress)}
              frente a {formatPercent(forecastSummary.plannedProgress)} planejado, resultando em desvio de {formatPercent(forecastSummary.realProgress - forecastSummary.plannedProgress)}.
              A previsao estimada de termino e {formatDate(forecastSummary.estimatedFinishDate)} e a situacao geral e {statusLabel(forecastSummary.status).toLowerCase()}.
              Os principais pontos de atencao concentram-se em {criticalStagesText}, com servicos criticos como {getTopRisksText(criticalItems)}.
              Recomenda-se revisar produtividade, reforcar equipes nos servicos com capacidade insuficiente e reprogramar saldos pendentes nos proximos periodos.
              A previsao deve ser interpretada com confiabilidade {confidence.label.toLowerCase()}, pois {confidence.reason.toLowerCase()}
            </p>
          </section>

          <section className="print-section mt-10 grid gap-6 md:grid-cols-2">
            <div className="border-t pt-3 text-sm text-muted-foreground print-muted">
              Responsavel tecnico / assinatura
            </div>
            <div className="border-t pt-3 text-sm text-muted-foreground print-muted">
              Contratante / fiscalizacao
            </div>
          </section>

          <div className="print-footer">
            Relatorio gerado automaticamente pelo ObraMap em {formatDateTime(generatedAt)}.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
