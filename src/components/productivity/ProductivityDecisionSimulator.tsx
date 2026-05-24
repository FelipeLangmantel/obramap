import { useMemo, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';

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

export function ProductivityDecisionSimulator({ rows, formatNumber }: ProductivityDecisionSimulatorProps) {
  const [selectedId, setSelectedId] = useState('');
  const [extraTeams, setExtraTeams] = useState('0');
  const [productivityGain, setProductivityGain] = useState('0');
  const [extraDays, setExtraDays] = useState('0');
  const [demandReduction, setDemandReduction] = useState('0');

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

  const clearSimulation = () => {
    setSelectedId('');
    setExtraTeams('0');
    setProductivityGain('0');
    setExtraDays('0');
    setDemandReduction('0');
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
      )}
    </div>
  );
}
