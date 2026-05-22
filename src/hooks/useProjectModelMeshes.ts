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

export const GLB_CONTEXT_MESH_MARKER = "__obramap_context__";

export function isContextProjectModelMesh(
  mesh: Pick<ProjectModelMesh, "service_macro_id" | "service_scope_id"> | null | undefined,
) {
  return mesh?.service_macro_id === GLB_CONTEXT_MESH_MARKER
    && mesh?.service_scope_id === GLB_CONTEXT_MESH_MARKER;
}

export function isCompleteProductionLink(
  mesh: Pick<ProjectModelMesh, "assigned_house_number" | "service_macro_id" | "service_scope_id" | "ignored"> | null | undefined,
) {
  return !!mesh
    && mesh.assigned_house_number != null
    && mesh.service_macro_id != null
    && mesh.service_scope_id != null
    && !mesh.ignored
    && !isContextProjectModelMesh(mesh);
}

const WATCHED_GLB_MESH_KEYS = ["Geom3D_300", "Geom3D_302", "Geom3D_303"];
const PROJECT_MODEL_MESHES_PAGE_SIZE = 1000;

function isWatchedGlbMeshKey(layerKey: string | null | undefined) {
  return !!layerKey && WATCHED_GLB_MESH_KEYS.some((key) => layerKey.includes(key));
}

interface UseProjectModelMeshesOptions {
  canWrite?: boolean;
}

function assertCanWriteProjectModelMeshes(canWrite: boolean) {
  if (!canWrite) {
    throw new Error("Sem permissao para alterar vinculos ou inventario do modelo 3D.");
  }
}

export function useProjectModelMeshes(
  projectId: string | undefined,
  options: UseProjectModelMeshesOptions = {},
) {
  const canWrite = options.canWrite === true;
  const [meshes, setMeshes] = useState<ProjectModelMesh[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const debugLayerKeyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const allRows: ProjectModelMesh[] = [];
    let page = 0;
    let pagesLoaded = 0;
    while (true) {
      const from = page * PROJECT_MODEL_MESHES_PAGE_SIZE;
      const to = from + PROJECT_MODEL_MESHES_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("project_model_meshes" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("layer_key", { ascending: true })
        .range(from, to);

      if (error) {
        setLoading(false);
        console.error("[useProjectModelMeshes] load error", error);
        return;
      }

      const rows = (data || []) as unknown as ProjectModelMesh[];
      allRows.push(...rows);
      pagesLoaded++;
      if (rows.length < PROJECT_MODEL_MESHES_PAGE_SIZE) break;
      page++;
    }
    setLoading(false);
    setMeshes(allRows);
    loadedFor.current = projectId;
    console.log("[GLB MeshMap Refresh]", {
      projectId,
      totalLoaded: allRows.length,
      pagesLoaded,
      hasGeom300: allRows.some((mesh) => mesh.layer_key === "glb:Geom3D_300:0"),
      hasGeom302: allRows.some((mesh) => mesh.layer_key === "glb:Geom3D_302:0"),
      hasGeom303: allRows.some((mesh) => mesh.layer_key === "glb:Geom3D_303:0"),
    });
    if (import.meta.env.DEV) {
      const watchedMeshes = allRows
        .filter((mesh) => isWatchedGlbMeshKey(mesh.layer_key))
        .map((mesh) => ({
          layer_key: mesh.layer_key,
          mesh_name: mesh.mesh_name,
          assigned_house_number: mesh.assigned_house_number,
          service_macro_id: mesh.service_macro_id,
          service_scope_id: mesh.service_scope_id,
          production_visible: mesh.production_visible,
          progress_percent: mesh.progress_percent,
        }));
      console.log("[GLB Mesh Link Check] refresh watched meshes", {
        projectId,
        count: allRows.length,
        watchedMeshes,
      });
    }
    if (import.meta.env.DEV && debugLayerKeyRef.current) {
      const debugLayerKey = debugLayerKeyRef.current;
      const debugMesh = allRows.find(
        (mesh) => mesh.layer_key === debugLayerKey,
      ) ?? null;
      console.log("[GLB Mesh Link] refresh loaded", {
        projectId,
        count: allRows.length,
        layerKey: debugLayerKey,
        mesh: debugMesh,
      });
    }
    return allRows;
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
      assertCanWriteProjectModelMeshes(canWrite);
      if (!projectId) {
        throw new Error("projectId ausente ao salvar vinculo da mesh.");
      }
      debugLayerKeyRef.current = data.layer_key;
      const payload: any = { ...data, project_id: projectId };
      if (import.meta.env.DEV) {
        const logPayload = {
          projectId,
          layerKey: data.layer_key,
          payload,
        };
        console.log("[GLB Mesh Link] upsert payload", logPayload);
        if (isWatchedGlbMeshKey(data.layer_key)) {
          console.log("[GLB Mesh Link Check] upsert payload", logPayload);
        }
      }
      const { data: saved, error } = await supabase
        .from("project_model_meshes" as any)
        .upsert(payload, { onConflict: "project_id,layer_key" })
        .select("*")
        .single();
      if (error) {
        console.error("[useProjectModelMeshes] upsert error", error);
        if (import.meta.env.DEV) {
          console.log("[GLB Mesh Link] upsert error", {
            projectId,
            layerKey: data.layer_key,
            error,
          });
        }
        throw error;
      }
      const savedMesh = saved as unknown as ProjectModelMesh;
      const { data: verified, error: verifyError } = await supabase
        .from("project_model_meshes" as any)
        .select("*")
        .eq("project_id", projectId)
        .eq("layer_key", data.layer_key)
        .maybeSingle();
      if (verifyError) {
        console.error("[useProjectModelMeshes] verify error", verifyError);
        if (import.meta.env.DEV) {
          console.log("[GLB Mesh Link] verify error", {
            projectId,
            layerKey: data.layer_key,
            error: verifyError,
          });
        }
        throw verifyError;
      }
      if (!verified) {
        const verifyMissingError = new Error("Mesh salva nao ficou visivel no refresh por project_id/layer_key.");
        if (import.meta.env.DEV) {
          console.log("[GLB Mesh Link] verify missing", {
            projectId,
            layerKey: data.layer_key,
            saved: savedMesh,
          });
        }
        throw verifyMissingError;
      }
      const verifiedMesh = verified as unknown as ProjectModelMesh;
      if (import.meta.env.DEV) {
        const logPayload = {
          projectId,
          layerKey: data.layer_key,
          saved: savedMesh,
          verified: verifiedMesh,
        };
        console.log("[GLB Mesh Link] upsert saved", logPayload);
        if (isWatchedGlbMeshKey(data.layer_key)) {
          console.log("[GLB Mesh Link Check] upsert saved", logPayload);
        }
      }
      setMeshes((prev) => {
        const idx = prev.findIndex((mesh) => mesh.layer_key === verifiedMesh.layer_key);
        if (idx === -1) return [...prev, verifiedMesh];
        const next = [...prev];
        next[idx] = verifiedMesh;
        return next;
      });
      const refreshed = await refresh();
      if (import.meta.env.DEV) {
        const refreshedMesh = refreshed?.find((mesh) => mesh.layer_key === data.layer_key) ?? null;
        const logPayload = {
          projectId,
          layerKey: data.layer_key,
          refreshedMesh,
        };
        console.log("[GLB Mesh Link] refresh after upsert", logPayload);
        if (isWatchedGlbMeshKey(data.layer_key)) {
          console.log("[GLB Mesh Link Check] refresh after upsert", logPayload);
        }
      }
      return verifiedMesh;
    },
    [canWrite, projectId, refresh],
  );

  /**
   * Inventário em lote: insere meshes novas e ATUALIZA somente
   * mesh_name / material_name / detected_house_number nas existentes —
   * nunca sobrescreve assigned_house_number, ignored, visible etc.
   */
  const bulkUpsertMeshes = useCallback(
    async (incoming: BulkMeshInput[]) => {
      if (!projectId || incoming.length === 0) return;
      if (!canWrite) {
        if (import.meta.env.DEV) {
          console.warn("[useProjectModelMeshes] bulk inventory skipped without write permission", { projectId });
        }
        return;
      }

      const existing = new Map<string, ProjectModelMesh>();
      // usa o estado mais recente sincronicamente refazendo o fetch
      const { data, error: existingError } = await supabase
        .from("project_model_meshes" as any)
        .select("id, layer_key")
        .eq("project_id", projectId);
      if (existingError) {
        console.error("[useProjectModelMeshes] bulk existing fetch error", existingError);
        return;
      }
      ((data || []) as any[]).forEach((r) => existing.set(r.layer_key, r));

      const toInsert: any[] = [];
      const toUpdate: { id: string; layer_key: string; mesh_name: string; material_name: string; detected_house_number: number | null }[] = [];

      for (const m of incoming) {
        const ex = existing.get(m.layer_key);
        if (ex) {
          toUpdate.push({
            id: (ex as any).id,
            layer_key: m.layer_key,
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

      if (import.meta.env.DEV) {
        const watchedIncoming = incoming.filter((mesh) => isWatchedGlbMeshKey(mesh.layer_key));
        const watchedExisting = Array.from(existing.values())
          .filter((mesh) => isWatchedGlbMeshKey(mesh.layer_key))
          .map((mesh) => ({
            id: mesh.id,
            layer_key: mesh.layer_key,
          }));
        console.log("[GLB Mesh Link] bulk inventory plan", {
          projectId,
          incoming: incoming.length,
          existing: existing.size,
          toInsert: toInsert.length,
          toUpdate: toUpdate.length,
          sample: incoming.slice(0, 3),
        });
        console.log("[GLB Mesh Link Check] bulk inventory watched", {
          projectId,
          watchedIncoming,
          watchedExisting,
          watchedToInsert: toInsert.filter((mesh) => isWatchedGlbMeshKey(mesh.layer_key)),
          watchedToUpdate: toUpdate.filter((mesh) => isWatchedGlbMeshKey(mesh.layer_key)),
        });
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("project_model_meshes" as any)
          .upsert(toInsert, { onConflict: "project_id,layer_key" });
        if (error) console.error("[useProjectModelMeshes] bulk insert error", error);
      }
      // Updates em lote — paralelos
      if (toUpdate.length > 0) {
        const results = await Promise.all(
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
        const updateErrors = results
          .map((result) => result.error)
          .filter(Boolean);
        if (updateErrors.length > 0) {
          console.error("[useProjectModelMeshes] bulk update errors", updateErrors);
        }
      }
      await refresh();
    },
    [canWrite, projectId, refresh],
  );

  const countGlbMeshes = useCallback(async () => {
    if (!projectId) return 0;
    const { count, error } = await supabase
      .from("project_model_meshes" as any)
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .like("layer_key", "glb:%");
    if (error) {
      console.error("[useProjectModelMeshes] count GLB meshes error", error);
      throw error;
    }
    return count ?? 0;
  }, [projectId]);

  const clearGlbMeshes = useCallback(async () => {
    if (!projectId) return 0;
    assertCanWriteProjectModelMeshes(canWrite);
    const beforeCount = await countGlbMeshes();
    const { count, error } = await supabase
      .from("project_model_meshes" as any)
      .delete({ count: "exact" })
      .eq("project_id", projectId)
      .like("layer_key", "glb:%");
    if (error) {
      console.error("[useProjectModelMeshes] clear GLB meshes error", error);
      throw error;
    }
    const deletedCount = count ?? beforeCount;
    console.log("[GLB Import Safety] cleared old GLB mesh records", {
      projectId,
      beforeCount,
      deletedCount,
    });
    await refresh();
    return deletedCount;
  }, [canWrite, countGlbMeshes, projectId, refresh]);

  const setIgnored = useCallback(async (layerKey: string, ignored: boolean) => {
    if (!projectId) return;
    assertCanWriteProjectModelMeshes(canWrite);
    await supabase
      .from("project_model_meshes" as any)
      .update(ignored ? { ignored: true, visible: false } : { ignored: false })
      .eq("project_id", projectId)
      .eq("layer_key", layerKey);
    await refresh();
  }, [canWrite, projectId, refresh]);

  const setVisible = useCallback(async (layerKey: string, visible: boolean) => {
    if (!projectId) return;
    assertCanWriteProjectModelMeshes(canWrite);
    await supabase
      .from("project_model_meshes" as any)
      .update({ visible })
      .eq("project_id", projectId)
      .eq("layer_key", layerKey);
    await refresh();
  }, [canWrite, projectId, refresh]);

  return { meshes, meshMap, loading, refresh, upsertMesh, bulkUpsertMeshes, countGlbMeshes, clearGlbMeshes, setIgnored, setVisible };
}
