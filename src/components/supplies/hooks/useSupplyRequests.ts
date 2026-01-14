import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type SupplyRequestStatus = 'alert' | 'quoted' | 'ordered' | 'delivered' | 'cancelled';

export interface SupplyRequest {
  id: string;
  project_id: string;
  item_id: string | null;
  item_name: string;
  item_unit: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  status: SupplyRequestStatus;
  source_plan_id: string | null;
  measurement_id: string | null;
  family_id: string | null;
  family_name: string | null;
  family_color: string | null;
  scope_id: string | null;
  macro_id: string | null;
  required_date: string | null;
  order_by_date: string | null;
  is_critical: boolean;
  notes: string | null;
  quotation_id: string | null;
  purchase_order_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplyKPIs {
  alerts: number;
  quoted: number;
  ordered: number;
  delivered: number;
  cancelled: number;
  critical: number;
  total_pending_value: number;
  total_quoted_value: number;
  total_ordered_value: number;
}

const STATUS_LABELS: Record<SupplyRequestStatus, string> = {
  alert: 'Alerta',
  quoted: 'Cotado',
  ordered: 'Pedido',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export function useSupplyRequests(projectId: string | undefined) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [kpis, setKpis] = useState<SupplyKPIs>({
    alerts: 0,
    quoted: 0,
    ordered: 0,
    delivered: 0,
    cancelled: 0,
    critical: 0,
    total_pending_value: 0,
    total_quoted_value: 0,
    total_ordered_value: 0,
  });

  // Load requests from backend
  const loadRequests = useCallback(async (status?: SupplyRequestStatus) => {
    if (!projectId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_supply_requests_by_status', {
        p_project_id: projectId,
        p_status: status || null
      });

      if (error) throw error;

      const typedData = (data || []) as SupplyRequest[];
      setRequests(typedData);

      // Calculate KPIs
      const newKpis: SupplyKPIs = {
        alerts: typedData.filter(r => r.status === 'alert').length,
        quoted: typedData.filter(r => r.status === 'quoted').length,
        ordered: typedData.filter(r => r.status === 'ordered').length,
        delivered: typedData.filter(r => r.status === 'delivered').length,
        cancelled: typedData.filter(r => r.status === 'cancelled').length,
        critical: typedData.filter(r => r.is_critical && r.status === 'alert').length,
        total_pending_value: typedData
          .filter(r => r.status === 'alert')
          .reduce((sum, r) => sum + (r.total_value || 0), 0),
        total_quoted_value: typedData
          .filter(r => r.status === 'quoted')
          .reduce((sum, r) => sum + (r.total_value || 0), 0),
        total_ordered_value: typedData
          .filter(r => r.status === 'ordered')
          .reduce((sum, r) => sum + (r.total_value || 0), 0),
      };
      setKpis(newKpis);

    } catch (error) {
      console.error('Error loading supply requests:', error);
      toast.error('Erro ao carregar requisições de suprimentos');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Transition status via Edge Function
  const transitionStatus = useCallback(async (
    requestId: string,
    newStatus: SupplyRequestStatus,
    notes?: string
  ): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return false;
      }

      const response = await supabase.functions.invoke('transition-supply-status', {
        body: { request_id: requestId, new_status: newStatus, notes }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      
      if (!result.success) {
        toast.error(result.error || 'Erro ao atualizar status');
        return false;
      }

      toast.success(`Status atualizado: ${STATUS_LABELS[result.old_status]} → ${STATUS_LABELS[result.new_status]}`);
      
      // Reload requests to get fresh data from backend
      await loadRequests();
      return true;

    } catch (error) {
      console.error('Error transitioning status:', error);
      toast.error('Erro ao atualizar status');
      return false;
    }
  }, [loadRequests]);

  // Generate requests from planning
  const generateFromPlanning = useCallback(async (measurementId?: string): Promise<number> => {
    if (!projectId) return 0;

    try {
      const { data, error } = await supabase.rpc('generate_supply_requests_from_planning', {
        p_project_id: projectId,
        p_measurement_id: measurementId || null
      });

      if (error) throw error;

      const result = data as { success: boolean; inserted_count: number; message: string };
      
      if (result.success) {
        if (result.inserted_count > 0) {
          toast.success(result.message);
          await loadRequests();
        } else {
          toast.info('Nenhuma nova requisição a criar');
        }
        return result.inserted_count;
      }
      
      return 0;
    } catch (error) {
      console.error('Error generating supply requests:', error);
      toast.error('Erro ao gerar requisições');
      return 0;
    }
  }, [projectId, loadRequests]);

  // Filter helpers
  const getRequestsByStatus = useCallback((status: SupplyRequestStatus) => {
    return requests.filter(r => r.status === status);
  }, [requests]);

  const getAlerts = useCallback(() => getRequestsByStatus('alert'), [getRequestsByStatus]);
  const getQuoted = useCallback(() => getRequestsByStatus('quoted'), [getRequestsByStatus]);
  const getOrdered = useCallback(() => getRequestsByStatus('ordered'), [getRequestsByStatus]);
  const getDelivered = useCallback(() => getRequestsByStatus('delivered'), [getRequestsByStatus]);

  // Group by family
  const getGroupedByFamily = useCallback((status?: SupplyRequestStatus) => {
    const filtered = status ? requests.filter(r => r.status === status) : requests;
    
    return filtered.reduce((acc, req) => {
      const familyName = req.family_name || 'Sem Família';
      if (!acc[familyName]) {
        acc[familyName] = {
          family_id: req.family_id,
          family_name: familyName,
          family_color: req.family_color,
          items: [],
          total_value: 0,
          total_quantity: 0
        };
      }
      acc[familyName].items.push(req);
      acc[familyName].total_value += req.total_value || 0;
      acc[familyName].total_quantity += req.quantity || 0;
      return acc;
    }, {} as Record<string, {
      family_id: string | null;
      family_name: string;
      family_color: string | null;
      items: SupplyRequest[];
      total_value: number;
      total_quantity: number;
    }>);
  }, [requests]);

  // Load on mount and project change
  useEffect(() => {
    if (projectId) {
      loadRequests();
    }
  }, [projectId, loadRequests]);

  return {
    requests,
    isLoading,
    kpis,
    loadRequests,
    transitionStatus,
    generateFromPlanning,
    getAlerts,
    getQuoted,
    getOrdered,
    getDelivered,
    getRequestsByStatus,
    getGroupedByFamily,
    STATUS_LABELS,
  };
}
