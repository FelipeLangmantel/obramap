import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectModelMesh {
  id: string;
  project_id: string;
  layer_key: string;
  mesh_name: string | null;
  material_name: string | null;
  detected_house_number: number | null;
  assigned_house_number: number | null;
  service_macro_id: string | null;
  service_scope_id: string | null;
  visible: boolean;
  ignored: boolean;
  production_visible: boolean;
  progress_percent: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkMeshInput {
  layer_key: string;
  mesh_name: string;
  material_name: string;
  detected_house_number: number | null;
}

export function useProjectModelMeshes(projectId: string | undefined) {
  const [meshes, setMeshes] = useState<ProjectModelMesh[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("project_model_meshes" as any)
      .select("*")
      .eq("project_id", projectId);
    setLoading(false);
    if (error) {
      console.error("[useProjectModelMeshes] load error", error);
      return;
    }
    setMeshes((data || []) as unknown as ProjectModelMesh[]);
    loadedFor.current = projectId;
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (loadedFor.current === projectId) return;
    void refresh();
  }, [projectId, refresh]);

  // Realtime so multiple viewers stay in sync
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`pmm-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_model_meshes", filter: `project_id=eq.${projectId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  const meshMap = useMemo(() => {
    const m = new Map<string, ProjectModelMesh>();
    meshes.forEach(x => m.set(x.layer_key, x));
    return m;
  }, [meshes]);

  /** Upsert único — preserva campos editáveis caso o registro já exista. */
  const upsertMesh = useCallback(
    async (data: Partial<ProjectModelMesh> & { layer_key: string }) => {
      if (!projectId) return;
      const payload: any = { ...data, project_id: projectId };
      const { error } = await supabase
        .from("project_model_meshes" as any)
        .upsert(payload, { onConflict: "project_id,layer_key" });
      if (error) {
        console.error("[useProjectModelMeshes] upsert error", error);
        throw error;
      }
      await refresh();
    },
    [projectId, refresh],
  );

  /**
   * Inventário em lote: insere meshes novas e ATUALIZA somente
   * mesh_name / material_name / detected_house_number nas existentes —
   * nunca sobrescreve assigned_house_number, ignored, visible etc.
   */
  const bulkUpsertMeshes = useCallback(
    async (incoming: BulkMeshInput[]) => {
      if (!projectId || incoming.length === 0) return;

      const existing = new Map<string, ProjectModelMesh>();
      // usa o estado mais recente sincronicamente refazendo o fetch
      const { data } = await supabase
        .from("project_model_meshes" as any)
        .select("id, layer_key")
        .eq("project_id", projectId);
      ((data || []) as any[]).forEach((r) => existing.set(r.layer_key, r));

      const toInsert: any[] = [];
      const toUpdate: { id: string; mesh_name: string; material_name: string; detected_house_number: number | null }[] = [];

      for (const m of incoming) {
        const ex = existing.get(m.layer_key);
        if (ex) {
          toUpdate.push({
            id: (ex as any).id,
            mesh_name: m.mesh_name,
            material_name: m.material_name,
            detected_house_number: m.detected_house_number,
          });
        } else {
          toInsert.push({
            project_id: projectId,
            layer_key: m.layer_key,
            mesh_name: m.mesh_name,
            material_name: m.material_name,
            detected_house_number: m.detected_house_number,
          });
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("project_model_meshes" as any).insert(toInsert);
        if (error) console.error("[useProjectModelMeshes] bulk insert error", error);
      }
      // Updates em lote — paralelos
      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map((u) =>
            supabase
              .from("project_model_meshes" as any)
              .update({
                mesh_name: u.mesh_name,
                material_name: u.material_name,
                detected_house_number: u.detected_house_number,
              })
              .eq("id", u.id),
          ),
        );
      }
      await refresh();
    },
    [projectId, refresh],
  );

  const setIgnored = useCallback(async (layerKey: string, ignored: boolean) => {
    if (!projectId) return;
    await supabase
      .from("project_model_meshes" as any)
      .update(ignored ? { ignored: true, visible: false } : { ignored: false })
      .eq("project_id", projectId)
      .eq("layer_key", layerKey);
    await refresh();
  }, [projectId, refresh]);

  const setVisible = useCallback(async (layerKey: string, visible: boolean) => {
    if (!projectId) return;
    await supabase
      .from("project_model_meshes" as any)
      .update({ visible })
      .eq("project_id", projectId)
      .eq("layer_key", layerKey);
    await refresh();
  }, [projectId, refresh]);

  return { meshes, meshMap, loading, refresh, upsertMesh, bulkUpsertMeshes, setIgnored, setVisible };
}
