import { useMemo, useState } from 'react';
import { Copy, RotateCcw, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type SimulationStatus = 'resolved' | 'reduced' | 'not_resolved' | 'insufficient_data';

interface SimulatorServiceRow {
  service: {
    scopeId: string;
    scopeName: string;
    macroName: string;
  };
  frontName: string | null;
  registeredProductivity: number | null;
  realProductivity: number | null;
  requiredProductivity: number | null;
  plannedDemand: number | null;
  planningDays: number | null;
  capacityPerTeam: number | null;
  status: string;
}

interface SimulatorItem {
  id: string;
  label: string;
  type: 'service' | 'front';
  frontName: string | null;
  serviceName: string | null;
  registeredProductivity: number | null;
  realProductivity: number | null;
  requiredProductivity: number | null;
  plannedDemand: number | null;
  planningDays: number | null;
  capacityPerTeam: number | null;
  currentStatus: string;
}

interface ProductivityDecisionSimulatorProps {
  rows: SimulatorServiceRow[];
  formatNumber: (value: number | null | undefined, digits?: number) => string;
}

const statusLabel: Record<SimulationStatus, string> = {
  resolved: 'Resolve o problema',
  reduced: 'Reduz a sobrecarga, mas ainda nao resolve',
  not_resolved: 'Nao resolve',
  insufficient_data: 'Dados insuficientes para simular',
};

const statusVariant = (status: SimulationStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'resolved') return 'default';
  if (status === 'reduced') return 'secondary';
  if (status === 'not_resolved') return 'destructive';
  return 'outline';
};

const parseNumericInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isValidNumber = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

export function ProductivityDecisionSimulator({ rows, formatNumber }: ProductivityDecisionSimulatorProps) {
  const [selectedId, setSelectedId] = useState('');
  const [extraTeams, setExtraTeams] = useState('0');
  const [productivityGain, setProductivityGain] = useState('0');
  const [extraDays, setExtraDays] = useState('0');
  const [demandReduction, setDemandReduction] = useState('0');
  const [copyFeedback, setCopyFeedback] = useState('');

  const simulationItems = useMemo<SimulatorItem[]>(() => {
    const serviceItems: SimulatorItem[] = rows.map((row) => ({
      id: `service:${row.service.scopeId}`,
      label: `${row.service.scopeName || 'Servico sem nome'} (${row.service.macroName || 'Etapa nao informada'})`,
      type: 'service',
      frontName: row.frontName,
      serviceName: row.service.scopeName || 'Servico sem nome',
      registeredProductivity: row.registeredProductivity,
      realProductivity: row.realProductivity,
      requiredProductivity: row.requiredProductivity,
      plannedDemand: row.plannedDemand,
      planningDays: row.planningDays,
      capacityPerTeam: row.capacityPerTeam,
      currentStatus: row.status,
    }));

    const fronts = new Map<string, SimulatorServiceRow[]>();
    rows.forEach((row) => {
      if (!row.frontName) return;
      fronts.set(row.frontName, [...(fronts.get(row.frontName) ?? []), row]);
    });

    const frontItems: SimulatorItem[] = Array.from(fronts.entries()).map(([frontName, frontRows]) => {
      const plannedDemand = frontRows.reduce((sum, row) => sum + (row.plannedDemand ?? 0), 0);
      const requiredProductivity = frontRows.reduce((sum, row) => sum + (row.requiredProductivity ?? 0), 0);
      const realProductivity = frontRows.some((row) => row.realProductivity !== null)
        ? frontRows.reduce((sum, row) => sum + (row.realProductivity ?? 0), 0)
        : null;
      const registeredCandidates = frontRows
        .map((row) => row.registeredProductivity)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const registeredProductivity = registeredCandidates.length ? Math.max(...registeredCandidates) : null;
      const capacityPerTeamCandidates = frontRows
        .map((row) => row.capacityPerTeam)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const capacityPerTeam = capacityPerTeamCandidates.length ? Math.max(...capacityPerTeamCandidates) : registeredProductivity;
      const planningDaysCandidates = frontRows
        .map((row) => row.planningDays)
        .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
      const planningDays = planningDaysCandidates.length ? Math.max(...planningDaysCandidates) : null;

      return {
        id: `front:${frontName}`,
        label: `Frente: ${frontName}`,
        type: 'front',
        frontName,
        serviceName: null,
        registeredProductivity,
        realProductivity,
        requiredProductivity: requiredProductivity > 0 ? requiredProductivity : null,
        plannedDemand: plannedDemand > 0 ? plannedDemand : null,
        planningDays,
        capacityPerTeam,
        currentStatus: frontRows.some((row) => row.status === 'below_required') ? 'below_required' : frontRows[0]?.status ?? 'missing_planning',
      };
    });

    return [...frontItems, ...serviceItems];
  }, [rows]);

  const selectedItem = simulationItems.find((item) => item.id === selectedId) ?? null;

  const result = useMemo(() => {
    if (!selectedItem) return null;

    const teams = Math.max(parseNumericInput(extraTeams), 0);
    const gain = Math.max(parseNumericInput(productivityGain), 0);
    const addedDays = Math.max(parseNumericInput(extraDays), 0);
    const reduction = Math.min(Math.max(parseNumericInput(demandReduction), 0), 100);

    const demand = selectedItem.plannedDemand;
    const currentDays = selectedItem.planningDays;
    const currentCapacity = selectedItem.registeredProductivity;
    const requiredNow = selectedItem.requiredProductivity;
    const capacityPerTeam = selectedItem.capacityPerTeam ?? currentCapacity;

    if (!demand || !currentDays || !requiredNow) {
      return {
        status: 'insufficient_data' as SimulationStatus,
        simulatedDemand: null,
        simulatedDays: null,
        simulatedRequired: null,
        simulatedCapacity: null,
        currentDifference: null,
        simulatedDifference: null,
        recommendation: 'Sem planejamento suficiente para simular prazo ou demanda.',
      };
    }

    if (!currentCapacity || !capacityPerTeam) {
      return {
        status: 'insufficient_data' as SimulationStatus,
        simulatedDemand: null,
        simulatedDays: null,
        simulatedRequired: null,
        simulatedCapacity: null,
        currentDifference: null,
        simulatedDifference: null,
        recommendation: 'Cadastre produtividade antes de simular capacidade com seguranca.',
      };
    }

    const simulatedDemand = demand * (1 - reduction / 100);
    const simulatedDays = currentDays + addedDays;
    const simulatedRequired = simulatedDays > 0 ? simulatedDemand / simulatedDays : requiredNow;
    const capacityWithTeams = currentCapacity + capacityPerTeam * teams;
    const simulatedCapacity = capacityWithTeams * (1 + gain / 100);
    const currentDifference = currentCapacity - requiredNow;
    const simulatedDifference = simulatedCapacity - simulatedRequired;
    const improved = simulatedDifference > currentDifference;
    const status: SimulationStatus =
      simulatedCapacity >= simulatedRequired
        ? 'resolved'
        : improved
          ? 'reduced'
          : 'not_resolved';
    const recommendation =
      status === 'resolved'
        ? 'O cenario simulado resolve a diferenca atual sem alterar dados oficiais.'
        : status === 'reduced'
          ? 'O cenario reduz a diferenca, mas ainda falta produtividade ou prazo.'
          : 'Mesmo com a simulacao, ainda falta produtividade. Revise equipe, meta ou prazo.';

    return {
      status,
      simulatedDemand,
      simulatedDays,
      simulatedRequired,
      simulatedCapacity,
      currentDifference,
      simulatedDifference,
      recommendation: selectedItem.realProductivity === null
        ? `${recommendation} Colete mais dados reais para melhorar a confianca da analise.`
        : recommendation,
    };
  }, [demandReduction, extraDays, extraTeams, productivityGain, selectedItem]);

  const executiveReport = useMemo(() => {
    if (!selectedItem || !result) return null;

    const currentCapacity = selectedItem.registeredProductivity;
    const currentRequired = selectedItem.requiredProductivity;
    const currentDemand = selectedItem.plannedDemand;
    const simulatedCapacity = result.simulatedCapacity;
    const simulatedRequired = result.simulatedRequired;
    const simulatedDemand = result.simulatedDemand;
    const currentDifference = result.currentDifference;
    const simulatedDifference = result.simulatedDifference;

    const capacityGain = isValidNumber(simulatedCapacity) && isValidNumber(currentCapacity)
      ? simulatedCapacity - currentCapacity
      : null;
    const gapReduction = isValidNumber(simulatedDifference) && isValidNumber(currentDifference)
      ? simulatedDifference - currentDifference
      : null;
    const improvementPercent = isValidNumber(gapReduction) && isValidNumber(currentDifference) && Math.abs(currentDifference) > 0
      ? (gapReduction / Math.abs(currentDifference)) * 100
      : null;

    const hasPlanning = isValidNumber(currentDemand) && isValidNumber(selectedItem.planningDays) && isValidNumber(currentRequired);
    const hasRegisteredProductivity = isValidNumber(currentCapacity);
    const hasRealProductivity = isValidNumber(selectedItem.realProductivity);

    const confidence =
      hasRegisteredProductivity && hasPlanning && hasRealProductivity
        ? 'Alta'
        : hasRegisteredProductivity && hasPlanning
          ? 'Media'
          : 'Baixa';
    const confidenceReason =
      confidence === 'Alta'
        ? 'Ha produtividade cadastrada, planejamento e dados reais para apoiar a decisao.'
        : confidence === 'Media'
          ? 'Ha produtividade cadastrada e planejamento, mas a produtividade real ainda tem pouca base.'
          : 'Faltam produtividade, planejamento ou producao real suficientes para uma decisao segura.';

    const decision =
      result.status === 'resolved'
        ? 'Cenario recomendado'
        : result.status === 'reduced'
          ? 'Cenario melhora, mas ainda exige ajuste'
          : result.status === 'not_resolved'
            ? 'Cenario insuficiente'
            : 'Dados insuficientes para decisao';

    const decisionText =
      result.status === 'resolved'
        ? 'O cenario simulado elimina a diferenca atual. Valide com o responsavel da obra antes de alterar o planejamento oficial.'
        : result.status === 'reduced'
          ? 'O cenario reduz a diferenca, mas ainda exige ajuste de equipe, produtividade, meta ou prazo.'
          : result.status === 'not_resolved'
            ? 'O cenario nao resolve a diferenca atual. Revise premissas antes de tomar decisao.'
            : 'Ainda faltam dados minimos para usar este cenario como base de decisao.';

    const summary =
      isValidNumber(currentCapacity) && isValidNumber(simulatedCapacity) && isValidNumber(simulatedRequired)
        ? `Com a simulacao atual, a capacidade passaria de ${formatNumber(currentCapacity, 2)} para ${formatNumber(simulatedCapacity, 2)} por dia. A produtividade necessaria simulada seria ${formatNumber(simulatedRequired, 2)} por dia. Portanto, ${result.status === 'resolved' ? 'o cenario resolve a diferenca atual.' : result.status === 'reduced' ? 'o cenario reduz a diferenca, mas ainda nao resolve completamente.' : 'o cenario ainda nao resolve a diferenca atual.'}`
        : 'O cenario simulado ainda nao possui dados suficientes para comparar capacidade, demanda e prazo com seguranca.';

    return {
      capacityGain,
      confidence,
      confidenceReason,
      currentCapacity,
      currentDemand,
      currentDifference,
      currentRequired,
      decision,
      decisionText,
      gapReduction,
      improvementPercent,
      simulatedCapacity,
      simulatedDemand,
      simulatedDifference,
      simulatedRequired,
      summary,
    };
  }, [formatNumber, result, selectedItem]);

  const clearSimulation = () => {
    setSelectedId('');
    setExtraTeams('0');
    setProductivityGain('0');
    setExtraDays('0');
    setDemandReduction('0');
    setCopyFeedback('');
  };

  const formatReportValue = (value: number | null | undefined, digits = 2, suffix = '') => (
    isValidNumber(value) ? `${formatNumber(value, digits)}${suffix}` : 'Sem dado suficiente'
  );

  const copyReportSummary = async () => {
    if (!selectedItem || !executiveReport || !result) return;

    const reportText = [
      'Relatorio executivo do cenario simulado',
      '',
      `Servico/Frente: ${selectedItem.label}`,
      '',
      'Situacao atual:',
      `- Produtividade necessaria: ${formatReportValue(executiveReport.currentRequired, 2, '/dia')}`,
      `- Capacidade atual: ${formatReportValue(executiveReport.currentCapacity, 2, '/dia')}`,
      `- Demanda atual: ${formatReportValue(executiveReport.currentDemand, 1)}`,
      `- Diferenca atual: ${formatReportValue(executiveReport.currentDifference, 2, '/dia')}`,
      '',
      'Cenario simulado:',
      `- Equipes adicionais: ${Math.max(parseNumericInput(extraTeams), 0)}`,
      `- Ganho de produtividade: ${Math.max(parseNumericInput(productivityGain), 0)}%`,
      `- Prazo adicional: ${Math.max(parseNumericInput(extraDays), 0)} dia(s)`,
      `- Reducao/redistribuicao de meta: ${Math.min(Math.max(parseNumericInput(demandReduction), 0), 100)}%`,
      `- Capacidade simulada: ${formatReportValue(executiveReport.simulatedCapacity, 2, '/dia')}`,
      `- Produtividade necessaria simulada: ${formatReportValue(executiveReport.simulatedRequired, 2, '/dia')}`,
      `- Demanda simulada: ${formatReportValue(executiveReport.simulatedDemand, 1)}`,
      `- Diferenca simulada: ${formatReportValue(executiveReport.simulatedDifference, 2, '/dia')}`,
      '',
      `Resultado: ${statusLabel[result.status]}.`,
      '',
      `Recomendacao: ${executiveReport.decisionText}`,
      '',
      `Confianca: ${executiveReport.confidence}. ${executiveReport.confidenceReason}`,
      '',
      'Observacao: este cenario e apenas uma simulacao local e nao altera o planejamento oficial, producao, diario, medicao, Gantt, Linha de Balanco ou Planejamento Semanal.',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(reportText);
      setCopyFeedback('Resumo copiado.');
    } catch {
      setCopyFeedback('Nao foi possivel copiar automaticamente.');
    }

    window.setTimeout(() => setCopyFeedback(''), 2500);
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Simulador de decisao
          </h3>
          <p className="text-sm text-muted-foreground">
            Teste cenarios locais antes de alterar equipe, produtividade, meta ou prazo.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">Simulacao local</Badge>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Simulacao local. Nao altera produtividade, equipe, meta, prazo, producao, diario, medicao ou planejamento oficial.
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="decision-simulator-target">
            Servico ou frente
          </label>
          <select
            id="decision-simulator-target"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Selecione para simular</option>
            {simulationItems.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="decision-simulator-teams">
            Equipes extras
          </label>
          <input
            id="decision-simulator-teams"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            min="0"
            type="number"
            value={extraTeams}
            onChange={(event) => setExtraTeams(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="decision-simulator-gain">
            Ganho %
          </label>
          <input
            id="decision-simulator-gain"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            min="0"
            type="number"
            value={productivityGain}
            onChange={(event) => setProductivityGain(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="decision-simulator-days">
            Prazo extra
          </label>
          <input
            id="decision-simulator-days"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            min="0"
            type="number"
            value={extraDays}
            onChange={(event) => setExtraDays(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="decision-simulator-demand">
            Reducao/redistribuicao da meta %
          </label>
          <input
            id="decision-simulator-demand"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            min="0"
            max="100"
            type="number"
            value={demandReduction}
            onChange={(event) => setDemandReduction(event.target.value)}
          />
        </div>
        <Button className="self-end" type="button" variant="outline" onClick={clearSimulation}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Limpar simulacao
        </Button>
      </div>

      {!selectedItem ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Selecione um servico ou uma frente para comparar a situacao atual com um cenario simulado.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <h4 className="font-medium">Situacao atual</h4>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Necessaria</dt><dd>{formatNumber(selectedItem.requiredProductivity, 2)}/dia</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cadastrada</dt><dd>{selectedItem.registeredProductivity === null ? 'Sem produtividade' : `${formatNumber(selectedItem.registeredProductivity, 2)}/dia`}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Real</dt><dd>{selectedItem.realProductivity === null ? 'Sem dados reais' : `${formatNumber(selectedItem.realProductivity, 2)}/dia`}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Demanda</dt><dd>{selectedItem.plannedDemand === null ? '-' : formatNumber(selectedItem.plannedDemand, 1)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Diferenca</dt><dd>{result?.currentDifference === null || !result ? '-' : `${formatNumber(result.currentDifference, 2)}/dia`}</dd></div>
              </dl>
            </div>

            <div className="rounded-lg border bg-background p-3">
              <h4 className="font-medium">Cenario simulado</h4>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Capacidade</dt><dd>{result?.simulatedCapacity === null || !result ? '-' : `${formatNumber(result.simulatedCapacity, 2)}/dia`}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Necessaria</dt><dd>{result?.simulatedRequired === null || !result ? '-' : `${formatNumber(result.simulatedRequired, 2)}/dia`}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Demanda</dt><dd>{result?.simulatedDemand === null || !result ? '-' : formatNumber(result.simulatedDemand, 1)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Prazo</dt><dd>{result?.simulatedDays === null || !result ? '-' : `${formatNumber(result.simulatedDays, 0)} dia(s)`}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Diferenca</dt><dd>{result?.simulatedDifference === null || !result ? '-' : `${formatNumber(result.simulatedDifference, 2)}/dia`}</dd></div>
              </dl>
            </div>

            <div className="rounded-lg border bg-background p-3">
              <h4 className="font-medium">Resultado</h4>
              <div className="mt-3">
                <Badge variant={statusVariant(result?.status ?? 'insufficient_data')}>
                  {statusLabel[result?.status ?? 'insufficient_data']}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {result?.recommendation ?? 'Dados insuficientes para simular.'}
              </p>
            </div>
          </div>

          {executiveReport && result ? (
            <div className="rounded-lg border bg-background p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h4 className="font-semibold">Relatorio executivo do cenario simulado</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{executiveReport.summary}</p>
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <Button type="button" variant="outline" size="sm" onClick={copyReportSummary}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar resumo
                  </Button>
                  {copyFeedback ? <span className="text-xs text-muted-foreground">{copyFeedback}</span> : null}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Indicador</th>
                      <th className="py-2 pr-3 font-medium">Atual</th>
                      <th className="py-2 pr-3 font-medium">Simulado</th>
                      <th className="py-2 font-medium">Diferenca</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="py-2 pr-3 font-medium">Demanda</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.currentDemand, 1)}</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.simulatedDemand, 1)}</td>
                      <td className="py-2">{formatReportValue(
                        isValidNumber(executiveReport.simulatedDemand) && isValidNumber(executiveReport.currentDemand)
                          ? executiveReport.simulatedDemand - executiveReport.currentDemand
                          : null,
                        1,
                      )}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-medium">Capacidade</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.currentCapacity, 2, '/dia')}</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.simulatedCapacity, 2, '/dia')}</td>
                      <td className="py-2">{formatReportValue(executiveReport.capacityGain, 2, '/dia')}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-medium">Produtividade necessaria</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.currentRequired, 2, '/dia')}</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.simulatedRequired, 2, '/dia')}</td>
                      <td className="py-2">{formatReportValue(
                        isValidNumber(executiveReport.simulatedRequired) && isValidNumber(executiveReport.currentRequired)
                          ? executiveReport.simulatedRequired - executiveReport.currentRequired
                          : null,
                        2,
                        '/dia',
                      )}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-medium">Diferenca</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.currentDifference, 2, '/dia')}</td>
                      <td className="py-2 pr-3">{formatReportValue(executiveReport.simulatedDifference, 2, '/dia')}</td>
                      <td className="py-2">{formatReportValue(executiveReport.gapReduction, 2, '/dia')}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-medium">Status</td>
                      <td className="py-2 pr-3">{selectedItem.currentStatus || 'Nao informado'}</td>
                      <td className="py-2 pr-3">{statusLabel[result.status]}</td>
                      <td className="py-2">
                        {isValidNumber(executiveReport.improvementPercent)
                          ? `${formatNumber(executiveReport.improvementPercent, 0)}% de melhoria`
                          : 'Sem comparacao suficiente'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Decisao sugerida</p>
                  <p className="mt-1 font-medium">{executiveReport.decision}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{executiveReport.decisionText}</p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Confianca da analise</p>
                  <p className="mt-1 font-medium">{executiveReport.confidence}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{executiveReport.confidenceReason}</p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Este cenario e apenas uma simulacao local e nao altera o planejamento oficial, producao, diario, medicao, Gantt, Linha de Balanco ou Planejamento Semanal.
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
