import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MeshHouseAssignment {
  id: string;
  project_id: string;
  mesh_name: string;
  house_number: number;
}

/**
 * Carrega e gerencia as atribuições "malha do 3D → casa".
 *
 * Use o `assignmentMap` (Map<mesh_name, house_number>) como fonte da
 * verdade no front: ele tem prioridade sobre a casa detectada pelo nome
 * do mesh. Persistência em `map_mesh_house_assignments`.
 */
export function useMeshHouseAssignments(projectId: string | undefined) {
  const [assignments, setAssignments] = useState<MeshHouseAssignment[]>([]);
  const [assignmentMap, setAssignmentMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setAssignments([]);
      setAssignmentMap(new Map());
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("map_mesh_house_assignments" as any)
      .select("*")
      .eq("project_id", projectId);
    if (!error && data) {
      const list = data as unknown as MeshHouseAssignment[];
      setAssignments(list);
      setAssignmentMap(new Map(list.map(a => [a.mesh_name, a.house_number])));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Atribui uma lista de meshes (ex.: o mesh clicado + filhos do grupo pai)
   * a uma casa específica. Faz upsert em lote.
   */
  const assignMeshes = useCallback(async (meshNames: string[], houseNumber: number) => {
    if (!projectId || meshNames.length === 0) return { error: null as any };
    const rows = meshNames.map(n => ({
      project_id: projectId,
      mesh_name: n,
      house_number: houseNumber,
    }));
    const { error } = await supabase
      .from("map_mesh_house_assignments" as any)
      .upsert(rows as any, { onConflict: "project_id,mesh_name" });
    if (!error) await refresh();
    return { error };
  }, [projectId, refresh]);

  /** Remove a atribuição de uma malha (volta a usar auto-detect pelo nome). */
  const clearMesh = useCallback(async (meshName: string) => {
    if (!projectId) return;
    await supabase
      .from("map_mesh_house_assignments" as any)
      .delete()
      .eq("project_id", projectId)
      .eq("mesh_name", meshName);
    await refresh();
  }, [projectId, refresh]);

  /** Remove todas as atribuições de uma casa. */
  const clearHouse = useCallback(async (houseNumber: number) => {
    if (!projectId) return;
    await supabase
      .from("map_mesh_house_assignments" as any)
      .delete()
      .eq("project_id", projectId)
      .eq("house_number", houseNumber);
    await refresh();
  }, [projectId, refresh]);

  return {
    assignments,
    assignmentMap,
    loading,
    refresh,
    assignMeshes,
    clearMesh,
    clearHouse,
  };
}
