import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { toast } from "sonner";

export interface ContractService {
  id?: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  unit_revenue_value: number;
  max_cost_value: number;
  cost_percent: number;
  status: string;
  macro_order: number;
  scope_order: number;
}

export interface ProjectContract {
  id?: string;
  contract_number: string | null;
  contract_date: string | null;
  contract_value_total: number;
  cost_target_percent: number;
  target_margin_percent: number | null;
  target_profit_value: number | null;
  notes: string | null;
}

export function useProjectContract() {
  const { company } = useAuth();
  const { currentProject } = useConstruction();
  const { currentStep, advanceToStep } = useProjectSetupFlow();
  
  const [contract, setContract] = useState<ProjectContract | null>(null);
  const [services, setServices] = useState<ContractService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPlanning, setHasPlanning] = useState(false);

  // ✅ Reset completo de estado quando projectId muda
  useEffect(() => {
    setContract(null);
    setServices([]);
    setLoading(true);
    setSaving(false);
    setHasPlanning(false);
  }, [currentProject?.id]);

  // Load contract and services
  const loadData = useCallback(async () => {
    if (!currentProject?.id || !company?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Load existing contract
      const { data: contractData, error: contractError } = await supabase
        .from("project_contracts")
        .select("*")
        .eq("project_id", currentProject.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (contractError) throw contractError;

      if (contractData) {
        setContract({
          id: contractData.id,
          contract_number: contractData.contract_number,
          contract_date: contractData.contract_date,
          contract_value_total: contractData.contract_value_total,
          cost_target_percent: contractData.cost_target_percent,
          target_margin_percent: contractData.target_margin_percent,
          target_profit_value: contractData.target_profit_value,
          notes: contractData.notes,
        });

        // ✅ Se já existe contrato no backend, garantir progressão do fluxo
        // (evita casos onde o contrato foi criado mas o setup_step ficou preso em budget_defined)
        if (currentStep && currentStep !== "contract_defined" && currentStep !== "long_term_planned") {
          await advanceToStep("contract_defined");
        }

        // Sync contract services from budget (calls RPC to import missing services)
        await supabase.rpc("sync_contract_services", {
          p_project_id: currentProject.id,
          p_company_id: company.id,
        });

        // Load existing contract services
        const { data: servicesData, error: servicesError } = await supabase
          .from("project_contract_services")
          .select("*")
          .eq("contract_id", contractData.id)
          .order("macro_order", { ascending: true })
          .order("scope_order", { ascending: true });

        if (servicesError) throw servicesError;

        if (servicesData && servicesData.length > 0) {
          setServices(
            servicesData.map((s) => ({
              id: s.id,
              macro_id: s.macro_id,
              macro_name: s.macro_name,
              scope_id: s.scope_id,
              scope_name: s.scope_name,
              unit_revenue_value: Number(s.unit_revenue_value),
              max_cost_value: Number(s.max_cost_value),
              cost_percent: Number(s.cost_percent),
              status: s.status,
              macro_order: Number((s as any).macro_order ?? 0),
              scope_order: Number((s as any).scope_order ?? 0),
            }))
          );
        } else {
          // Load services from scope_costs (budget) as fallback
          await loadServicesFromBudget();
        }

        // Check if planning exists
        const { data: planningData } = await supabase
          .from("planning_versions")
          .select("id")
          .eq("project_id", currentProject.id)
          .eq("is_active", true)
          .limit(1);

        setHasPlanning((planningData?.length || 0) > 0);
      } else {
        // Create default contract
        setContract({
          contract_number: null,
          contract_date: new Date().toISOString().split("T")[0],
          contract_value_total: 0,
          cost_target_percent: 70,
          target_margin_percent: 30,
          target_profit_value: 0,
          notes: null,
        });

        // Load services from scope_costs (budget)
        await loadServicesFromBudget();
      }
    } catch (error) {
      console.error("Error loading contract data:", error);
      toast.error("Erro ao carregar dados do contrato");
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id, company?.id, currentStep, advanceToStep]);

  const loadServicesFromBudget = async () => {
    if (!currentProject?.id) return;

    // Build order map from macrosTemplate
    const orderMap = new Map<string, { macro_order: number; scope_order: number }>();
    currentProject.macrosTemplate?.forEach((macro, mi) => {
      macro.scopes.forEach((scope, si) => {
        orderMap.set(`${macro.id}-${scope.id}`, { macro_order: mi, scope_order: si });
      });
    });

    const getOrder = (macroId: string, scopeId: string) => 
      orderMap.get(`${macroId}-${scopeId}`) ?? { macro_order: 0, scope_order: 0 };

    // First try scope_costs (budget data)
    const { data: scopeCosts, error: scopeCostsError } = await supabase
      .from("scope_costs")
      .select("macro_id, macro_name, scope_id, scope_name")
      .eq("project_id", currentProject.id);

    if (!scopeCostsError && scopeCosts && scopeCosts.length > 0) {
      const uniqueServices = new Map<string, ContractService>();
      scopeCosts.forEach(sc => {
        const key = `${sc.macro_id}-${sc.scope_id}`;
        if (!uniqueServices.has(key)) {
          const ord = getOrder(sc.macro_id, sc.scope_id);
          uniqueServices.set(key, {
            macro_id: sc.macro_id,
            macro_name: sc.macro_name,
            scope_id: sc.scope_id,
            scope_name: sc.scope_name,
            unit_revenue_value: 0,
            max_cost_value: 0,
            cost_percent: 0,
            status: "pending",
            ...ord,
          });
        }
      });
      setServices(Array.from(uniqueServices.values()).sort((a, b) => a.macro_order - b.macro_order || a.scope_order - b.scope_order));
      return;
    }

    // Second: try measurement_services
    const { data: measurementServices, error: msError } = await supabase
      .from("measurement_services")
      .select("macro_id, macro_name, scope_id, scope_name")
      .eq("project_id", currentProject.id);

    if (!msError && measurementServices && measurementServices.length > 0) {
      const uniqueServices = new Map<string, ContractService>();
      measurementServices.forEach(ms => {
        const key = `${ms.macro_id}-${ms.scope_id}`;
        if (!uniqueServices.has(key)) {
          const ord = getOrder(ms.macro_id, ms.scope_id);
          uniqueServices.set(key, {
            macro_id: ms.macro_id,
            macro_name: ms.macro_name,
            scope_id: ms.scope_id,
            scope_name: ms.scope_name,
            unit_revenue_value: 0,
            max_cost_value: 0,
            cost_percent: 0,
            status: "pending",
            ...ord,
          });
        }
      });
      setServices(Array.from(uniqueServices.values()).sort((a, b) => a.macro_order - b.macro_order || a.scope_order - b.scope_order));
      return;
    }

    // Final fallback: use project's macrosTemplate from context
    if (currentProject?.macrosTemplate && currentProject.macrosTemplate.length > 0) {
      const servicesFromTemplate: ContractService[] = [];
      currentProject.macrosTemplate.forEach((macro, macroIdx) => {
        macro.scopes.forEach((scope, scopeIdx) => {
          servicesFromTemplate.push({
            macro_id: macro.id,
            macro_name: macro.name,
            scope_id: scope.id,
            scope_name: scope.name,
            unit_revenue_value: 0,
            max_cost_value: 0,
            cost_percent: 0,
            status: "pending",
            macro_order: macroIdx,
            scope_order: scopeIdx,
          });
        });
      });
      setServices(servicesFromTemplate);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update service value
  const updateServiceValue = useCallback((
    macroId: string,
    scopeId: string,
    value: number
  ) => {
    const costPercent = contract?.cost_target_percent || 70;
    
    setServices(prev => prev.map(s => {
      if (s.macro_id === macroId && s.scope_id === scopeId) {
        const maxCost = value * (costPercent / 100);
        return {
          ...s,
          unit_revenue_value: value,
          max_cost_value: maxCost,
          cost_percent: value > 0 ? costPercent : 0,
          status: value > 0 ? "ok" : "pending",
        };
      }
      return s;
    }));
  }, [contract?.cost_target_percent]);

  // Recalculate all costs when target percent changes
  const updateCostTarget = useCallback((newPercent: number) => {
    setContract(prev => prev ? { ...prev, cost_target_percent: newPercent, target_margin_percent: 100 - newPercent } : null);
    
    setServices(prev => prev.map(s => ({
      ...s,
      max_cost_value: s.unit_revenue_value * (newPercent / 100),
      cost_percent: s.unit_revenue_value > 0 ? newPercent : 0,
    })));
  }, []);

  // Calculate totals
  const totals = {
    totalRevenue: services.reduce((acc, s) => acc + s.unit_revenue_value, 0),
    totalMaxCost: services.reduce((acc, s) => acc + s.max_cost_value, 0),
    projectedMargin: services.reduce((acc, s) => acc + (s.unit_revenue_value - s.max_cost_value), 0),
    servicesWithoutPrice: services.filter(s => s.unit_revenue_value === 0).length,
  };

  // Save contract
  const saveContract = async (): Promise<boolean> => {
    if (!currentProject?.id || !company?.id || !contract) {
      toast.error("Dados do projeto não disponíveis");
      return false;
    }

    setSaving(true);
    try {
      let contractId = contract.id;

      // Upsert contract
      if (contractId) {
        const { error } = await supabase
          .from("project_contracts")
          .update({
            contract_number: contract.contract_number,
            contract_date: contract.contract_date,
            contract_value_total: totals.totalRevenue,
            cost_target_percent: contract.cost_target_percent,
            target_margin_percent: contract.target_margin_percent,
            target_profit_value: totals.projectedMargin,
            notes: contract.notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", contractId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("project_contracts")
          .insert({
            company_id: company.id,
            project_id: currentProject.id,
            contract_number: contract.contract_number,
            contract_date: contract.contract_date,
            contract_value_total: totals.totalRevenue,
            cost_target_percent: contract.cost_target_percent,
            target_margin_percent: contract.target_margin_percent,
            target_profit_value: totals.projectedMargin,
            notes: contract.notes,
          })
          .select("id")
          .single();

        if (error) throw error;
        contractId = data.id;
        setContract(prev => prev ? { ...prev, id: contractId } : null);
      }

      // Delete existing services and insert new ones
      await supabase
        .from("project_contract_services")
        .delete()
        .eq("contract_id", contractId!);

      const servicesToInsert = services.map(s => ({
        company_id: company.id,
        project_id: currentProject.id,
        contract_id: contractId!,
        macro_id: s.macro_id,
        macro_name: s.macro_name,
        scope_id: s.scope_id,
        scope_name: s.scope_name,
        unit_revenue_value: s.unit_revenue_value,
        max_cost_value: s.max_cost_value,
        cost_percent: s.cost_percent,
        status: s.status,
        macro_order: s.macro_order ?? 0,
        scope_order: s.scope_order ?? 0,
      }));

      const { error: servicesError } = await supabase
        .from("project_contract_services")
        .insert(servicesToInsert);

      if (servicesError) throw servicesError;

      // ✅ Ao salvar contrato, garantir progressão do fluxo
      try {
        if (currentStep && currentStep !== "contract_defined" && currentStep !== "long_term_planned") {
          await advanceToStep("contract_defined");
        }
      } catch {
        // não bloquear o salvamento por falha de progressão
      }

      toast.success("Contrato salvo com sucesso!");
      return true;
    } catch (error) {
      console.error("Error saving contract:", error);
      toast.error("Erro ao salvar contrato");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    contract,
    setContract,
    services,
    loading,
    saving,
    hasPlanning,
    totals,
    updateServiceValue,
    updateCostTarget,
    saveContract,
    reload: loadData,
  };
}
