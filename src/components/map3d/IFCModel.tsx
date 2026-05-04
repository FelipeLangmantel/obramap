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
  quotedValues: string[];
  layerNames: string[];
  primaryLayerName: string | null;
  category: "production" | "text" | "unnamed";
  rawLine: string;
}

interface IfcLayerAssignment {
  id: string;
  name: string;
  refs: string[];
  rawLine: string;
}

type IfcInventoryFilter = "all" | "production" | "text" | "unnamed";

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

function isUsefulIfcName(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return !!normalized && normalized.toLowerCase() !== "undefined";
}

function contains3dText(value: string | null | undefined) {
  return (value || "").toLowerCase().includes("3dtext");
}

function classifyIfcElement(name: string, primaryLayerName: string | null): IfcInventoryItem["category"] {
  if (contains3dText(name) || contains3dText(primaryLayerName)) return "text";
  if (isUsefulIfcName(name) || isUsefulIfcName(primaryLayerName)) return "production";
  return "unnamed";
}

function extractRefs(line: string) {
  return Array.from(new Set(line.match(/#\d+/g) || []));
}

function parseIfcLineMap(text: string) {
  const lineById = new Map<string, string>();
  const linePattern = /(#\d+)\s*=\s*[^;]+;/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(text)) !== null) {
    lineById.set(match[1], match[0]);
  }

  return lineById;
}

function parseLayerAssignments(text: string): IfcLayerAssignment[] {
  const layerPattern = /(#\d+)\s*=\s*IFCPRESENTATIONLAYERASSIGNMENT\s*\(\s*'([^']*)'\s*,\s*[^,]*,\s*\(([^)]*)\)[^;]*;/gi;
  const layers: IfcLayerAssignment[] = [];
  let match: RegExpExecArray | null;

  while ((match = layerPattern.exec(text)) !== null) {
    const [, id, name, refsText] = match;
    layers.push({
      id,
      name,
      refs: extractRefs(refsText),
      rawLine: summarizeLine(match[0]),
    });
  }

  return layers;
}

function buildRefToLayerNames(layers: IfcLayerAssignment[]) {
  const refToLayerNames = new Map<string, string[]>();

  for (const layer of layers) {
    for (const ref of layer.refs) {
      const existing = refToLayerNames.get(ref) || [];
      if (!existing.includes(layer.name)) existing.push(layer.name);
      refToLayerNames.set(ref, existing);
    }
  }

  return refToLayerNames;
}

function findLayerNamesForElement(rawLine: string, refToLayerNames: Map<string, string[]>, lineById: Map<string, string>) {
  const found = new Set<string>();
  const directRefs = extractRefs(rawLine);

  for (const ref of directRefs) {
    (refToLayerNames.get(ref) || []).forEach(name => found.add(name));
  }

  if (found.size > 0) return Array.from(found);

  for (const ref of directRefs) {
    const linkedLine = lineById.get(ref);
    if (!linkedLine) continue;

    for (const nestedRef of extractRefs(linkedLine)) {
      (refToLayerNames.get(nestedRef) || []).forEach(name => found.add(name));
    }
  }

  return Array.from(found);
}

function parseIfcText(text: string): IfcInventoryItem[] {
  const lineById = parseIfcLineMap(text);
  const layerAssignments = parseLayerAssignments(text);
  const refToLayerNames = buildRefToLayerNames(layerAssignments);
  const entityPattern = new RegExp(
    `(#\\d+)\\s*=\\s*(${IFC_ENTITY_TYPES.join("|")})\\s*\\(([^;]*)\\);`,
    "gi"
  );
  const items: IfcInventoryItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = entityPattern.exec(text)) !== null) {
    const [, id, type, args] = match;
    const quoted = Array.from(args.matchAll(/'([^']*)'/g)).map(item => item[1]);
    const name = quoted[1] || "";
    const rawLine = match[0];
    const layerNames = findLayerNamesForElement(rawLine, refToLayerNames, lineById);
    const primaryLayerName = layerNames[0] || null;

    items.push({
      id,
      type: type.toUpperCase(),
      globalId: quoted[0] || "",
      name,
      quotedValues: quoted,
      layerNames,
      primaryLayerName,
      category: classifyIfcElement(name, primaryLayerName),
      rawLine: summarizeLine(rawLine),
    });
  }

  return items;
}

export function IFCModel({ url, onLoaded, onSceneReady, onMeshClick, selectedMeshKey }: Props) {
  const [items, setItems] = useState<IfcInventoryItem[]>([]);
  const [filter, setFilter] = useState<IfcInventoryFilter>("production");
  const [expandedRawLines, setExpandedRawLines] = useState<Set<string>>(new Set());
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
    setExpandedRawLines(new Set());
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

  const inventoryCounts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalElements += 1;
        if (item.category === "production") acc.productionElements += 1;
        if (item.category === "text") acc.textElements += 1;
        if (item.category === "unnamed") acc.unnamedElements += 1;
        return acc;
      },
      { totalElements: 0, productionElements: 0, textElements: 0, unnamedElements: 0 }
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter(item => item.category === filter);
  }, [filter, items]);

  const toggleRawLine = (id: string) => {
    setExpandedRawLines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyRawLine = async (rawLine: string) => {
    await navigator.clipboard.writeText(rawLine);
  };

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
                <InventoryMetric label="Elementos detectados" value={inventoryCounts.totalElements} />
                <InventoryMetric label="Produtivos" value={inventoryCounts.productionElements} />
                <InventoryMetric label="Textos/anotações" value={inventoryCounts.textElements} />
                <InventoryMetric label="Sem nome" value={inventoryCounts.unnamedElements} />
                <InventoryMetric label="Tipos detectados" value={Object.keys(countsByType).length} />
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

                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ["all", "Todos"],
                      ["production", "Produtivos"],
                      ["text", "Textos/anotações"],
                      ["unnamed", "Sem nome"],
                    ] as Array<[IfcInventoryFilter, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          filter === value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
                    {filteredItems.slice(0, 50).map(item => (
                      <div key={item.id} className="border-b border-border px-3 py-2 last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{item.type}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{item.id}</span>
                        </div>
                        {item.category === "text" && (
                          <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            Texto / anotação — não vincular
                          </span>
                        )}
                        {item.category === "unnamed" && (
                          <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                            Sem nome — revisar exportação
                          </span>
                        )}
                        <p className="mt-1 truncate text-[11px]">
                          <span className="text-muted-foreground">GlobalId: </span>
                          {item.globalId || "—"}
                        </p>
                        <p className="truncate text-[11px]">
                          <span className="text-muted-foreground">Nome IFC: </span>
                          {item.name || "—"}
                        </p>
                        <p className="truncate text-[11px]">
                          <span className="text-muted-foreground">Camada IFC principal: </span>
                          {item.primaryLayerName || "—"}
                        </p>
                        <p className="text-[11px]">
                          <span className="text-muted-foreground">Todas as camadas encontradas: </span>
                          {item.layerNames.length > 0 ? item.layerNames.join(", ") : "—"}
                        </p>
                        <div className="mt-1 text-[11px]">
                          <span className="text-muted-foreground">Valores textuais encontrados: </span>
                          {item.quotedValues.length > 0 ? (
                            <span className="break-words">
                              {item.quotedValues.map((value, index) => (
                                <span key={`${item.id}-quoted-${index}`} className="mr-1">
                                  {index + 1}. {value || "—"}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                        {item.category === "unnamed" && (
                          <div className="mt-2 space-y-1">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleRawLine(item.id)}
                                className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted"
                              >
                                Ver linha bruta
                              </button>
                              <button
                                type="button"
                                onClick={() => void copyRawLine(item.rawLine)}
                                className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted"
                              >
                                Copiar linha IFC
                              </button>
                            </div>
                            {expandedRawLines.has(item.id) && (
                              <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[10px] leading-relaxed">
                                {item.rawLine}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {filteredItems.length === 0 && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Nenhum elemento nesta categoria.
                      </div>
                    )}
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

function InventoryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
