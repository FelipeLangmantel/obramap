import { useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";

export interface ModelLayer {
  name: string;
  visible: boolean;
  opacity: number;
  meshCount: number;
  linkedStageId?: string;
  linkedMacroId?: string;
  progress?: number; // 0-100 from production
}

export interface LayerStageLink {
  id: string;
  project_id: string;
  layer_name: string;
  stage_id: string | null;
  macro_id: string | null;
  scope_id: string | null;
}

export function useModelLayers(projectId: string | undefined) {
  const [layers, setLayers] = useState<ModelLayer[]>([]);
  const [links, setLinks] = useState<LayerStageLink[]>([]);
  const [sceneRef, setSceneRef] = useState<THREE.Object3D | null>(null);
  const [autoMode, setAutoMode] = useState(false); // "Visão Atual" vs "Visão Completa"

  // Extract layers from a loaded Three.js scene
  const extractLayers = useCallback((scene: THREE.Object3D) => {
    setSceneRef(scene);
    const layerMap = new Map<string, number>();

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const name = child.name || child.parent?.name || `Mesh_${child.id}`;
        layerMap.set(name, (layerMap.get(name) || 0) + 1);
      }
    });

    const extracted: ModelLayer[] = Array.from(layerMap.entries()).map(([name, count]) => ({
      name,
      visible: true,
      opacity: 1,
      meshCount: count,
    }));

    setLayers(extracted);
    return extracted;
  }, []);

  // Load saved links from DB
  const loadLinks = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from("map_layer_stage_links" as any)
      .select("*")
      .eq("project_id", projectId);
    if (!error && data) {
      setLinks(data as unknown as LayerStageLink[]);
    }
  }, [projectId]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  // Save a link
  const saveLink = useCallback(async (layerName: string, stageId: string | null, macroId: string | null) => {
    if (!projectId) return;
    const { error } = await supabase
      .from("map_layer_stage_links" as any)
      .upsert({
        project_id: projectId,
        layer_name: layerName,
        stage_id: stageId,
        macro_id: macroId,
      } as any, { onConflict: "project_id,layer_name" });
    if (!error) {
      await loadLinks();
    }
    return error;
  }, [projectId, loadLinks]);

  // Remove a link
  const removeLink = useCallback(async (layerName: string) => {
    if (!projectId) return;
    await supabase
      .from("map_layer_stage_links" as any)
      .delete()
      .eq("project_id", projectId)
      .eq("layer_name", layerName);
    await loadLinks();
  }, [projectId, loadLinks]);

  // Toggle layer visibility
  const toggleLayer = useCallback((layerName: string) => {
    setLayers(prev => prev.map(l => 
      l.name === layerName ? { ...l, visible: !l.visible } : l
    ));
  }, []);

  // Set layer opacity
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

  // Update layers based on production progress
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
      // In progress: semi-transparent
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
    loadLinks,
    autoMode,
    setAutoMode,
    updateFromProduction,
    setSceneRef,
  };
}
