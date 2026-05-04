import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  url: string;
  onLoaded: () => void;
  onSceneReady?: (scene: THREE.Object3D) => void;
  onMeshClick?: (mesh: THREE.Object3D) => void;
  selectedMeshKey?: string | null;
}

interface IfcInventoryItem {
  id: string;
  type: string;
  globalId: string;
  name: string;
  rawLine: string;
}

const IFC_ENTITY_TYPES = [
  "IFCBUILDINGELEMENTPROXY",
  "IFCWALL",
  "IFCSLAB",
  "IFCROOF",
  "IFCDOOR",
  "IFCWINDOW",
];

function summarizeLine(line: string) {
  const compact = line.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function parseIfcText(text: string): IfcInventoryItem[] {
  const entityPattern = new RegExp(
    `(#\\d+)\\s*=\\s*(${IFC_ENTITY_TYPES.join("|")})\\s*\\(([^;]*)\\);`,
    "gi"
  );
  const items: IfcInventoryItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = entityPattern.exec(text)) !== null) {
    const [, id, type, args] = match;
    const quoted = Array.from(args.matchAll(/'([^']*)'/g)).map(item => item[1]);

    items.push({
      id,
      type: type.toUpperCase(),
      globalId: quoted[0] || "",
      name: quoted[1] || "",
      rawLine: summarizeLine(match[0]),
    });
  }

  return items;
}

export function IFCModel({ url, onLoaded, onSceneReady, onMeshClick, selectedMeshKey }: Props) {
  const [items, setItems] = useState<IfcInventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const calledRef = useRef(false);

  void onSceneReady;
  void onMeshClick;
  void selectedMeshKey;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setItems([]);
    calledRef.current = false;

    const loadIfcText = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        if (cancelled) return;
        setItems(parseIfcText(text));
        setLoaded(true);
      } catch (err: any) {
        if (cancelled) return;
        setError(`Falha ao ler IFC: ${err?.message || "erro desconhecido"}`);
        setLoaded(true);
      }
    };

    void loadIfcText();

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!loaded || calledRef.current) return;
    calledRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => onLoaded()));
  }, [loaded, onLoaded]);

  const countsByType = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  return (
    <Html center>
      <div className="w-[420px] max-w-[90vw] max-h-[70vh] overflow-hidden rounded-lg border border-border bg-background/95 shadow-2xl">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-base font-semibold">Inventário IFC</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Renderização IFC 3D será ativada em etapa futura. Nesta etapa o arquivo foi lido para validar entidades e nomes.
          </p>
        </div>

        <div className="space-y-3 p-4">
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Elementos detectados</p>
                  <p className="text-xl font-bold">{items.length}</p>
                </div>
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Tipos detectados</p>
                  <p className="text-xl font-bold">{Object.keys(countsByType).length}</p>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Nenhuma entidade IFC compatível detectada.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(countsByType).map(([type, count]) => (
                      <span key={type} className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                        {type}: {count}
                      </span>
                    ))}
                  </div>

                  <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
                    {items.slice(0, 50).map(item => (
                      <div key={item.id} className="border-b border-border px-3 py-2 last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{item.type}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{item.id}</span>
                        </div>
                        <p className="mt-1 truncate text-[11px]">
                          <span className="text-muted-foreground">GlobalId: </span>
                          {item.globalId || "—"}
                        </p>
                        <p className="truncate text-[11px]">
                          <span className="text-muted-foreground">Nome: </span>
                          {item.name || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Html>
  );
}
