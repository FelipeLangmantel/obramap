import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { toast } from "sonner";

export type PeriodStatus = "draft" | "approved" | "executing" | "closed" | "planned";

export interface PlanningPeriod {
  id: string;
  period_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  is_closed: boolean | null;
  status: PeriodStatus;
}

export interface PlanningVersion {
  id: string;
  name: string;
  version_number: number;
  is_active: boolean;
}

export type ServiceStatus = "completed" | "in_progress" | "not_started";

export interface ServiceRow {
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  macro_color: string;
  unit_cost_value: number;
  unit_revenue_value: number;
  initial_bank: number; // Casas já executadas (banco inicial + produção)
  available_houses: number; // Casas disponíveis para planejar
  completion_percent: number; // % de execução
  execution_status: ServiceStatus; // Status baseado na RPC
  total_planned: number; // Soma de todas as células
  remaining_to_plan: number; // Casas restantes para planejar
  is_completed: boolean; // Se já foi 100% executado
  periodValues: Record<string, CellData>; // period_id -> valor
}

export interface CellData {
  id: string | null;
  target_houses: number;
  is_closed: boolean;
}

export interface PeriodSummary {
  period_id: string;
  total_houses: number;
  total_cost: number;
  total_revenue: number;
  projected_result: number;
}

export function useLongTermPlanning(projectId: string | undefined) {
  const { company } = useAuth();
  const { currentStep, advanceToStep } = useProjectSetupFlow();
  const [activeVersion, setActiveVersion] = useState<PlanningVersion | null>(null);
  const [periods, setPeriods] = useState<PlanningPeriod[]>([]);
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [totalHouses, setTotalHouses] = useState<number>(0);

  // ✅ Reset completo de estado quando projectId muda
  useEffect(() => {
    setActiveVersion(null);
    setPeriods([]);
    setServiceRows([]);
    setLoading(false);
    setInitializing(false);
    setSaving(false);
    setHasChanges(false);
    setInitError(null);
    setContractId(null);
    setTotalHouses(0);
  }, [projectId]);

  // Buscar ou inicializar planejamento
  const initializePlanning = useCallback(async () => {
    if (!projectId || !company?.id) return;

    setInitializing(true);
    setInitError(null);

    try {
      const [contractResult, housesResult] = await Promise.all([
        supabase
          .from("project_contracts")
          .select("id")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("houses")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
      ]);

      if (contractResult.data && contractResult.data.length > 0) {
        setContractId(contractResult.data[0].id);
      }

      const houseCount = housesResult.count || 0;
      setTotalHouses(houseCount);

      // Buscar versão ativa
      const { data: versions, error: versionsError } = await supabase
        .from("planning_versions")
        .select("id, name, version_number, is_active")
        .eq("project_id", projectId)
        .eq("company_id", company.id)
        .eq("is_active", true)
        .limit(1);

      if (versionsError) throw versionsError;

      if (versions && versions.length > 0) {
        setActiveVersion(versions[0]);
      } else {
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc("initialize_long_term_planning", {
            p_project_id: projectId,
            p_company_id: company.id,
            p_number_of_periods: 6,
          });

        if (rpcError) throw new Error(rpcError.message || "Erro ao inicializar planejamento");

        const result = rpcResult as { success: boolean; error?: string; planning_version_id?: string };

        if (!result.success) {
          if (result.error === "no_services_found") {
            throw new Error("Nenhum serviço encontrado no projeto. Cadastre os serviços do contrato antes de criar o planejamento.");
          }
          throw new Error(result.error || "Erro desconhecido ao inicializar");
        }

        const { data: newVersion, error: newVersionError } = await supabase
          .from("planning_versions")
          .select("id, name, version_number, is_active")
          .eq("id", result.planning_version_id)
          .single();

        if (newVersionError) throw newVersionError;
        setActiveVersion(newVersion);
        toast.success("Planejamento inicializado com sucesso!");
      }
    } catch (error) {
      console.error("Erro ao inicializar planejamento:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro ao carregar planejamento";
      setInitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setInitializing(false);
    }
  }, [projectId, company?.id]);

  // Carregar períodos da versão ativa
  const loadPeriods = useCallback(async () => {
    if (!projectId || !company?.id || !activeVersion?.id) {
      setPeriods([]);
      return;
    }

    const { data, error } = await supabase
      .from("planning_periods")
      .select("id, period_number, name, start_date, end_date, is_closed, status")
      .eq("project_id", projectId)
      .eq("company_id", company.id)
      .eq("planning_version_id", activeVersion.id)
      .order("period_number", { ascending: true });

    if (error) {
      console.error("Erro ao carregar períodos:", error);
      return;
    }

    const normalizedPeriods: PlanningPeriod[] = (data || []).map(p => ({
      id: p.id,
      period_number: p.period_number,
      name: p.name,
      start_date: p.start_date,
      end_date: p.end_date,
      is_closed: p.is_closed,
      status: normalizeStatus(p.status),
    }));

    setPeriods(normalizedPeriods);
  }, [projectId, company?.id, activeVersion?.id]);

  const normalizeStatus = (status: string | null): PeriodStatus => {
    if (!status) return "draft";
    const s = status.toLowerCase();
    if (s === "approved" || s === "executing" || s === "closed") return s as PeriodStatus;
    if (s === "planned") return "draft";
    return "draft";
  };

  // Carregar serviços e dados da matriz (com dados de execução)
  const loadMatrixData = useCallback(async () => {
    if (!projectId || !company?.id || !activeVersion?.id || periods.length === 0) {
      setServiceRows([]);
      return;
    }

    setLoading(true);

    try {
      // Buscar banco de execução via RPC, serviços e planejamento em paralelo
      const [executionBankResult, servicesResult, planningResult] = await Promise.all([
        supabase.rpc('get_service_execution_bank', { p_project_id: projectId }),
        supabase
          .from("project_contract_services")
          .select("macro_id, macro_name, scope_id, scope_name")
          .eq("project_id", projectId)
          .eq("company_id", company.id),
        supabase
          .from("service_planning_by_period")
          .select("id, macro_id, scope_id, planning_period_id, target_houses, unit_cost_value, unit_revenue_value")
          .eq("project_id", projectId)
          .eq("company_id", company.id)
          .in("planning_period_id", periods.map(p => p.id)),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (planningResult.error) throw planningResult.error;

      // Build execution bank map from RPC
      const executionMap = new Map<string, {
        executed_houses: number;
        available_houses: number;
        completion_percent: number;
        status: ServiceStatus;
      }>();

      if (!executionBankResult.error && executionBankResult.data) {
        (executionBankResult.data as any[]).forEach((row: any) => {
          const key = `${row.macro_id}_${row.scope_id}`;
          executionMap.set(key, {
            executed_houses: Number(row.executed_houses) || 0,
            available_houses: Number(row.available_houses) || 0,
            completion_percent: Number(row.completion_percent) || 0,
            status: (row.status as ServiceStatus) || 'not_started',
          });
        });
      }

      console.log('[LTP] Execution bank loaded:', executionMap.size, 'services with data');

      // Deduzir serviços únicos
      const uniqueServicesMap = new Map<string, {
        macro_id: string;
        macro_name: string;
        scope_id: string;
        scope_name: string;
        macro_color: string;
      }>();

      servicesResult.data?.forEach(s => {
        const key = `${s.macro_id}_${s.scope_id}`;
        if (!uniqueServicesMap.has(key)) {
          uniqueServicesMap.set(key, {
            ...s,
            macro_color: "#6b7280",
          });
        }
      });

      const uniqueServices = Array.from(uniqueServicesMap.values());

      // Mapa de planejamento
      const planningMap = new Map<string, typeof planningResult.data[0]>();
      planningResult.data?.forEach(p => {
        const key = `${p.macro_id}_${p.scope_id}_${p.planning_period_id}`;
        planningMap.set(key, p);
      });

      // Construir as linhas de serviço
      const rows: ServiceRow[] = uniqueServices.map(service => {
        const serviceKey = `${service.macro_id}_${service.scope_id}`;
        const execData = executionMap.get(serviceKey);
        const executedHouses = execData?.executed_houses || 0;
        const availableHouses = execData?.available_houses ?? totalHouses;
        const completionPercent = execData?.completion_percent || 0;
        const executionStatus = execData?.status || 'not_started';

        const periodValues: Record<string, CellData> = {};
        let totalPlanned = 0;
        let unit_cost_value = 0;
        let unit_revenue_value = 0;

        periods.forEach(period => {
          const key = `${service.macro_id}_${service.scope_id}_${period.id}`;
          const planningRecord = planningMap.get(key);
          const targetHouses = planningRecord?.target_houses || 0;
          totalPlanned += targetHouses;

          if (planningRecord && !unit_cost_value) {
            unit_cost_value = planningRecord.unit_cost_value || 0;
            unit_revenue_value = planningRecord.unit_revenue_value || 0;
          }

          periodValues[period.id] = {
            id: planningRecord?.id || null,
            target_houses: targetHouses,
            is_closed: period.is_closed || false,
          };
        });

        const remainingToPlan = Math.max(0, availableHouses - totalPlanned);
        const isCompleted = executionStatus === 'completed';

        return {
          macro_id: service.macro_id,
          macro_name: service.macro_name,
          scope_id: service.scope_id,
          scope_name: service.scope_name,
          macro_color: service.macro_color,
          unit_cost_value,
          unit_revenue_value,
          initial_bank: executedHouses,
          available_houses: availableHouses,
          completion_percent: completionPercent,
          execution_status: executionStatus,
          total_planned: totalPlanned,
          remaining_to_plan: remainingToPlan,
          is_completed: isCompleted,
          periodValues,
        };
      });

      // Preserve registration order (same as contract services / quadras cadastro)

      setServiceRows(rows);
    } catch (error) {
      console.error("Erro ao carregar matriz:", error);
      toast.error("Erro ao carregar dados do planejamento");
    } finally {
      setLoading(false);
    }
  }, [projectId, company?.id, activeVersion?.id, periods, totalHouses]);

  // Atualizar valor de uma célula
  const updateCellValue = useCallback((
    macroId: string,
    scopeId: string,
    periodId: string,
    newValue: number
  ) => {
    setServiceRows(prev => prev.map(row => {
      if (row.macro_id === macroId && row.scope_id === scopeId) {
        // Block completed services
        if (row.is_completed) return row;

        const updatedPeriodValues = {
          ...row.periodValues,
          [periodId]: {
            ...row.periodValues[periodId],
            target_houses: newValue,
          },
        };

        const newTotal = Object.values(updatedPeriodValues).reduce(
          (sum, cell) => sum + cell.target_houses,
          0
        );

        const remainingToPlan = Math.max(0, row.available_houses - newTotal);

        return {
          ...row,
          periodValues: updatedPeriodValues,
          total_planned: newTotal,
          remaining_to_plan: remainingToPlan,
        };
      }
      return row;
    }));
    setHasChanges(true);
  }, []);

  // Calcular resumos por período
  const periodSummaries = useMemo((): PeriodSummary[] => {
    return periods.map(period => {
      let totalHouses = 0;
      let totalCost = 0;
      let totalRevenue = 0;

      serviceRows.forEach(row => {
        const cellData = row.periodValues[period.id];
        if (cellData) {
          const houses = cellData.target_houses;
          totalHouses += houses;
          totalCost += houses * row.unit_cost_value;
          totalRevenue += houses * row.unit_revenue_value;
        }
      });

      return {
        period_id: period.id,
        total_houses: totalHouses,
        total_cost: totalCost,
        total_revenue: totalRevenue,
        projected_result: totalRevenue - totalCost,
      };
    });
  }, [periods, serviceRows]);

  // Totais gerais
  const overallTotals = useMemo(() => {
    return periodSummaries.reduce(
      (acc, summary) => ({
        total_houses: acc.total_houses + summary.total_houses,
        total_cost: acc.total_cost + summary.total_cost,
        total_revenue: acc.total_revenue + summary.total_revenue,
        projected_result: acc.projected_result + summary.projected_result,
      }),
      { total_houses: 0, total_cost: 0, total_revenue: 0, projected_result: 0 }
    );
  }, [periodSummaries]);

  // Salvar alterações
  const savePlanning = useCallback(async () => {
    if (!projectId || !company?.id) {
      toast.error("Projeto ou empresa não identificados");
      return false;
    }

    // Validar se algum serviço excede o máximo planejável
    for (const row of serviceRows) {
      if (row.is_completed && row.total_planned > 0) {
        toast.error(
          `"${row.macro_name} - ${row.scope_name}": serviço já concluído (${row.initial_bank}/${totalHouses} casas). Remova o planejamento.`
        );
        return false;
      }
      if (row.total_planned > row.available_houses && totalHouses > 0) {
        toast.error(
          `"${row.macro_name} - ${row.scope_name}": planejado ${row.total_planned}, mas só restam ${row.available_houses} casas (${row.initial_bank} já executadas).`
        );
        return false;
      }
    }

    let currentContractId = contractId;
    if (!currentContractId) {
      const { data: contractData } = await supabase
        .from("project_contracts")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (contractData && contractData.length > 0) {
        currentContractId = contractData[0].id;
        setContractId(currentContractId);
      }
    }

    setSaving(true);

    try {
      const upsertData: any[] = [];

      serviceRows.forEach(row => {
        Object.entries(row.periodValues).forEach(([periodId, cellData]) => {
          if (cellData.target_houses > 0 || cellData.id) {
            upsertData.push({
              id: cellData.id || undefined,
              company_id: company.id,
              project_id: projectId,
              contract_id: currentContractId,
              planning_period_id: periodId,
              macro_id: row.macro_id,
              macro_name: row.macro_name,
              scope_id: row.scope_id,
              scope_name: row.scope_name,
              target_houses: cellData.target_houses,
              unit_cost_value: row.unit_cost_value,
              unit_revenue_value: row.unit_revenue_value,
            });
          }
        });
      });

      if (upsertData.length > 0) {
        const toUpdate = upsertData.filter(d => d.id);
        const toInsert = upsertData.filter(d => !d.id);

        // Batch updates in parallel (chunks of 20)
        const CHUNK_SIZE = 20;
        const updatePromises: Promise<void>[] = [];
        for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
          const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
          updatePromises.push(
            Promise.all(
              chunk.map(record =>
                supabase
                  .from("service_planning_by_period")
                  .update({
                    target_houses: record.target_houses,
                    unit_cost_value: record.unit_cost_value,
                    unit_revenue_value: record.unit_revenue_value,
                  })
                  .eq("id", record.id)
                  .then(({ error }) => { if (error) throw error; })
              )
            ).then(() => {})
          );
        }
        await Promise.all(updatePromises);

        if (toInsert.length > 0) {
          const insertData = toInsert.map(({ id, ...rest }) => rest);
          const { error } = await supabase
            .from("service_planning_by_period")
            .insert(insertData);

          if (error) throw error;
        }
      }

      toast.success("Planejamento estratégico salvo com sucesso!");
      setHasChanges(false);

      if (currentStep !== "long_term_planned") {
        await advanceToStep("long_term_planned");
      }

      await loadMatrixData();
      return true;
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error(`Erro ao salvar planejamento: ${error?.message || "Erro desconhecido"}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectId, company?.id, contractId, activeVersion, serviceRows, periods, totalHouses, loadMatrixData, currentStep, advanceToStep]);

  const retryInit = useCallback(() => {
    setInitError(null);
    initializePlanning();
  }, [initializePlanning]);

  const addPeriod = useCallback(async () => {
    if (!projectId || !company?.id || !activeVersion?.id) return;

    try {
      const { data, error } = await supabase.rpc("add_planning_period", {
        p_project_id: projectId,
        p_company_id: company.id,
        p_planning_version_id: activeVersion.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; period_number?: number };
      if (!result.success) {
        toast.error(result.error || "Erro ao adicionar período");
        return;
      }

      toast.success(`Período P${result.period_number} adicionado!`);
      await loadPeriods();
    } catch (error: any) {
      console.error("Erro ao adicionar período:", error);
      toast.error("Erro ao adicionar período");
    }
  }, [projectId, company?.id, activeVersion?.id, loadPeriods]);

  const deletePeriod = useCallback(async (periodId: string) => {
    try {
      const { data, error } = await supabase.rpc("delete_planning_period", {
        p_period_id: periodId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        if (result.error === "cannot_delete_last_period") {
          toast.error("Não é possível excluir o único período restante");
        } else {
          toast.error(result.error || "Erro ao excluir período");
        }
        return;
      }

      toast.success("Período excluído com sucesso!");
      await loadPeriods();
    } catch (error: any) {
      console.error("Erro ao excluir período:", error);
      toast.error("Erro ao excluir período");
    }
  }, [loadPeriods]);

  const updatePeriodDates = useCallback(async (periodId: string, startDate: string, endDate: string) => {
    try {
      const period = periods.find(p => p.id === periodId);
      if (!period) {
        toast.error("Período não encontrado");
        return false;
      }
      if (period.status === "executing" || period.status === "closed") {
        toast.error("Não é possível editar um período em execução ou fechado");
        return false;
      }

      const { error } = await supabase
        .from("planning_periods")
        .update({ start_date: startDate, end_date: endDate, updated_at: new Date().toISOString() })
        .eq("id", periodId);

      if (error) throw error;

      toast.success("Período atualizado com sucesso!");
      await loadPeriods();
      return true;
    } catch (error) {
      console.error("Erro ao atualizar período:", error);
      toast.error("Erro ao atualizar período");
      return false;
    }
  }, [periods, loadPeriods]);

  useEffect(() => {
    if (!projectId || !company?.id) return;
    initializePlanning();
  }, [projectId, company?.id, initializePlanning]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    loadMatrixData();
  }, [loadMatrixData]);

  // Auto-refresh when production data changes (banco inicial edits, new productions)
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`ltp-productions-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productions', filter: `project_id=eq.${projectId}` }, () => loadMatrixData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_productions', filter: `project_id=eq.${projectId}` }, () => loadMatrixData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, loadMatrixData]);

  return {
    activeVersion,
    periods,
    serviceRows,
    loading,
    initializing,
    saving,
    hasChanges,
    initError,
    updateCellValue,
    periodSummaries,
    overallTotals,
    totalHouses,
    savePlanning,
    refresh: loadMatrixData,
    retryInit,
    addPeriod,
    deletePeriod,
    updatePeriodDates,
  };
}
