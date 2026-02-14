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

export interface ServiceRow {
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  macro_color: string;
  unit_cost_value: number;
  unit_revenue_value: number;
  initial_bank: number; // Casas acumuladas de períodos anteriores
  total_planned: number; // Soma de todas as células
  periodValues: Record<string, CellData>; // period_id -> valor
}

export interface CellData {
  id: string | null; // ID do registro em service_planning_by_period
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
    console.log("=== INIT PLANNING DEBUG ===");
    console.log("projectId:", projectId);
    console.log("company.id:", company?.id);
    console.log("===========================");

    if (!projectId || !company?.id) {
      console.warn("INIT BLOCKED: projectId ou company.id ausente");
      return;
    }

    setInitializing(true);
    setInitError(null);

    try {
      // Buscar contrato do projeto e total de casas
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

      console.log("CONTRACT RESULT:", contractResult);
      console.log("HOUSES RESULT:", housesResult);

      if (contractResult.data && contractResult.data.length > 0) {
        setContractId(contractResult.data[0].id);
        console.log("contractId SET:", contractResult.data[0].id);
      } else {
        console.log("Nenhum contrato encontrado - planejamento estratégico prossegue sem contrato");
      }

      const houseCount = housesResult.count || 0;
      setTotalHouses(houseCount);
      console.log("totalHouses SET:", houseCount);

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
        // Versão ativa encontrada
        setActiveVersion(versions[0]);
      } else {
        // Nenhuma versão ativa - inicializar planejamento via RPC
        console.log("Nenhuma versão encontrada, inicializando planejamento...");
        
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc("initialize_long_term_planning", {
            p_project_id: projectId,
            p_company_id: company.id,
            p_number_of_periods: 6,
          });

        if (rpcError) {
          console.error("Erro na RPC:", rpcError);
          throw new Error(rpcError.message || "Erro ao inicializar planejamento");
        }

        const result = rpcResult as { success: boolean; error?: string; planning_version_id?: string };

        if (!result.success) {
          if (result.error === "no_services_found") {
            throw new Error("Nenhum serviço encontrado no projeto. Cadastre os serviços do contrato antes de criar o planejamento.");
          }
          throw new Error(result.error || "Erro desconhecido ao inicializar");
        }

        // Buscar a versão recém-criada
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

    // Normalize status and ensure all required fields
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

  // Normalize status helper
  const normalizeStatus = (status: string | null): PeriodStatus => {
    if (!status) return "draft";
    const s = status.toLowerCase();
    if (s === "approved" || s === "executing" || s === "closed") return s as PeriodStatus;
    if (s === "planned") return "draft";
    return "draft";
  };

  // Carregar serviços e dados da matriz
  const loadMatrixData = useCallback(async () => {
    if (!projectId || !company?.id || !activeVersion?.id || periods.length === 0) {
      setServiceRows([]);
      return;
    }

    setLoading(true);

    try {
      // Buscar serviços do contrato do projeto (NÃO de measurement_services)
      // Isso mantém o isolamento estratégico - não depende de dados operacionais
      const { data: services, error: servicesError } = await supabase
        .from("project_contract_services")
        .select("macro_id, macro_name, scope_id, scope_name")
        .eq("project_id", projectId)
        .eq("company_id", company.id);

      if (servicesError) throw servicesError;

      // Deduzir serviços únicos
      const uniqueServicesMap = new Map<string, {
        macro_id: string;
        macro_name: string;
        scope_id: string;
        scope_name: string;
        macro_color: string;
      }>();

      services?.forEach(s => {
        const key = `${s.macro_id}_${s.scope_id}`;
        if (!uniqueServicesMap.has(key)) {
          uniqueServicesMap.set(key, {
            ...s,
            macro_color: "#6b7280", // Default color for contract services
          });
        }
      });

      const uniqueServices = Array.from(uniqueServicesMap.values());

      // Buscar dados de planejamento por período
      const periodIds = periods.map(p => p.id);
      const { data: planningData, error: planningError } = await supabase
        .from("service_planning_by_period")
        .select("id, macro_id, scope_id, planning_period_id, target_houses, unit_cost_value, unit_revenue_value")
        .eq("project_id", projectId)
        .eq("company_id", company.id)
        .in("planning_period_id", periodIds);

      if (planningError) throw planningError;

      // Montar mapa para acesso rápido
      const planningMap = new Map<string, typeof planningData[0]>();
      planningData?.forEach(p => {
        const key = `${p.macro_id}_${p.scope_id}_${p.planning_period_id}`;
        planningMap.set(key, p);
      });

      // Construir as linhas de serviço
      const rows: ServiceRow[] = uniqueServices.map(service => {
        const periodValues: Record<string, CellData> = {};
        let totalPlanned = 0;
        let unit_cost_value = 0;
        let unit_revenue_value = 0;

        periods.forEach(period => {
          const key = `${service.macro_id}_${service.scope_id}_${period.id}`;
          const planningRecord = planningMap.get(key);

          const targetHouses = planningRecord?.target_houses || 0;
          totalPlanned += targetHouses;

          // Pegar valores unitários do primeiro registro encontrado
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

        return {
          macro_id: service.macro_id,
          macro_name: service.macro_name,
          scope_id: service.scope_id,
          scope_name: service.scope_name,
          macro_color: service.macro_color,
          unit_cost_value,
          unit_revenue_value,
          initial_bank: 0, // TODO: calcular acumulado de versões anteriores
          total_planned: totalPlanned,
          periodValues,
        };
      });

      // Ordenar pela sequência original de cadastro (macro_id e scope_id contêm timestamp)
      rows.sort((a, b) => {
        const macroCompare = a.macro_id.localeCompare(b.macro_id);
        if (macroCompare !== 0) return macroCompare;
        return a.scope_id.localeCompare(b.scope_id);
      });

      setServiceRows(rows);
    } catch (error) {
      console.error("Erro ao carregar matriz:", error);
      toast.error("Erro ao carregar dados do planejamento");
    } finally {
      setLoading(false);
    }
  }, [projectId, company?.id, activeVersion?.id, periods]);

  // Atualizar valor de uma célula
  const updateCellValue = useCallback((
    macroId: string,
    scopeId: string,
    periodId: string,
    newValue: number
  ) => {
    setServiceRows(prev => prev.map(row => {
      if (row.macro_id === macroId && row.scope_id === scopeId) {
        const updatedPeriodValues = {
          ...row.periodValues,
          [periodId]: {
            ...row.periodValues[periodId],
            target_houses: newValue,
          },
        };

        // Recalcular total
        const newTotal = Object.values(updatedPeriodValues).reduce(
          (sum, cell) => sum + cell.target_houses,
          0
        );

        return {
          ...row,
          periodValues: updatedPeriodValues,
          total_planned: newTotal,
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
    // ✅ DEBUG LOG: Payload completo antes do save
    console.log("=== SAVE PLANNING DEBUG ===");
    console.log("projectId:", projectId);
    console.log("company.id:", company?.id);
    console.log("contractId (estado):", contractId);
    console.log("activeVersion:", activeVersion);
    console.log("totalHouses:", totalHouses);
    console.log("serviceRows count:", serviceRows.length);
    console.log("serviceRows:", JSON.stringify(serviceRows.slice(0, 2), null, 2));
    console.log("periods:", periods);
    console.log("===========================");

    if (!projectId || !company?.id) {
      console.error("SAVE BLOCKED: projectId ou company.id ausente", { projectId, companyId: company?.id });
      toast.error("Projeto ou empresa não identificados");
      return false;
    }

    // ✅ Validar se algum serviço excede o total de casas do projeto
    for (const row of serviceRows) {
      if (row.total_planned > totalHouses && totalHouses > 0) {
        console.warn("VALIDATION FAIL: casas excedidas", { 
          service: `${row.macro_name} - ${row.scope_name}`,
          planned: row.total_planned,
          max: totalHouses
        });
        toast.error(
          `O serviço "${row.macro_name} - ${row.scope_name}" está planejado para ${row.total_planned} casas, mas o projeto tem apenas ${totalHouses} casas.`
        );
        return false;
      }
    }

    // Buscar contract_id (opcional - pode ser NULL)
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
      // Se não encontrar contrato, prossegue com NULL
    }

    console.log("SAVE PROCEEDING com contractId:", currentContractId);
    setSaving(true);

    try {
      const upsertData: any[] = [];

      serviceRows.forEach(row => {
        Object.entries(row.periodValues).forEach(([periodId, cellData]) => {
          // Só adicionar se tiver algum valor ou se já existir registro
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
        // Separar inserts de updates
        const toUpdate = upsertData.filter(d => d.id);
        const toInsert = upsertData.filter(d => !d.id);

        // Updates
        for (const record of toUpdate) {
          const { error } = await supabase
            .from("service_planning_by_period")
            .update({
              target_houses: record.target_houses,
              unit_cost_value: record.unit_cost_value,
              unit_revenue_value: record.unit_revenue_value,
            })
            .eq("id", record.id);

          if (error) throw error;
        }

        // Inserts
        if (toInsert.length > 0) {
          const insertData = toInsert.map(({ id, ...rest }) => rest);
          const { error } = await supabase
            .from("service_planning_by_period")
            .insert(insertData);

          if (error) throw error;
        }
      }

      // ✅ Planejamento de longo prazo salvo apenas em service_planning_by_period
      // NÃO gera dados operacionais (measurement_services, suprimentos, etc.)
      console.log(`=== PLANEJAMENTO ESTRATÉGICO SALVO ===`);
      console.log(`Registros salvos em service_planning_by_period: ${upsertData.length}`);
      
      toast.success("Planejamento estratégico salvo com sucesso!");
      setHasChanges(false);

      // ✅ Avançar setup_step para long_term_planned (libera measurement-planning)
      if (currentStep !== "long_term_planned") {
        await advanceToStep("long_term_planned");
      }

      // Recarregar dados para atualizar IDs
      await loadMatrixData();
      return true;
    } catch (error: any) {
      console.error("=== SAVE ERROR ===");
      console.error("Error object:", error);
      console.error("Error message:", error?.message);
      console.error("Error details:", error?.details);
      console.error("Error hint:", error?.hint);
      console.error("Error code:", error?.code);
      console.error("==================");
      toast.error(`Erro ao salvar planejamento: ${error?.message || "Erro desconhecido"}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectId, company?.id, contractId, activeVersion, serviceRows, periods, totalHouses, loadMatrixData, currentStep, advanceToStep]);

  // Retry initialization
  const retryInit = useCallback(() => {
    setInitError(null);
    initializePlanning();
  }, [initializePlanning]);

  // Adicionar período
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

  // Excluir período
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

  // ✅ Efeito de inicialização - roda quando projectId ou company mudam
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
  };
}
