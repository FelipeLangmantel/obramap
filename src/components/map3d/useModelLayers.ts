import { useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";

export interface ModelLayer {
  name: string;
  displayName: string;
  visible: boolean;
  opacity: number;
  meshCount: number;
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
}

export function useModelLayers(projectId: string | undefined) {
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

    // Preserve existing display names from previously loaded links
    setLayers(prev => {
      const prevMap = new Map(prev.map(l => [l.name, l]));
      return Array.from(layerMap.entries()).map(([name, count]) => {
        const existing = prevMap.get(name);
        return {
          name,
          displayName: existing?.displayName || name,
          visible: existing?.visible ?? true,
          opacity: existing?.opacity ?? 1,
          meshCount: count,
          progress: existing?.progress,
        };
      });
    });
  }, []);

  const loadLinks = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from("map_layer_stage_links" as any)
      .select("*")
      .eq("project_id", projectId);
    if (!error && data) {
      const parsed = data as unknown as LayerStageLink[];
      setLinks(parsed);
      // Apply display names from saved links
      setLayers(prev => prev.map(l => {
        const link = parsed.find(lk => lk.layer_name === l.name);
        return link?.display_name ? { ...l, displayName: link.display_name } : l;
      }));
    }
  }, [projectId]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  const saveLink = useCallback(async (layerName: string, stageId: string | null, macroId: string | null, scopeId?: string | null, displayName?: string | null) => {
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
      } as any, { onConflict: "project_id,layer_name" });
    if (!error) {
      await loadLinks();
    }
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
    // Upsert the display name
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

  // Apply visibility to Three.js scene
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

  const updateFromProduction = useCallback(async (stages: Array<{ id: string; name: string; progress: number }>) => {
    if (!autoMode || links.length === 0) return;
    setLayers(prev => prev.map(layer => {
      const link = links.find(l => l.layer_name === layer.name);
      if (!link || !link.stage_id) return { ...layer, visible: true, opacity: 1 };
      const stage = stages.find(s => s.id === link.stage_id);
      if (!stage) return { ...layer, visible: true, opacity: 1 };
      const progress = stage.progress;
      if (progress === 0) return { ...layer, visible: false, opacity: 0, progress: 0 };
      if (progress >= 100) return { ...layer, visible: true, opacity: 1, progress: 100 };
      const opacity = 0.3 + (progress / 100) * 0.7;
      return { ...layer, visible: true, opacity, progress };
    }));
  }, [autoMode, links]);

  return {
    layers,
    links,
    extractLayers,
    toggleLayer,
    setLayerOpacity,
    saveLink,
    removeLink,
    renameLayer,
    loadLinks,
    autoMode,
    setAutoMode,
    updateFromProduction,
    setSceneRef,
  };
}
