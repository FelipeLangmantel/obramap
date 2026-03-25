import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { toast } from "@/hooks/use-toast";

export interface Contractor {
  id: string;
  company_id: string;
  supplier_id: string | null;
  name: string;
  cpf_cnpj: string | null;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_type: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export interface ContractorContract {
  id: string;
  company_id: string;
  project_id: string;
  contractor_id: string;
  contract_number: string | null;
  retention_percent: number;
  total_value: number;
  total_measured: number;
  total_retained: number;
  total_paid: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  contractor?: Contractor;
}

export interface ContractorContractService {
  id: string;
  contract_id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  budget_unit_value: number;
  negotiated_unit_value: number;
  house_ids: number[];
  total_houses: number;
  total_value: number;
  measured_houses: number;
  measured_value: number;
}

export interface ContractorMeasurement {
  id: string;
  contract_id: string;
  measurement_number: number;
  period_start: string;
  period_end: string;
  gross_value: number;
  retention_value: number;
  net_value: number;
  retention_percent: number;
  status: string;
  approved_at: string | null;
  payment_due_date: string | null;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface ContractorMeasurementItem {
  id: string;
  measurement_id: string;
  contract_service_id: string;
  house_ids: number[];
  houses_measured: number;
  unit_value: number;
  total_value: number;
  notes: string | null;
}

export function useContractors() {
  const { company, canEdit } = useAuth();
  const { currentProject } = useConstruction();
  const companyId = company?.id;
  const projectId = currentProject?.id;

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [contracts, setContracts] = useState<ContractorContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContractors = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("contractors")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    if (data) setContractors(data as any);
  }, [companyId]);

  const fetchContracts = useCallback(async () => {
    if (!companyId || !projectId) return;
    const { data } = await supabase
      .from("contractor_contracts")
      .select("*")
      .eq("company_id", companyId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) {
      const enriched = data.map((c: any) => ({
        ...c,
        contractor: contractors.find(ct => ct.id === c.contractor_id),
      }));
      setContracts(enriched);
    }
  }, [companyId, projectId, contractors]);

  useEffect(() => {
    setIsLoading(true);
    fetchContractors().finally(() => setIsLoading(false));
  }, [fetchContractors]);

  useEffect(() => {
    if (contractors.length >= 0) fetchContracts();
  }, [fetchContracts, contractors]);

  const createContractor = async (data: Partial<Contractor>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!companyId) return null;
    const { data: result, error } = await supabase
      .from("contractors")
      .insert({ ...data, company_id: companyId } as any)
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao cadastrar empreiteiro", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Empreiteiro cadastrado com sucesso" });
    await fetchContractors();
    return result;
  };

  const updateContractor = async (id: string, data: Partial<Contractor>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return false; }
    const { error } = await supabase
      .from("contractors")
      .update({ ...data, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Empreiteiro atualizado" });
    await fetchContractors();
    return true;
  };

  const createContract = async (contractorId: string, data: Partial<ContractorContract>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!companyId || !projectId) return null;
    const { data: result, error } = await supabase
      .from("contractor_contracts")
      .insert({
        ...data,
        company_id: companyId,
        project_id: projectId,
        contractor_id: contractorId,
      } as any)
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao criar contrato", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Contrato criado com sucesso" });
    await fetchContracts();
    return result;
  };

  const fetchContractServices = async (contractId: string): Promise<ContractorContractService[]> => {
    const { data } = await supabase
      .from("contractor_contract_services")
      .select("*")
      .eq("contract_id", contractId)
      .order("macro_name, scope_name");
    return (data as any) || [];
  };

  const addContractService = async (contractId: string, service: Partial<ContractorContractService>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!companyId || !projectId) return null;
    const totalValue = (service.negotiated_unit_value || 0) * (service.total_houses || 0);
    const { data: result, error } = await supabase
      .from("contractor_contract_services")
      .insert({
        ...service,
        contract_id: contractId,
        company_id: companyId,
        project_id: projectId,
        total_value: totalValue,
      } as any)
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao adicionar serviço", description: error.message, variant: "destructive" });
      return null;
    }
    await recalcContractTotal(contractId);
    return result;
  };

  const updateContractService = async (serviceId: string, updates: Partial<ContractorContractService>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return false; }
    const houseCount = updates.house_ids?.length ?? updates.total_houses ?? 0;
    const unitValue = updates.negotiated_unit_value ?? 0;
    const totalValue = unitValue * houseCount;
    const { error } = await supabase
      .from("contractor_contract_services")
      .update({
        ...updates,
        total_houses: houseCount,
        total_value: totalValue,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", serviceId);
    if (error) {
      toast({ title: "Erro ao atualizar serviço", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Serviço atualizado" });
    return true;
  };

  const deleteContractService = async (serviceId: string, contractId: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return false; }
    const { error } = await supabase
      .from("contractor_contract_services")
      .delete()
      .eq("id", serviceId);
    if (error) {
      toast({ title: "Erro ao remover serviço", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Serviço removido" });
    await recalcContractTotal(contractId);
    return true;
  };

  const recalcContractTotal = async (contractId: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const services = await fetchContractServices(contractId);
    const total = services.reduce((s, sv) => s + sv.total_value, 0);
    await supabase
      .from("contractor_contracts")
      .update({ total_value: total, updated_at: new Date().toISOString() } as any)
      .eq("id", contractId);
    await fetchContracts();
  };

  const fetchMeasurements = async (contractId: string): Promise<ContractorMeasurement[]> => {
    const { data } = await supabase
      .from("contractor_measurements")
      .select("*")
      .eq("contract_id", contractId)
      .order("measurement_number");
    return (data as any) || [];
  };

  const createMeasurement = async (contractId: string, data: Partial<ContractorMeasurement>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!companyId || !projectId) return null;
    const { data: result, error } = await supabase
      .from("contractor_measurements")
      .insert({
        ...data,
        contract_id: contractId,
        company_id: companyId,
        project_id: projectId,
      } as any)
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao criar medição", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Medição criada com sucesso" });
    return result;
  };

  const fetchMeasurementItems = async (measurementId: string): Promise<ContractorMeasurementItem[]> => {
    const { data } = await supabase
      .from("contractor_measurement_items")
      .select("*")
      .eq("measurement_id", measurementId);
    return (data as any) || [];
  };

  const saveMeasurementItem = async (item: Partial<ContractorMeasurementItem> & { measurement_id: string; contract_service_id: string }) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!companyId || !projectId) return null;
    const totalValue = (item.unit_value || 0) * (item.houses_measured || 0);
    const { data: result, error } = await supabase
      .from("contractor_measurement_items")
      .upsert({
        ...item,
        company_id: companyId,
        project_id: projectId,
        total_value: totalValue,
      } as any)
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao salvar item", description: error.message, variant: "destructive" });
      return null;
    }
    return result;
  };

  const approveMeasurement = async (measurementId: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return false; }
    const { error } = await supabase
      .from("contractor_measurements")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      } as any)
      .eq("id", measurementId);
    if (error) {
      toast({ title: "Erro ao aprovar", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Medição aprovada — liberada para financeiro" });
    return true;
  };

  return {
    contractors,
    contracts,
    isLoading,
    createContractor,
    updateContractor,
    createContract,
    fetchContractServices,
    addContractService,
    updateContractService,
    deleteContractService,
    recalcContractTotal,
    fetchMeasurements,
    createMeasurement,
    fetchMeasurementItems,
    saveMeasurementItem,
    approveMeasurement,
    refetchContractors: fetchContractors,
    refetchContracts: fetchContracts,
  };
}
