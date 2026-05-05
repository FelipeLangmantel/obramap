import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  url: string;
  projectId?: string | null;
  companyId?: string | null;
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
  reachableRefs: string[];
  detectedServiceKey: string | null;
  detectedServiceLabel: string | null;
  detectedHouseNumber: number | null;
  semanticConfidence: "high" | "medium" | "low";
  semanticNeedsReview: boolean;
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
type IfcInventorySaveStatus = "idle" | "saving" | "saved" | "error";
type Project3DModelIdRow = { id: string };
type ProtectedIfcElementRow = { ifc_global_id: string | null; ifc_entity_id: string | null };

function asProject3DModelIdRow(data: unknown): Project3DModelIdRow | null {
  if (!data || typeof data !== "object") return null;

  const maybeRow = data as Record<string, unknown>;
  return typeof maybeRow.id === "string" ? { id: maybeRow.id } : null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asProtectedIfcElementRows(data: unknown): ProtectedIfcElementRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row): ProtectedIfcElementRow => ({
      ifc_global_id: normalizeNullableString(row.ifc_global_id),
      ifc_entity_id: normalizeNullableString(row.ifc_entity_id),
    }));
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

function isUsefulIfcName(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return !!normalized && normalized.toLowerCase() !== "undefined";
}

function contains3dText(value: string | null | undefined) {
  return (value || "").toLowerCase().includes("3dtext");
}

function normalizeIfcLayerName(layerName: string | null) {
  return (layerName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseIfcLayerSemantic(layerName: string | null): {
  serviceKey: string | null;
  serviceLabel: string | null;
  houseNumber: number | null;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
} {
  const normalized = normalizeIfcLayerName(layerName);
  const houseMatch = normalized.match(/\b(?:casa|lote)\s*0*(\d+)\b/);
  const houseNumber = houseMatch ? Number(houseMatch[1]) : null;
  let serviceKey: string | null = null;
  let serviceLabel: string | null = null;
  let needsReview = false;

  if (normalized.includes("radier")) {
    serviceKey = "radier";
    serviceLabel = "Radier";
  } else if (normalized.includes("parede")) {
    serviceKey = "paredes";
    serviceLabel = "Paredes";
  } else if (normalized.includes("oitao")) {
    serviceKey = "oitao";
    serviceLabel = "Oitão";
  } else if (normalized.includes("telhado") || normalized.includes("cobertura")) {
    serviceKey = "cobertura";
    serviceLabel = "Cobertura";
  } else if (normalized.includes("piso")) {
    serviceKey = "piso";
    serviceLabel = "Piso";
  } else if (normalized.includes("lote")) {
    serviceLabel = "Referência/Lote";
    needsReview = true;
  }

  const confidence = serviceKey && houseNumber != null ? "high" : serviceKey ? "medium" : "low";
  return { serviceKey, serviceLabel, houseNumber, confidence, needsReview };
}

function classifyIfcElement(name: string, primaryLayerName: string | null): IfcInventoryItem["category"] {
  if (contains3dText(name) || contains3dText(primaryLayerName)) return "text";
  if (isUsefulIfcName(primaryLayerName)) return "production";
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

function collectReachableRefs(startId: string, lineById: Map<string, string>, maxDepth = 5) {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id) || current.depth > maxDepth) continue;

    visited.add(current.id);
    const line = lineById.get(current.id);
    if (!line || current.depth === maxDepth) continue;

    for (const ref of extractRefs(line)) {
      if (!visited.has(ref)) queue.push({ id: ref, depth: current.depth + 1 });
    }
  }

  return visited;
}

function findLayerNamesForRefs(reachableRefs: Set<string>, refToLayerNames: Map<string, string[]>) {
  const found = new Set<string>();

  for (const ref of reachableRefs) {
    (refToLayerNames.get(ref) || []).forEach(name => found.add(name));
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
    const reachableRefs = collectReachableRefs(id, lineById, 5);
    const layerNames = findLayerNamesForRefs(reachableRefs, refToLayerNames);
    const primaryLayerName = layerNames[0] || null;
    const semantic = parseIfcLayerSemantic(primaryLayerName);

    items.push({
      id,
      type: type.toUpperCase(),
      globalId: quoted[0] || "",
      name,
      quotedValues: quoted,
      layerNames,
      primaryLayerName,
      reachableRefs: Array.from(reachableRefs),
      detectedServiceKey: semantic.serviceKey,
      detectedServiceLabel: semantic.serviceLabel,
      detectedHouseNumber: semantic.houseNumber,
      semanticConfidence: semantic.confidence,
      semanticNeedsReview: semantic.needsReview,
      category: classifyIfcElement(name, primaryLayerName),
      rawLine: summarizeLine(rawLine),
    });
  }

  return items;
}

function getIfcFileName(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathName = decodeURIComponent(parsedUrl.pathname);
    return pathName.split("/").filter(Boolean).pop() || "modelo-ifc.ifc";
  } catch {
    return url.split("/").filter(Boolean).pop() || "modelo-ifc.ifc";
  }
}

function mapIfcCategory(category: IfcInventoryItem["category"]) {
  if (category === "production") return "production";
  if (category === "text") return "text_annotation";
  return "unknown";
}

function buildIfcElementPayload(item: IfcInventoryItem, projectId: string, companyId: string, modelId: string) {
  return {
    company_id: companyId,
    project_id: projectId,
    model_id: modelId,
    ifc_global_id: item.globalId || null,
    ifc_entity_id: item.id,
    ifc_type: item.type,
    ifc_layer_name: item.primaryLayerName,
    name: item.name || null,
    detected_service_key: item.detectedServiceKey,
    detected_service_label: item.detectedServiceLabel,
    detected_house_number: item.detectedHouseNumber,
    category: mapIfcCategory(item.category),
    confidence: item.semanticConfidence,
    needs_review: item.semanticNeedsReview || item.semanticConfidence !== "high",
    status: "suggested",
    raw_properties: {
      layerNames: item.layerNames,
      quotedValues: item.quotedValues,
      rawLine: item.rawLine,
      reachableRefsCount: item.reachableRefs.length,
    },
  };
}

export function IFCModel({ url, projectId, companyId, onLoaded, onSceneReady, onMeshClick, selectedMeshKey }: Props) {
  const [items, setItems] = useState<IfcInventoryItem[]>([]);
  const [filter, setFilter] = useState<IfcInventoryFilter>("production");
  const [search, setSearch] = useState("");
  const [expandedRawLines, setExpandedRawLines] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<IfcInventorySaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const calledRef = useRef(false);
  const persistedKeyRef = useRef<string | null>(null);

  void onSceneReady;
  void onMeshClick;
  void selectedMeshKey;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setItems([]);
    setExpandedRawLines(new Set());
    setSaveStatus("idle");
    setSaveMessage(null);
    calledRef.current = false;
    persistedKeyRef.current = null;

    const loadIfcText = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

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

  useEffect(() => {
    if (!loaded || error || !projectId || !companyId) return;

    const persistenceKey = `${projectId}:${companyId}:${url}:${items.length}`;
    if (persistedKeyRef.current === persistenceKey) return;
    persistedKeyRef.current = persistenceKey;

    let cancelled = false;

    const persistInventory = async () => {
      setSaveStatus("saving");
      setSaveMessage("Salvando inventário como sugestões...");
      let persistStage = "initial";

      try {
        const modelTable = supabase.from("project_3d_models" as any);
        const elementsTable = supabase.from("project_ifc_elements" as any);

        persistStage = "get_auth_user";
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const authUser = authData.user;

        console.info("[IFC][RLS diagnostics] Auth user", {
          authUserId: authUser?.id || null,
          authUserEmail: authUser?.email || null,
          projectId,
          companyId,
          url,
        });

        persistStage = "load_profile";
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, user_id, email, company_id, system_role")
          .eq("user_id", authUser?.id || "")
          .maybeSingle();
        if (profileError) throw profileError;

        persistStage = "load_project";
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select("id, name, company_id")
          .eq("id", projectId)
          .maybeSingle();
        if (projectError) throw projectError;

        console.info("[IFC][RLS diagnostics] Profile/project company check", {
          profileCompanyId: profileData?.company_id || null,
          projectCompanyId: projectData?.company_id || null,
          companyMatches: Boolean(profileData?.company_id && projectData?.company_id && profileData.company_id === projectData.company_id),
          profile: profileData,
          project: projectData,
        });

        persistStage = "find_existing_model";
        const { data: existingModelData, error: findModelError } = await modelTable
          .select("id")
          .eq("project_id", projectId)
          .eq("storage_path", url)
          .eq("model_type", "ifc")
          .limit(1)
          .maybeSingle();
        if (findModelError) throw findModelError;

        const existingModel = asProject3DModelIdRow(existingModelData as unknown);
        let modelId = existingModel?.id as string | undefined;

        if (!modelId) {
          persistStage = "insert_project_3d_model";
          const modelPayload = {
            company_id: companyId,
            project_id: projectId,
            model_type: "ifc",
            storage_path: url,
            file_name: getIfcFileName(url),
            status: "uploaded",
          };

          console.info("[IFC][RLS diagnostics] project_3d_models insert payload", modelPayload);

          const { data: insertedModelData, error: insertModelError } = await modelTable
            .insert([modelPayload])
            .select("id")
            .single();
          if (insertModelError) throw insertModelError;
          const insertedModel = asProject3DModelIdRow(insertedModelData as unknown);
          if (!insertedModel?.id) throw new Error("Modelo IFC criado sem id retornado.");
          modelId = insertedModel.id;
        }

        persistStage = "delete_old_suggestions";
        const { error: deleteSuggestedError } = await elementsTable
          .delete()
          .eq("model_id", modelId)
          .eq("status", "suggested");
        if (deleteSuggestedError) throw deleteSuggestedError;

        persistStage = "load_protected_elements";
        const { data: protectedElementsData, error: protectedError } = await elementsTable
          .select("ifc_global_id, ifc_entity_id")
          .eq("model_id", modelId)
          .in("status", ["confirmed", "ignored"]);
        if (protectedError) throw protectedError;

        const protectedElements = asProtectedIfcElementRows(protectedElementsData as unknown);
        const protectedGlobalIds = new Set(
          protectedElements
            .map(item => item.ifc_global_id)
            .filter((value): value is string => Boolean(value))
        );
        const protectedEntityIds = new Set(
          protectedElements
            .map(item => item.ifc_entity_id)
            .filter((value): value is string => Boolean(value))
        );
        const rows = items
          .filter(item => {
            if (item.globalId && protectedGlobalIds.has(item.globalId)) return false;
            if (!item.globalId && protectedEntityIds.has(item.id)) return false;
            return true;
          })
          .map(item => buildIfcElementPayload(item, projectId, companyId, modelId!));

        if (rows.length > 0) {
          persistStage = "insert_ifc_elements";
          const { error: insertElementsError } = await elementsTable.insert(rows);
          if (insertElementsError) throw insertElementsError;
        }

        persistStage = "update_model_status";
        const { error: updateModelError } = await modelTable
          .update({ status: "inventory_ready" })
          .eq("id", modelId);
        if (updateModelError) throw updateModelError;

        if (cancelled) return;
        setSaveStatus("saved");
        setSaveMessage("Inventário salvo como sugestões");
      } catch (err: any) {
        const code = err?.code ? ` [${err.code}]` : "";
        const detail = err?.message || err?.details || err?.hint || "erro desconhecido";
        console.error("[IFC] Falha ao salvar inventário", {
          stage: persistStage,
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          raw: err,
        });
        if (cancelled) return;
        persistedKeyRef.current = null;
        setSaveStatus("error");
        setSaveMessage(`Falha ao salvar inventário${code}: ${detail}`);
      }
    };

    void persistInventory();

    return () => {
      cancelled = true;
    };
  }, [companyId, error, items, loaded, projectId, url]);

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

  const semanticCounts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        if (item.detectedServiceKey && item.detectedHouseNumber != null) acc.withServiceAndHouse += 1;
        else if (item.detectedServiceKey) acc.withServiceWithoutHouse += 1;
        else acc.withoutService += 1;
        if (item.semanticNeedsReview) acc.referencesOrLots += 1;
        return acc;
      },
      { withServiceAndHouse: 0, withServiceWithoutHouse: 0, withoutService: 0, referencesOrLots: 0 }
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const base = filter === "all" ? items : items.filter(item => item.category === filter);
    const query = search.trim().toLowerCase();
    if (!query) return base;

    return base.filter(item => {
      const haystack = [
        item.id,
        item.type,
        item.globalId,
        item.name,
        item.primaryLayerName,
        item.layerNames.join(" "),
        item.detectedServiceLabel,
        item.detectedServiceKey,
        item.detectedHouseNumber != null ? String(item.detectedHouseNumber) : "",
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [filter, items, search]);

  const toggleRawLine = (id: string) => {
    setExpandedRawLines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const copyRawLine = async (rawLine: string) => {
    await copyText(rawLine);
  };

  const formatItemLine = (item: IfcInventoryItem) => {
    return [
      item.id,
      item.type,
      `GlobalId: ${item.globalId || "-"}`,
      `Camada: ${item.primaryLayerName || "-"}`,
      `Serviço: ${item.detectedServiceLabel || "-"}`,
      `Casa: ${item.detectedHouseNumber ?? "-"}`,
      `Confiança: ${item.semanticConfidence}`,
    ].join(" | ");
  };

  const formatSummary = (list: IfcInventoryItem[]) => {
    return [
      "Inventário IFC",
      `Total: ${inventoryCounts.totalElements}`,
      `Produtivos: ${inventoryCounts.productionElements}`,
      `Textos/anotações: ${inventoryCounts.textElements}`,
      `Sem nome: ${inventoryCounts.unnamedElements}`,
      `Com serviço e casa: ${semanticCounts.withServiceAndHouse}`,
      `Com serviço sem casa: ${semanticCounts.withServiceWithoutHouse}`,
      `Sem serviço detectado: ${semanticCounts.withoutService}`,
      `Referência/lote: ${semanticCounts.referencesOrLots}`,
      "",
      ...list.map(formatItemLine),
    ].join("\n");
  };

  return (
    <Html fullscreen>
      <div className="pointer-events-none absolute right-4 top-4 bottom-24 w-[min(760px,calc(100vw-2rem))]">
        <div
          className="pointer-events-auto flex h-full max-h-[calc(100vh-160px)] flex-col overflow-hidden overscroll-contain rounded-lg border border-border bg-background/95 shadow-2xl"
          onWheel={(e) => e.stopPropagation()}
          onWheelCapture={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          style={minimized ? { height: "auto", maxHeight: "auto" } : undefined}
        >
          <div className="flex-shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold">Inventário IFC</h3>
              <button
                type="button"
                onClick={() => setMinimized(prev => !prev)}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
              >
                {minimized ? "Expandir" : "Minimizar"}
              </button>
            </div>
            {!minimized && (
              <p className="mt-1 text-xs text-muted-foreground">
                Renderização IFC 3D será ativada em etapa futura. Nesta etapa o arquivo foi lido para validar entidades e nomes.
              </p>
            )}
            {saveMessage && (
              <p className={`mt-2 rounded-md px-2 py-1 text-xs break-words ${
                saveStatus === "saved"
                  ? "bg-emerald-100 text-emerald-800"
                  : saveStatus === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}>
                {saveMessage}
              </p>
            )}
          </div>

          {minimized ? null : error ? (
            <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <>
              <div className="grid flex-shrink-0 grid-cols-2 gap-2 p-3 text-sm md:grid-cols-4">
                <InventoryMetric label="Elementos detectados" value={inventoryCounts.totalElements} />
                <InventoryMetric label="Produtivos" value={inventoryCounts.productionElements} />
                <InventoryMetric label="Textos/anotações" value={inventoryCounts.textElements} />
                <InventoryMetric label="Sem nome" value={inventoryCounts.unnamedElements} />
                <InventoryMetric label="Tipos detectados" value={Object.keys(countsByType).length} />
                <InventoryMetric label="Com serviço e casa" value={semanticCounts.withServiceAndHouse} />
                <InventoryMetric label="Com serviço sem casa" value={semanticCounts.withServiceWithoutHouse} />
                <InventoryMetric label="Sem serviço detectado" value={semanticCounts.withoutService} />
                <InventoryMetric label="Referência/lote" value={semanticCounts.referencesOrLots} />
              </div>

              {items.length === 0 ? (
                <div className="mx-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Nenhuma entidade IFC compatível detectada.
                </div>
              ) : (
                <>
                  <div className="flex-shrink-0 space-y-2 border-y border-border bg-muted/20 px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(countsByType).map(([type, count]) => (
                        <span key={type} className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                          {type}: {count}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 md:flex-row">
                      <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar por GlobalId, nome, camada, serviço, casa ou tipo..."
                        className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <CopyButton onClick={() => copyText(formatSummary(items))}>Copiar resumo</CopyButton>
                        <CopyButton onClick={() => copyText(formatSummary(filteredItems))}>Copiar elementos filtrados</CopyButton>
                        <CopyButton onClick={() => copyText(formatSummary(items.filter(item => item.category === "production")))}>Copiar produtivos</CopyButton>
                      </div>
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
                      <span className="ml-auto text-[11px] text-muted-foreground">{filteredItems.length} elemento(s)</span>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="space-y-2">
                      {filteredItems.map(item => (
                        <IfcItemCard
                          key={item.id}
                          item={item}
                          filter={filter}
                          expanded={expandedRawLines.has(item.id)}
                          onToggleRaw={() => toggleRawLine(item.id)}
                          onCopyRaw={() => copyRawLine(item.rawLine)}
                          onCopyGlobalId={() => copyText(item.globalId)}
                        />
                      ))}
                    </div>
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
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className="text-base font-bold leading-tight">{value}</p>
    </div>
  );
}

function CopyButton({ children, onClick }: { children: string; onClick: () => Promise<void> }) {
  return (
    <button type="button" onClick={() => void onClick()} className="rounded border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted">
      {children}
    </button>
  );
}

function IfcItemCard({
  item,
  filter,
  expanded,
  onToggleRaw,
  onCopyRaw,
  onCopyGlobalId,
}: {
  item: IfcInventoryItem;
  filter: IfcInventoryFilter;
  expanded: boolean;
  onToggleRaw: () => void;
  onCopyRaw: () => Promise<void>;
  onCopyGlobalId: () => Promise<void>;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.primaryLayerName || item.name || item.type}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{item.id} | {item.type}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
          item.semanticConfidence === "high"
            ? "bg-emerald-100 text-emerald-800"
            : item.semanticConfidence === "medium"
              ? "bg-blue-100 text-blue-800"
              : "bg-slate-100 text-slate-700"
        }`}>
          {item.semanticConfidence}
        </span>
      </div>

      {item.category === "text" && (
        <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Texto / anotação - não vincular
        </span>
      )}
      {item.category === "unnamed" && (
        <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          Sem nome - revisar exportação
        </span>
      )}

      <p className="mt-1 truncate text-[11px]">
        <span className="text-muted-foreground">GlobalId: </span>
        {item.globalId || "-"}
        {item.globalId && (
          <button type="button" onClick={() => void onCopyGlobalId()} className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted">
            Copiar
          </button>
        )}
      </p>
      <p className="truncate text-[11px]"><span className="text-muted-foreground">Nome IFC: </span>{item.name || "-"}</p>
      <p className="truncate text-[11px]"><span className="text-muted-foreground">Camada IFC principal: </span>{item.primaryLayerName || "-"}</p>
      <p className="text-[11px]"><span className="text-muted-foreground">Todas as camadas encontradas: </span>{item.layerNames.length > 0 ? item.layerNames.join(", ") : "-"}</p>

      {item.category === "production" && (
        <div className="mt-1 grid gap-1 rounded bg-muted/40 px-2 py-1 text-[11px] md:grid-cols-3">
          <p className="truncate"><span className="text-muted-foreground">Serviço detectado: </span>{item.detectedServiceLabel || "-"}</p>
          <p><span className="text-muted-foreground">Casa detectada: </span>{item.detectedHouseNumber != null ? item.detectedHouseNumber : "-"}</p>
          <p><span className="text-muted-foreground">Confiança: </span>{item.semanticConfidence}</p>
          {item.semanticNeedsReview && (
            <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Revisar
            </span>
          )}
        </div>
      )}

      {(filter === "all" || filter === "unnamed") && (
        <div className="mt-1 rounded bg-muted/40 px-2 py-1 text-[10px]">
          <p><span className="text-muted-foreground">Refs alcançadas: </span>{item.reachableRefs.length}</p>
          <p className="break-words font-mono text-muted-foreground">{item.reachableRefs.slice(0, 10).join(", ") || "-"}</p>
        </div>
      )}

      <div className="mt-1 text-[11px]">
        <span className="text-muted-foreground">Valores textuais encontrados: </span>
        {item.quotedValues.length > 0 ? (
          <span className="break-words">
            {item.quotedValues.map((value, index) => (
              <span key={`${item.id}-quoted-${index}`} className="mr-1">{index + 1}. {value || "-"}</span>
            ))}
          </span>
        ) : (
          <span>-</span>
        )}
      </div>

      {item.category === "unnamed" && (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={onToggleRaw} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">Ver linha bruta</button>
            <button type="button" onClick={() => void onCopyRaw()} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">Copiar linha IFC</button>
          </div>
          {expanded && (
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[10px] leading-relaxed">
              {item.rawLine}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
