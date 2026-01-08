import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SupplyAlert, SupplyKPIs, MaterialFamily, ProjectLeadTime } from '../types';
import { differenceInDays } from 'date-fns';
import { toast } from 'sonner';

export function useSupplyAlerts(projectId: string | undefined) {
  const [alerts, setAlerts] = useState<SupplyAlert[]>([]);
  const [families, setFamilies] = useState<MaterialFamily[]>([]);
  const [projectLeadTimes, setProjectLeadTimes] = useState<ProjectLeadTime[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!projectId) {
      setAlerts([]);
      setFamilies([]);
      setProjectLeadTimes([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [alertsRes, familiesRes, leadTimesRes] = await Promise.all([
        supabase
          .from('supply_alerts')
          .select(`
            *,
            family:material_families(*),
            measurement:measurements(id, measurement_number, start_date, end_date)
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
          .eq('project_id', projectId)
      ]);

      if (alertsRes.error) throw alertsRes.error;
      if (familiesRes.error) throw familiesRes.error;
      if (leadTimesRes.error) throw leadTimesRes.error;

      setAlerts((alertsRes.data || []).map(a => ({
        ...a,
        status: a.status as SupplyAlert['status'],
        family: a.family as MaterialFamily | undefined,
        measurement: a.measurement as SupplyAlert['measurement']
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
      
      toast.success('Status atualizado');
    } catch (error) {
      console.error('Error updating alert status:', error);
      toast.error('Erro ao atualizar status');
    }
  }, []);

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
      
      toast.success('Lead time salvo');
      await loadData();
    } catch (error) {
      console.error('Error saving lead time:', error);
      toast.error('Erro ao salvar lead time');
    }
  }, [projectId, projectLeadTimes, loadData]);

  // Calculate KPIs
  const kpis: SupplyKPIs = {
    pendingAlerts: alerts.filter(a => a.status === 'pending').length,
    delayedAlerts: alerts.filter(a => a.status === 'delayed').length,
    orderedAlerts: alerts.filter(a => a.status === 'ordered').length,
    deliveredAlerts: alerts.filter(a => a.status === 'delivered').length,
    nextOrderDate: alerts.find(a => a.status === 'pending')?.order_by_date || null,
    avgDelayDays: calculateAvgDelayDays(alerts),
    totalPendingValue: alerts
      .filter(a => a.status === 'pending' || a.status === 'delayed')
      .reduce((sum, a) => sum + (a.total_value || 0), 0),
    onTimeDeliveryRate: calculateOnTimeRate(alerts)
  };

  return {
    alerts,
    families,
    projectLeadTimes,
    kpis,
    isLoading,
    loadData,
    regenerateAlerts,
    updateAlertStatus,
    saveProjectLeadTime
  };
}

function calculateAvgDelayDays(alerts: SupplyAlert[]): number {
  const delayedAlerts = alerts.filter(a => a.status === 'delayed');
  if (delayedAlerts.length === 0) return 0;
  
  const today = new Date();
  const totalDays = delayedAlerts.reduce((sum, a) => {
    return sum + Math.max(0, differenceInDays(today, new Date(a.order_by_date)));
  }, 0);
  
  return Math.round(totalDays / delayedAlerts.length);
}

function calculateOnTimeRate(alerts: SupplyAlert[]): number {
  const delivered = alerts.filter(a => a.status === 'delivered');
  if (delivered.length === 0) return 100;
  
  // For now, assume all delivered are on time (would need actual delivery date tracking)
  return 100;
}
