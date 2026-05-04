import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { Html } from "@react-three/drei";

/**
 * Loads an IFC model into the Three.js scene.
 * IFC preserves named groups (IfcBuildingElementProxy, IfcWall, etc.),
 * which allows linking each casa/component reliably.
 *
 * The web-ifc WASM lives at /wasm/ (copied from node_modules at build time).
 */
interface Props {
  url: string;
  onLoaded: () => void;
  onSceneReady?: (scene: THREE.Object3D) => void;
  onMeshClick?: (mesh: THREE.Object3D) => void;
  selectedMeshKey?: string | null;
}

function useSelectionHighlight(scene: THREE.Object3D | null, selectedKey: string | null) {
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m: any) => {
        if (!m || m.emissive === undefined) return;
        if (mesh.uuid === selectedKey) {
          m.emissive.set(0xffffff);
          m.emissiveIntensity = 0.25;
        } else {
          m.emissive.set(0x000000);
          m.emissiveIntensity = 0;
        }
        m.needsUpdate = true;
      });
    });
  }, [scene, selectedKey]);
}

export function IFCModel({ url, onLoaded, onSceneReady, onMeshClick, selectedMeshKey }: Props) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calledRef = useRef(false);

  useSelectionHighlight(object, selectedMeshKey ?? null);

  useEffect(() => {
    let cancelled = false;
    const loader = new IFCLoader();
    // Aponta para o WASM servido em /public/wasm/
    loader.ifcManager.setWasmPath("/wasm/");

    loader.load(
      url,
      (model) => {
        if (cancelled) return;
        // Garante nomes legíveis em cada grupo/mesh para uso no LinkLayersDialog
        model.traverse((child) => {
          if (!child.name && child.type) child.name = child.type;
        });
        setObject(model);
      },
      undefined,
      (err) => {
        console.error("[IFCModel] load error", err);
        if (!cancelled) setError("Falha ao carregar IFC");
      }
    );

    return () => {
      cancelled = true;
      try {
        loader.ifcManager.dispose();
      } catch {
        /* noop */
      }
    };
  }, [url]);

  useEffect(() => {
    if (object && !calledRef.current) {
      calledRef.current = true;
      onSceneReady?.(object);
      requestAnimationFrame(() => requestAnimationFrame(() => onLoaded()));
    }
  }, [object, onLoaded, onSceneReady]);

  if (error) {
    return (
      <Html center>
        <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-lg">{error}</div>
      </Html>
    );
  }
  if (!object) return null;

  return (
    <primitive
      object={object}
      onClick={(e: any) => {
        if (!onMeshClick) return;
        e.stopPropagation();
        if (e.object) onMeshClick(e.object);
      }}
    />
  );
}
