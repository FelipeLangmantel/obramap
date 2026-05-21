import { useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { parseHouseNumberFromMesh, stripHousePrefix } from "./parseHouseFromMeshName";

export interface ModelLayer {
  name: string;
  displayName: string;
  visible: boolean;
  opacity: number;
  meshCount: number;
  /** Casa detectada automaticamente pelo nome do mesh (1..N), null = camada agregada. */
  houseNumber: number | null;
  linkedStageId?: string;
  linkedMacroId?: string;
  progress?: number;
}

export interface LayerStageLink {
  id: string;
  project_id: string;
  layer_name: string;
  display_name: string | null;
  stage_id: string | null;
  macro_id: string | null;
  scope_id: string | null;
  /** NULL = vínculo agregado da obra; preenchido = casa específica. */
  house_number: number | null;
}

export function useModelLayers(
  projectId: string | undefined,
  /** Mapa malha→casa vindo de `useMeshHouseAssignments` (atribuição manual). */
  meshAssignmentMap?: Map<string, number>,
) {
  const [layers, setLayers] = useState<ModelLayer[]>([]);
  const [links, setLinks] = useState<LayerStageLink[]>([]);
  const [sceneRef, setSceneRef] = useState<THREE.Object3D | null>(null);
  const [autoMode, setAutoMode] = useState(false);

  const extractLayers = useCallback((scene: THREE.Object3D) => {
    setSceneRef(scene);
    const layerMap = new Map<string, number>();

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const name = child.name || child.parent?.name || `Mesh_${child.id}`;
        layerMap.set(name, (layerMap.get(name) || 0) + 1);
      }
    });

    setLayers(prev => {
      const prevMap = new Map(prev.map(l => [l.name, l]));
      return Array.from(layerMap.entries()).map(([name, count]) => {
        const existing = prevMap.get(name);
        // Atribuição manual TEM PRIORIDADE sobre auto-detect por nome.
        const manualHouse = meshAssignmentMap?.get(name);
        const houseNumber = manualHouse ?? parseHouseNumberFromMesh(name);
        const friendly = houseNumber != null
          ? `Casa ${String(houseNumber).padStart(2, "0")} • ${stripHousePrefix(name)}`
          : name;
        return {
          name,
          displayName: existing?.displayName || friendly,
          visible: existing?.visible ?? true,
          opacity: existing?.opacity ?? 1,
          meshCount: count,
          houseNumber,
          progress: existing?.progress,
        };
      });
    });
  }, [meshAssignmentMap]);

  /**
   * Recalcula o `houseNumber` de todas as camadas quando o mapa de
   * atribuição muda (sem precisar reextrair do GLTF).
   */
  useEffect(() => {
    if (!meshAssignmentMap) return;
    setLayers(prev => prev.map(l => {
      const manualHouse = meshAssignmentMap.get(l.name);
      const newHouse = manualHouse ?? parseHouseNumberFromMesh(l.name);
      if (newHouse === l.houseNumber) return l;
      const friendly = newHouse != null
        ? `Casa ${String(newHouse).padStart(2, "0")} • ${stripHousePrefix(l.name)}`
        : l.name;
      return { ...l, houseNumber: newHouse, displayName: friendly };
    }));
  }, [meshAssignmentMap]);

  const loadLinks = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from("map_layer_stage_links" as any)
      .select("*")
      .eq("project_id", projectId);
    if (!error && data) {
      const parsed = data as unknown as LayerStageLink[];
      setLinks(parsed);
      setLayers(prev => prev.map(l => {
        const link = parsed.find(lk => lk.layer_name === l.name);
        return link?.display_name ? { ...l, displayName: link.display_name } : l;
      }));
    }
  }, [projectId]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  const saveLink = useCallback(async (
    layerName: string,
    stageId: string | null,
    macroId: string | null,
    scopeId?: string | null,
    displayName?: string | null,
    houseNumber?: number | null,
  ) => {
    if (!projectId) return;
    const { error } = await supabase
      .from("map_layer_stage_links" as any)
      .upsert({
        project_id: projectId,
        layer_name: layerName,
        stage_id: stageId,
        macro_id: macroId,
        scope_id: scopeId || null,
        display_name: displayName || null,
        house_number: houseNumber ?? null,
      } as any, { onConflict: "project_id,layer_name" });
    if (!error) await loadLinks();
    return error;
  }, [projectId, loadLinks]);

  const removeLink = useCallback(async (layerName: string) => {
    if (!projectId) return;
    await supabase
      .from("map_layer_stage_links" as any)
      .delete()
      .eq("project_id", projectId)
      .eq("layer_name", layerName);
    await loadLinks();
  }, [projectId, loadLinks]);

  const renameLayer = useCallback(async (layerName: string, newDisplayName: string) => {
    if (!projectId) return;
    await supabase
      .from("map_layer_stage_links" as any)
      .upsert({
        project_id: projectId,
        layer_name: layerName,
        display_name: newDisplayName,
      } as any, { onConflict: "project_id,layer_name" });
    setLayers(prev => prev.map(l =>
      l.name === layerName ? { ...l, displayName: newDisplayName } : l
    ));
    await loadLinks();
  }, [projectId, loadLinks]);

  const toggleLayer = useCallback((layerName: string) => {
    setLayers(prev => prev.map(l =>
      l.name === layerName ? { ...l, visible: !l.visible } : l
    ));
  }, []);

  const setLayerOpacity = useCallback((layerName: string, opacity: number) => {
    setLayers(prev => prev.map(l =>
      l.name === layerName ? { ...l, opacity } : l
    ));
  }, []);

  const showAllLayers = useCallback(() => {
    setLayers(prev => prev.map(l => ({ ...l, visible: true, opacity: 1 })));
  }, []);

  // Aplica visibilidade/opacity ao Three.js
  useEffect(() => {
    if (!sceneRef) return;
    sceneRef.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const name = child.name || child.parent?.name || `Mesh_${child.id}`;
        const layer = layers.find(l => l.name === name);
        if (layer) {
          child.visible = layer.visible;
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat.opacity !== undefined) {
              mat.transparent = layer.opacity < 1;
              mat.opacity = layer.opacity;
              mat.needsUpdate = true;
            }
          }
        }
      }
    });
  }, [layers, sceneRef]);

  /**
   * Atualização AGREGADA (média da obra inteira por macro/scope).
   * Usada apenas para camadas SEM house_number (vínculo geral).
   */
  const updateFromMacroProgress = useCallback((progressMap: Map<string, number>) => {
    if (!autoMode || links.length === 0) return;
    setLayers(prev => prev.map(layer => {
      const link = links.find(l => l.layer_name === layer.name);
      if (!link || link.house_number != null) return layer; // casa-específica é tratada em updateFromHousesProgress
      const key = link.macro_id && link.scope_id
        ? `${link.macro_id}::${link.scope_id}`
        : link.macro_id || "";
      const progress = progressMap.get(key);
      if (progress == null) return { ...layer, visible: true, opacity: 1 };
      if (progress <= 0)   return { ...layer, visible: false, opacity: 0, progress: 0 };
      if (progress >= 100) return { ...layer, visible: true, opacity: 1, progress: 100 };
      return { ...layer, visible: true, opacity: 0.3 + (progress / 100) * 0.7, progress };
    }));
  }, [autoMode, links]);

  /**
   * Atualização POR CASA — mapa de chave `house::macro::scope` (ou `house::macro`)
   * para o progresso REAL daquela casa específica.
   *
   * - Vínculo com house_number: aplica progresso individual da casa.
   * - Vínculo sem house_number: cai no updateFromMacroProgress (média).
   */
  const updateFromHousesProgress = useCallback((perHouseProgress: Map<string, number>) => {
    if (!autoMode || links.length === 0) return;
    setLayers(prev => prev.map(layer => {
      const link = links.find(l => l.layer_name === layer.name);
      if (!link || link.house_number == null) return layer; // agregada é tratada acima
      const macro = link.macro_id || "";
      const key = link.scope_id
        ? `${link.house_number}::${macro}::${link.scope_id}`
        : `${link.house_number}::${macro}`;
      const progress = perHouseProgress.get(key);
      if (progress == null) return { ...layer, visible: true, opacity: 1 };
      if (progress <= 0)   return { ...layer, visible: false, opacity: 0, progress: 0 };
      if (progress >= 100) return { ...layer, visible: true, opacity: 1, progress: 100 };
      return { ...layer, visible: true, opacity: 0.3 + (progress / 100) * 0.7, progress };
    }));
  }, [autoMode, links]);

  return {
    layers,
    links,
    extractLayers,
    toggleLayer,
    setLayerOpacity,
    showAllLayers,
    saveLink,
    removeLink,
    renameLayer,
    loadLinks,
    autoMode,
    setAutoMode,
    updateFromMacroProgress,
    updateFromHousesProgress,
    setSceneRef,
  };
}
