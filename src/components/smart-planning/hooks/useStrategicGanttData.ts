import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { addDays, startOfDay, parseISO } from 'date-fns';
import { toast } from 'sonner';

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
  team_composition: { role: string; quantity: number; unit: string }[];
}

export interface GanttService {
  id: string; // macro_id + scope_id
  macro_id: string;
  scope_id: string;
  name: string;
  color: string;
  remaining_houses: number;
  total_houses: number;
  executed_houses: number;
  completion_percent: number;
  productivity: number;
  productivity_type: string;
  teams: number;
  duration_days: number;
  planned_start: Date;
  planned_end: Date;
  depends_on: string | null; // id of predecessor service
  sequence_order: number;
  stage_id: string | null; // planning_stages id if exists
}

export function useStrategicGanttData(projectId: string | undefined) {
  const { company, canEdit } = useAuth();
  const [services, setServices] = useState<StrategicService[]>([]);
  const [productivities, setProductivities] = useState<ServiceProductivityConfig[]>([]);
  const [ganttServices, setGanttServices] = useState<GanttService[]>([]);
  const [stages, setStages] = useState<any[]>([]);
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
          execMap.set(`${row.macro_id}_${row.scope_id}`, {
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
        const key = `${s.macro_id}_${s.scope_id}`;
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

      // Productivities
      const prods: ServiceProductivityConfig[] = (productivityRes.data || []).map((p: any) => ({
        id: p.id,
        macro_id: p.macro_id,
        scope_id: p.scope_id,
        productivity_type: p.productivity_type,
        base_productivity: Number(p.base_productivity),
        team_composition: p.team_composition || [],
      }));
      setProductivities(prods);

      // Planning stages
      setStages(stagesRes.data || []);

      // Build Gantt services
      const gantt = buildGanttServices(uniqueServices, prods, stagesRes.data || [], startDate);
      setGanttServices(gantt);
    } catch (error) {
      console.error('Error loading strategic gantt data:', error);
    } finally {
      setLoading(false);
    }
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
    startDateStr: string
  ): GanttService[] => {
    const prodMap = new Map<string, ServiceProductivityConfig>();
    prods.forEach((p) => prodMap.set(`${p.macro_id}_${p.scope_id}`, p));

    const stageMap = new Map<string, any>();
    stgs.forEach((s) => {
      if (s.macro_id) stageMap.set(s.macro_id, s);
    });

    const result: GanttService[] = [];
    const scheduleMap = new Map<string, { start: Date; end: Date }>();

    // Sort by stage sequence if available, otherwise by service order
    const sorted = [...svcs].map((svc, idx) => {
      const stage = stageMap.get(svc.macro_id);
      return { svc, stage, order: stage?.sequence_order ?? idx };
    }).sort((a, b) => a.order - b.order);

    let nextStart = startOfDay(parseISO(startDateStr));

    for (const { svc, stage } of sorted) {
      const id = `${svc.macro_id}_${svc.scope_id}`;
      const prod = prodMap.get(id);
      const productivity = prod?.base_productivity || 1;
      const productivityType = prod?.productivity_type || 'casa_por_dia';
      const teams = stage?.planned_teams || 1;
      const dependsOn = stage?.depends_on || null;
      const sequenceOrder = stage?.sequence_order ?? result.length;

      // Calculate duration
      const remaining = svc.remaining_houses;
      let durationDays: number;
      if (productivityType === 'casa_por_dia') {
        durationDays = Math.max(1, Math.ceil(remaining / (productivity * teams)));
      } else {
        durationDays = Math.max(1, Math.ceil(remaining * productivity / teams));
      }

      // Determine start date based on predecessor
      let plannedStart = nextStart;
      if (dependsOn) {
        const depSchedule = scheduleMap.get(dependsOn);
        if (depSchedule) {
          plannedStart = addDays(depSchedule.end, 1);
        }
      }

      const plannedEnd = addDays(plannedStart, durationDays - 1);
      scheduleMap.set(stage?.id || id, { start: plannedStart, end: plannedEnd });

      // Only advance nextStart if no explicit predecessor (sequential by default)
      if (!dependsOn) {
        nextStart = addDays(plannedEnd, 1);
      }

      result.push({
        id,
        macro_id: svc.macro_id,
        scope_id: svc.scope_id,
        name: `${svc.macro_name} - ${svc.scope_name}`,
        color: svc.macro_color,
        remaining_houses: remaining,
        total_houses: svc.total_houses,
        executed_houses: svc.executed_houses,
        completion_percent: svc.completion_percent,
        productivity,
        productivity_type: productivityType,
        teams,
        duration_days: durationDays,
        planned_start: plannedStart,
        planned_end: plannedEnd,
        depends_on: dependsOn,
        sequence_order: sequenceOrder,
        stage_id: stage?.id || null,
      });
    }

    return result;
  };

  // Update productivity for a service
  const updateServiceProductivity = useCallback(async (
    macroId: string,
    scopeId: string,
    newProductivity: number,
    newTeams: number
  ) => {
    if (!company?.id) return;

    // Update service_productivities
    const existing = productivities.find(
      (p) => p.macro_id === macroId && p.scope_id === scopeId
    );

    if (existing?.id) {
      await supabase
        .from('service_productivities')
        .update({ base_productivity: newProductivity })
        .eq('id', existing.id);
    }

    // Update planning_stages if exists
    const stage = stages.find((s: any) => s.macro_id === macroId);
    if (stage) {
      await supabase
        .from('planning_stages')
        .update({ planned_productivity: newProductivity, planned_teams: newTeams })
        .eq('id', stage.id);
    }

    // Recalculate locally
    const updatedProds = productivities.map((p) => {
      if (p.macro_id === macroId && p.scope_id === scopeId) {
        return { ...p, base_productivity: newProductivity };
      }
      return p;
    });
    setProductivities(updatedProds);

    // Rebuild gantt
    const gantt = buildGanttServices(services, updatedProds, stages, projectStartDate);
    setGanttServices(gantt);
    toast.success('Produtividade atualizada');
  }, [company?.id, productivities, stages, services, projectStartDate]);

  // Update predecessor
  const updatePredecessor = useCallback(async (
    serviceId: string,
    predecessorStageId: string | null
  ) => {
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
  }, [projectId, ganttServices, loadData]);

  // Update sequence order
  const updateSequenceOrder = useCallback(async (
    serviceId: string,
    newOrder: number
  ) => {
    const service = ganttServices.find((s) => s.id === serviceId);
    if (!service?.stage_id) return;

    await supabase
      .from('planning_stages')
      .update({ sequence_order: newOrder })
      .eq('id', service.stage_id);

    await loadData();
  }, [ganttServices, loadData]);

  // Projected end date
  const projectedEndDate = useMemo(() => {
    if (ganttServices.length === 0) return null;
    const dates = ganttServices.map((s) => s.planned_end);
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [ganttServices]);

  return {
    services,
    ganttServices,
    productivities,
    loading,
    totalHouses,
    projectStartDate,
    projectedEndDate,
    loadData,
    updateServiceProductivity,
    updatePredecessor,
    updateSequenceOrder,
  };
}
