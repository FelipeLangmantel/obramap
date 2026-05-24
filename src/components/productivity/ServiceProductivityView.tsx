import { useEffect, useMemo, useState } from 'react';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useServiceProductivity } from '@/hooks/useServiceProductivity';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Settings,
  Users,
  TrendingUp,
  AlertCircle,
  ClipboardList,
  GitBranch,
  Layers,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { ServiceProductivityDialog } from './ServiceProductivityDialog';
import { TeamWorkGroupsPanel } from './TeamWorkGroupsPanel';
import { ServicePlanningSettingsPanel } from './ServicePlanningSettingsPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { ServiceProductivity } from '@/hooks/useServiceProductivity';
import { usePlanningCapacityModel } from '@/components/smart-planning/hooks/usePlanningCapacityModel';

interface ServiceInfo {
  macroId: string;
  scopeId: string;
  macroName: string;
  scopeName: string;
  macroColor: string;
}

type SuggestedServiceType =
  | 'physical_repetitive'
  | 'physical_one_time'
  | 'administrative_cost'
  | 'support_service'
  | 'milestone'
  | 'undefined';

interface ServiceCapacityInsight {
  service: ServiceInfo;
  productivity?: ServiceProductivity;
  type: SuggestedServiceType;
  isConfigured: boolean;
  planningSuggestion: {
    gantt: string;
    lineOfBalance: string;
    weeklyPlanning: string;
  };
}

interface SuggestedTeamGroup {
  id: string;
  title: string;
  services: ServiceCapacityInsight[];
  reasons: string[];
  hasDuplicatedCapacityRisk: boolean;
  confidence: 'Alta' | 'Media' | 'Baixa';
}

interface ProjectMacroTemplate {
  id: string;
  name: string;
  color?: string | null;
  scopes?: Array<{
    id: string;
    name: string;
  }>;
}

type RequiredProductivityStatus =
  | 'ok'
  | 'attention'
  | 'below_required'
  | 'missing_registered'
  | 'missing_real'
  | 'missing_planning';

interface WeeklyTargetReadRow {
  id: string;
  weekly_plan_week_id: string | null;
  macro_id: string | null;
  macro_name: string | null;
  scope_id: string | null;
  scope_name: string | null;
  planned_house_ids?: unknown;
  house_ids?: unknown;
  planned_houses?: number | null;
  planned_quantity?: number | null;
  quantity?: number | null;
  target_quantity?: number | null;
}

interface WeeklyPlanWeekReadRow {
  id: string;
  week_start?: string | null;
  week_end?: string | null;
  week_number?: number | null;
}

interface ActualProductionReadRow {
  id: string;
  macro_id?: string | null;
  scope_id?: string | null;
  quantity?: number | null;
  progress?: number | null;
  house_ids?: unknown;
  production_date?: string | null;
  date?: string | null;
  week_start?: string | null;
  created_at?: string | null;
  is_initial_bank?: boolean | null;
  source?: string | null;
}

interface RequiredProductivityRow {
  service: ServiceInfo;
  frontName: string | null;
  registeredProductivity: number | null;
  registeredLabel: string;
  realProductivity: number | null;
  requiredProductivity: number | null;
  diffRegisteredPercent: number | null;
  diffRealPercent: number | null;
  status: RequiredProductivityStatus;
  recommendation: string;
}

const TYPE_LABELS: Record<SuggestedServiceType, string> = {
  physical_repetitive: 'Fisico repetitivo',
  physical_one_time: 'Fisico pontual',
  administrative_cost: 'Administrativo/custo',
  support_service: 'Apoio/controle',
  milestone: 'Marco',
  undefined: 'Indefinido',
};

const REQUIRED_STATUS_LABELS: Record<RequiredProductivityStatus, string> = {
  ok: 'OK',
  attention: 'Atencao',
  below_required: 'Abaixo do necessario',
  missing_registered: 'Sem produtividade cadastrada',
  missing_real: 'Sem dados reais',
  missing_planning: 'Sem planejamento suficiente',
};

const requiredStatusVariant = (status: RequiredProductivityStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'below_required') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
};

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sameId = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');

const formatNumber = (value: number | null | undefined, digits = 1) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '-';

const readQuantity = (row: Record<string, unknown>) => {
  const numeric = Number(row.planned_quantity ?? row.quantity ?? row.target_quantity ?? row.planned_houses ?? row.progress);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const collections = [row.planned_house_ids, row.house_ids];
  for (const value of collections) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') {
      const count = value.split(',').map((item) => item.trim()).filter(Boolean).length;
      if (count > 0) return count;
    }
  }
  return 0;
};

const dateOnly = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};

const diffDaysInclusive = (start?: string | null, end?: string | null) => {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (!startDate || !endDate || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return 0;
  return Math.max(Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1, 1);
};

const toDailyProductivity = (
  value: number | null | undefined,
  unit: string | null | undefined,
  workingDaysPerWeek: number,
  teamCount: number,
) => {
  const productivity = Number(value);
  const days = Math.max(Number(workingDaysPerWeek) || 5, 1);
  const teams = Math.max(Number(teamCount) || 1, 1);
  if (!Number.isFinite(productivity) || productivity <= 0) return null;
  const unitText = normalizeText(unit);
  if (unitText.includes('semana')) return (productivity * teams) / days;
  if (unitText.includes('mes')) return (productivity * teams) / 22;
  return productivity * teams;
};

const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

const findProductivityForService = (
  service: ServiceInfo,
  productivities: ServiceProductivity[]
) =>
  productivities.find((productivity) =>
    sameId(productivity.scope_id, service.scopeId) &&
    (!productivity.macro_id || sameId(productivity.macro_id, service.macroId))
  ) ||
  productivities.find((productivity) => sameId(productivity.scope_id, service.scopeId));

const formatProductivitySummary = (productivity?: ServiceProductivity) => {
  if (!productivity) return 'Sem produtividade';
  return [
    `${productivity.productivity_value} ${productivity.productivity_unit}`,
    `${productivity.professionals_per_team} prof. + ${productivity.helpers_per_team} aux.`,
    `${productivity.default_team_count} equipe(s)`,
  ].join(' · ');
};

const classifyService = (service: ServiceInfo): SuggestedServiceType => {
  const text = normalizeText(`${service.macroName} ${service.scopeName}`);

  if (hasAny(text, ['locacao de obra', 'locacao da obra', 'locacao'])) {
    return 'physical_one_time';
  }

  if (
    hasAny(text, [
      'adm de obra',
      'administracao',
      'administrativo',
      'engenheiro',
      'mestre',
      'canteiro',
      'instalacoes provisoria',
      'mobilizacao',
      'desmobilizacao',
    ])
  ) {
    return 'administrative_cost';
  }

  if (
    hasAny(text, [
      'ensaio',
      'resistencia',
      'compressao',
      'controle tecnologico',
      'laudo',
      'teste',
      'topografia',
      'projeto',
      'documentacao',
      'canteiro de obras',
      'instalacoes e canteiro',
    ])
  ) {
    return 'support_service';
  }

  if (hasAny(text, ['marco', 'vistoria', 'entrega', 'habite se', 'medicao final'])) {
    return 'milestone';
  }

  if (
    hasAny(text, [
      'radier',
      'parede',
      'piso',
      'laje',
      'oitao',
      'telhado',
      'telhamento',
      'cobertura',
      'pintura',
      'esquadria',
      'porta',
      'janela',
      'prumada',
      'barrilete',
      'caixa d agua',
      'agua',
      'esgoto',
      'revestimento',
      'fundacao',
      'concretagem',
      'graute',
      'pre mold',
      'premold',
      'moldad',
      'vaso sanitario',
      'lavatorio',
      'bancada',
      'cozinha',
      'tanque',
      'louca',
      'loucas',
      'metais',
      'acessorio',
      'acessorios',
      'efiacao',
      'fiacao',
      'tomada',
      'tomadas',
      'caixa de inspecao',
      'caixas de inspecao',
      'caixa de gordura',
      'calcada',
      'calcamento',
    ])
  ) {
    return 'physical_repetitive';
  }

  if (hasAny(text, ['terraplenagem', 'limpeza', 'locacao', 'infraestrutura', 'rede'])) {
    return 'physical_one_time';
  }

  return 'undefined';
};

const getPlanningSuggestion = (type: SuggestedServiceType) => {
  switch (type) {
    case 'physical_repetitive':
      return { gantt: 'Sim', lineOfBalance: 'Sim', weeklyPlanning: 'Valida capacidade' };
    case 'physical_one_time':
      return { gantt: 'Sim', lineOfBalance: 'Opcional/Nao', weeklyPlanning: 'Meta pontual por servico' };
    case 'administrative_cost':
      return { gantt: 'Opcional', lineOfBalance: 'Nao', weeklyPlanning: 'Nao lancar como grupo' };
    case 'support_service':
      return { gantt: 'Sim/Opcional', lineOfBalance: 'Nao', weeklyPlanning: 'Opcional por servico' };
    case 'milestone':
      return { gantt: 'Marco', lineOfBalance: 'Nao', weeklyPlanning: 'Nao lancar como grupo' };
    default:
      return { gantt: 'Revisar', lineOfBalance: 'Revisar', weeklyPlanning: 'Revisar' };
  }
};

const getGroupToken = (service: ServiceInfo) => {
  const text = normalizeText(`${service.macroName} ${service.scopeName}`);
  const groups = [
    {
      id: 'pre_moldado',
      title: 'Montagem Pre-Moldado',
      terms: ['pre mold', 'premold', 'moldad', 'oitao', 'laje pre', 'parede pre'],
    },
    {
      id: 'cobertura',
      title: 'Cobertura',
      terms: ['telhado', 'telhamento', 'cobertura'],
    },
    {
      id: 'esquadrias',
      title: 'Esquadrias',
      terms: ['esquadria', 'janela', 'porta', 'vidro', 'aluminio'],
    },
    {
      id: 'hidraulica',
      title: 'Hidraulica e prumadas',
      terms: ['prumada', 'barrilete', 'caixa d agua', 'agua fria', 'agua quente', 'esgoto'],
    },
    {
      id: 'fundacao',
      title: 'Fundacao',
      terms: ['radier', 'fundacao', 'concretagem'],
    },
    {
      id: 'pintura',
      title: 'Pintura',
      terms: ['pintura', 'emassamento', 'massa corrida', 'textura'],
    },
  ];

  return groups.find((group) => hasAny(text, group.terms)) || null;
};

const normalizeUnit = (productivity?: ServiceProductivity) =>
  normalizeText(productivity?.productivity_unit)
    .replace(/\bpor\b/g, '')
    .replace(/\bdia\b/g, '')
    .replace(/\bsemana\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const dailyProductivity = (productivity?: ServiceProductivity) => {
  if (!productivity?.productivity_value) return null;
  const unit = normalizeText(productivity.productivity_unit);
  const value = Number(productivity.productivity_value) || 0;
  if (!value) return null;
  if (unit.includes('semana')) {
    return value / Math.max(Number(productivity.working_days_per_week) || 5, 1);
  }
  return value;
};

const hasSimilarProductivity = (items: ServiceCapacityInsight[]) => {
  const values = items
    .map((item) => dailyProductivity(item.productivity))
    .filter((value): value is number => typeof value === 'number' && value > 0);
  if (values.length < 2) return false;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min > 0 && max / min <= 1.35;
};

const hasCompatibleComposition = (items: ServiceCapacityInsight[]) => {
  const signatures = items
    .filter((item) => item.productivity)
    .map((item) => {
      const productivity = item.productivity!;
      const roles = (productivity.team_composition || [])
        .map((role) => `${normalizeText(role.role_name)}:${role.role_type}:${role.quantity}`)
        .sort()
        .join('|');
      return [
        productivity.professionals_per_team,
        productivity.helpers_per_team,
        productivity.default_team_count,
        roles,
      ].join(':');
    });
  return signatures.length >= 2 && new Set(signatures).size === 1;
};

const buildSuggestedTeamGroups = (insights: ServiceCapacityInsight[]): SuggestedTeamGroup[] => {
  const grouped = new Map<string, { tokenTitle: string; items: ServiceCapacityInsight[] }>();

  insights
    .filter((insight) => insight.type === 'physical_repetitive')
    .forEach((insight) => {
      const token = getGroupToken(insight.service);
      if (!token) return;
      const key = `${insight.service.macroId}:${token.id}`;
      const current = grouped.get(key) || { tokenTitle: token.title, items: [] };
      current.items.push(insight);
      grouped.set(key, current);
    });

  return Array.from(grouped.entries())
    .filter(([, group]) => group.items.length >= 2)
    .map(([id, group]) => {
      const unitCount = new Set(group.items.map((item) => normalizeUnit(item.productivity))).size;
      const reasons = [
        `mesma etapa ${group.items[0].service.macroName}`,
        'nomes relacionados',
      ];

      if (unitCount <= 1) reasons.push('mesma unidade');
      if (hasSimilarProductivity(group.items)) reasons.push('produtividade semelhante');
      if (hasCompatibleComposition(group.items)) reasons.push('composicao de equipe compativel');

      const configuredCount = group.items.filter((item) => item.productivity).length;
      const hasPrecastSet =
        id.includes('pre_moldado') &&
        group.items.some((item) => normalizeText(item.service.scopeName).includes('parede')) &&
        group.items.some((item) => normalizeText(item.service.scopeName).includes('laje')) &&
        group.items.some((item) => normalizeText(item.service.scopeName).includes('oitao'));
      const confidence: SuggestedTeamGroup['confidence'] =
        hasPrecastSet || id.includes('pintura')
          ? 'Alta'
          : configuredCount >= 2 && (hasSimilarProductivity(group.items) || hasCompatibleComposition(group.items))
            ? 'Media'
            : 'Baixa';

      return {
        id,
        title: group.tokenTitle,
        services: group.items,
        reasons,
        hasDuplicatedCapacityRisk: configuredCount >= 2,
        confidence,
      };
    });
};

const formatSharedCapacity = (services: ServiceCapacityInsight[]) => {
  const configured = services.filter((item) => item.productivity);
  const missing = services.length - configured.length;
  if (!configured.length) return `${services.length} servico(s) sem produtividade para estimar capacidade.`;

  const reference = configured[0].productivity!;
  return `${configured.length} com produtividade, ${missing} sem produtividade. Referencia: ${reference.productivity_value} ${reference.productivity_unit} com ${reference.default_team_count} equipe(s).`;
};

export function ServiceProductivityView() {
  const { currentProject } = useConstruction();
  const { productivities, isLoading, saveProductivity } = useServiceProductivity(currentProject?.id);
  const capacityModel = usePlanningCapacityModel(currentProject?.id);
  const serviceCapacityMap = capacityModel.serviceCapacityMap;
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null);
  const [requiredProductivityFilter, setRequiredProductivityFilter] = useState<'all' | RequiredProductivityStatus>('all');
  const [requiredProductivityFrontFilter, setRequiredProductivityFrontFilter] = useState('all');
  const [weeklyTargets, setWeeklyTargets] = useState<WeeklyTargetReadRow[]>([]);
  const [weeklyWeeks, setWeeklyWeeks] = useState<WeeklyPlanWeekReadRow[]>([]);
  const [actualProductions, setActualProductions] = useState<ActualProductionReadRow[]>([]);
  const [requiredProductivityLoading, setRequiredProductivityLoading] = useState(false);

  const allServices = useMemo(() => {
    if (!currentProject?.macrosTemplate) return [];

    const services: ServiceInfo[] = [];
    (currentProject.macrosTemplate as ProjectMacroTemplate[]).forEach((macro) => {
      macro.scopes?.forEach((scope) => {
        services.push({
          macroId: macro.id,
          scopeId: scope.id,
          macroName: macro.name,
          scopeName: scope.name,
          macroColor: macro.color || '#6b7280',
        });
      });
    });
    return services;
  }, [currentProject]);

  useEffect(() => {
    let alive = true;

    async function loadRequiredProductivitySources() {
      if (!currentProject?.id) {
        setWeeklyTargets([]);
        setWeeklyWeeks([]);
        setActualProductions([]);
        return;
      }

      setRequiredProductivityLoading(true);
      try {
        const [targetsResult, weeksResult, weeklyProductionsResult, productionsResult] = await Promise.all([
          supabase
            .from('weekly_plan_services' as never)
            .select('*')
            .eq('project_id', currentProject.id),
          supabase
            .from('weekly_plan_weeks' as never)
            .select('id, week_start, week_end, week_number')
            .eq('project_id', currentProject.id),
          supabase
            .from('weekly_productions' as never)
            .select('*')
            .eq('project_id', currentProject.id),
          supabase
            .from('productions' as never)
            .select('*')
            .eq('project_id', currentProject.id),
        ]);

        if (!alive) return;

        setWeeklyTargets((targetsResult.data as WeeklyTargetReadRow[]) ?? []);
        setWeeklyWeeks((weeksResult.data as WeeklyPlanWeekReadRow[]) ?? []);
        setActualProductions([
          ...(((weeklyProductionsResult.data as ActualProductionReadRow[]) ?? []).map((row) => ({ ...row, source: row.source ?? 'weekly_productions' }))),
          ...(((productionsResult.data as ActualProductionReadRow[]) ?? []).map((row) => ({ ...row, source: row.source ?? 'productions' }))),
        ]);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[Required Productivity Diagnostic]', error);
        }
        if (alive) {
          setWeeklyTargets([]);
          setWeeklyWeeks([]);
          setActualProductions([]);
        }
      } finally {
        if (alive) setRequiredProductivityLoading(false);
      }
    }

    loadRequiredProductivitySources();

    return () => {
      alive = false;
    };
  }, [currentProject?.id]);

  const stats = useMemo(() => {
    const total = allServices.length;
    const configured = allServices.filter((service) =>
      !!findProductivityForService(service, productivities)
    ).length;
    const missing = total - configured;
    const totalProfessionals = productivities.reduce(
      (sum, p) => sum + p.default_team_count * p.professionals_per_team, 0
    );
    const totalHelpers = productivities.reduce(
      (sum, p) => sum + p.default_team_count * p.helpers_per_team, 0
    );
    return { total, configured, missing, totalProfessionals, totalHelpers };
  }, [allServices, productivities]);

  const capacityDiagnostics = useMemo(() => {
    const serviceInsights: ServiceCapacityInsight[] = allServices.map((service) => {
      const type = classifyService(service);
      const productivity = findProductivityForService(service, productivities);
      return {
        service,
        productivity,
        type,
        isConfigured: !!productivity,
        planningSuggestion: getPlanningSuggestion(type),
      };
    });

    const suggestedGroups = buildSuggestedTeamGroups(serviceInsights);

    return {
      serviceInsights,
      suggestedGroups,
      configured: serviceInsights.filter((item) => item.isConfigured).length,
      missing: serviceInsights.filter((item) => !item.isConfigured).length,
      likelyAdministrative: serviceInsights.filter((item) => item.type === 'administrative_cost').length,
      physicalRepetitive: serviceInsights.filter((item) => item.type === 'physical_repetitive').length,
      duplicatedCapacityRisk: suggestedGroups.filter((group) => group.hasDuplicatedCapacityRisk).length,
    };
  }, [allServices, productivities]);

  const weekById = useMemo(
    () => new Map(weeklyWeeks.map((week) => [week.id, week])),
    [weeklyWeeks],
  );

  const capacityByService = useMemo(() => {
    const exact = new Map<string, (typeof serviceCapacityMap)[number]>();
    const byName = new Map<string, (typeof serviceCapacityMap)[number]>();
    serviceCapacityMap.forEach((entry) => {
      exact.set(`${entry.macroId ?? ''}::${entry.scopeId ?? ''}`, entry);
      byName.set(normalizeText(entry.serviceName), entry);
    });
    return { exact, byName };
  }, [serviceCapacityMap]);

  const requiredProductivityRows = useMemo<RequiredProductivityRow[]>(() => {
    return allServices.map((service) => {
      const capacityEntry =
        capacityByService.exact.get(`${service.macroId ?? ''}::${service.scopeId ?? ''}`)
        ?? capacityByService.byName.get(normalizeText(service.scopeName));
      const productivity = findProductivityForService(service, productivities);
      const serviceTargets = weeklyTargets.filter(
        (target) => sameId(target.scope_id, service.scopeId) && (!target.macro_id || sameId(target.macro_id, service.macroId)),
      );
      const targetRequirements = serviceTargets.map((target) => {
        const quantity = readQuantity(target as unknown as Record<string, unknown>);
        const week = target.weekly_plan_week_id ? weekById.get(target.weekly_plan_week_id) : undefined;
        const days =
          diffDaysInclusive(week?.week_start, week?.week_end)
          || capacityEntry?.workingDaysPerWeek
          || productivity?.working_days_per_week
          || 5;
        return days > 0 && quantity > 0 ? quantity / days : 0;
      });
      const requiredProductivity = targetRequirements.length ? Math.max(...targetRequirements) : null;
      const registeredProductivity =
        capacityEntry?.weeklyCapacity && capacityEntry.workingDaysPerWeek > 0
          ? capacityEntry.weeklyCapacity / capacityEntry.workingDaysPerWeek
          : toDailyProductivity(
            productivity?.productivity_value,
            productivity?.productivity_unit,
            productivity?.working_days_per_week ?? 5,
            productivity?.default_team_count ?? 1,
          );
      const registeredLabel = capacityEntry?.groupName
        ? `${formatNumber(registeredProductivity, 2)}/dia via ${capacityEntry.groupName}`
        : registeredProductivity !== null
          ? `${formatNumber(registeredProductivity, 2)}/dia`
          : 'Sem produtividade';

      const matchingActual = actualProductions.filter((row) => {
        if (row.is_initial_bank || normalizeText(row.source).includes('initial')) return false;
        return sameId(row.scope_id, service.scopeId) && (!row.macro_id || sameId(row.macro_id, service.macroId));
      });
      const realQuantity = matchingActual.reduce((sum, row) => sum + readQuantity(row as unknown as Record<string, unknown>), 0);
      const realDates = new Set(
        matchingActual
          .map((row) => dateOnly(row.production_date ?? row.date ?? row.week_start ?? row.created_at))
          .filter(Boolean) as string[],
      );
      const realProductivity = realQuantity > 0 && realDates.size > 0 ? realQuantity / realDates.size : null;
      const diffRegisteredPercent = requiredProductivity && registeredProductivity !== null
        ? ((registeredProductivity - requiredProductivity) / requiredProductivity) * 100
        : null;
      const diffRealPercent = requiredProductivity && realProductivity !== null
        ? ((realProductivity - requiredProductivity) / requiredProductivity) * 100
        : null;
      const comparisonValue = realProductivity ?? registeredProductivity;
      const status: RequiredProductivityStatus =
        !requiredProductivity
          ? 'missing_planning'
          : registeredProductivity === null
            ? 'missing_registered'
            : realProductivity === null
              ? 'missing_real'
              : comparisonValue >= requiredProductivity
                ? 'ok'
                : comparisonValue >= requiredProductivity * 0.8
                  ? 'attention'
                  : 'below_required';
      const recommendation =
        status === 'missing_planning'
          ? 'Revisar metas semanais ou planejamento do servico.'
          : status === 'missing_registered'
            ? 'Cadastrar produtividade do servico ou da frente.'
            : status === 'missing_real'
              ? 'Sem dados reais suficientes; acompanhar lancamentos futuros.'
              : status === 'ok'
                ? 'Produtividade atende a necessidade atual.'
                : status === 'attention'
                  ? 'Monitorar produtividade e avaliar ajuste leve de equipe ou prazo.'
                  : 'Aumentar equipe, revisar produtividade ou alongar prazo planejado.';

      return {
        service,
        frontName: capacityEntry?.groupName ?? null,
        registeredProductivity,
        registeredLabel,
        realProductivity,
        requiredProductivity,
        diffRegisteredPercent,
        diffRealPercent,
        status,
        recommendation,
      };
    });
  }, [actualProductions, allServices, capacityByService, productivities, weekById, weeklyTargets]);

  const requiredFrontOptions = useMemo(
    () => Array.from(new Set(requiredProductivityRows.map((row) => row.frontName).filter(Boolean) as string[])).sort(),
    [requiredProductivityRows],
  );

  const filteredRequiredProductivityRows = useMemo(
    () => requiredProductivityRows.filter((row) =>
      (requiredProductivityFilter === 'all' || row.status === requiredProductivityFilter)
      && (requiredProductivityFrontFilter === 'all' || row.frontName === requiredProductivityFrontFilter),
    ),
    [requiredProductivityFilter, requiredProductivityRows, requiredProductivityFrontFilter],
  );

  const requiredProductivitySummary = useMemo(() => ({
    analyzed: requiredProductivityRows.filter((row) => row.requiredProductivity !== null).length,
    ok: requiredProductivityRows.filter((row) => row.status === 'ok').length,
    below: requiredProductivityRows.filter((row) => row.status === 'below_required' || row.status === 'attention').length,
    missingRegistered: requiredProductivityRows.filter((row) => row.status === 'missing_registered').length,
    missingReal: requiredProductivityRows.filter((row) => row.status === 'missing_real').length,
  }), [requiredProductivityRows]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione um projeto para gerenciar produtividade
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Produtividade e Equipes
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Defina produtividade e dimensionamento de equipes por serviço
        </p>
      </div>

      <Tabs defaultValue="produtividade" className="space-y-4">
        <TabsList>
          <TabsTrigger value="produtividade">Produtividade por servico</TabsTrigger>
          <TabsTrigger value="frentes">Frentes compartilhadas</TabsTrigger>
          <TabsTrigger value="configplan">Config. planejamento fisico</TabsTrigger>
          <TabsTrigger value="necessaria">Produtividade necessaria</TabsTrigger>
        </TabsList>

        <TabsContent value="produtividade" className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total Serviços</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">Configurados</p>
                <p className="text-xl font-bold text-foreground">{stats.configured}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-xl font-bold text-foreground">{stats.missing}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Profissionais</p>
                <p className="text-xl font-bold text-foreground">{stats.totalProfessionals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-violet-500" />
              <div>
                <p className="text-xs text-muted-foreground">Auxiliares</p>
                <p className="text-xl font-bold text-foreground">{stats.totalHelpers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capacity Diagnostic */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-5 w-5 text-primary" />
                Diagnostico de capacidade
              </CardTitle>
              <CardDescription>
                Leitura local para identificar frentes de trabalho compartilhadas, sem unir os lancamentos por servico.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit gap-1">
              <Info className="h-3 w-3" />
              Somente leitura
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Servicos configurados</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.configured}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Servicos pendentes</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.missing}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Sem produtividade</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.missing}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Administrativos provaveis</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.likelyAdministrative}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Fisicos repetitivos</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.physicalRepetitive}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Frentes compartilhadas</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.suggestedGroups.length}</p>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            <p className="font-medium">Grupo sugerido aqui significa capacidade compartilhada.</p>
            <p className="mt-1 text-xs">
              Os servicos continuam separados na Producao, Diario, desvios, saldo, Mapa 3D e medicao. A frente compartilhada
              serve apenas para Gantt, Linha de Balanco, capacidade semanal/mensal, alerta de sobrecarga, simulacao e replanejamento.
            </p>
          </div>

          {capacityDiagnostics.duplicatedCapacityRisk > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Possivel capacidade duplicada no planejamento</p>
                  <p className="text-xs">
                    Alguns servicos parecem disputar a mesma equipe. Eles continuam sendo lancados separadamente,
                    mas o planejamento deve somar as metas desses servicos para validar sobrecarga da frente.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <GitBranch className="h-4 w-4 text-primary" />
                Frentes de trabalho compartilhadas
              </h3>
              <Badge variant="secondary">Acao futura</Badge>
            </div>

            {capacityDiagnostics.suggestedGroups.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {capacityDiagnostics.suggestedGroups.map((group) => (
                  <div key={group.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-medium">{group.title}</p>
                      <Badge variant="outline">Capacidade compartilhada</Badge>
                      <Badge variant="secondary">Confianca {group.confidence}</Badge>
                      {group.hasDuplicatedCapacityRisk && (
                        <Badge variant="secondary" className="text-amber-700 dark:text-amber-300">
                          revisar capacidade
                        </Badge>
                      )}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {group.services.map((item) => (
                        <Badge key={item.service.scopeId} variant="secondary" className="font-normal">
                          {item.service.scopeName}
                        </Badge>
                      ))}
                    </div>
                    <div className="mb-3 grid gap-2 rounded-md bg-muted/40 p-2 text-xs md:grid-cols-2">
                      <span>Gantt: capacidade compartilhada</span>
                      <span>Linha: fluxo da frente</span>
                      <span>Semanal: valida sobrecarga por servico</span>
                      <span>Producao/Diario: lancamento separado</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Motivos: {group.reasons.join(', ')}.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatSharedCapacity(group.services)} Nao une lancamentos de producao.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sugestao automatica. Confirme manualmente antes de transformar em frente oficial.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhuma frente compartilhada sugerida com os dados atuais.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Classificacao sugerida dos servicos</h3>
            <ScrollArea className="h-72 rounded-lg border">
              <div className="divide-y">
                {capacityDiagnostics.serviceInsights.map((item) => (
                  <div key={item.service.scopeId} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_auto_minmax(240px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.service.scopeName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.service.macroName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.isConfigured ? 'default' : 'outline'}>
                        {item.isConfigured ? 'Configurado' : 'Sem produtividade'}
                      </Badge>
                      <Badge variant="secondary">{TYPE_LABELS[item.type]}</Badge>
                      {item.productivity && (
                        <span className="text-xs text-muted-foreground">
                          {formatProductivitySummary(item.productivity)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="rounded border px-2 py-1">Gantt: {item.planningSuggestion.gantt}</span>
                      <span className="rounded border px-2 py-1">Linha: {item.planningSuggestion.lineOfBalance}</span>
                      <span className="rounded border px-2 py-1">Semanal: {item.planningSuggestion.weeklyPlanning}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              O Planejamento Semanal continua por servico. Para uma frente compartilhada, a validacao futura deve somar as metas
              dos servicos da mesma frente para detectar sobrecarga, sem transformar tudo em um lancamento unico.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Services List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Serviços da Obra</CardTitle>
          <CardDescription>Configure produtividade e equipes para cada serviço</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-420px)]">
            <div className="space-y-2">
              {allServices.map((service) => {
                const productivity = findProductivityForService(service, productivities);
                const isConfigured = !!productivity;

                return (
                  <div
                    key={service.scopeId}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: service.macroColor }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {service.scopeName}
                        </p>
                        <p className="text-xs text-muted-foreground">{service.macroName}</p>

                        {productivity && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>
                              {productivity.productivity_value} {productivity.productivity_unit}
                            </span>
                            <span>•</span>
                            <span>
                              {productivity.professionals_per_team} prof. + {productivity.helpers_per_team} aux.
                            </span>
                            <span>•</span>
                            <span>{productivity.default_team_count} equipe(s)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {isConfigured ? (
                        <Badge variant="default" className="text-xs">Configurado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          Pendente
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={isConfigured ? 'outline' : 'default'}
                        onClick={() => setSelectedService(service)}
                      >
                        {isConfigured ? 'Editar' : 'Configurar'}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {allServices.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum serviço cadastrado. Configure as etapas e serviços primeiro.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dialog */}
      {selectedService && (
        <ServiceProductivityDialog
          service={selectedService}
          existingProductivity={findProductivityForService(selectedService, productivities)}
          onClose={() => setSelectedService(null)}
          onSave={saveProductivity}
        />
      )}
        </TabsContent>

        <TabsContent value="frentes">
          <TeamWorkGroupsPanel
            projectId={currentProject?.id}
            allServices={allServices.map((s) => ({
              macroId: s.macroId,
              scopeId: s.scopeId,
              macroName: s.macroName,
              scopeName: s.scopeName,
            }))}
            suggestions={capacityDiagnostics.suggestedGroups.map((g) => ({
              id: g.id,
              title: g.title,
              services: g.services.map((it) => ({
                macroId: it.service.macroId,
                scopeId: it.service.scopeId,
                macroName: it.service.macroName,
                scopeName: it.service.scopeName,
              })),
            }))}
          />
        </TabsContent>

        <TabsContent value="configplan">
          <ServicePlanningSettingsPanel
            projectId={currentProject?.id}
            allServices={allServices.map((s) => ({
              macroId: s.macroId,
              scopeId: s.scopeId,
              macroName: s.macroName,
              scopeName: s.scopeName,
            }))}
          />
        </TabsContent>

        <TabsContent value="necessaria" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Produtividade necessaria
                  </CardTitle>
                  <CardDescription>
                    Compara produtividade necessaria, cadastrada e real sem alterar produtividade, producao, diario,
                    medicao, planejamento ou equipes.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit gap-1">
                  <Info className="h-3 w-3" />
                  Somente leitura
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                {[
                  ['Servicos analisados', requiredProductivitySummary.analyzed],
                  ['Servicos OK', requiredProductivitySummary.ok],
                  ['Abaixo/atencao', requiredProductivitySummary.below],
                  ['Sem produtividade', requiredProductivitySummary.missingRegistered],
                  ['Sem dados reais', requiredProductivitySummary.missingReal],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Este diagnostico e apenas leitura. Ele nao altera produtividade, producao, diario, medicao,
                planejamento, equipes, Gantt, Linha de Balanco, Semanal ou Previsao oficial.
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="required-productivity-status">
                    Status
                  </label>
                  <select
                    id="required-productivity-status"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={requiredProductivityFilter}
                    onChange={(event) => setRequiredProductivityFilter(event.target.value as 'all' | RequiredProductivityStatus)}
                  >
                    <option value="all">Todos</option>
                    <option value="below_required">Abaixo do necessario</option>
                    <option value="attention">Atencao</option>
                    <option value="missing_registered">Sem produtividade</option>
                    <option value="missing_real">Sem dados reais</option>
                    <option value="missing_planning">Sem planejamento</option>
                    <option value="ok">OK</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="required-productivity-front">
                    Frente
                  </label>
                  <select
                    id="required-productivity-front"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={requiredProductivityFrontFilter}
                    onChange={(event) => setRequiredProductivityFrontFilter(event.target.value)}
                  >
                    <option value="all">Todas</option>
                    {requiredFrontOptions.map((frontName) => (
                      <option key={frontName} value={frontName}>{frontName}</option>
                    ))}
                  </select>
                </div>
                {requiredProductivityLoading && (
                  <div className="pb-2 text-sm text-muted-foreground">Carregando fontes de produtividade real...</div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">Servico</th>
                      <th className="p-2">Frente</th>
                      <th className="p-2">Necessaria</th>
                      <th className="p-2">Cadastrada</th>
                      <th className="p-2">Real</th>
                      <th className="p-2">Dif. cadastrada</th>
                      <th className="p-2">Dif. real</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Recomendacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequiredProductivityRows.map((row) => (
                      <tr key={row.service.scopeId} className="border-b last:border-0">
                        <td className="p-2">
                          <div className="font-medium">{row.service.scopeName}</div>
                          <div className="text-xs text-muted-foreground">{row.service.macroName}</div>
                        </td>
                        <td className="p-2">{row.frontName ?? 'Sem frente'}</td>
                        <td className="p-2">
                          {row.requiredProductivity === null ? 'Sem planejamento suficiente' : `${formatNumber(row.requiredProductivity, 2)}/dia`}
                        </td>
                        <td className="p-2">{row.registeredLabel}</td>
                        <td className="p-2">
                          {row.realProductivity === null ? 'Sem dados reais' : `${formatNumber(row.realProductivity, 2)}/dia`}
                        </td>
                        <td className="p-2">
                          {row.diffRegisteredPercent === null ? '-' : `${formatNumber(row.diffRegisteredPercent, 1)}%`}
                        </td>
                        <td className="p-2">
                          {row.diffRealPercent === null ? '-' : `${formatNumber(row.diffRealPercent, 1)}%`}
                        </td>
                        <td className="p-2">
                          <Badge variant={requiredStatusVariant(row.status)}>
                            {REQUIRED_STATUS_LABELS[row.status]}
                          </Badge>
                        </td>
                        <td className="p-2">{row.recommendation}</td>
                      </tr>
                    ))}
                    {filteredRequiredProductivityRows.length === 0 && (
                      <tr>
                        <td className="p-6 text-center text-muted-foreground" colSpan={9}>
                          Nenhum servico encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {requiredProductivitySummary.analyzed === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Sem planejamento suficiente para calcular produtividade necessaria. Revise metas semanais ou planejamento por periodo.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

