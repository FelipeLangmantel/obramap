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

interface StrategicService {
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  max_cost_value: number;
  unit_revenue_value: number;
}

const getServiceKey = (macroId: string, scopeId: string) => `${macroId}::${scopeId}`;

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

  const fetchStrategicServicesMap = useCallback(async () => {
    if (!projectId) return new Map<string, StrategicService>();

    const { data, error } = await supabase
      .from("project_contract_services")
      .select("macro_id, scope_id, macro_name, scope_name, max_cost_value, unit_revenue_value")
      .eq("project_id", projectId);

    if (error) throw error;

    const servicesMap = new Map<string, StrategicService>();
    (data || []).forEach((service) => {
      servicesMap.set(getServiceKey(service.macro_id, service.scope_id), {
        macro_id: service.macro_id,
        scope_id: service.scope_id,
        macro_name: service.macro_name,
        scope_name: service.scope_name,
        max_cost_value: service.max_cost_value || 0,
        unit_revenue_value: service.unit_revenue_value || 0,
      });
    });

    return servicesMap;
  }, [projectId]);

  // Carregar períodos do projeto (quinzenas do planejamento de longo prazo)
  const loadPeriods = useCallback(async () => {
    if (!projectId || !company?.id) return;

    setIsLoading(true);
    try {
      // Sincronizar serviços do período com o planejamento estratégico
      // Remove órfãos, atualiza nomes/valores e insere serviços faltantes
      const syncResult = await supabase.rpc("sync_period_services_with_strategic", {
        p_project_id: projectId,
      });
      
      if (syncResult.error) {
        console.error("Erro ao sincronizar serviços:", syncResult.error);
      } else {
        const syncData = syncResult.data as { success: boolean; deleted_count?: number; updated_count?: number; inserted_count?: number } | null;
        if (syncData && (syncData.deleted_count || syncData.updated_count || syncData.inserted_count)) {
          console.log("Sincronização:", syncData);
        }
      }

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

      const strategicServicesMap = await fetchStrategicServicesMap();

      // Para cada período, calcular totais considerando APENAS serviços válidos do planejamento estratégico
      const periodsWithTotals = await Promise.all(
        periodsData.map(async (period) => {
          const { data: services } = await supabase
            .from("service_planning_by_period")
            .select("macro_id, scope_id, target_houses, expected_output")
            .eq("planning_period_id", period.id);

          const totals = (services || []).reduce(
            (acc, s) => {
              const strategicService = strategicServicesMap.get(getServiceKey(s.macro_id, s.scope_id));
              if (!strategicService) return acc;

              const targetHouses = s.target_houses || 0;
              const plannedCost = targetHouses * strategicService.max_cost_value;
              const plannedRevenue = targetHouses * strategicService.unit_revenue_value;

              return {
                total_planned_houses: acc.total_planned_houses + targetHouses,
                total_planned_cost: acc.total_planned_cost + plannedCost,
                total_planned_revenue: acc.total_planned_revenue + plannedRevenue,
                total_planned_profit: acc.total_planned_profit + (plannedRevenue - plannedCost),
                total_capacity: acc.total_capacity + (s.expected_output || 0),
              };
            },
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
  }, [projectId, company?.id, fetchStrategicServicesMap]);

  // Carregar serviços de um período específico
  const loadPeriodServices = useCallback(async (periodId: string) => {
    if (!periodId) {
      setPeriodServices([]);
      return;
    }

    setIsLoadingServices(true);
    try {
      const strategicServicesMap = await fetchStrategicServicesMap();

      const { data, error } = await supabase
        .from("service_planning_by_period")
        .select("id, planning_period_id, macro_id, scope_id, macro_name, scope_name, target_houses, productivity_planned, teams_planned, status, team_count, productivity_per_team, expected_output")
        .eq("planning_period_id", periodId)
        .order("macro_id", { ascending: true });

      if (error) throw error;

      const normalizedServices = (data || [])
        .map((s) => {
          const strategicService = strategicServicesMap.get(getServiceKey(s.macro_id, s.scope_id));
          if (!strategicService) return null;

          const targetHouses = s.target_houses || 0;
          const plannedCost = targetHouses * strategicService.max_cost_value;
          const plannedRevenue = targetHouses * strategicService.unit_revenue_value;

          return {
            id: s.id,
            planning_period_id: s.planning_period_id,
            macro_id: s.macro_id,
            scope_id: s.scope_id,
            macro_name: strategicService.macro_name,
            scope_name: strategicService.scope_name,
            target_houses: targetHouses,
            planned_revenue: plannedRevenue,
            planned_cost: plannedCost,
            projected_result: plannedRevenue - plannedCost,
            productivity_planned: s.productivity_planned,
            teams_planned: s.teams_planned,
            status: s.status,
            team_count: s.team_count || 1,
            productivity_per_team: s.productivity_per_team || 0,
            expected_output: s.expected_output || 0,
          } as PeriodService;
        })
        .filter((service): service is PeriodService => service !== null)
        .sort((a, b) => {
          if (a.macro_name !== b.macro_name) return a.macro_name.localeCompare(b.macro_name, "pt-BR");
          return a.scope_name.localeCompare(b.scope_name, "pt-BR");
        });

      setPeriodServices(normalizedServices);
    } catch (error) {
      console.error("Erro ao carregar serviços do período:", error);
      toast.error("Erro ao carregar detalhes do período");
    } finally {
      setIsLoadingServices(false);
    }
  }, [fetchStrategicServicesMap]);

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

  // Update target houses for a service (bidirectional sync with long-term planning)
  const updateServiceHouses = useCallback(async (serviceId: string, newTargetHouses: number) => {
    try {
      // Check if the period is editable
      const service = periodServices.find(s => s.id === serviceId);
      if (!service) return false;

      const period = periods.find(p => p.id === service.planning_period_id);
      if (period && (period.status === "approved" || period.status === "released_to_weekly" || period.status === "closed")) {
        toast.error("Não é possível editar um período aprovado, liberado ou fechado");
        return false;
      }

      const { error } = await supabase
        .from("service_planning_by_period")
        .update({ target_houses: newTargetHouses })
        .eq("id", serviceId);

      if (error) throw error;

      // Refresh both services and period totals
      if (selectedPeriodId) {
        await loadPeriodServices(selectedPeriodId);
      }
      await loadPeriods();
      return true;
    } catch (error) {
      console.error("Erro ao atualizar casas:", error);
      toast.error("Erro ao atualizar quantidade de casas");
      return false;
    }
  }, [periodServices, periods, selectedPeriodId, loadPeriodServices, loadPeriods]);

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
    updateServiceHouses,
  };
}
