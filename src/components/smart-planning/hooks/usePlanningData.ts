import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  PlanningStage, 
  PlanningTeam, 
  ProductivityTemplate, 
  DailyWorkLog,
  PlanningAlert,
  PlanningSimulation,
  PlanningBaseline,
  TeamComposition,
  PlanningVersion,
  CompletedUnitsInfo
} from '../types';
import { toast } from 'sonner';

export function usePlanningData(projectId: string | undefined) {
  const [stages, setStages] = useState<PlanningStage[]>([]);
  const [teams, setTeams] = useState<PlanningTeam[]>([]);
  const [templates, setTemplates] = useState<ProductivityTemplate[]>([]);
  const [workLogs, setWorkLogs] = useState<DailyWorkLog[]>([]);
  const [alerts, setAlerts] = useState<PlanningAlert[]>([]);
  const [simulations, setSimulations] = useState<PlanningSimulation[]>([]);
  const [baselines, setBaselines] = useState<PlanningBaseline[]>([]);
  const [versions, setVersions] = useState<PlanningVersion[]>([]);
  const [completedUnitsInfo, setCompletedUnitsInfo] = useState<CompletedUnitsInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [hasBaseline, setHasBaseline] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const [
        stagesRes,
        teamsRes,
        templatesRes,
        workLogsRes,
        alertsRes,
        simulationsRes,
        baselinesRes,
        versionsRes,
        weeklyProductionsRes
      ] = await Promise.all([
        supabase
          .from('planning_stages')
          .select('*')
          .eq('project_id', projectId)
          .order('sequence_order'),
        supabase
          .from('planning_teams')
          .select('*')
          .eq('project_id', projectId),
        supabase
          .from('productivity_library')
          .select('*')
          .or(`project_id.eq.${projectId},project_id.is.null`)
          .order('stage_name'),
        supabase
          .from('daily_work_logs')
          .select('*')
          .eq('project_id', projectId)
          .order('log_date', { ascending: false }),
        supabase
          .from('planning_alerts')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_resolved', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('planning_simulations')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_applied', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('planning_baselines')
          .select('*')
          .eq('project_id', projectId)
          .order('version_number', { ascending: false }),
        supabase
          .from('planning_versions')
          .select('*')
          .eq('project_id', projectId)
          .order('version_number', { ascending: false }),
        // Fetch weekly productions to calculate completed units
        supabase
          .from('weekly_productions')
          .select('*')
          .eq('project_id', projectId)
      ]);

      if (stagesRes.data) {
        setStages(stagesRes.data as PlanningStage[]);
        setIsSetupComplete(stagesRes.data.length > 0);
      }
      if (teamsRes.data) setTeams(teamsRes.data as PlanningTeam[]);
      if (templatesRes.data) setTemplates(templatesRes.data as ProductivityTemplate[]);
      if (workLogsRes.data) setWorkLogs(workLogsRes.data as DailyWorkLog[]);
      if (alertsRes.data) setAlerts(alertsRes.data as PlanningAlert[]);
      if (simulationsRes.data) setSimulations(simulationsRes.data as unknown as PlanningSimulation[]);
      if (baselinesRes.data) {
        setBaselines(baselinesRes.data as unknown as PlanningBaseline[]);
        setHasBaseline(baselinesRes.data.length > 0);
      }
      if (versionsRes.data) setVersions(versionsRes.data as PlanningVersion[]);
      
      // Calculate completed units per macro from weekly productions
      if (weeklyProductionsRes.data) {
        const completedByMacro: Record<string, CompletedUnitsInfo> = {};
        for (const prod of weeklyProductionsRes.data) {
          if (!completedByMacro[prod.macro_id]) {
            completedByMacro[prod.macro_id] = {
              macroId: prod.macro_id,
              macroName: prod.macro_name,
              completedUnits: 0,
              totalHouseIds: []
            };
          }
          completedByMacro[prod.macro_id].completedUnits += prod.houses_count;
          completedByMacro[prod.macro_id].totalHouseIds.push(...(prod.house_ids || []));
        }
        setCompletedUnitsInfo(Object.values(completedByMacro));
      }
    } catch (error) {
      console.error('Error loading planning data:', error);
      toast.error('Erro ao carregar dados de planejamento');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stage CRUD with team compositions
  const addStageWithTeams = async (
    stage: Omit<PlanningStage, 'id' | 'created_at' | 'updated_at'>,
    teamComposition: TeamComposition
  ) => {
    const { data, error } = await supabase
      .from('planning_stages')
      .insert(stage)
      .select()
      .single();
    
    if (error) {
      toast.error('Erro ao adicionar etapa');
      return null;
    }
    
    // Auto-create teams with composition
    const teamInserts = [];
    for (let i = 1; i <= stage.planned_teams; i++) {
      teamInserts.push({
        project_id: projectId!,
        stage_id: data.id,
        name: `Equipe ${stage.name} ${i}`,
        professionals_count: teamComposition.professionals,
        helpers_count: teamComposition.helpers
      });
    }
    
    if (teamInserts.length > 0) {
      await supabase.from('planning_teams').insert(teamInserts);
    }
    
    return data as PlanningStage;
  };

  const addStage = async (stage: Omit<PlanningStage, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('planning_stages')
      .insert(stage)
      .select()
      .single();
    
    if (error) {
      toast.error('Erro ao adicionar etapa');
      return null;
    }
    
    // Auto-create teams
    const teamInserts = [];
    for (let i = 1; i <= stage.planned_teams; i++) {
      teamInserts.push({
        project_id: projectId!,
        stage_id: data.id,
        name: `Equipe ${stage.name} ${i}`
      });
    }
    
    if (teamInserts.length > 0) {
      await supabase.from('planning_teams').insert(teamInserts);
    }
    
    await loadData();
    return data as PlanningStage;
  };

  const updateStage = async (stageId: string, updates: Partial<PlanningStage>) => {
    const { error } = await supabase
      .from('planning_stages')
      .update(updates)
      .eq('id', stageId);
    
    if (error) {
      toast.error('Erro ao atualizar etapa');
      return;
    }
    
    await loadData();
  };

  const deleteStage = async (stageId: string) => {
    // Cascade delete is handled by database constraints
    const { error } = await supabase
      .from('planning_stages')
      .delete()
      .eq('id', stageId);
    
    if (error) {
      toast.error('Erro ao remover etapa');
      return;
    }
    
    toast.success('Etapa e dados associados removidos');
    await loadData();
  };

  // Delete all planning data with cascade (for complete reset)
  const deleteAllPlanningData = async () => {
    if (!projectId) return;
    
    try {
      // Delete stages (cascade will remove teams, work logs, alerts)
      await supabase
        .from('planning_stages')
        .delete()
        .eq('project_id', projectId);
      
      // Delete baselines
      await supabase
        .from('planning_baselines')
        .delete()
        .eq('project_id', projectId);
      
      // Delete simulations
      await supabase
        .from('planning_simulations')
        .delete()
        .eq('project_id', projectId);
      
      // Delete versions
      await supabase
        .from('planning_versions')
        .delete()
        .eq('project_id', projectId);
      
      toast.success('Planejamento excluído com sucesso');
      await loadData();
    } catch (error) {
      console.error('Error deleting planning data:', error);
      toast.error('Erro ao excluir planejamento');
    }
  };

  // Update stage predecessor and latency
  const updateStagePredecessor = async (stageId: string, predecessorId: string | null, latencyDays: number) => {
    const { error } = await supabase
      .from('planning_stages')
      .update({ 
        depends_on: predecessorId,
        latency_days: latencyDays
      })
      .eq('id', stageId);
    
    if (error) {
      toast.error('Erro ao atualizar predecessora');
      return;
    }
    
    toast.success('Predecessora atualizada');
    await loadData();
  };

  // Work Log CRUD
  const addWorkLog = async (log: Omit<DailyWorkLog, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('daily_work_logs')
      .insert(log)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        toast.error('Já existe um registro para esta data/etapa/equipe');
      } else {
        toast.error('Erro ao adicionar registro');
      }
      return null;
    }
    
    toast.success('Registro adicionado com sucesso');
    await loadData();
    return data as DailyWorkLog;
  };

  const updateWorkLog = async (logId: string, updates: Partial<DailyWorkLog>) => {
    const { error } = await supabase
      .from('daily_work_logs')
      .update(updates)
      .eq('id', logId);
    
    if (error) {
      toast.error('Erro ao atualizar registro');
      return;
    }
    
    await loadData();
  };

  // Alerts
  const resolveAlert = async (alertId: string) => {
    const { error } = await supabase
      .from('planning_alerts')
      .update({ 
        is_resolved: true, 
        resolved_at: new Date().toISOString() 
      })
      .eq('id', alertId);
    
    if (error) {
      toast.error('Erro ao resolver alerta');
      return;
    }
    
    await loadData();
  };

  // Simulations
  const createSimulation = async (simulation: Omit<PlanningSimulation, 'id' | 'created_at' | 'is_applied' | 'applied_at' | 'applied_by'>) => {
    const { data, error } = await supabase
      .from('planning_simulations')
      .insert({
        project_id: simulation.project_id,
        name: simulation.name,
        description: simulation.description,
        simulation_data: simulation.simulation_data as any,
        results: simulation.results as any,
        created_by: simulation.created_by
      } as any)
      .select()
      .single();
    
    if (error) {
      toast.error('Erro ao criar simulação');
      return null;
    }
    
    await loadData();
    return data as unknown as PlanningSimulation;
  };

  const applySimulation = async (simulationId: string) => {
    const { error } = await supabase
      .from('planning_simulations')
      .update({ 
        is_applied: true, 
        applied_at: new Date().toISOString() 
      })
      .eq('id', simulationId);
    
    if (error) {
      toast.error('Erro ao aplicar simulação');
      return;
    }
    
    toast.success('Simulação aplicada com sucesso');
    await loadData();
  };

  // Baseline (Freeze planning)
  const createBaseline = async (name: string = 'Planejamento Inicial') => {
    const baselineData = {
      stages: stages,
      teams: teams,
      projected_end_date: new Date().toISOString(),
      total_duration_days: stages.reduce((sum, s) => sum + (s.duration_days || 0), 0)
    };

    const { data, error } = await supabase
      .from('planning_baselines')
      .insert({
        project_id: projectId!,
        name,
        version_number: baselines.length + 1,
        baseline_data: baselineData as any
      })
      .select()
      .single();
    
    if (error) {
      toast.error('Erro ao criar baseline');
      return null;
    }

    // Mark stages as baseline
    await supabase
      .from('planning_stages')
      .update({ 
        is_baseline: true, 
        baseline_created_at: new Date().toISOString() 
      })
      .eq('project_id', projectId!);
    
    toast.success('Planejamento iniciado oficialmente!');
    await loadData();
    return data as unknown as PlanningBaseline;
  };

  // Team management
  const addTeamToStage = async (stageId: string, professionals: number = 1, helpers: number = 1) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;

    const existingTeams = teams.filter(t => t.stage_id === stageId);
    const newTeamNumber = existingTeams.length + 1;

    const { error } = await supabase
      .from('planning_teams')
      .insert({
        project_id: projectId!,
        stage_id: stageId,
        name: `Equipe ${stage.name} ${newTeamNumber}`,
        professionals_count: professionals,
        helpers_count: helpers
      });

    if (error) {
      toast.error('Erro ao adicionar equipe');
      return;
    }

    // Update stage planned_teams count
    await supabase
      .from('planning_stages')
      .update({ planned_teams: stage.planned_teams + 1 })
      .eq('id', stageId);

    toast.success('Equipe adicionada');
    await loadData();
  };

  const removeTeamFromStage = async (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    const stage = stages.find(s => s.id === team.stage_id);
    if (!stage || stage.planned_teams <= 1) {
      toast.error('A etapa precisa ter pelo menos uma equipe');
      return;
    }

    const { error } = await supabase
      .from('planning_teams')
      .delete()
      .eq('id', teamId);

    if (error) {
      toast.error('Erro ao remover equipe');
      return;
    }

    await supabase
      .from('planning_stages')
      .update({ planned_teams: stage.planned_teams - 1 })
      .eq('id', stage.id);

    toast.success('Equipe removida');
    await loadData();
  };

  const updateTeam = async (teamId: string, updates: Partial<PlanningTeam>) => {
    const { error } = await supabase
      .from('planning_teams')
      .update(updates)
      .eq('id', teamId);

    if (error) {
      toast.error('Erro ao atualizar equipe');
      return;
    }

    await loadData();
  };

  return {
    stages,
    teams,
    templates,
    workLogs,
    alerts,
    simulations,
    baselines,
    versions,
    completedUnitsInfo,
    loading,
    isSetupComplete,
    hasBaseline,
    loadData,
    addStage,
    addStageWithTeams,
    updateStage,
    deleteStage,
    deleteAllPlanningData,
    updateStagePredecessor,
    addWorkLog,
    updateWorkLog,
    resolveAlert,
    createSimulation,
    applySimulation,
    createBaseline,
    addTeamToStage,
    removeTeamFromStage,
    updateTeam
  };
}
