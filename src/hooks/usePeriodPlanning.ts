import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type PeriodStatus = "draft" | "approved" | "released_to_weekly" | "closed";

export interface PlanningPeriod {
  id: string;
  project_id: string;
  company_id: string;
  planning_version_id: string;
  period_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  is_closed: boolean | null;
  supplies_generated_at: string | null;
  // Campos calculados
  total_planned_houses: number;
  total_planned_cost: number;
  total_planned_revenue: number;
  total_planned_profit: number;
  // Campos de capacidade
  total_capacity: number;
  capacity_gap: number; // positive = surplus, negative = deficit
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
  // Campos de dimensionamento
  team_count: number;
  productivity_per_team: number;
  expected_output: number;
}

export function usePeriodPlanning(projectId: string | null) {
  const { company, isAdmin, isCompanyAdmin } = useAuth();
  const [periods, setPeriods] = useState<PlanningPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [periodServices, setPeriodServices] = useState<PeriodService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [approvingPeriodId, setApprovingPeriodId] = useState<string | null>(null);

  const canEdit = isAdmin || isCompanyAdmin;

  // Normalize status to our PeriodStatus type
  const normalizeStatus = (status: string | null): PeriodStatus => {
    if (!status) return "draft";
    const s = status.toLowerCase();
    if (s === "approved" || s === "released_to_weekly" || s === "closed") return s as PeriodStatus;
    return "draft";
  };

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
            .select("target_houses, planned_revenue, planned_cost, projected_result, team_count, productivity_per_team, expected_output")
            .eq("planning_period_id", period.id);

          const totals = (services || []).reduce(
            (acc, s) => ({
              total_planned_houses: acc.total_planned_houses + (s.target_houses || 0),
              total_planned_cost: acc.total_planned_cost + (s.planned_cost || 0),
              total_planned_revenue: acc.total_planned_revenue + (s.planned_revenue || 0),
              total_planned_profit: acc.total_planned_profit + (s.projected_result || 0),
              total_capacity: acc.total_capacity + (s.expected_output || 0),
            }),
            { total_planned_houses: 0, total_planned_cost: 0, total_planned_revenue: 0, total_planned_profit: 0, total_capacity: 0 }
          );

          const capacity_gap = totals.total_capacity - totals.total_planned_houses;

          return {
            ...period,
            ...totals,
            capacity_gap,
            status: normalizeStatus(period.status),
            supplies_generated_at: period.supplies_generated_at,
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
        .select("id, planning_period_id, macro_id, scope_id, macro_name, scope_name, target_houses, planned_revenue, planned_cost, projected_result, productivity_planned, teams_planned, status, team_count, productivity_per_team, expected_output")
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
          team_count: s.team_count || 1,
          productivity_per_team: s.productivity_per_team || 0,
          expected_output: s.expected_output || 0,
        }))
      );
    } catch (error) {
      console.error("Erro ao carregar serviços do período:", error);
      toast.error("Erro ao carregar detalhes do período");
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  // Aprovar período (legacy - chama changePeriodStatus)
  const approvePeriod = useCallback(async (periodId: string) => {
    return changePeriodStatus(periodId, "approved");
  }, []);

  // Mudar status do período (nova função genérica)
  const changePeriodStatus = useCallback(async (periodId: string, newStatus: PeriodStatus) => {
    setApprovingPeriodId(periodId);
    try {
      const { data, error } = await supabase.rpc("update_planning_period_status", {
        p_period_id: periodId,
        p_new_status: newStatus,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        const errorMessages: Record<string, string> = {
          period_not_found: "Período não encontrado",
          period_is_closed: "Este período está fechado e não pode ser alterado",
          invalid_status: "Status inválido",
          invalid_transition: result.message || "Transição de status não permitida",
        };
        toast.error(errorMessages[result.error || ""] || "Erro ao alterar status");
        return false;
      }

      const statusLabels: Record<string, string> = {
        approved: "aprovado",
        released_to_weekly: "liberado para planejamento semanal",
        closed: "fechado",
      };
      toast.success(`Período ${statusLabels[newStatus] || "atualizado"} com sucesso!`);

      // Gerar suprimentos automaticamente quando aprovado
      if (newStatus === "approved") {
        toast.info("Gerando suprimentos automaticamente...");
        const supplyResult = await supabase.rpc("generate_supplies_from_planning_period", {
          p_period_id: periodId,
        });

        if (supplyResult.error) {
          console.error("Erro ao gerar suprimentos:", supplyResult.error);
          toast.warning("Período aprovado, mas houve erro ao gerar suprimentos");
        } else {
          const supplyData = supplyResult.data as { success: boolean; inserted_count?: number };
          if (supplyData.success) {
            // Atualizar timestamp de suprimentos gerados
            await supabase
              .from("planning_periods")
              .update({ supplies_generated_at: new Date().toISOString() })
              .eq("id", periodId);
            toast.success(`Suprimentos gerados: ${supplyData.inserted_count || 0} itens`);
          }
        }
      }

      await loadPeriods(); // Recarregar para atualizar status
      return true;
    } catch (error) {
      console.error("Erro ao alterar status do período:", error);
      toast.error("Erro ao alterar status do período");
      return false;
    } finally {
      setApprovingPeriodId(null);
    }
  }, [loadPeriods]);

  // Gerar suprimentos a partir do planejamento aprovado
  const generateSupplies = useCallback(async (periodId: string) => {
    try {
      const { data, error } = await supabase.rpc("generate_supplies_from_planning_period", {
        p_period_id: periodId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string; inserted_count?: number; deleted_count?: number };

      if (!result.success) {
        const errorMessages: Record<string, string> = {
          period_not_found: "Período não encontrado",
          invalid_status: result.message || "Suprimentos só podem ser gerados para períodos aprovados",
        };
        toast.error(errorMessages[result.error || ""] || "Erro ao gerar suprimentos");
        return false;
      }

      // Atualizar o campo supplies_generated_at
      await supabase
        .from("planning_periods")
        .update({ supplies_generated_at: new Date().toISOString() })
        .eq("id", periodId);

      toast.success(`Suprimentos gerados: ${result.inserted_count || 0} itens criados`);
      await loadPeriods();
      return true;
    } catch (error) {
      console.error("Erro ao gerar suprimentos:", error);
      toast.error("Erro ao gerar suprimentos");
      return false;
    }
  }, [loadPeriods]);

  // Update period dates
  const updatePeriodDates = useCallback(async (periodId: string, startDate: string, endDate: string) => {
    try {
      // First check the period status
      const period = periods.find(p => p.id === periodId);
      if (!period) {
        toast.error("Período não encontrado");
        return false;
      }

      // Only allow editing for draft or approved status
      if (period.status === "released_to_weekly" || period.status === "closed") {
        toast.error("Não é possível editar um período liberado ou fechado");
        return false;
      }

      const { error } = await supabase
        .from("planning_periods")
        .update({ 
          start_date: startDate, 
          end_date: endDate,
          updated_at: new Date().toISOString()
        })
        .eq("id", periodId);

      if (error) throw error;

      toast.success("Período atualizado com sucesso!");
      await loadPeriods(); // Refresh to recalculate capacity
      return true;
    } catch (error) {
      console.error("Erro ao atualizar período:", error);
      toast.error("Erro ao atualizar período");
      return false;
    }
  }, [periods, loadPeriods]);
  const deleteService = useCallback(async (serviceId: string) => {
    try {
      const { error } = await supabase
        .from("service_planning_by_period")
        .delete()
        .eq("id", serviceId);

      if (error) throw error;

      toast.success("Serviço excluído com sucesso!");
      // Reload both services and periods to update totals
      if (selectedPeriodId) {
        await loadPeriodServices(selectedPeriodId);
      }
      await loadPeriods();
      return true;
    } catch (error) {
      console.error("Error deleting service:", error);
      toast.error("Erro ao excluir serviço");
      return false;
    }
  }, [selectedPeriodId, loadPeriodServices, loadPeriods]);

  // Refresh services for current period
  const refreshServices = useCallback(async () => {
    if (selectedPeriodId) {
      await loadPeriodServices(selectedPeriodId);
      await loadPeriods(); // Also refresh period totals
    }
  }, [selectedPeriodId, loadPeriodServices, loadPeriods]);

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
    refreshServices,
    deleteService,
    approvePeriod,
    changePeriodStatus,
    approvingPeriodId,
    generateSupplies,
    updatePeriodDates,
  };
}
