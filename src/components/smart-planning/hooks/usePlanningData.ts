import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  PlanningStage, 
  PlanningTeam, 
  ProductivityTemplate, 
  DailyWorkLog,
  PlanningAlert,
  PlanningSimulation
} from '../types';
import { toast } from 'sonner';

export function usePlanningData(projectId: string | undefined) {
  const [stages, setStages] = useState<PlanningStage[]>([]);
  const [teams, setTeams] = useState<PlanningTeam[]>([]);
  const [templates, setTemplates] = useState<ProductivityTemplate[]>([]);
  const [workLogs, setWorkLogs] = useState<DailyWorkLog[]>([]);
  const [alerts, setAlerts] = useState<PlanningAlert[]>([]);
  const [simulations, setSimulations] = useState<PlanningSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSetupComplete, setIsSetupComplete] = useState(false);

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
        simulationsRes
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
          .order('created_at', { ascending: false })
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
    } catch (error) {
      console.error('Error loading planning data:', error);
      toast.error('Erro ao carregar dados de planejamento');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stage CRUD
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
    const { error } = await supabase
      .from('planning_stages')
      .delete()
      .eq('id', stageId);
    
    if (error) {
      toast.error('Erro ao remover etapa');
      return;
    }
    
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
    // Apply simulation logic would go here
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

  return {
    stages,
    teams,
    templates,
    workLogs,
    alerts,
    simulations,
    loading,
    isSetupComplete,
    loadData,
    addStage,
    updateStage,
    deleteStage,
    addWorkLog,
    updateWorkLog,
    resolveAlert,
    createSimulation,
    applySimulation
  };
}
