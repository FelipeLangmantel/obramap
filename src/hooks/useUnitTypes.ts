import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UnitCapacity {
  id?: string;
  unit_type_id?: string;
  unit_label: string;
  unit_symbol: string;
  capacity_value: number;
  notes?: string | null;
}

export interface UnitType {
  id: string;
  project_id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  display_order: number;
  capacities: UnitCapacity[];
}

/**
 * Hook para gerenciar Tipologias e Capacidades de uma obra.
 * - 1 tipologia (ex: "Casa A 100m²") agrupa N capacidades por unidade física (m², m³, m linear).
 * - Validação de capacidade ocorre via trigger no banco em INSERT/UPDATE de produções.
 */
export function useUnitTypes(projectId: string | null) {
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setUnitTypes([]);
      return;
    }
    setLoading(true);
    try {
      const { data: types, error: errT } = await supabase
        .from("project_unit_types" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (errT) throw errT;

      const ids = (types || []).map((t: any) => t.id);
      let caps: any[] = [];
      if (ids.length > 0) {
        const { data: c, error: errC } = await supabase
          .from("project_unit_capacities" as any)
          .select("*")
          .in("unit_type_id", ids);
        if (errC) throw errC;
        caps = c || [];
      }

      const merged: UnitType[] = (types || []).map((t: any) => ({
        ...t,
        capacities: caps.filter((c) => c.unit_type_id === t.id),
      }));
      setUnitTypes(merged);
    } catch (e: any) {
      console.error("[useUnitTypes] erro:", e);
      toast.error(e?.message || "Erro ao carregar tipologias");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createType = useCallback(
    async (payload: { name: string; description?: string; is_default?: boolean }) => {
      if (!projectId) return null;
      const { data: meta, error: metaErr } = await supabase.rpc("get_my_company_id");
      if (metaErr || !meta) {
        toast.error("Empresa do usuário não encontrada");
        return null;
      }
      const { data, error } = await supabase
        .from("project_unit_types" as any)
        .insert({
          project_id: projectId,
          company_id: meta,
          name: payload.name.trim(),
          description: payload.description?.trim() || null,
          is_default: !!payload.is_default,
        })
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return null;
      }
      toast.success("Tipologia criada");
      await refresh();
      return data;
    },
    [projectId, refresh]
  );

  const updateType = useCallback(
    async (id: string, patch: Partial<Pick<UnitType, "name" | "description" | "is_default" | "display_order">>) => {
      const { error } = await supabase.from("project_unit_types" as any).update(patch).eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const deleteType = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("project_unit_types" as any).delete().eq("id", id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success("Tipologia removida");
      await refresh();
      return true;
    },
    [refresh]
  );

  const upsertCapacity = useCallback(
    async (unitTypeId: string, cap: UnitCapacity) => {
      const type = unitTypes.find((t) => t.id === unitTypeId);
      if (!type) return false;
      const payload = {
        unit_type_id: unitTypeId,
        company_id: type.company_id,
        project_id: type.project_id,
        unit_label: cap.unit_label,
        unit_symbol: cap.unit_symbol,
        capacity_value: cap.capacity_value,
        notes: cap.notes ?? null,
      };
      const { error } = await supabase
        .from("project_unit_capacities" as any)
        .upsert(payload, { onConflict: "unit_type_id,unit_symbol" });
      if (error) {
        toast.error(error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [unitTypes, refresh]
  );

  const deleteCapacity = useCallback(
    async (capacityId: string) => {
      const { error } = await supabase.from("project_unit_capacities" as any).delete().eq("id", capacityId);
      if (error) {
        toast.error(error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const assignHousesToType = useCallback(
    async (unitTypeId: string | null, houseIds: number[]) => {
      if (!projectId || houseIds.length === 0) return false;
      const { error } = await supabase
        .from("houses")
        .update({ unit_type_id: unitTypeId })
        .eq("project_id", projectId)
        .in("house_number", houseIds);
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success(`${houseIds.length} casa(s) atualizada(s)`);
      return true;
    },
    [projectId]
  );

  return {
    unitTypes,
    loading,
    refresh,
    createType,
    updateType,
    deleteType,
    upsertCapacity,
    deleteCapacity,
    assignHousesToType,
  };
}
