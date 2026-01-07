import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface Measurement {
  id: string;
  project_id: string;
  measurement_number: number;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeasurementService {
  id: string;
  measurement_id: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_id: string;
  scope_name: string;
  planned_house_ids: number[];
  planned_houses: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Production {
  id: string;
  project_id: string;
  measurement_id: string | null;
  measurement_service_id: string | null;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_id: string;
  scope_name: string;
  house_ids: number[];
  houses_count: number;
  production_date: string;
  is_initial_database: boolean;
  is_unplanned: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeasurementWithServices extends Measurement {
  services: MeasurementService[];
  totalHouses: number;
  servicesCount: number;
}

interface UseMeasurementsOptions {
  projectId: string | undefined;
}

export function useMeasurements({ projectId }: UseMeasurementsOptions) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementServices, setMeasurementServices] = useState<MeasurementService[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load all measurements data
  const loadData = useCallback(async () => {
    if (!projectId) {
      setMeasurements([]);
      setMeasurementServices([]);
      setProductions([]);
      return;
    }
    
    setIsLoading(true);
    try {
      // First get measurements
      const measurementsResult = await supabase
        .from('measurements')
        .select('*')
        .eq('project_id', projectId)
        .order('measurement_number', { ascending: true });

      if (measurementsResult.error) throw measurementsResult.error;
      
      const measurementIds = measurementsResult.data?.map(m => m.id) || [];
      
      // Only fetch services if there are measurements
      let servicesData: MeasurementService[] = [];
      if (measurementIds.length > 0) {
        const servicesResult = await supabase
          .from('measurement_services')
          .select('*')
          .in('measurement_id', measurementIds);
        
        if (servicesResult.error) throw servicesResult.error;
        servicesData = servicesResult.data || [];
      }
      
      // Fetch productions
      const productionsResult = await supabase
        .from('productions')
        .select('*')
        .eq('project_id', projectId)
        .order('production_date', { ascending: false });

      if (productionsResult.error) throw productionsResult.error;

      setMeasurements(measurementsResult.data || []);
      setMeasurementServices(servicesData);
      setProductions(productionsResult.data || []);
    } catch (error) {
      console.error('Error loading measurements data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load on mount and when projectId changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get measurements with services aggregated
  const measurementsWithServices = useMemo<MeasurementWithServices[]>(() => {
    return measurements.map(m => {
      const services = measurementServices.filter(s => s.measurement_id === m.id);
      const totalHouses = services.reduce((sum, s) => {
        const uniqueHouses = new Set(s.planned_house_ids);
        return sum + uniqueHouses.size;
      }, 0);
      
      return {
        ...m,
        services,
        totalHouses,
        servicesCount: services.length
      };
    });
  }, [measurements, measurementServices]);

  // Get next measurement number
  const nextMeasurementNumber = useMemo(() => {
    if (measurements.length === 0) return 1;
    return Math.max(...measurements.map(m => m.measurement_number)) + 1;
  }, [measurements]);

  // Create or get measurement for a period
  const createOrGetMeasurement = useCallback(async (
    measurementNumber: number,
    startDate: string,
    endDate: string,
    notes?: string
  ): Promise<Measurement | null> => {
    if (!projectId) return null;

    try {
      // Check if measurement already exists
      const existing = measurements.find(m => m.measurement_number === measurementNumber);
      if (existing) {
        return existing;
      }

      const { data, error } = await supabase
        .from('measurements')
        .insert({
          project_id: projectId,
          measurement_number: measurementNumber,
          start_date: startDate,
          end_date: endDate,
          notes: notes || null
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Duplicate - fetch existing
          const { data: existingData } = await supabase
            .from('measurements')
            .select('*')
            .eq('project_id', projectId)
            .eq('measurement_number', measurementNumber)
            .single();
          return existingData;
        }
        throw error;
      }

      setMeasurements(prev => [...prev, data]);
      return data;
    } catch (error) {
      console.error('Error creating measurement:', error);
      toast.error('Erro ao criar medição');
      return null;
    }
  }, [projectId, measurements]);

  // Add service to a measurement
  const addServiceToMeasurement = useCallback(async (
    measurementId: string,
    service: {
      macro_id: string;
      macro_name: string;
      macro_color: string;
      scope_id: string;
      scope_name: string;
      planned_house_ids: number[];
      notes?: string;
    }
  ): Promise<MeasurementService | null> => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('measurement_services')
        .insert({
          measurement_id: measurementId,
          macro_id: service.macro_id,
          macro_name: service.macro_name,
          macro_color: service.macro_color,
          scope_id: service.scope_id,
          scope_name: service.scope_name,
          planned_house_ids: service.planned_house_ids,
          planned_houses: service.planned_house_ids.length,
          notes: service.notes || null
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('Este serviço já está cadastrado nesta medição.');
          return null;
        }
        throw error;
      }

      setMeasurementServices(prev => [...prev, data]);
      return data;
    } catch (error) {
      console.error('Error adding service to measurement:', error);
      toast.error('Erro ao adicionar serviço à medição');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Update service in measurement
  const updateServiceInMeasurement = useCallback(async (
    serviceId: string,
    updates: Partial<{
      planned_house_ids: number[];
      notes: string | null;
    }>
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      const updateData: any = { ...updates };
      if (updates.planned_house_ids) {
        updateData.planned_houses = updates.planned_house_ids.length;
      }

      const { error } = await supabase
        .from('measurement_services')
        .update(updateData)
        .eq('id', serviceId);

      if (error) throw error;

      setMeasurementServices(prev => 
        prev.map(s => s.id === serviceId ? { ...s, ...updateData } : s)
      );
      return true;
    } catch (error) {
      console.error('Error updating service:', error);
      toast.error('Erro ao atualizar serviço');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Delete service from measurement
  const deleteServiceFromMeasurement = useCallback(async (serviceId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('measurement_services')
        .delete()
        .eq('id', serviceId);

      if (error) throw error;

      setMeasurementServices(prev => prev.filter(s => s.id !== serviceId));
      return true;
    } catch (error) {
      console.error('Error deleting service:', error);
      toast.error('Erro ao remover serviço');
      return false;
    }
  }, []);

  // Register production
  const registerProduction = useCallback(async (
    production: {
      measurementId: string | null;
      measurementServiceId: string | null;
      macro_id: string;
      macro_name: string;
      macro_color: string;
      scope_id: string;
      scope_name: string;
      house_ids: number[];
      production_date: string;
      is_initial_database: boolean;
      is_unplanned: boolean;
      notes?: string;
    }
  ): Promise<Production | null> => {
    if (!projectId) return null;

    setIsSaving(true);
    try {
      // Validate measurement exists if provided
      if (production.measurementId) {
        const measurement = measurements.find(m => m.id === production.measurementId);
        if (!measurement) {
          toast.error('Medição inválida');
          return null;
        }
      }

      // Validate measurement service belongs to measurement
      if (production.measurementServiceId && production.measurementId) {
        const service = measurementServices.find(
          s => s.id === production.measurementServiceId && s.measurement_id === production.measurementId
        );
        if (!service) {
          toast.error('Serviço não pertence à medição selecionada');
          return null;
        }
      }

      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('productions')
        .insert({
          project_id: projectId,
          measurement_id: production.measurementId,
          measurement_service_id: production.measurementServiceId,
          macro_id: production.macro_id,
          macro_name: production.macro_name,
          macro_color: production.macro_color,
          scope_id: production.scope_id,
          scope_name: production.scope_name,
          house_ids: production.house_ids,
          houses_count: production.house_ids.length,
          production_date: production.production_date,
          is_initial_database: production.is_initial_database,
          is_unplanned: production.is_unplanned,
          notes: production.notes || null,
          created_by: userData?.user?.id || null
        })
        .select()
        .single();

      if (error) throw error;

      setProductions(prev => [data, ...prev]);
      return data;
    } catch (error) {
      console.error('Error registering production:', error);
      toast.error('Erro ao registrar produção');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [projectId, measurements, measurementServices]);

  // Delete production
  const deleteProduction = useCallback(async (productionId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('productions')
        .delete()
        .eq('id', productionId);

      if (error) throw error;

      setProductions(prev => prev.filter(p => p.id !== productionId));
      return true;
    } catch (error) {
      console.error('Error deleting production:', error);
      toast.error('Erro ao excluir produção');
      return false;
    }
  }, []);

  // Delete a complete measurement with all services and productions (cascade)
  const deleteMeasurement = useCallback(async (measurementId: string): Promise<boolean> => {
    try {
      // 1. Delete all productions linked to services of this measurement
      const servicesToDelete = measurementServices.filter(s => s.measurement_id === measurementId);
      for (const service of servicesToDelete) {
        await supabase
          .from('productions')
          .delete()
          .eq('measurement_service_id', service.id);
      }
      
      // 2. Also delete productions directly linked to measurement
      await supabase
        .from('productions')
        .delete()
        .eq('measurement_id', measurementId);

      // 3. Delete all measurement_services
      await supabase
        .from('measurement_services')
        .delete()
        .eq('measurement_id', measurementId);

      // 4. Delete the measurement itself
      const { error } = await supabase
        .from('measurements')
        .delete()
        .eq('id', measurementId);

      if (error) throw error;

      // Update local state
      setMeasurements(prev => prev.filter(m => m.id !== measurementId));
      setMeasurementServices(prev => prev.filter(s => s.measurement_id !== measurementId));
      setProductions(prev => prev.filter(p => p.measurement_id !== measurementId));
      
      return true;
    } catch (error) {
      console.error('Error deleting measurement:', error);
      toast.error('Erro ao excluir medição');
      return false;
    }
  }, [measurementServices]);

  // Get services for a specific measurement
  const getServicesForMeasurement = useCallback((measurementId: string): MeasurementService[] => {
    return measurementServices.filter(s => s.measurement_id === measurementId);
  }, [measurementServices]);

  // Get productions for a specific measurement
  const getProductionsForMeasurement = useCallback((measurementId: string): Production[] => {
    return productions.filter(p => p.measurement_id === measurementId);
  }, [productions]);

  // Check if a service is already registered in a measurement
  const isServiceRegisteredInMeasurement = useCallback((
    measurementId: string,
    macroId: string,
    scopeId: string
  ): boolean => {
    return measurementServices.some(
      s => s.measurement_id === measurementId && s.macro_id === macroId && s.scope_id === scopeId
    );
  }, [measurementServices]);

  // Get registered production IDs for a measurement
  const getRegisteredServiceIds = useCallback((measurementId: string): string[] => {
    const productionsInMeasurement = productions.filter(p => p.measurement_id === measurementId);
    return [...new Set(productionsInMeasurement.map(p => p.measurement_service_id).filter(Boolean) as string[])];
  }, [productions]);

  // Format measurement display
  const formatMeasurementDisplay = useCallback((measurement: MeasurementWithServices): string => {
    const startFormatted = format(parseISO(measurement.start_date), 'dd/MM', { locale: ptBR });
    const endFormatted = format(parseISO(measurement.end_date), 'dd/MM', { locale: ptBR });
    return `${measurement.measurement_number}ª Medição — ${startFormatted} a ${endFormatted} — ${measurement.servicesCount} serviço(s) — ${measurement.totalHouses} casas`;
  }, []);

  return {
    // Data
    measurements,
    measurementServices,
    productions,
    measurementsWithServices,
    nextMeasurementNumber,
    
    // Loading states
    isLoading,
    isSaving,
    
    // Actions
    loadData,
    createOrGetMeasurement,
    addServiceToMeasurement,
    updateServiceInMeasurement,
    deleteServiceFromMeasurement,
    deleteMeasurement,
    registerProduction,
    deleteProduction,
    
    // Helpers
    getServicesForMeasurement,
    getProductionsForMeasurement,
    isServiceRegisteredInMeasurement,
    getRegisteredServiceIds,
    formatMeasurementDisplay
  };
}
