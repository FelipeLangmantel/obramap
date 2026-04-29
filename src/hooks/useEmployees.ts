import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { toast } from "@/hooks/use-toast";

export interface Employee {
  id: string;
  company_id: string;
  name: string;
  cpf: string | null;
  profession: string | null;
  worker_type: "professional" | "helper";
  cost_per_hour: number | null;
  hire_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

/**
 * Funcionários próprios da empresa. Apontamentos no Diário podem
 * vincular funcionário ao "contrato interno" (Mão de Obra Própria),
 * permitindo rastrear casas/serviços executados pela equipe própria.
 */
export function useEmployees(opts: { onlyActive?: boolean } = {}) {
  const { company, canEdit } = useAuth();
  const { currentProject } = useConstruction();
  const companyId = company?.id;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [internalContractId, setInternalContractId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    let q = (supabase as any)
      .from("employees")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    if (opts.onlyActive) q = q.eq("active", true);
    const { data } = await q;
    if (data) setEmployees(data as any);
    setIsLoading(false);
  }, [companyId, opts.onlyActive]);

  useEffect(() => { fetch(); }, [fetch]);

  /** Garante (e retorna) o contractor_contract interno do projeto atual. */
  const ensureInternalContract = useCallback(async (): Promise<string | null> => {
    if (!currentProject?.id) return null;
    const { data, error } = await (supabase as any).rpc("ensure_internal_contract", {
      _project_id: currentProject.id,
    });
    if (error) {
      console.warn("[ensure_internal_contract]", error.message);
      return null;
    }
    setInternalContractId(data || null);
    return data || null;
  }, [currentProject?.id]);

  useEffect(() => { ensureInternalContract(); }, [ensureInternalContract]);

  const create = async (e: Partial<Employee>) => {
    if (!canEdit || !companyId) return null;
    const { data, error } = await (supabase as any)
      .from("employees")
      .insert({
        company_id: companyId,
        name: e.name?.trim(),
        cpf: e.cpf?.trim() || null,
        profession: e.profession?.trim() || null,
        worker_type: e.worker_type || "professional",
        cost_per_hour: e.cost_per_hour ?? null,
        hire_date: e.hire_date || null,
        active: e.active ?? true,
        notes: e.notes?.trim() || null,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao cadastrar funcionário", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Funcionário cadastrado" });
    await fetch();
    return data;
  };

  const update = async (id: string, patch: Partial<Employee>) => {
    if (!canEdit) return false;
    const { error } = await (supabase as any).from("employees").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return false;
    }
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    if (!canEdit) return false;
    const { error } = await (supabase as any).from("employees").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return false;
    }
    await fetch();
    return true;
  };

  return { employees, isLoading, internalContractId, create, update, remove, refetch: fetch, ensureInternalContract };
}
