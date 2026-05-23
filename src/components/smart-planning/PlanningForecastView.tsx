import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CalendarClock, FileText, Printer, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project } from '@/contexts/ConstructionContext';
import type { PlanningOfficialViewResult } from './hooks/usePlanningOfficialView';
import { usePlanningForecast, type ForecastStatus, type TeamRequirementStatus } from './hooks/usePlanningForecast';

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

const formatNumber = (value: number | null | undefined, digits = 0) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '-';

const formatPercent = (value: number | null | undefined) =>
  `${formatNumber(value, 1)}%`;

const statusLabel = (status: ForecastStatus) => {
  const labels: Record<ForecastStatus, string> = {
    on_track: 'No prazo',
    attention: 'Atenção',
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

const getTopRisksText = (items: { service: string }[]) => {
  const services = items.slice(0, 3).map((item) => item.service);
  return services.length ? services.join(', ') : 'sem riscos críticos identificados';
};

export function PlanningForecastView({ project, companyName, officialView }: PlanningForecastViewProps) {
  const forecast = usePlanningForecast(project.id, officialView, project);
  const {
    forecastSummary,
    serviceForecasts,
    teamRequirements,
    criticalItems,
    deviations,
    loading,
  } = forecast;

  const missingProductivity = serviceForecasts.filter((item) => item.remainingQuantity > 0 && !item.productivityValue);
  const overloadedTeams = teamRequirements.filter((item) => item.status === 'overloaded');
  const printReport = () => window.print();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Montando previsão de equipes e prazo...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Previsão e Equipes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Visão somente leitura para prazo, capacidade e relatório executivo. Não salva dados e não altera o planejamento oficial.
            </p>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={printReport}>
            <Printer className="h-4 w-4" />
            Imprimir relatório
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            {[
              ['Progresso planejado', formatPercent(forecastSummary.plannedProgress)],
              ['Progresso realizado', formatPercent(forecastSummary.realProgress)],
              ['Desvio', formatPercent(forecastSummary.realProgress - forecastSummary.plannedProgress)],
              ['Previsão de término', formatDate(forecastSummary.estimatedFinishDate)],
              ['Atraso/adiantamento', forecastSummary.delayDays === null ? 'Estimado' : `${forecastSummary.delayDays} dias`],
              ['Sem produtividade', forecastSummary.missingProductivityCount],
              ['Equipes com sobrecarga', overloadedTeams.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />
            Previsão estimada com base nas produtividades cadastradas. Serviços sem produtividade reduzem a confiabilidade.
            Frentes compartilhadas ainda estão em diagnóstico e não unem lançamentos de produção, diário, desvios ou Mapa 3D.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Serviços críticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Etapa</th>
                    <th className="p-2">Serviço</th>
                    <th className="p-2">Saldo</th>
                    <th className="p-2">Produtividade</th>
                    <th className="p-2">Equipe</th>
                    <th className="p-2">Duração</th>
                    <th className="p-2">Risco</th>
                    <th className="p-2">Ação sugerida</th>
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
                        <td className="p-2">{item.recommendedAction}</td>
                      </tr>
                    );
                  })}
                  {criticalItems.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={8}>
                        Nenhum serviço crítico identificado com os dados atuais.
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
                    <th className="p-2">Serviço</th>
                    <th className="p-2">Meta</th>
                    <th className="p-2">Capacidade atual</th>
                    <th className="p-2">Equipes atuais</th>
                    <th className="p-2">Necessárias</th>
                    <th className="p-2">Diferença</th>
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
          <CardTitle>Serviços sem produtividade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Etapa</th>
                  <th className="p-2">Serviço</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {missingProductivity.slice(0, 20).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-2">{item.macroName}</td>
                    <td className="p-2">{item.scopeName}</td>
                    <td className="p-2">Não há produtividade ativa para estimar o saldo.</td>
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
                      Todos os serviços com saldo possuem produtividade para esta previsão.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="print:shadow-none print:border-0" id="planning-executive-report">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Relatório Executivo de Planejamento
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Formato preparado para impressão pelo navegador.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <section className="grid gap-3 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Cabeçalho</h3>
              <p className="text-sm text-muted-foreground">Obra: {project.name}</p>
              <p className="text-sm text-muted-foreground">Localização: {[project.location, project.municipio, project.estado].filter(Boolean).join(' / ') || 'Não informado'}</p>
              <p className="text-sm text-muted-foreground">Unidades: {project.totalHouses}</p>
              <p className="text-sm text-muted-foreground">Empresa: {companyName || 'Não informada'}</p>
              <p className="text-sm text-muted-foreground">Data-base: {formatDate(new Date().toISOString())}</p>
            </div>
            <div>
              <h3 className="font-semibold">Resumo executivo</h3>
              <p className="text-sm text-muted-foreground">Planejado: {formatPercent(forecastSummary.plannedProgress)}</p>
              <p className="text-sm text-muted-foreground">Realizado: {formatPercent(forecastSummary.realProgress)}</p>
              <p className="text-sm text-muted-foreground">Previsão: {formatDate(forecastSummary.estimatedFinishDate)}</p>
              <Badge variant={statusVariant(forecastSummary.status)}>{statusLabel(forecastSummary.status)}</Badge>
            </div>
          </section>

          <section>
            <h3 className="font-semibold">Análise de prazo</h3>
            <p className="text-sm text-muted-foreground">
              Prazo planejado atual: {formatDate(forecastSummary.currentPlannedFinishDate)}. Previsão atual:
              {' '}{formatDate(forecastSummary.estimatedFinishDate)}. Diferença:
              {' '}{forecastSummary.delayDays === null ? 'estimada sem base completa' : `${forecastSummary.delayDays} dia(s)`}.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Serviços críticos</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {criticalItems.slice(0, 6).map((item) => (
                <li key={item.id}>{item.service}: {item.reason} Recomenda-se: {item.recommendedAction}</li>
              ))}
              {criticalItems.length === 0 && <li>Nenhum serviço crítico identificado.</li>}
            </ul>
          </section>

          <section>
            <h3 className="font-semibold">Necessidade de equipes</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {teamRequirements.filter((item) => item.status !== 'ok').slice(0, 6).map((item) => (
                <li key={item.id}>{item.scopeName}: {teamStatusLabel(item.status)}. Equipes atuais: {item.currentTeams}; necessárias: {item.requiredTeams ?? 'sem base'}.</li>
              ))}
              {teamRequirements.filter((item) => item.status !== 'ok').length === 0 && <li>Sem sobrecarga de equipe detectada nas metas semanais atuais.</li>}
            </ul>
          </section>

          <section>
            <h3 className="font-semibold">Desvios e motivos</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {deviations.slice(0, 6).map((item) => (
                <li key={item.id}>{item.reason || 'Sem motivo informado'} - {item.notes || 'Sem observações'}.</li>
              ))}
              {deviations.length === 0 && <li>Nenhum desvio registrado no adapter de planejamento.</li>}
            </ul>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <h3 className="font-semibold">Gantt resumido</h3>
              <p className="text-sm text-muted-foreground">Gantt completo disponível na aba Gantt.</p>
            </div>
            <div className="rounded-lg border p-3">
              <h3 className="font-semibold">Linha de Balanço resumida</h3>
              <p className="text-sm text-muted-foreground">Linha de Balanço completa disponível na aba Linha de Balanço.</p>
            </div>
          </section>

          <section>
            <h3 className="font-semibold">Conclusão técnica</h3>
            <p className="text-sm text-muted-foreground">
              Com base nos dados disponíveis até a data-base, a obra encontra-se em {statusLabel(forecastSummary.status).toLowerCase()}.
              A previsão de término é {formatDate(forecastSummary.estimatedFinishDate)}.
              Os principais riscos estão associados aos serviços {getTopRisksText(criticalItems)}.
              Recomenda-se revisar produtividade, equipes e metas semanais dos itens críticos antes de publicar qualquer replanejamento oficial.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
