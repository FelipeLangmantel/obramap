import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PlanningPeriod {
  id: string;
  period_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  is_closed: boolean | null;
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
  const [versions, setVersions] = useState<PlanningVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PlanningPeriod[]>([]);
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Carregar versões de planejamento do projeto
  const loadVersions = useCallback(async () => {
    if (!projectId || !company?.id) return;

    const { data, error } = await supabase
      .from("planning_versions")
      .select("id, name, version_number, is_active")
      .eq("project_id", projectId)
      .eq("company_id", company.id)
      .order("version_number", { ascending: false });

    if (error) {
      console.error("Erro ao carregar versões:", error);
      return;
    }

    setVersions(data || []);

    // Selecionar a versão ativa por padrão
    const activeVersion = data?.find(v => v.is_active);
    if (activeVersion && !selectedVersionId) {
      setSelectedVersionId(activeVersion.id);
    }
  }, [projectId, company?.id, selectedVersionId]);

  // Carregar períodos da versão selecionada
  const loadPeriods = useCallback(async () => {
    if (!projectId || !company?.id || !selectedVersionId) {
      setPeriods([]);
      return;
    }

    const { data, error } = await supabase
      .from("planning_periods")
      .select("id, period_number, name, start_date, end_date, is_closed")
      .eq("project_id", projectId)
      .eq("company_id", company.id)
      .eq("planning_version_id", selectedVersionId)
      .order("start_date", { ascending: true });

    if (error) {
      console.error("Erro ao carregar períodos:", error);
      return;
    }

    setPeriods(data || []);
  }, [projectId, company?.id, selectedVersionId]);

  // Carregar serviços e dados da matriz
  const loadMatrixData = useCallback(async () => {
    if (!projectId || !company?.id || !selectedVersionId || periods.length === 0) {
      setServiceRows([]);
      return;
    }

    setLoading(true);

    try {
      // Buscar serviços únicos do orçamento executivo (measurement_services)
      const { data: services, error: servicesError } = await supabase
        .from("measurement_services")
        .select("macro_id, macro_name, scope_id, scope_name, macro_color")
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
          uniqueServicesMap.set(key, s);
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

      // Ordenar por macro_name e scope_name
      rows.sort((a, b) => {
        const macroCompare = a.macro_name.localeCompare(b.macro_name);
        if (macroCompare !== 0) return macroCompare;
        return a.scope_name.localeCompare(b.scope_name);
      });

      setServiceRows(rows);
    } catch (error) {
      console.error("Erro ao carregar matriz:", error);
      toast.error("Erro ao carregar dados do planejamento");
    } finally {
      setLoading(false);
    }
  }, [projectId, company?.id, selectedVersionId, periods]);

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
    if (!projectId || !company?.id) return;

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
              planning_period_id: periodId,
              macro_id: row.macro_id,
              macro_name: row.macro_name,
              scope_id: row.scope_id,
              scope_name: row.scope_name,
              macro_color: row.macro_color,
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

      toast.success("Planejamento salvo com sucesso!");
      setHasChanges(false);

      // Recarregar dados para atualizar IDs
      await loadMatrixData();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar planejamento");
    } finally {
      setSaving(false);
    }
  }, [projectId, company?.id, serviceRows, loadMatrixData]);

  // Efeitos
  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    loadMatrixData();
  }, [loadMatrixData]);

  return {
    versions,
    selectedVersionId,
    setSelectedVersionId,
    periods,
    serviceRows,
    loading,
    saving,
    hasChanges,
    updateCellValue,
    periodSummaries,
    overallTotals,
    savePlanning,
    refresh: loadMatrixData,
  };
}
