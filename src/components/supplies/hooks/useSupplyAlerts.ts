import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SupplyAlert, SupplyKPIs, MaterialFamily, ProjectLeadTime } from '../types';
import { toast } from 'sonner';

export function useSupplyAlerts(projectId: string | undefined) {
  const [alerts, setAlerts] = useState<SupplyAlert[]>([]);
  const [families, setFamilies] = useState<MaterialFamily[]>([]);
  const [projectLeadTimes, setProjectLeadTimes] = useState<ProjectLeadTime[]>([]);
  const [kpis, setKpis] = useState<SupplyKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!projectId) {
      setAlerts([]);
      setFamilies([]);
      setProjectLeadTimes([]);
      setKpis(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [alertsRes, familiesRes, leadTimesRes, kpisRes] = await Promise.all([
        supabase
          .from('supply_alerts')
          .select(`
            *,
            family:material_families(*),
            measurement:measurements(id, measurement_number, start_date, end_date, status),
            scope_item:scope_items(id, name, category, quantity, unit, unit_value, scope_id, macro_id)
          `)
          .eq('project_id', projectId)
          .order('order_by_date', { ascending: true }),
        supabase
          .from('material_families')
          .select('*')
          .order('display_order'),
        supabase
          .from('project_lead_times')
          .select('*, family:material_families(*)')
          .eq('project_id', projectId),
        // Call the backend RPC for KPIs
        supabase.rpc('get_supply_kpis', { p_project_id: projectId })
      ]);

      if (alertsRes.error) throw alertsRes.error;
      if (familiesRes.error) throw familiesRes.error;
      if (leadTimesRes.error) throw leadTimesRes.error;

      setAlerts((alertsRes.data || []).map(a => ({
        ...a,
        status: a.status as SupplyAlert['status'],
        family: a.family as MaterialFamily | undefined,
        scope_item: a.scope_item as SupplyAlert['scope_item'],
        measurement: a.measurement as SupplyAlert['measurement'],
        is_labor: a.is_labor || false,
        delay_days: a.delay_days || 0,
        is_critical: a.is_critical || false
      })));
      
      setFamilies((familiesRes.data || []).map(f => ({
        ...f,
        is_labor: f.is_labor || false,
        lead_time_days: f.lead_time_days || 7
      })));
      
      setProjectLeadTimes((leadTimesRes.data || []).map(lt => ({
        ...lt,
        family: lt.family as MaterialFamily | undefined
      })));

      // Set KPIs from backend
      if (kpisRes.data && typeof kpisRes.data === 'object' && !Array.isArray(kpisRes.data)) {
        setKpis(kpisRes.data as unknown as SupplyKPIs);
      }
    } catch (error) {
      console.error('Error loading supply data:', error);
      toast.error('Erro ao carregar dados de suprimentos');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const regenerateAlerts = useCallback(async () => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase.rpc('regenerate_supply_alerts', {
        p_project_id: projectId
      });
      
      if (error) throw error;
      
      toast.success('Alertas regenerados com sucesso');
      await loadData();
    } catch (error) {
      console.error('Error regenerating alerts:', error);
      toast.error('Erro ao regenerar alertas');
    }
  }, [projectId, loadData]);

  const updateAlertStatus = useCallback(async (alertId: string, status: SupplyAlert['status']) => {
    try {
      const { error } = await supabase
        .from('supply_alerts')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', alertId);
      
      if (error) throw error;
      
      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, status } : a
      ));
      
      // Reload KPIs after status change
      const { data: newKpis } = await supabase.rpc('get_supply_kpis', { p_project_id: projectId });
      if (newKpis && typeof newKpis === 'object' && !Array.isArray(newKpis)) {
        setKpis(newKpis as unknown as SupplyKPIs);
      }
      
      toast.success('Status atualizado');
    } catch (error) {
      console.error('Error updating alert status:', error);
      toast.error('Erro ao atualizar status');
    }
  }, [projectId]);

  const saveProjectLeadTime = useCallback(async (familyId: string, leadTimeDays: number) => {
    if (!projectId) return;
    
    try {
      const existing = projectLeadTimes.find(lt => lt.family_id === familyId);
      
      if (existing) {
        const { error } = await supabase
          .from('project_lead_times')
          .update({ lead_time_days: leadTimeDays, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('project_lead_times')
          .insert({
            project_id: projectId,
            family_id: familyId,
            lead_time_days: leadTimeDays
          });
        
        if (error) throw error;
      }
      
      toast.success('Lead time salvo (alertas serão regenerados automaticamente)');
      // Alerts will be auto-regenerated by the trigger
      await loadData();
    } catch (error) {
      console.error('Error saving lead time:', error);
      toast.error('Erro ao salvar lead time');
    }
  }, [projectId, projectLeadTimes, loadData]);

  const closeLaborMeasurement = useCallback(async (
    contractId: string, 
    houseIds: number[], 
    notes?: string
  ) => {
    try {
      const { error } = await supabase.rpc('close_labor_measurement', {
        p_contract_id: contractId,
        p_house_ids: houseIds,
        p_notes: notes || null
      });

      if (error) throw error;

      toast.success('Medição fechada e produção registrada');
      await loadData();
    } catch (error) {
      console.error('Error closing labor measurement:', error);
      toast.error('Erro ao fechar medição');
    }
  }, [loadData]);

  // Group alerts by family and labor type
  const materialAlerts = alerts.filter(a => !a.is_labor);
  const laborAlerts = alerts.filter(a => a.is_labor);

  // Get critical alerts
  const criticalAlerts = alerts.filter(a => a.is_critical && a.status !== 'delivered');

  return {
    alerts,
    materialAlerts,
    laborAlerts,
    criticalAlerts,
    families,
    projectLeadTimes,
    kpis,
    isLoading,
    loadData,
    regenerateAlerts,
    updateAlertStatus,
    saveProjectLeadTime,
    closeLaborMeasurement
  };
}
