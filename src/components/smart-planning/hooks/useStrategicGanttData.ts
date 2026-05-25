import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { addDays, startOfDay, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { ServiceCapacityEntry, usePlanningCapacityModel } from './usePlanningCapacityModel';
import { PlanningMacroflowDependency, hasMacroflowCycle } from './usePlanningMacroflow';

export interface StrategicService {
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  macro_color: string;
  total_houses: number;
  executed_houses: number;
  remaining_houses: number;
  completion_percent: number;
}

export interface ServiceProductivityConfig {
  id?: string;
  macro_id: string;
  scope_id: string;
  productivity_type: string;
  base_productivity: number;
  productivity_unit?: string;
  default_team_count?: number;
  working_days_per_week?: number;
  source: 'project' | 'default' | 'manual';
  team_composition: { role: string; quantity: number; unit: string }[];
}

export type CapacityStatus = 'ok' | 'attention' | 'insufficient' | 'missing_productivity';

export interface GanttService {
  id: string; // macro_id + scope_id
  package_type?: 'service' | 'work_group';
  macroflow_id?: string | null;
  macroflow_name?: string | null;
  macroflow_active?: boolean;
  group_id?: string | null;
  internal_services?: {
    id: string;
    macro_id: string;
    scope_id: string;
    macro_name: string;
    scope_name: string;
  }[];
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  name: string;
  color: string;
  remaining_houses: number;
  total_houses: number;
  executed_houses: number;
  completion_percent: number;
  productivity: number;
  productivity_type: string;
  productivity_source: ServiceProductivityConfig['source'] | 'missing';
  productivity_unit: string;
  has_productivity: boolean;
  teams: number;
  duration_days: number;
  suggested_duration_days: number | null;
  duration_delta_days: number | null;
  capacity_status: CapacityStatus;
  schedule_source?: 'macroflow' | 'official_productivity' | 'legacy_fallback' | 'missing_productivity';
  has_explicit_predecessor?: boolean;
  planned_start: Date;
  planned_end: Date;
  depends_on: string | null; // id of predecessor service
  sequence_order: number;
  stage_id: string | null; // planning_stages id if exists
}

interface ActiveMacroflowPackage {
  packageKey: string;
  packageType: 'service' | 'work_group';
  macroflowId?: string;
  macroflowName?: string;
  macroflowActive?: boolean;
}

export interface ActiveMacroflowSummary {
  id: string;
  name: string;
  active?: boolean;
  configured?: boolean;
  packagesCount: number;
  dependenciesCount: number;
}

interface LoadedMacroflowData {
  summary: ActiveMacroflowSummary;
  dependencies: PlanningMacroflowDependency[];
  packages: ActiveMacroflowPackage[];
}

export interface MacroflowGanttView {
  id: string;
  label: string;
  services: GanttService[];
  summary: ActiveMacroflowSummary | null;
  packagesCount: number;
  dependenciesCount: number;
  incompleteCount?: number;
  isAll?: boolean;
  isPrincipal?: boolean;
}

const getServiceKey = (macroId: string | null | undefined, scopeId: string | null | undefined) =>
  `${macroId || 'sem_macro'}::${scopeId || 'sem_servico'}`;

const getLegacyServiceId = (macroId: string, scopeId: string) => `${macroId}_${scopeId}`;

const getWorkGroupId = (groupId: string) => `work_group_${groupId}`;

const getPackageKeyAliases = (item: GanttService) => {
  const aliases = new Set<string>([item.id, getServiceKey(item.macro_id, item.scope_id)]);

  if (item.package_type === 'work_group' && item.group_id) {
    aliases.add(getWorkGroupId(item.group_id));
    aliases.add(getServiceKey(`work_group:${item.group_id}`, item.group_id));
    aliases.add(getServiceKey('work_group', item.group_id));
  } else {
    aliases.add(getLegacyServiceId(item.macro_id, item.scope_id));
  }

  return aliases;
};

const createPackageKeyResolver = (items: GanttService[]) => {
  const resolver = new Map<string, string>();
  items.forEach((item) => {
    getPackageKeyAliases(item).forEach((alias) => resolver.set(alias, item.id));
  });
  return resolver;
};

const resolvePackageKey = (key: string, resolver: Map<string, string>) => resolver.get(key) ?? key;

const normalizeDailyProductivity = (
  value: number,
  unit: string | undefined,
  workingDaysPerWeek: number | undefined
) => {
  const safeValue = Number(value) || 0;
  if (safeValue <= 0) return 0;

  const normalizedUnit = (unit || '').toLowerCase();
  if (normalizedUnit.includes('semana')) {
    return safeValue / Math.max(Number(workingDaysPerWeek) || 5, 1);
  }

  return safeValue;
};

const getCapacityStatus = (
  plannedDuration: number,
  suggestedDuration: number | null
): CapacityStatus => {
  if (!suggestedDuration) return 'missing_productivity';
  if (plannedDuration >= suggestedDuration) return 'ok';
  if (plannedDuration >= suggestedDuration * 0.8) return 'attention';
  return 'insufficient';
};

const isMacroflowConfigured = (packages: ActiveMacroflowPackage[], dependencies: PlanningMacroflowDependency[]) => {
  if (packages.length < 2 || !dependencies.length) return false;
  const packageIds = new Set(packages.map((item) => item.packageKey));
  return dependencies.some((dependency) =>
    packageIds.has(dependency.predecessorKey) && packageIds.has(dependency.successorKey)
  );
};

export function useStrategicGanttData(projectId: string | undefined) {
  const { company, canEdit } = useAuth();
  const capacityModel = usePlanningCapacityModel(projectId);
  const [services, setServices] = useState<StrategicService[]>([]);
  const [productivities, setProductivities] = useState<ServiceProductivityConfig[]>([]);
  const [ganttServices, setGanttServices] = useState<GanttService[]>([]);
  const [allGanttServices, setAllGanttServices] = useState<GanttService[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [macroflowDependencies, setMacroflowDependencies] = useState<PlanningMacroflowDependency[]>([]);
  const [macroflowPackages, setMacroflowPackages] = useState<ActiveMacroflowPackage[]>([]);
  const [macroflowData, setMacroflowData] = useState<LoadedMacroflowData[]>([]);
  const [macroflowViews, setMacroflowViews] = useState<MacroflowGanttView[]>([]);
  const [defaultMacroflowViewId, setDefaultMacroflowViewId] = useState<string>('all');
  const [incompleteMacroflowsCount, setIncompleteMacroflowsCount] = useState(0);
  const [activeMacroflowSummary, setActiveMacroflowSummary] = useState<ActiveMacroflowSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectStartDate, setProjectStartDate] = useState<string>('');
  const [totalHouses, setTotalHouses] = useState(0);

  const loadData = useCallback(async () => {
    if (!projectId || !company?.id) return;
    setLoading(true);

    try {
      const [
        execBankRes,
        servicesRes,
        productivityRes,
        projectProductivityRes,
        stagesRes,
        housesRes,
        projectRes,
      ] = await Promise.all([
        supabase.rpc('get_service_execution_bank', { p_project_id: projectId }),
        supabase
          .from('project_contract_services')
          .select('macro_id, macro_name, scope_id, scope_name, macro_order, scope_order')
          .eq('project_id', projectId)
          .eq('company_id', company.id)
          .order('macro_order', { ascending: true })
          .order('scope_order', { ascending: true }),
        supabase
          .from('service_productivities')
          .select('*')
          .eq('company_id', company.id),
        supabase
          .from('project_service_productivity' as any)
          .select('*')
          .eq('project_id', projectId)
          .eq('is_active', true),
        supabase
          .from('planning_stages')
          .select('*')
          .eq('project_id', projectId)
          .order('sequence_order'),
        supabase
          .from('houses')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId),
        supabase
          .from('projects')
          .select('start_date, expected_end_date')
          .eq('id', projectId)
          .single(),
      ]);

      const houseCount = housesRes.count || 0;
      setTotalHouses(houseCount);

      const startDate = projectRes.data?.start_date || new Date().toISOString().split('T')[0];
      setProjectStartDate(startDate);

      // Build execution bank map
      const execMap = new Map<string, { executed: number; available: number; percent: number }>();
      if (!execBankRes.error && execBankRes.data) {
        (execBankRes.data as any[]).forEach((row: any) => {
          execMap.set(getServiceKey(row.macro_id, row.scope_id), {
            executed: Number(row.executed_houses) || 0,
            available: Number(row.available_houses) || 0,
            percent: Number(row.completion_percent) || 0,
          });
        });
      }

      // Build unique services
      const uniqueServices: StrategicService[] = [];
      const seen = new Set<string>();
      servicesRes.data?.forEach((s) => {
        const key = getServiceKey(s.macro_id, s.scope_id);
        if (seen.has(key)) return;
        seen.add(key);
        const exec = execMap.get(key);
        uniqueServices.push({
          macro_id: s.macro_id,
          scope_id: s.scope_id,
          macro_name: s.macro_name,
          scope_name: s.scope_name,
          macro_color: '#6b7280',
          total_houses: houseCount,
          executed_houses: exec?.executed || 0,
          remaining_houses: exec?.available ?? houseCount,
          completion_percent: exec?.percent || 0,
        });
      });
      setServices(uniqueServices);

      // Productivities: prioridade para produtividade especifica da obra,
      // com fallback para a produtividade padrao da empresa.
      const projectProds: ServiceProductivityConfig[] = ((projectProductivityRes.data as any[]) || []).map((p: any) => {
        const dailyProductivity = normalizeDailyProductivity(
          Number(p.productivity_value),
          p.productivity_unit,
          Number(p.working_days_per_week)
        );

        return {
          id: p.id,
          macro_id: p.macro_id,
          scope_id: p.scope_id,
          productivity_type: 'casa_por_dia',
          base_productivity: dailyProductivity,
          productivity_unit: p.productivity_unit || 'un/dia',
          default_team_count: Number(p.default_team_count) || 1,
          working_days_per_week: Number(p.working_days_per_week) || 5,
          source: 'project',
          team_composition: [],
        };
      });

      const defaultProds: ServiceProductivityConfig[] = (productivityRes.data || []).map((p: any) => ({
        id: p.id,
        macro_id: p.macro_id,
        scope_id: p.scope_id,
        productivity_type: p.productivity_type,
        base_productivity: Number(p.base_productivity),
        productivity_unit: 'un/dia',
        default_team_count: 1,
        working_days_per_week: 5,
        source: 'default',
        team_composition: p.team_composition || [],
      }));

      const prodsByService = new Map<string, ServiceProductivityConfig>();
      defaultProds.forEach((p) => prodsByService.set(getServiceKey(p.macro_id, p.scope_id), p));
      projectProds.forEach((p) => prodsByService.set(getServiceKey(p.macro_id, p.scope_id), p));
      const prods = Array.from(prodsByService.values());
      setProductivities(prods);

      // Planning stages
      setStages(stagesRes.data || []);

      let loadedMacroflowData: LoadedMacroflowData[] = [];
      const { data: macroflowRows, error: macroflowError } = await supabase
        .from('planning_macroflows')
        .select('*')
        .eq('project_id', projectId)
        .eq('company_id', company.id)
        .order('active', { ascending: false })
        .order('created_at', { ascending: true });

      if (!macroflowError && macroflowRows?.length) {
        loadedMacroflowData = await Promise.all(macroflowRows.map(async (row) => {
          const macroflowId = String(row.id);
          const macroflowName = String(row.name || 'Macrofluxo sem nome');
          const macroflowActive = Boolean(row.active);

          const { data: dependencyRows, error: dependencyError } = await supabase
            .from('planning_macroflow_dependencies')
            .select('*')
            .eq('macroflow_id', macroflowId)
            .order('created_at', { ascending: true });

          const dependencies: PlanningMacroflowDependency[] = dependencyError
            ? []
            : (dependencyRows ?? []).map((dependencyRow) => ({
                id: String(dependencyRow.id),
                macroflowId: String(dependencyRow.macroflow_id),
                projectId: String(dependencyRow.project_id),
                companyId: String(dependencyRow.company_id),
                predecessorType: dependencyRow.predecessor_type === 'work_group' ? 'work_group' : 'service',
                predecessorKey: String(dependencyRow.predecessor_key),
                predecessorLabel: String(dependencyRow.predecessor_label ?? 'Pacote sem nome'),
                successorType: dependencyRow.successor_type === 'work_group' ? 'work_group' : 'service',
                successorKey: String(dependencyRow.successor_key),
                successorLabel: String(dependencyRow.successor_label ?? 'Pacote sem nome'),
                relationType: dependencyRow.relation_type === 'SS' ? 'SS' : 'FS',
                lagDays: Number(dependencyRow.lag_days) || 0,
              }));

          const { data: packageRows, error: packageError } = await supabase
            .from('planning_macroflow_packages')
            .select('*')
            .eq('macroflow_id', macroflowId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });

          let packagesForMacroflow: ActiveMacroflowPackage[] = [];
          if (!packageError && packageRows?.length) {
            packagesForMacroflow = packageRows.map((packageRow) => ({
              packageKey: String(packageRow.package_key),
              packageType: packageRow.package_type === 'work_group' ? 'work_group' : 'service',
              macroflowId,
              macroflowName,
              macroflowActive,
            }));
          } else if (!packageError && dependencies.length > 0) {
            const inferred = new Map<string, ActiveMacroflowPackage>();
            dependencies.forEach((dependency) => {
              inferred.set(dependency.predecessorKey, {
                packageKey: dependency.predecessorKey,
                packageType: dependency.predecessorType,
                macroflowId,
                macroflowName,
                macroflowActive,
              });
              inferred.set(dependency.successorKey, {
                packageKey: dependency.successorKey,
                packageType: dependency.successorType,
                macroflowId,
                macroflowName,
                macroflowActive,
              });
            });
            packagesForMacroflow = Array.from(inferred.values());
          }

          const configured = isMacroflowConfigured(packagesForMacroflow, dependencies);
          return {
            summary: {
              id: macroflowId,
              name: macroflowName,
              active: macroflowActive,
              configured,
              packagesCount: packagesForMacroflow.length,
              dependenciesCount: dependencies.length,
            },
            dependencies,
            packages: packagesForMacroflow,
          };
        }));
      }

      setMacroflowData(loadedMacroflowData);
      const configuredMacroflows = loadedMacroflowData.filter((item) => item.summary.configured);
      const defaultMacroflow = configuredMacroflows.length > 1
        ? null
        : configuredMacroflows[0] ?? loadedMacroflowData.find((item) => item.summary.active) ?? null;
      const defaultDependencies = defaultMacroflow?.dependencies ?? configuredMacroflows.flatMap((item) => item.dependencies);
      const defaultPackages = defaultMacroflow?.packages ?? configuredMacroflows.flatMap((item) => item.packages);
      setMacroflowDependencies(defaultDependencies);
      setMacroflowPackages(defaultPackages);
      setActiveMacroflowSummary(loadedMacroflowData.find((item) => item.summary.active)?.summary ?? null);
      setIncompleteMacroflowsCount(loadedMacroflowData.filter((item) => !item.summary.configured).length);

      // Build inicial. Um efeito abaixo reconcilia com usePlanningCapacityModel
      // para agrupar frentes compartilhadas quando o adapter terminar de carregar.
      const allGantt = buildGanttServices(uniqueServices, prods, stagesRes.data || [], startDate, []);
      const gantt = buildGanttServices(uniqueServices, prods, stagesRes.data || [], startDate, [], defaultDependencies, defaultPackages);
      setAllGanttServices(allGantt);
      setGanttServices(gantt);
    } catch (error) {
      console.error('Error loading strategic gantt data:', error);
    } finally {
      setLoading(false);
    }
  // buildGanttServices is a local pure builder; loadData is intentionally tied to project/company changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, company?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh when production data changes (banco inicial edits, new productions, etc.)
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`strategic-gantt-productions-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productions', filter: `project_id=eq.${projectId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_productions', filter: `project_id=eq.${projectId}` }, () => loadData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, loadData]);

  // Build Gantt timeline
  const buildGanttServices = (
    svcs: StrategicService[],
    prods: ServiceProductivityConfig[],
    stgs: any[],
    startDateStr: string,
    capacityEntries: ServiceCapacityEntry[],
    dependencies: PlanningMacroflowDependency[] = [],
    includedPackages: ActiveMacroflowPackage[] = [],
  ): GanttService[] => {
    const prodMap = new Map<string, ServiceProductivityConfig>();
    prods.forEach((p) => prodMap.set(getServiceKey(p.macro_id, p.scope_id), p));
    const capacityByKey = new Map<string, ServiceCapacityEntry>();
    const capacityByName = new Map<string, ServiceCapacityEntry>();
    capacityEntries.forEach((entry) => {
      capacityByKey.set(getServiceKey(entry.macroId, entry.scopeId), entry);
      capacityByName.set(String(entry.serviceName || '').trim().toLowerCase(), entry);
    });

    const exactStageMap = new Map<string, any>();
    const macroStageMap = new Map<string, any>();
    stgs.forEach((s) => {
      if (!s.macro_id) return;
      if (s.scope_id) {
        exactStageMap.set(getServiceKey(s.macro_id, s.scope_id), s);
      } else {
        macroStageMap.set(s.macro_id, s);
      }
    });

    const serviceCountByMacro = svcs.reduce((acc, svc) => {
      acc.set(svc.macro_id, (acc.get(svc.macro_id) || 0) + 1);
      return acc;
    }, new Map<string, number>());

    const getStageForService = (macroId: string, scopeId: string) => {
      const exact = exactStageMap.get(getServiceKey(macroId, scopeId));
      if (exact) return exact;

      // Fallback para dados antigos em planning_stages sem scope_id.
      // Se a etapa tem vários serviços, não reaproveitamos o mesmo stage para todos
      // para evitar misturar produtividade, equipes e predecessoras entre serviços.
      if ((serviceCountByMacro.get(macroId) || 0) <= 1) {
        return macroStageMap.get(macroId);
      }

      return null;
    };

    const servicePackages: Array<{ svc: StrategicService; stage: any; order: number; capacity: ServiceCapacityEntry | null }> = [];
    const groupPackages = new Map<string, {
      groupId: string;
      groupName: string;
      services: StrategicService[];
      stages: any[];
      order: number;
      capacity: ServiceCapacityEntry;
    }>();

    svcs.forEach((svc, idx) => {
      const stage = getStageForService(svc.macro_id, svc.scope_id);
      const order = stage?.sequence_order ?? idx;
      const capacity = capacityByKey.get(getServiceKey(svc.macro_id, svc.scope_id))
        ?? capacityByName.get(svc.scope_name.trim().toLowerCase())
        ?? null;

      if (capacity?.groupId) {
        const existing = groupPackages.get(capacity.groupId);
        if (existing) {
          existing.services.push(svc);
          if (stage) existing.stages.push(stage);
          existing.order = Math.min(existing.order, order);
          return;
        }
        groupPackages.set(capacity.groupId, {
          groupId: capacity.groupId,
          groupName: capacity.groupName || 'Frente sem nome',
          services: [svc],
          stages: stage ? [stage] : [],
          order,
          capacity,
        });
        return;
      }

      servicePackages.push({ svc, stage, order, capacity });
    });

    const sorted = [
      ...Array.from(groupPackages.values()).map((group) => ({ type: 'work_group' as const, group, order: group.order })),
      ...servicePackages.map((item) => ({ type: 'service' as const, item, order: item.order })),
    ].sort((a, b) => a.order - b.order);

    const result: GanttService[] = [];
    const scheduleMap = new Map<string, { start: Date; end: Date }>();

    for (const sortedItem of sorted) {
      const isWorkGroup = sortedItem.type === 'work_group';
      const group = isWorkGroup ? sortedItem.group : null;
      const svc: StrategicService = isWorkGroup
        ? {
            macro_id: `work_group:${group!.groupId}`,
            scope_id: group!.groupId,
            macro_name: 'Frente compartilhada',
            scope_name: group!.groupName,
            macro_color: '#0f766e',
            total_houses: Math.max(...group!.services.map((item) => item.total_houses), 0),
            executed_houses: Math.max(...group!.services.map((item) => item.executed_houses), 0),
            remaining_houses: Math.max(...group!.services.map((item) => item.remaining_houses), 0),
            completion_percent: group!.services.length
              ? group!.services.reduce((sum, item) => sum + item.completion_percent, 0) / group!.services.length
              : 0,
          }
        : sortedItem.item.svc;
      const stage = isWorkGroup ? null : sortedItem.item.stage;
      const capacity = isWorkGroup ? group!.capacity : sortedItem.item.capacity;
      const serviceKey = getServiceKey(svc.macro_id, svc.scope_id);
      const id = isWorkGroup ? `work_group_${group!.groupId}` : getLegacyServiceId(svc.macro_id, svc.scope_id);
      const prod = prodMap.get(serviceKey);
      const stageProductivity = Number(stage?.planned_productivity) || 0;
      const capacityTeams = Math.max(Number(capacity?.teamCount) || 0, 0);
      const capacityDailyPerTeam = capacity?.dailyCapacity && capacityTeams > 0
        ? capacity.dailyCapacity / capacityTeams
        : null;
      const hasCapacityModelProductivity = Boolean(capacity?.dailyCapacity && capacity.dailyCapacity > 0);
      const hasProjectProductivitySource = prod?.source === 'project' || capacity?.capacitySource === 'service_productivity' || capacity?.capacitySource === 'work_group';
      const hasProjectProductivity = (prod?.source === 'project' && prod.base_productivity > 0) || hasCapacityModelProductivity;
      const hasLegacyProductivity = !hasProjectProductivity && stageProductivity > 0;
      const hasDefaultProductivity = !hasProjectProductivity && !!prod && prod.base_productivity > 0;
      const hasProductivity = hasProjectProductivity || hasLegacyProductivity || hasDefaultProductivity;
      const productivity = hasProjectProductivitySource
        ? capacityDailyPerTeam || prod?.base_productivity || 1
        : stageProductivity || prod?.base_productivity || 1;
      const productivitySource = hasProjectProductivitySource
        ? 'project'
        : stageProductivity > 0
          ? 'manual'
          : prod?.source || 'missing';
      const productivityType = prod?.productivity_type || 'casa_por_dia';
      const teams = hasProjectProductivitySource
        ? capacityTeams || prod?.default_team_count || 1
        : stage?.planned_teams || prod?.default_team_count || 1;
      const dependsOn = stage?.depends_on || null;
      const sequenceOrder = stage?.sequence_order ?? sortedItem.order;

      // Calculate suggested duration from productivity without persisting dates.
      const remaining = svc.remaining_houses;
      const dailyCapacity = productivity * teams;
      const suggestedDurationDays = hasProductivity
        ? Math.max(1, Math.ceil(remaining / Math.max(dailyCapacity, 0.01)))
        : null;
      const durationDays = Math.max(
        1,
        hasProjectProductivitySource
          ? suggestedDurationDays || Math.ceil(remaining / Math.max(dailyCapacity, 0.01))
          : Number(stage?.duration_days) || suggestedDurationDays || Math.ceil(remaining / Math.max(dailyCapacity, 0.01))
      );
      const durationDeltaDays = suggestedDurationDays !== null
        ? durationDays - suggestedDurationDays
        : null;
      const capacityStatus = getCapacityStatus(durationDays, suggestedDurationDays);

      // Determine start date based on predecessor
      let plannedStart = startOfDay(parseISO(startDateStr));
      if (dependsOn) {
        const depSchedule = scheduleMap.get(dependsOn);
        if (depSchedule) {
          plannedStart = addDays(depSchedule.end, 1);
        }
      }

      const plannedEnd = addDays(plannedStart, durationDays - 1);
      scheduleMap.set(stage?.id || id, { start: plannedStart, end: plannedEnd });

      result.push({
        id,
        package_type: isWorkGroup ? 'work_group' : 'service',
        group_id: group?.groupId ?? null,
        internal_services: group?.services.map((item) => ({
          id: getLegacyServiceId(item.macro_id, item.scope_id),
          macro_id: item.macro_id,
          scope_id: item.scope_id,
          macro_name: item.macro_name,
          scope_name: item.scope_name,
        })),
        macro_id: svc.macro_id,
        scope_id: svc.scope_id,
        macro_name: svc.macro_name,
        scope_name: svc.scope_name,
        name: `${svc.macro_name} - ${svc.scope_name}`,
        color: svc.macro_color,
        remaining_houses: remaining,
        total_houses: svc.total_houses,
        executed_houses: svc.executed_houses,
        completion_percent: svc.completion_percent,
        productivity,
        productivity_type: productivityType,
        productivity_source: productivitySource,
        productivity_unit: prod?.productivity_unit || (stageProductivity > 0 ? 'casas/dia manual' : 'sem produtividade'),
        has_productivity: hasProductivity,
        teams,
        duration_days: durationDays,
        suggested_duration_days: suggestedDurationDays,
        duration_delta_days: durationDeltaDays,
        capacity_status: capacityStatus,
        schedule_source: hasProjectProductivity
          ? 'official_productivity'
          : hasLegacyProductivity
            ? 'legacy_fallback'
            : 'missing_productivity',
        has_explicit_predecessor: Boolean(dependsOn),
        planned_start: plannedStart,
        planned_end: plannedEnd,
        depends_on: dependsOn,
        sequence_order: sequenceOrder,
        stage_id: stage?.id || null,
      });
    }

    const packageKeyResolver = createPackageKeyResolver(result);
    const normalizedIncludedPackages = includedPackages.map((item) => ({
      ...item,
      packageKey: resolvePackageKey(item.packageKey, packageKeyResolver),
    }));
    const normalizedDependencies = dependencies.map((dependency) => ({
      ...dependency,
      predecessorKey: resolvePackageKey(dependency.predecessorKey, packageKeyResolver),
      successorKey: resolvePackageKey(dependency.successorKey, packageKeyResolver),
    }));
    const includedKeys = new Set(normalizedIncludedPackages.map((item) => item.packageKey));
    const macroflowByPackageKey = new Map(normalizedIncludedPackages.map((item) => [item.packageKey, item]));
    const hasConfiguredPackageList = includedKeys.size >= 2;
    const validIncludedDependencies = normalizedDependencies.filter((dependency) =>
      includedKeys.has(dependency.predecessorKey) && includedKeys.has(dependency.successorKey)
    );

    if (hasConfiguredPackageList && validIncludedDependencies.length > 0) {
      return applyMacroflowSchedule(
        result
          .filter((item) => includedKeys.has(item.id))
          .map((item) => {
            const macroflowPackage = macroflowByPackageKey.get(item.id);
            return {
              ...item,
              macroflow_id: macroflowPackage?.macroflowId ?? null,
              macroflow_name: macroflowPackage?.macroflowName ?? null,
              macroflow_active: macroflowPackage?.macroflowActive ?? false,
            };
          }),
        validIncludedDependencies,
        startDateStr,
      );
    }

    return result;
  };

  const applyMacroflowSchedule = (
    items: GanttService[],
    dependencies: PlanningMacroflowDependency[],
    startDateStr: string,
  ) => {
    if (!dependencies.length) return items;

    const projectStart = startOfDay(parseISO(startDateStr));
    const packageKeys = items.map((item) => item.id);
    const validDependencies = dependencies.filter((dependency) =>
      packageKeys.includes(dependency.predecessorKey) && packageKeys.includes(dependency.successorKey)
    );

    if (!validDependencies.length || hasMacroflowCycle(packageKeys, validDependencies)) {
      return items;
    }

    const byId = new Map(items.map((item) => [item.id, { ...item }]));
    const indegree = new Map<string, number>();
    const outgoing = new Map<string, PlanningMacroflowDependency[]>();
    items.forEach((item) => indegree.set(item.id, 0));

    validDependencies.forEach((dependency) => {
      outgoing.set(dependency.predecessorKey, [...(outgoing.get(dependency.predecessorKey) ?? []), dependency]);
      indegree.set(dependency.successorKey, (indegree.get(dependency.successorKey) ?? 0) + 1);
    });

    const queue = items
      .filter((item) => (indegree.get(item.id) ?? 0) === 0)
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((item) => item.id);
    const earliestStart = new Map<string, Date>();
    items.forEach((item) => earliestStart.set(item.id, projectStart));
    const ordered: string[] = [];

    while (queue.length) {
      const currentId = queue.shift()!;
      const current = byId.get(currentId);
      if (!current) continue;

      const currentStart = earliestStart.get(currentId) ?? projectStart;
      current.planned_start = currentStart;
      current.planned_end = addDays(currentStart, current.duration_days - 1);
      current.schedule_source = 'macroflow';
      byId.set(currentId, current);
      ordered.push(currentId);

      (outgoing.get(currentId) ?? []).forEach((dependency) => {
        const successor = byId.get(dependency.successorKey);
        if (!successor) return;
        const lag = Number(dependency.lagDays) || 0;
        const candidateStart = dependency.relationType === 'SS'
          ? addDays(current.planned_start, lag)
          : addDays(current.planned_end, lag + 1);
        const previousStart = earliestStart.get(successor.id) ?? projectStart;
        if (candidateStart.getTime() > previousStart.getTime()) {
          earliestStart.set(successor.id, candidateStart);
        }
        successor.depends_on = dependency.predecessorKey;
        successor.has_explicit_predecessor = true;
        byId.set(successor.id, successor);
        const nextCount = (indegree.get(successor.id) ?? 0) - 1;
        indegree.set(successor.id, nextCount);
        if (nextCount === 0) {
          queue.push(successor.id);
          queue.sort((a, b) => (byId.get(a)?.sequence_order ?? 0) - (byId.get(b)?.sequence_order ?? 0));
        }
      });
    }

    const scheduled = Array.from(byId.values()).sort((a, b) => {
      const startDelta = a.planned_start.getTime() - b.planned_start.getTime();
      if (startDelta !== 0) return startDelta;
      return a.sequence_order - b.sequence_order;
    });

    return scheduled.map((item, index) => ({ ...item, sequence_order: ordered.includes(item.id) ? index : item.sequence_order }));
  };

  useEffect(() => {
    if (!projectStartDate) return;
    const nextAllGantt = buildGanttServices(
      services,
      productivities,
      stages,
      projectStartDate,
      capacityModel.serviceCapacityMap,
    );
    setAllGanttServices(nextAllGantt);

    const configuredMacroflows = macroflowData.filter((item) => item.summary.configured);
    const principalMacroflow = configuredMacroflows.find((item) => item.summary.active) ?? null;
    const nextViews: MacroflowGanttView[] = [];

    if (configuredMacroflows.length > 0) {
      const allPackages = configuredMacroflows.flatMap((item) => item.packages);
      const allDependencies = configuredMacroflows.flatMap((item) => item.dependencies);
      const allServices = buildGanttServices(
        services,
        productivities,
        stages,
        projectStartDate,
        capacityModel.serviceCapacityMap,
        allDependencies,
        allPackages,
      );

      nextViews.push({
        id: 'all',
        label: 'Todos os macrofluxos',
        services: allServices,
        summary: null,
        packagesCount: allPackages.length,
        dependenciesCount: allDependencies.length,
        incompleteCount: incompleteMacroflowsCount,
        isAll: true,
      });

      if (principalMacroflow) {
        nextViews.push({
          id: 'principal',
          label: `Principal: ${principalMacroflow.summary.name}`,
          services: buildGanttServices(
            services,
            productivities,
            stages,
            projectStartDate,
            capacityModel.serviceCapacityMap,
            principalMacroflow.dependencies,
            principalMacroflow.packages,
          ),
          summary: principalMacroflow.summary,
          packagesCount: principalMacroflow.packages.length,
          dependenciesCount: principalMacroflow.dependencies.length,
          isPrincipal: true,
        });
      }

      configuredMacroflows.forEach((item) => {
        nextViews.push({
          id: item.summary.id,
          label: item.summary.name,
          services: buildGanttServices(
            services,
            productivities,
            stages,
            projectStartDate,
            capacityModel.serviceCapacityMap,
            item.dependencies,
            item.packages,
          ),
          summary: item.summary,
          packagesCount: item.packages.length,
          dependenciesCount: item.dependencies.length,
          isPrincipal: Boolean(item.summary.active),
        });
      });
    }

    setMacroflowViews(nextViews);
    const nextDefaultViewId = configuredMacroflows.length > 1
      ? 'all'
      : configuredMacroflows[0]?.summary.id || 'all';
    setDefaultMacroflowViewId(nextDefaultViewId);
    const defaultView = nextViews.find((view) => view.id === nextDefaultViewId) ?? nextViews[0] ?? null;
    setGanttServices(defaultView?.services ?? []);
    setMacroflowDependencies(defaultView?.id === 'all'
      ? configuredMacroflows.flatMap((item) => item.dependencies)
      : configuredMacroflows.find((item) => item.summary.id === defaultView?.summary?.id)?.dependencies ?? macroflowDependencies);
    setMacroflowPackages(defaultView?.id === 'all'
      ? configuredMacroflows.flatMap((item) => item.packages)
      : configuredMacroflows.find((item) => item.summary.id === defaultView?.summary?.id)?.packages ?? macroflowPackages);
  // buildGanttServices is pure and reads only the dependencies passed above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacityModel.serviceCapacityMap, incompleteMacroflowsCount, macroflowData, productivities, projectStartDate, services, stages]);

  // Update productivity for a service
  const updateServiceProductivity = useCallback(async (
    macroId: string,
    scopeId: string,
    newProductivity: number,
    newTeams: number
  ) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    if (!company?.id) return;

    // Update service_productivities
    const existing = productivities.find(
      (p) => p.macro_id === macroId && p.scope_id === scopeId
    );

    if (existing?.id && existing.source === 'project') {
      await supabase
        .from('project_service_productivity' as any)
        .update({
          productivity_value: newProductivity,
          productivity_unit: 'casa/dia',
          default_team_count: newTeams,
        })
        .eq('id', existing.id);
    } else if (existing?.id) {
      await supabase
        .from('service_productivities')
        .update({ base_productivity: newProductivity })
        .eq('id', existing.id);
    }

    // Update planning_stages only when the service still relies on legacy/manual data.
    const stage = stages.find((s: any) => s.macro_id === macroId && s.scope_id === scopeId)
      || (services.filter((s) => s.macro_id === macroId).length <= 1
        ? stages.find((s: any) => s.macro_id === macroId && !s.scope_id)
        : null);
    if (stage && existing?.source !== 'project') {
      await supabase
        .from('planning_stages')
        .update({ planned_productivity: newProductivity, planned_teams: newTeams })
        .eq('id', stage.id);
    }

    // Recalculate locally
    const updatedProds = productivities.map((p) => {
      if (p.macro_id === macroId && p.scope_id === scopeId) {
        return {
          ...p,
          base_productivity: newProductivity,
          productivity_unit: p.source === 'project' ? 'casa/dia' : p.productivity_unit,
          default_team_count: p.source === 'project' ? newTeams : p.default_team_count,
        };
      }
      return p;
    });
    setProductivities(updatedProds);

    // Rebuild gantt
    const allGantt = buildGanttServices(services, updatedProds, stages, projectStartDate, capacityModel.serviceCapacityMap);
    const gantt = buildGanttServices(services, updatedProds, stages, projectStartDate, capacityModel.serviceCapacityMap, macroflowDependencies, macroflowPackages);
    setAllGanttServices(allGantt);
    setGanttServices(gantt);
    toast.success('Produtividade atualizada');
  // buildGanttServices is pure and reads only the dependencies passed above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, capacityModel.serviceCapacityMap, company?.id, macroflowDependencies, macroflowPackages, productivities, stages, services, projectStartDate]);

  // Update predecessor
  const updatePredecessor = useCallback(async (
    serviceId: string,
    predecessorStageId: string | null
  ) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    if (!projectId) return;

    const service = ganttServices.find((s) => s.id === serviceId);
    if (!service) return;

    if (service.stage_id) {
      await supabase
        .from('planning_stages')
        .update({ depends_on: predecessorStageId })
        .eq('id', service.stage_id);
    }

    // Rebuild
    await loadData();
    toast.success('Predecessora atualizada');
  }, [canEdit, projectId, ganttServices, loadData]);

  // Update sequence order
  const updateSequenceOrder = useCallback(async (
    serviceId: string,
    newOrder: number
  ) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const service = ganttServices.find((s) => s.id === serviceId);
    if (!service?.stage_id) return;

    await supabase
      .from('planning_stages')
      .update({ sequence_order: newOrder })
      .eq('id', service.stage_id);

    await loadData();
  }, [canEdit, ganttServices, loadData]);

  // Projected end date
  const projectedEndDate = useMemo(() => {
    if (ganttServices.length === 0) return null;
    const dates = ganttServices.map((s) => s.planned_end);
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [ganttServices]);

  const hasConfiguredMacroflow = useMemo(() => {
    return macroflowData.some((item) => item.summary.configured);
  }, [macroflowData]);

  return {
    services,
    ganttServices,
    allGanttServices,
    productivities,
    loading,
    totalHouses,
    projectStartDate,
    projectedEndDate,
    hasConfiguredMacroflow,
    activeMacroflowSummary,
    macroflowViews,
    defaultMacroflowViewId,
    incompleteMacroflowsCount,
    loadData,
    updateServiceProductivity,
    updatePredecessor,
    updateSequenceOrder,
  };
}
