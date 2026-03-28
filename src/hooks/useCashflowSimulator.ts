import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { toast } from "sonner";
import { addDays, format, startOfMonth, endOfMonth, eachDayOfInterval, eachMonthOfInterval } from "date-fns";

export interface SimInput {
  id?: string;
  budget_service_input_id: string;
  input_id: string;
  input_name: string;
  macro_id: string;
  scope_id: string;
  macro_name?: string;
  scope_name?: string;
  supplier_name: string;
  supplier_id: string | null;
  reference_price: number;
  lead_time_days: number;
  installment_1_days: number;
  installment_1_pct: number;
  installment_2_days: number;
  installment_2_pct: number;
  installment_3_days: number;
  installment_3_pct: number;
  quantity_per_unit: number;
  unit: string | null;
}

export interface CashflowInstallment {
  id: string;
  input_name: string;
  macro_name: string;
  scope_name: string;
  supplier_name: string;
  period_name: string;
  period_id: string;
  purchase_date: Date;
  installment_date: Date;
  installment_number: number;
  installment_pct: number;
  total_quantity: number;
  unit_price: number;
  total_value: number;
  installment_value: number;
  family: string; // macro_name used as family
}

export function useCashflowSimulator() {
  const { company } = useAuth();
  const { currentProject } = useConstruction();
  const projectId = currentProject?.id;
  const companyId = company?.id;

  const [simInputs, setSimInputs] = useState<SimInput[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [periods, setPeriods] = useState<any[]>([]);
  const [periodServices, setPeriodServices] = useState<any[]>([]);
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Load suppliers for autocomplete
  const loadSuppliers = useCallback(async () => {
    if (!projectId || !companyId) return;
    const { data } = await supabase
      .from("suppliers")
      .select("id, name")
      .or(`supplier_scope.eq.global,project_id.eq.${projectId}`)
      .order("name");
    setSuppliers(data || []);
  }, [projectId, companyId]);

  // Load budget_service_inputs and merge with saved sim config
  const loadInputs = useCallback(async () => {
    if (!projectId || !companyId) return;
    setIsLoading(true);
    try {
      // Get budget service inputs
      const { data: budgetInputs, error: biErr } = await supabase
        .from("budget_service_inputs")
        .select("id, input_id, input_name, macro_id, scope_id, service_name, quantity_per_unit, unit")
        .eq("project_id", projectId)
        .eq("company_id", companyId);

      if (biErr) throw biErr;

      // Get saved sim inputs
      const { data: savedInputs } = await supabase
        .from("cashflow_sim_inputs")
        .select("*")
        .eq("project_id", projectId)
        .eq("company_id", companyId);

      const savedMap = new Map((savedInputs || []).map((s: any) => [s.budget_service_input_id, s]));

      // Get macro/scope names from contract services
      const { data: contractServices } = await supabase
        .from("project_contract_services")
        .select("macro_id, scope_id, macro_name, scope_name")
        .eq("project_id", projectId);

      const nameMap = new Map(
        (contractServices || []).map((cs: any) => [`${cs.macro_id}::${cs.scope_id}`, cs])
      );

      const merged: SimInput[] = (budgetInputs || []).map((bi: any) => {
        const saved = savedMap.get(bi.id);
        const names = nameMap.get(`${bi.macro_id}::${bi.scope_id}`);
        return {
          budget_service_input_id: bi.id,
          input_id: bi.input_id,
          input_name: bi.input_name || bi.service_name || "Sem nome",
          macro_id: bi.macro_id,
          scope_id: bi.scope_id,
          macro_name: names?.macro_name || "—",
          scope_name: names?.scope_name || "—",
          quantity_per_unit: bi.quantity_per_unit || 0,
          unit: bi.unit,
          supplier_name: saved?.supplier_name || "",
          supplier_id: saved?.supplier_id || null,
          reference_price: saved?.reference_price ?? 0,
          lead_time_days: saved?.lead_time_days ?? 7,
          installment_1_days: saved?.installment_1_days ?? 0,
          installment_1_pct: saved?.installment_1_pct ?? 100,
          installment_2_days: saved?.installment_2_days ?? 0,
          installment_2_pct: saved?.installment_2_pct ?? 0,
          installment_3_days: saved?.installment_3_days ?? 0,
          installment_3_pct: saved?.installment_3_pct ?? 0,
          id: saved?.id,
        };
      });

      setSimInputs(merged.sort((a, b) => a.macro_name.localeCompare(b.macro_name, "pt-BR")));
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar insumos do orçamento");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, companyId]);

  // Load planning periods
  const loadPeriods = useCallback(async () => {
    if (!projectId) return;

    const { data: version } = await supabase
      .from("planning_versions")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .maybeSingle();

    if (!version) { setPeriods([]); return; }

    const { data } = await supabase
      .from("planning_periods")
      .select("id, name, period_number, start_date, end_date, status")
      .eq("project_id", projectId)
      .eq("planning_version_id", version.id)
      .order("period_number");

    setPeriods(data || []);

    // Load all period services
    const periodIds = (data || []).map((p: any) => p.id);
    if (periodIds.length > 0) {
      const { data: services } = await supabase
        .from("service_planning_by_period")
        .select("planning_period_id, macro_id, scope_id, target_houses")
        .in("planning_period_id", periodIds);

      setPeriodServices(services || []);
    }
  }, [projectId]);

  // Save a single sim input
  const saveSimInput = useCallback(async (input: SimInput) => {
    if (!projectId || !companyId) return;
    setIsSaving(true);
    try {
      const payload = {
        project_id: projectId,
        company_id: companyId,
        budget_service_input_id: input.budget_service_input_id,
        input_id: input.input_id,
        input_name: input.input_name,
        macro_id: input.macro_id,
        scope_id: input.scope_id,
        supplier_name: input.supplier_name || null,
        supplier_id: input.supplier_id || null,
        reference_price: input.reference_price,
        lead_time_days: input.lead_time_days,
        installment_1_days: input.installment_1_days,
        installment_1_pct: input.installment_1_pct,
        installment_2_days: input.installment_2_days,
        installment_2_pct: input.installment_2_pct,
        installment_3_days: input.installment_3_days,
        installment_3_pct: input.installment_3_pct,
        updated_at: new Date().toISOString(),
      };

      if (input.id) {
        await supabase.from("cashflow_sim_inputs").update(payload).eq("id", input.id);
      } else {
        const { data } = await supabase.from("cashflow_sim_inputs").insert(payload).select("id").single();
        if (data) {
          setSimInputs(prev => prev.map(i =>
            i.budget_service_input_id === input.budget_service_input_id ? { ...i, id: data.id } : i
          ));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar configuração");
    } finally {
      setIsSaving(false);
    }
  }, [projectId, companyId]);

  // Update a single input field locally
  const updateSimInput = useCallback((budgetInputId: string, field: keyof SimInput, value: any) => {
    setSimInputs(prev => prev.map(i =>
      i.budget_service_input_id === budgetInputId ? { ...i, [field]: value } : i
    ));
  }, []);

  // ===== CALCULATION ENGINE =====
  const installments = useMemo<CashflowInstallment[]>(() => {
    const activePeriodIds = selectedPeriodIds.length > 0
      ? selectedPeriodIds
      : periods.map((p: any) => p.id);

    const result: CashflowInstallment[] = [];
    let counter = 0;

    for (const periodId of activePeriodIds) {
      const period = periods.find((p: any) => p.id === periodId);
      if (!period) continue;

      // Get services for this period
      const services = periodServices.filter((s: any) => s.planning_period_id === periodId);

      for (const service of services) {
        // Find matching sim inputs for this macro/scope
        const matchingInputs = simInputs.filter(
          i => i.macro_id === service.macro_id && i.scope_id === service.scope_id
        );

        for (const input of matchingInputs) {
          const targetHouses = service.target_houses || 0;
          if (targetHouses === 0 || input.reference_price === 0) continue;

          const totalQty = targetHouses * input.quantity_per_unit;
          const totalValue = totalQty * input.reference_price;
          const purchaseDate = addDays(new Date(period.start_date), -input.lead_time_days);

          // Generate installments
          const installmentConfigs = [
            { days: input.installment_1_days, pct: input.installment_1_pct },
            { days: input.installment_2_days, pct: input.installment_2_pct },
            { days: input.installment_3_days, pct: input.installment_3_pct },
          ];

          for (let idx = 0; idx < installmentConfigs.length; idx++) {
            const cfg = installmentConfigs[idx];
            if (cfg.pct <= 0) continue;

            counter++;
            const installmentDate = addDays(purchaseDate, cfg.days);
            const installmentValue = totalValue * (cfg.pct / 100);

            result.push({
              id: `inst-${counter}`,
              input_name: input.input_name,
              macro_name: input.macro_name || "—",
              scope_name: input.scope_name || "—",
              supplier_name: input.supplier_name || "Não definido",
              period_name: period.name || `Período ${period.period_number}`,
              period_id: periodId,
              purchase_date: purchaseDate,
              installment_date: installmentDate,
              installment_number: idx + 1,
              installment_pct: cfg.pct,
              total_quantity: totalQty,
              unit_price: input.reference_price,
              total_value: totalValue,
              installment_value: installmentValue,
              family: input.macro_name || "Outros",
            });
          }
        }
      }
    }

    return result.sort((a, b) => a.installment_date.getTime() - b.installment_date.getTime());
  }, [simInputs, periods, periodServices, selectedPeriodIds]);

  // Monthly consolidated data
  const monthlyData = useMemo(() => {
    if (installments.length === 0) return { months: [], supplierMatrix: [], familyTotals: [] };

    const minDate = installments[0].installment_date;
    const maxDate = installments[installments.length - 1].installment_date;
    const months = eachMonthOfInterval({ start: startOfMonth(minDate), end: endOfMonth(maxDate) });

    // Supplier × month matrix
    const supplierMap = new Map<string, Map<string, number>>();
    const familyMap = new Map<string, Map<string, number>>();

    for (const inst of installments) {
      const monthKey = format(inst.installment_date, "yyyy-MM");

      // By supplier
      if (!supplierMap.has(inst.supplier_name)) supplierMap.set(inst.supplier_name, new Map());
      const sm = supplierMap.get(inst.supplier_name)!;
      sm.set(monthKey, (sm.get(monthKey) || 0) + inst.installment_value);

      // By family
      if (!familyMap.has(inst.family)) familyMap.set(inst.family, new Map());
      const fm = familyMap.get(inst.family)!;
      fm.set(monthKey, (fm.get(monthKey) || 0) + inst.installment_value);
    }

    const monthKeys = months.map(m => format(m, "yyyy-MM"));

    const supplierMatrix = Array.from(supplierMap.entries()).map(([supplier, monthData]) => ({
      supplier,
      months: monthKeys.map(mk => monthData.get(mk) || 0),
      total: Array.from(monthData.values()).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.total - a.total);

    const familyTotals = Array.from(familyMap.entries()).map(([family, monthData]) => ({
      family,
      months: monthKeys.map(mk => monthData.get(mk) || 0),
      total: Array.from(monthData.values()).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.total - a.total);

    return { months, monthKeys, supplierMatrix, familyTotals };
  }, [installments]);

  // Daily map for calendar
  const dailyMap = useMemo(() => {
    const map = new Map<string, CashflowInstallment[]>();
    for (const inst of installments) {
      const key = format(inst.installment_date, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inst);
    }
    return map;
  }, [installments]);

  useEffect(() => {
    loadInputs();
    loadPeriods();
    loadSuppliers();
  }, [loadInputs, loadPeriods, loadSuppliers]);

  return {
    simInputs,
    isLoading,
    isSaving,
    periods,
    selectedPeriodIds,
    setSelectedPeriodIds,
    suppliers,
    updateSimInput,
    saveSimInput,
    installments,
    monthlyData,
    dailyMap,
    loadInputs,
  };
}
