import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PlanningPeriod {
  id: string;
  project_id: string;
  company_id: string;
  planning_version_id: string;
  period_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  status: string | null;
  is_closed: boolean | null;
  // Campos calculados
  total_planned_houses: number;
  total_planned_cost: number;
  total_planned_revenue: number;
  total_planned_profit: number;
}

export interface PeriodService {
  id: string;
  planning_period_id: string;
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  target_houses: number;
  planned_revenue: number;
  planned_cost: number;
  projected_result: number;
  productivity_planned: number | null;
  teams_planned: number | null;
  status: string | null;
}

export function usePeriodPlanning(projectId: string | null) {
  const { company, isAdmin, isCompanyAdmin } = useAuth();
  const [periods, setPeriods] = useState<PlanningPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [periodServices, setPeriodServices] = useState<PeriodService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);

  const canEdit = isAdmin || isCompanyAdmin;

  // Carregar períodos do projeto (quinzenas do planejamento de longo prazo)
  const loadPeriods = useCallback(async () => {
    if (!projectId || !company?.id) return;

    setIsLoading(true);
    try {
      // Buscar versão ativa de planejamento
      const { data: version, error: versionError } = await supabase
        .from("planning_versions")
        .select("id")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .maybeSingle();

      if (versionError) throw versionError;

      if (!version) {
        setPeriods([]);
        return;
      }

      // Buscar períodos da versão ativa
      const { data: periodsData, error: periodsError } = await supabase
        .from("planning_periods")
        .select("*")
        .eq("project_id", projectId)
        .eq("planning_version_id", version.id)
        .order("period_number", { ascending: true });

      if (periodsError) throw periodsError;

      if (!periodsData || periodsData.length === 0) {
        setPeriods([]);
        return;
      }

      // Para cada período, calcular totais a partir de service_planning_by_period
      const periodsWithTotals = await Promise.all(
        periodsData.map(async (period) => {
          const { data: services } = await supabase
            .from("service_planning_by_period")
            .select("target_houses, planned_revenue, planned_cost, projected_result")
            .eq("planning_period_id", period.id);

          const totals = (services || []).reduce(
            (acc, s) => ({
              total_planned_houses: acc.total_planned_houses + (s.target_houses || 0),
              total_planned_cost: acc.total_planned_cost + (s.planned_cost || 0),
              total_planned_revenue: acc.total_planned_revenue + (s.planned_revenue || 0),
              total_planned_profit: acc.total_planned_profit + (s.projected_result || 0),
            }),
            { total_planned_houses: 0, total_planned_cost: 0, total_planned_revenue: 0, total_planned_profit: 0 }
          );

          return {
            ...period,
            ...totals,
          } as PlanningPeriod;
        })
      );

      setPeriods(periodsWithTotals);
    } catch (error) {
      console.error("Erro ao carregar períodos:", error);
      toast.error("Erro ao carregar períodos de planejamento");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, company?.id]);

  // Carregar serviços de um período específico
  const loadPeriodServices = useCallback(async (periodId: string) => {
    if (!periodId) {
      setPeriodServices([]);
      return;
    }

    setIsLoadingServices(true);
    try {
      const { data, error } = await supabase
        .from("service_planning_by_period")
        .select("id, planning_period_id, macro_id, scope_id, macro_name, scope_name, target_houses, planned_revenue, planned_cost, projected_result, productivity_planned, teams_planned, status")
        .eq("planning_period_id", periodId)
        .order("macro_name", { ascending: true });

      if (error) throw error;

      setPeriodServices(
        (data || []).map((s) => ({
          id: s.id,
          planning_period_id: s.planning_period_id,
          macro_id: s.macro_id,
          scope_id: s.scope_id,
          macro_name: s.macro_name,
          scope_name: s.scope_name,
          target_houses: s.target_houses || 0,
          planned_revenue: s.planned_revenue || 0,
          planned_cost: s.planned_cost || 0,
          projected_result: s.projected_result || 0,
          productivity_planned: s.productivity_planned,
          teams_planned: s.teams_planned,
          status: s.status,
        }))
      );
    } catch (error) {
      console.error("Erro ao carregar serviços do período:", error);
      toast.error("Erro ao carregar detalhes do período");
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  // Selecionar período e carregar seus serviços
  const selectPeriod = useCallback(
    (periodId: string | null) => {
      setSelectedPeriodId(periodId);
      if (periodId) {
        loadPeriodServices(periodId);
      } else {
        setPeriodServices([]);
      }
    },
    [loadPeriodServices]
  );

  // Período selecionado
  const selectedPeriod = useMemo(() => {
    return periods.find((p) => p.id === selectedPeriodId) || null;
  }, [periods, selectedPeriodId]);

  // Totais gerais de todos os períodos
  const overallTotals = useMemo(() => {
    return periods.reduce(
      (acc, p) => ({
        totalHouses: acc.totalHouses + p.total_planned_houses,
        totalCost: acc.totalCost + p.total_planned_cost,
        totalRevenue: acc.totalRevenue + p.total_planned_revenue,
        totalProfit: acc.totalProfit + p.total_planned_profit,
      }),
      { totalHouses: 0, totalCost: 0, totalRevenue: 0, totalProfit: 0 }
    );
  }, [periods]);

  // Carregar dados quando projeto mudar
  useEffect(() => {
    if (projectId) {
      loadPeriods();
    } else {
      setPeriods([]);
      setSelectedPeriodId(null);
      setPeriodServices([]);
    }
  }, [projectId, loadPeriods]);

  return {
    periods,
    selectedPeriod,
    selectedPeriodId,
    periodServices,
    isLoading,
    isLoadingServices,
    canEdit,
    overallTotals,
    selectPeriod,
    refreshPeriods: loadPeriods,
  };
}
