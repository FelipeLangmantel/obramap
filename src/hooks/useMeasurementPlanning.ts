import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PlanningTarget {
  id: string;
  company_id: string;
  project_id: string;
  contract_id: string | null;
  measurement_id: string | null;
  measurement_number: number | null;
  macro_id: string | null;
  scope_id: string | null;
  macro_name: string | null;
  scope_name: string | null;
  period_start: string;
  period_end: string;
  planned_houses: number;
  productivity_planned: number;
  teams_planned: number;
  planned_cost: number;
  planned_revenue: number;
  planned_margin: number;
  unit_cost_value: number;
  unit_revenue_value: number;
  target_margin_percent: number | null;
  target_profit_value: number | null;
  // Campos calculados no frontend
  calculatedCost?: number;
  calculatedRevenue?: number;
  calculatedProfit?: number;
  calculatedMargin?: number;
  status?: 'success' | 'warning' | 'danger';
}

export interface Measurement {
  id: string;
  measurement_number: number;
  start_date: string;
  end_date: string;
  status: string | null;
}

export interface ProjectContract {
  id: string;
  project_id: string;
  contract_value_total: number;
  target_margin_percent: number | null;
  cost_target_percent: number;
}

export function useMeasurementPlanning(projectId: string | null) {
  const { company, isAdmin, isCompanyAdmin } = useAuth();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [contract, setContract] = useState<ProjectContract | null>(null);
  const [targets, setTargets] = useState<PlanningTarget[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = isAdmin || isCompanyAdmin;

  // Carregar medições do projeto
  const loadMeasurements = useCallback(async () => {
    if (!projectId) return;

    const { data, error } = await supabase
      .from("measurements")
      .select("id, measurement_number, start_date, end_date, status")
      .eq("project_id", projectId)
      .order("measurement_number", { ascending: true });

    if (error) {
      console.error("Erro ao carregar medições:", error);
      return;
    }

    setMeasurements(data || []);
  }, [projectId]);

  // Carregar contrato do projeto
  const loadContract = useCallback(async () => {
    if (!projectId) return;

    const { data, error } = await supabase
      .from("project_contracts")
      .select("id, project_id, contract_value_total, target_margin_percent, cost_target_percent")
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar contrato:", error);
      return;
    }

    setContract(data);
  }, [projectId]);

  // Carregar targets de planejamento para uma medição
  const loadTargets = useCallback(async (measurementId: string) => {
    if (!projectId || !company?.id) return;
    
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("service_planning_targets")
        .select("*")
        .eq("project_id", projectId)
        .eq("measurement_id", measurementId);

      if (error) throw error;

      if (data && data.length > 0) {
        // Transformar dados com cálculos
        const targetsWithCalculations = data.map(t => calculateTarget(t as PlanningTarget));
        setTargets(targetsWithCalculations);
      } else {
        // Não existem targets, criar a partir de measurement_services
        await generateTargetsFromServices(measurementId);
      }
    } catch (error) {
      console.error("Erro ao carregar targets:", error);
      toast.error("Erro ao carregar planejamento");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, company?.id]);

  // Gerar targets a partir de measurement_services
  const generateTargetsFromServices = useCallback(async (measurementId: string) => {
    if (!projectId || !company?.id) return;

    try {
      // Buscar a medição
      const { data: measurementData } = await supabase
        .from("measurements")
        .select("*")
        .eq("id", measurementId)
        .single();

      if (!measurementData) {
        toast.error("Medição não encontrada");
        return;
      }

      // Buscar serviços da medição
      const { data: services, error: servicesError } = await supabase
        .from("measurement_services")
        .select("*")
        .eq("measurement_id", measurementId);

      if (servicesError) throw servicesError;

      if (!services || services.length === 0) {
        toast.info("Nenhum serviço encontrado para esta medição. Configure os serviços primeiro.");
        setTargets([]);
        return;
      }

      // Criar targets a partir dos serviços
      const newTargets: PlanningTarget[] = services.map(service => {
        const unitCost = service.planned_houses > 0 
          ? service.planned_cost / service.planned_houses 
          : 0;

        return {
          id: crypto.randomUUID(),
          company_id: company.id,
          project_id: projectId,
          contract_id: contract?.id || null,
          measurement_id: measurementId,
          measurement_number: measurementData.measurement_number,
          macro_id: service.macro_id,
          scope_id: service.scope_id,
          macro_name: service.macro_name,
          scope_name: service.scope_name,
          period_start: measurementData.start_date,
          period_end: measurementData.end_date,
          planned_houses: service.planned_houses,
          productivity_planned: service.productivity_expected,
          teams_planned: service.teams_expected,
          planned_cost: service.planned_cost,
          planned_revenue: 0,
          planned_margin: 0,
          unit_cost_value: unitCost,
          unit_revenue_value: 0,
          target_margin_percent: contract?.target_margin_percent || 0,
          target_profit_value: 0,
        };
      });

      // Calcular campos derivados
      const targetsWithCalculations = newTargets.map(t => calculateTarget(t));
      setTargets(targetsWithCalculations);

      toast.info("Planejamento gerado a partir dos serviços. Configure os valores e salve.");
    } catch (error) {
      console.error("Erro ao gerar targets:", error);
      toast.error("Erro ao gerar planejamento");
    }
  }, [projectId, company?.id, contract]);

  // Calcular campos derivados de um target
  const calculateTarget = (target: PlanningTarget): PlanningTarget => {
    const calculatedCost = target.planned_houses * (target.unit_cost_value || 0);
    const calculatedRevenue = target.planned_houses * (target.unit_revenue_value || 0);
    const calculatedProfit = calculatedRevenue - calculatedCost;
    const calculatedMargin = calculatedRevenue > 0 
      ? (calculatedProfit / calculatedRevenue) * 100 
      : 0;

    // Determinar status baseado na margem
    const targetMargin = target.target_margin_percent || contract?.target_margin_percent || 0;
    let status: 'success' | 'warning' | 'danger' = 'success';
    
    if (calculatedProfit < 0) {
      status = 'danger';
    } else if (calculatedMargin < targetMargin) {
      status = 'warning';
    }

    return {
      ...target,
      calculatedCost,
      calculatedRevenue,
      calculatedProfit,
      calculatedMargin,
      status,
    };
  };

  // Atualizar um target localmente (recalcular)
  const updateTarget = useCallback((targetId: string, updates: Partial<PlanningTarget>) => {
    setTargets(prev => prev.map(t => {
      if (t.id !== targetId) return t;
      
      const updated = { ...t, ...updates };
      return calculateTarget(updated);
    }));
  }, []);

  // Salvar todos os targets
  const saveTargets = useCallback(async () => {
    if (!projectId || !company?.id || targets.length === 0) return false;

    setIsSaving(true);

    try {
      // Preparar dados para upsert
      const dataToSave = targets.map(t => ({
        id: t.id,
        company_id: company.id,
        project_id: projectId,
        contract_id: t.contract_id,
        measurement_id: t.measurement_id,
        measurement_number: t.measurement_number,
        macro_id: t.macro_id,
        scope_id: t.scope_id,
        macro_name: t.macro_name,
        scope_name: t.scope_name,
        period_start: t.period_start,
        period_end: t.period_end,
        planned_houses: t.planned_houses,
        productivity_planned: t.productivity_planned,
        teams_planned: t.teams_planned,
        planned_cost: t.calculatedCost || t.planned_cost,
        planned_revenue: t.calculatedRevenue || t.planned_revenue,
        planned_margin: t.calculatedMargin || t.planned_margin,
        unit_cost_value: t.unit_cost_value,
        unit_revenue_value: t.unit_revenue_value,
        target_margin_percent: t.target_margin_percent,
        target_profit_value: t.calculatedProfit || t.target_profit_value,
      }));

      const { error } = await supabase
        .from("service_planning_targets")
        .upsert(dataToSave, { onConflict: "id" });

      if (error) throw error;

      toast.success("Planejamento salvo com sucesso!");
      return true;
    } catch (error) {
      console.error("Erro ao salvar targets:", error);
      toast.error("Erro ao salvar planejamento");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [projectId, company?.id, targets]);

  // Calcular totais
  const totals = targets.reduce((acc, t) => ({
    totalCost: acc.totalCost + (t.calculatedCost || 0),
    totalRevenue: acc.totalRevenue + (t.calculatedRevenue || 0),
    totalProfit: acc.totalProfit + (t.calculatedProfit || 0),
  }), { totalCost: 0, totalRevenue: 0, totalProfit: 0 });

  const overallMargin = totals.totalRevenue > 0 
    ? (totals.totalProfit / totals.totalRevenue) * 100 
    : 0;

  const overallStatus = totals.totalProfit < 0 
    ? 'danger' 
    : overallMargin < (contract?.target_margin_percent || 0) 
      ? 'warning' 
      : 'success';

  // Carregar dados quando projeto mudar
  useEffect(() => {
    if (projectId) {
      loadMeasurements();
      loadContract();
    } else {
      setMeasurements([]);
      setContract(null);
      setTargets([]);
    }
  }, [projectId, loadMeasurements, loadContract]);

  return {
    measurements,
    contract,
    targets,
    isLoading,
    isSaving,
    canEdit,
    loadTargets,
    updateTarget,
    saveTargets,
    totals: {
      ...totals,
      overallMargin,
      overallStatus,
    },
  };
}
