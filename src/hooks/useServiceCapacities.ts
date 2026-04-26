import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ServiceDefaultCapacity {
  id?: string;
  project_id: string;
  scope_id: string;
  scope_name?: string | null;
  unit_label: string;
  unit_symbol: string;
  capacity_value: number;
  notes?: string | null;
}

export interface ServiceHouseCapacity {
  id?: string;
  project_id: string;
  scope_id: string;
  house_number: number;
  unit_label: string;
  unit_symbol: string;
  capacity_value: number;
  notes?: string | null;
}

const PHYSICAL_SYMBOLS = ["m²", "m2", "m³", "m3", "m", "ml"];

export const isPhysicalUnit = (symbol?: string | null) =>
  !!symbol && PHYSICAL_SYMBOLS.includes(symbol);

/**
 * Gerencia capacidades de produção por serviço:
 *  - 1 capacidade default por serviço (vale para todas as casas)
 *  - N ajustes finos por casa (sobrepõem o default)
 * Validação no banco bloqueia lançamentos que excedam a capacidade.
 */
export function useServiceCapacities(projectId: string | null, scopeId?: string | null) {
  const [defaultCap, setDefaultCap] = useState<ServiceDefaultCapacity | null>(null);
  const [houseCaps, setHouseCaps] = useState<ServiceHouseCapacity[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId || !scopeId) {
      setDefaultCap(null);
      setHouseCaps([]);
      return;
    }
    setLoading(true);
    try {
      const [{ data: def }, { data: hc }] = await Promise.all([
        supabase
          .from("service_default_capacities" as any)
          .select("*")
          .eq("project_id", projectId)
          .eq("scope_id", scopeId)
          .maybeSingle(),
        supabase
          .from("service_house_capacities" as any)
          .select("*")
          .eq("project_id", projectId)
          .eq("scope_id", scopeId)
          .order("house_number", { ascending: true }),
      ]);
      setDefaultCap((def as any) || null);
      setHouseCaps(((hc as any[]) || []) as ServiceHouseCapacity[]);
    } catch (e: any) {
      console.error("[useServiceCapacities]", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, scopeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertDefault = useCallback(
    async (input: Omit<ServiceDefaultCapacity, "id">) => {
      const { data: companyId } = await supabase.rpc("get_my_company_id");
      if (!companyId) {
        toast.error("Empresa não identificada");
        return false;
      }
      const payload = { ...input, company_id: companyId };
      const { error } = await supabase
        .from("service_default_capacities" as any)
        .upsert(payload, { onConflict: "project_id,scope_id" });
      if (error) {
        toast.error(error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const removeDefault = useCallback(async () => {
    if (!projectId || !scopeId) return false;
    const { error } = await supabase
      .from("service_default_capacities" as any)
      .delete()
      .eq("project_id", projectId)
      .eq("scope_id", scopeId);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await refresh();
    return true;
  }, [projectId, scopeId, refresh]);

  const upsertHouseCap = useCallback(
    async (input: Omit<ServiceHouseCapacity, "id">) => {
      const { data: companyId } = await supabase.rpc("get_my_company_id");
      if (!companyId) {
        toast.error("Empresa não identificada");
        return false;
      }
      const payload = { ...input, company_id: companyId };
      const { error } = await supabase
        .from("service_house_capacities" as any)
        .upsert(payload, { onConflict: "project_id,scope_id,house_number" });
      if (error) {
        toast.error(error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const removeHouseCap = useCallback(
    async (house_number: number) => {
      if (!projectId || !scopeId) return false;
      const { error } = await supabase
        .from("service_house_capacities" as any)
        .delete()
        .eq("project_id", projectId)
        .eq("scope_id", scopeId)
        .eq("house_number", house_number);
      if (error) {
        toast.error(error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [projectId, scopeId, refresh]
  );

  /** Capacidade efetiva da casa: específica > default */
  const getCapacityFor = useCallback(
    (house_number: number): number | null => {
      const specific = houseCaps.find((h) => h.house_number === house_number);
      if (specific) return specific.capacity_value;
      if (defaultCap) return defaultCap.capacity_value;
      return null;
    },
    [houseCaps, defaultCap]
  );

  return {
    defaultCap,
    houseCaps,
    loading,
    refresh,
    upsertDefault,
    removeDefault,
    upsertHouseCap,
    removeHouseCap,
    getCapacityFor,
  };
}
