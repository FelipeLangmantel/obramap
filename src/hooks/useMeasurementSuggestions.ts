import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Sugestão de serviço vinda do Planejamento de Medições (service_planning_by_period)
 * Este hook é READ-ONLY - NÃO grava em tabelas operacionais
 */
export interface MeasurementSuggestion {
  id: string;
  planning_period_id: string;
  period_number: number;
  period_name: string | null;
  period_start_date: string;
  period_end_date: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  target_houses: number;
  planned_revenue: number;
  planned_cost: number;
  projected_result: number;
}

export interface PeriodForImport {
  id: string;
  period_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  total_services: number;
  total_houses: number;
}

interface UseMeasurementSuggestionsOptions {
  projectId: string | undefined;
}

/**
 * Hook para LEITURA de dados do Planejamento de Medições (planning_periods + service_planning_by_period)
 * para sugerir/preencher o Planejamento Semanal.
 * 
 * ⚠️ REGRA: Este hook é SOMENTE LEITURA.
 * Ele NÃO grava em: measurements, measurement_services, productions, supply_requests
 */
export function useMeasurementSuggestions({ projectId }: UseMeasurementSuggestionsOptions) {
  const { company } = useAuth();
  const [periods, setPeriods] = useState<PeriodForImport[]>([]);
  const [suggestions, setSuggestions] = useState<MeasurementSuggestion[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Carregar períodos disponíveis para importação (somente draft ou approved)
  const loadPeriods = useCallback(async () => {
    if (!projectId || !company?.id) {
      setPeriods([]);
      return;
    }

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
        .select(`
          id,
          period_number,
          name,
          start_date,
          end_date,
          status
        `)
        .eq("project_id", projectId)
        .eq("planning_version_id", version.id)
        .order("period_number", { ascending: true });

      if (periodsError) throw periodsError;

      if (!periodsData || periodsData.length === 0) {
        setPeriods([]);
        return;
      }

      // Calcular totais para cada período
      const periodsWithTotals = await Promise.all(
        periodsData.map(async (period) => {
          const { data: services, count } = await supabase
            .from("service_planning_by_period")
            .select("target_houses", { count: "exact" })
            .eq("planning_period_id", period.id);

          const totalHouses = (services || []).reduce((sum, s) => sum + (s.target_houses || 0), 0);

          return {
            id: period.id,
            period_number: period.period_number,
            name: period.name,
            start_date: period.start_date,
            end_date: period.end_date,
            status: period.status || "draft",
            total_services: count || 0,
            total_houses: totalHouses,
          } as PeriodForImport;
        })
      );

      setPeriods(periodsWithTotals);
    } catch (error) {
      console.error("Erro ao carregar períodos para importação:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, company?.id]);

  // Carregar sugestões de um período específico
  const loadSuggestions = useCallback(async (periodId: string) => {
    if (!periodId) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      // Buscar dados do período
      const { data: periodData, error: periodError } = await supabase
        .from("planning_periods")
        .select("period_number, name, start_date, end_date")
        .eq("id", periodId)
        .single();

      if (periodError) throw periodError;

      // Buscar serviços do período
      const { data: servicesData, error: servicesError } = await supabase
        .from("service_planning_by_period")
        .select(`
          id,
          planning_period_id,
          macro_id,
          macro_name,
          scope_id,
          scope_name,
          target_houses,
          planned_revenue,
          planned_cost,
          projected_result
        `)
        .eq("planning_period_id", periodId)
        .order("macro_name", { ascending: true });

      if (servicesError) throw servicesError;

      const mappedSuggestions: MeasurementSuggestion[] = (servicesData || []).map((s) => ({
        id: s.id,
        planning_period_id: s.planning_period_id,
        period_number: periodData.period_number,
        period_name: periodData.name,
        period_start_date: periodData.start_date,
        period_end_date: periodData.end_date,
        macro_id: s.macro_id,
        macro_name: s.macro_name,
        scope_id: s.scope_id,
        scope_name: s.scope_name,
        target_houses: s.target_houses || 0,
        planned_revenue: s.planned_revenue || 0,
        planned_cost: s.planned_cost || 0,
        projected_result: s.projected_result || 0,
      }));

      setSuggestions(mappedSuggestions);
    } catch (error) {
      console.error("Erro ao carregar sugestões:", error);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  // Selecionar período e carregar sugestões
  const selectPeriod = useCallback((periodId: string | null) => {
    setSelectedPeriodId(periodId);
    if (periodId) {
      loadSuggestions(periodId);
    } else {
      setSuggestions([]);
    }
  }, [loadSuggestions]);

  // Período selecionado
  const selectedPeriod = useMemo(() => {
    return periods.find((p) => p.id === selectedPeriodId) || null;
  }, [periods, selectedPeriodId]);

  // Carregar períodos quando projeto mudar
  useEffect(() => {
    if (projectId) {
      loadPeriods();
    } else {
      setPeriods([]);
      setSelectedPeriodId(null);
      setSuggestions([]);
    }
  }, [projectId, loadPeriods]);

  return {
    // Períodos disponíveis para importação
    periods,
    selectedPeriod,
    selectedPeriodId,
    
    // Sugestões do período selecionado
    suggestions,
    
    // Estados de carregamento
    isLoading,
    isLoadingSuggestions,
    
    // Ações
    selectPeriod,
    refreshPeriods: loadPeriods,
  };
}
