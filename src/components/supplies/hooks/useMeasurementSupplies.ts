import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
 
 export interface MeasurementSupplySummary {
   measurement_id: string;
   measurement_number: number;
   start_date: string;
   end_date: string;
   measurement_status: string;
   total_items: number;
   total_quantity: number;
   total_value: number;
   items_alert: number;
   items_quoted: number;
   items_ordered: number;
   items_delivered: number;
   percent_purchased: number;
   supply_status: 'empty' | 'pending' | 'quoted' | 'partial' | 'complete';
 }
 
 export interface MeasurementSupplyRequest {
   id: string;
   project_id: string;
   item_id: string | null;
   item_name: string;
   item_unit: string | null;
   quantity: number;
   unit_value: number | null;
   total_value: number | null;
   status: string;
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
 
 export interface MeasurementSupplyKPIs {
   total_items: number;
   total_quantity: number;
   total_value: number;
   items_alert: number;
   items_quoted: number;
   items_ordered: number;
   items_delivered: number;
   critical_items: number;
   percent_purchased: number;
   value_purchased: number;
   value_pending: number;
 }
 
export function useMeasurementSupplies(projectId: string | undefined) {
   const storageKey = useMemo(() => projectId ? `obramap_supply_requests_${projectId}` : null, [projectId]);
   const [measurements, setMeasurements] = useState<MeasurementSupplySummary[]>(() => {
     if (!storageKey) return [];
     try {
       const saved = sessionStorage.getItem(storageKey);
       return saved ? JSON.parse(saved).measurements || [] : [];
     } catch {
       return [];
     }
   });
   const [selectedMeasurement, setSelectedMeasurement] = useState<MeasurementSupplySummary | null>(() => {
     if (!storageKey) return null;
     try {
       const saved = sessionStorage.getItem(storageKey);
       return saved ? JSON.parse(saved).selectedMeasurement || null : null;
     } catch {
       return null;
     }
   });
   const [requests, setRequests] = useState<MeasurementSupplyRequest[]>(() => {
     if (!storageKey) return [];
     try {
       const saved = sessionStorage.getItem(storageKey);
       return saved ? JSON.parse(saved).requests || [] : [];
     } catch {
       return [];
     }
   });
   const [kpis, setKpis] = useState<MeasurementSupplyKPIs | null>(() => {
     if (!storageKey) return null;
     try {
       const saved = sessionStorage.getItem(storageKey);
       return saved ? JSON.parse(saved).kpis || null : null;
     } catch {
       return null;
     }
   });
   const [isLoading, setIsLoading] = useState(false);
   const [isLoadingRequests, setIsLoadingRequests] = useState(false);

   useEffect(() => {
     if (!storageKey) return;
     try {
       sessionStorage.setItem(storageKey, JSON.stringify({
         measurements,
         selectedMeasurement,
         requests,
         kpis,
       }));
     } catch {
       // noop
     }
   }, [storageKey, measurements, selectedMeasurement, requests, kpis]);
 
   // Load measurements summary
   const loadMeasurements = useCallback(async () => {
     if (!projectId) {
       setMeasurements([]);
       return;
     }
 
     setIsLoading(true);
     try {
       const { data, error } = await supabase.rpc('get_supply_requests_by_measurement', {
         p_project_id: projectId
       });
 
       if (error) throw error;
       setMeasurements((data || []) as MeasurementSupplySummary[]);
     } catch (error) {
       console.error('Error loading measurement supplies:', error);
       toast.error('Erro ao carregar medições');
     } finally {
       setIsLoading(false);
     }
   }, [projectId]);
 
   // Load requests for specific measurement
   const loadMeasurementRequests = useCallback(async (measurementId: string, status?: string) => {
     if (!projectId || !measurementId) {
       setRequests([]);
       setKpis(null);
       return;
     }
 
     setIsLoadingRequests(true);
     try {
       const [requestsRes, kpisRes] = await Promise.all([
         supabase.rpc('get_measurement_supply_requests', {
           p_project_id: projectId,
           p_measurement_id: measurementId,
           p_status: status || null
         }),
         supabase.rpc('get_measurement_supply_kpis', {
           p_project_id: projectId,
           p_measurement_id: measurementId
         })
       ]);
 
       if (requestsRes.error) throw requestsRes.error;
       if (kpisRes.error) throw kpisRes.error;
 
       setRequests((requestsRes.data || []) as MeasurementSupplyRequest[]);
       
       const kpisData = kpisRes.data;
       if (Array.isArray(kpisData) && kpisData.length > 0) {
         setKpis(kpisData[0] as MeasurementSupplyKPIs);
       } else {
         setKpis(null);
       }
     } catch (error) {
       console.error('Error loading measurement requests:', error);
       toast.error('Erro ao carregar requisições da medição');
     } finally {
       setIsLoadingRequests(false);
     }
   }, [projectId]);
 
   // Select a measurement
   const selectMeasurement = useCallback((measurement: MeasurementSupplySummary | null) => {
     setSelectedMeasurement(measurement);
     if (measurement) {
       loadMeasurementRequests(measurement.measurement_id);
     } else {
       setRequests([]);
       setKpis(null);
     }
   }, [loadMeasurementRequests]);
 
  // Generate supplies for specific planning period
    const generateForMeasurement = useCallback(async (planningPeriodId: string): Promise<number> => {
      if (!projectId) return 0;

      try {
        const { data, error } = await supabase.rpc('generate_supplies_from_planning_period', {
          p_period_id: planningPeriodId
        });

        if (error) throw error;

        const result = data as { success: boolean; inserted_count: number; deleted_count: number; period_id: string };
        
        if (result.success) {
          if (result.inserted_count > 0) {
            toast.success(`${result.inserted_count} requisições criadas`);
            await loadMeasurements();
            if (selectedMeasurement?.measurement_id === planningPeriodId) {
              await loadMeasurementRequests(planningPeriodId);
            }
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
    }, [projectId, loadMeasurements, loadMeasurementRequests, selectedMeasurement]);
 
   // Group requests by family
   const getGroupedByFamily = useCallback((status?: string) => {
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
       items: MeasurementSupplyRequest[];
       total_value: number;
       total_quantity: number;
     }>);
   }, [requests]);
 
   // Load on mount
   useEffect(() => {
     if (projectId) {
       loadMeasurements();
     }
   }, [projectId, loadMeasurements]);
 
   return {
     measurements,
     selectedMeasurement,
     requests,
     kpis,
     isLoading,
     isLoadingRequests,
     loadMeasurements,
     loadMeasurementRequests,
     selectMeasurement,
     generateForMeasurement,
     getGroupedByFamily,
   };
 }