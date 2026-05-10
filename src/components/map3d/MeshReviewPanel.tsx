import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { X, Copy, Eye, EyeOff, Crosshair, EyeOff as Ignore, Box, Home, Save, Search, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  GLB_CONTEXT_MESH_MARKER,
  isContextProjectModelMesh,
  type ProjectModelMesh,
} from "@/hooks/useProjectModelMeshes";
import { parseHouseNumberFromMesh } from "./parseHouseFromMeshName";
import type { GlbSmartLinkCandidate } from "./glbSmartLink";

export interface ServiceOption {
  id: string;          // `${macro_id}::${scope_id}`
  label: string;
  macro_id: string;
  scope_id: string;
}

interface Props {
  meshKey: string | null;
  meshData: ProjectModelMesh | null;
  sceneRef: THREE.Object3D | null;
  houses: number[];
  services: ServiceOption[];
  isolated: boolean;
  onClose: () => void;
  onIsolate: (key: string) => void;
  onShowAll: () => void;
  onUpdate: (key: string, data: Partial<ProjectModelMesh>) => Promise<void>;
  onIgnore: (key: string) => void;
  onFindSimilar?: (key: string) => void;
  smartLinkCandidate?: GlbSmartLinkCandidate | null;
  smartLinkSelected?: boolean;
  onSmartLinkToggleCandidate?: (key: string, checked: boolean) => void;
  onSmartLinkClearFocus?: () => void;
  onSmartLinkReturnToList?: () => void;
}

type PendingTypeChange = "production" | "context" | "ignored" | null;

const smartLinkStatusLabel: Record<GlbSmartLinkCandidate["status"], string> = {
  applicable: "aplicavel",
  missing_house: "sem casa",
  linked: "ja vinculada",
  context: "contexto",
  ignored: "ignorada",
  self: "mesh base",
};

export function MeshReviewPanel({
  meshKey, meshData, sceneRef, houses, services, isolated,
  onClose, onIsolate, onShowAll, onUpdate, onIgnore, onFindSimilar,
  smartLinkCandidate, smartLinkSelected = false, onSmartLinkToggleCandidate, onSmartLinkClearFocus, onSmartLinkReturnToList,
}: Props) {
  const [bbox, setBbox] = useState<{ size: THREE.Vector3; center: THREE.Vector3 } | null>(null);
  const [draftHouse, setDraftHouse] = useState("_none");
  const [draftService, setDraftService] = useState("_none");
  const [savingLink, setSavingLink] = useState(false);
  const [identExpanded, setIdentExpanded] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<PendingTypeChange>(null);

  const selectedSceneMesh = useMemo(() => {
    if (!meshKey || !sceneRef) return null;
    let found: THREE.Mesh | null = null;
    sceneRef.traverse((child) => {
      if (!found && (child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const layerKey = typeof mesh.userData?.obramapLayerKey === "string" && mesh.userData.obramapLayerKey
          ? mesh.userData.obramapLayerKey
          : mesh.uuid;
        if (layerKey === meshKey) found = mesh;
      }
    });
    return found;
  }, [meshKey, sceneRef]);

  const smartLinkCanSelectCandidate = smartLinkCandidate?.status === "applicable";
  const smartLinkSelectionBlockReason = smartLinkCandidate
    ? smartLinkCandidate.status === "missing_house"
      ? smartLinkCandidate.houseSuggestionRejectReason || "sem casa sugerida aplicavel"
      : smartLinkCandidate.status === "linked"
        ? "ja vinculada"
        : smartLinkCandidate.status === "context"
          ? "contexto"
          : smartLinkCandidate.status === "ignored"
            ? "ignorada"
            : smartLinkCandidate.status === "self"
              ? "mesh base"
              : ""
    : "";

  useEffect(() => {
    if (!meshKey || !sceneRef) { setBbox(null); return; }
    const box = new THREE.Box3();
    let found = false;
    sceneRef.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const layerKey = typeof mesh.userData?.obramapLayerKey === "string" && mesh.userData.obramapLayerKey
          ? mesh.userData.obramapLayerKey
          : mesh.uuid;
        if (layerKey === meshKey) {
          box.expandByObject(child);
          found = true;
        }
      }
    });
    if (!found || box.isEmpty()) { setBbox(null); return; }
    setBbox({
      size: box.getSize(new THREE.Vector3()),
      center: box.getCenter(new THREE.Vector3()),
    });
  }, [meshKey, sceneRef]);

  const currentService = useMemo(() => {
    if (isContextProjectModelMesh(meshData)) return "_none";
    if (!meshData?.service_macro_id || !meshData?.service_scope_id) return "_none";
    return `${meshData.service_macro_id}::${meshData.service_scope_id}`;
  }, [meshData]);

  const currentHouse = meshData?.assigned_house_number != null ? String(meshData.assigned_house_number) : "_none";
  const meshType = meshData?.ignored
    ? "ignored"
    : isContextProjectModelMesh(meshData)
      ? "context"
      : "production";
  const hasAssignedHouse = meshData?.assigned_house_number != null;
  const hasServiceMacro = !!meshData?.service_macro_id && !isContextProjectModelMesh(meshData);
  const hasServiceScope = !!meshData?.service_scope_id && !isContextProjectModelMesh(meshData);
  const hasExistingLink = hasAssignedHouse || hasServiceMacro || hasServiceScope || isContextProjectModelMesh(meshData);
  const hasOnFindSimilar = !!onFindSimilar;
  const canFindSimilar = hasAssignedHouse
    && hasServiceMacro
    && hasServiceScope
    && !meshData?.ignored
    && !isContextProjectModelMesh(meshData);
  useEffect(() => {
    setDraftHouse(currentHouse);
    setDraftService(currentService);
    setIdentExpanded(false);
  }, [currentHouse, currentService, meshKey]);

  if (!meshKey) return null;

  const copy = (s: string) => {
    navigator.clipboard.writeText(s).then(() => toast.success("Copiado"));
  };

  const fmt = (n: number) => n.toFixed(2);

  const materialNameFromScene = (() => {
    const material = selectedSceneMesh?.material;
    if (!material) return "";
    if (Array.isArray(material)) {
      return material.map((m) => m?.name).filter(Boolean).join(", ");
    }
    return material.name || "";
  })();

  const selectedService = services.find((service) => service.id === draftService) ?? null;
  const selectedHouseNumber = draftHouse === "_none" ? null : parseInt(draftHouse, 10);
  const hasDraftCompleteLink = Number.isFinite(selectedHouseNumber) && !!selectedService;
  const smartLinkStatusText = canFindSimilar
    ? "Status: Pronta para encontrar similares"
    : hasDraftCompleteLink
      ? "Status: Clique em Aplicar vínculo antes de encontrar similares"
      : "Status: Vincule Casa e Serviço primeiro";
  const canApplyLink =
    !!meshKey &&
    !savingLink &&
    !meshData?.ignored &&
    Number.isFinite(selectedHouseNumber) &&
    !!selectedService;

  const applySetProductionType = async () => {
    if (!meshKey) return;
    await onUpdate(meshKey, {
      ignored: false,
      visible: true,
      assigned_house_number: null,
      service_macro_id: null,
      service_scope_id: null,
      production_visible: false,
      progress_percent: 0,
    });
    toast.success("Mesh marcada como produção. Escolha Casa e Serviço para vincular.");
  };

  const applySetContextType = async () => {
    if (!meshKey) return;
    await onUpdate(meshKey, {
      ignored: false,
      visible: true,
      assigned_house_number: null,
      service_macro_id: GLB_CONTEXT_MESH_MARKER,
      service_scope_id: GLB_CONTEXT_MESH_MARKER,
      production_visible: false,
      progress_percent: 0,
    });
    toast.success("Mesh marcada como contexto do 3D Real.");
  };

  const applySetIgnoredType = async () => {
    if (!meshKey) return;
    await onUpdate(meshKey, {
      ignored: true,
      visible: false,
      production_visible: false,
      progress_percent: 0,
    });
    toast.success("Mesh marcada como ignorada.");
  };

  const requestTypeChange = (next: "production" | "context" | "ignored") => {
    if (meshType === next) return;
    if (hasExistingLink) {
      setPendingTypeChange(next);
      return;
    }
    if (next === "production") void applySetProductionType();
    else if (next === "context") void applySetContextType();
    else void applySetIgnoredType();
  };

  const confirmPendingTypeChange = async () => {
    const next = pendingTypeChange;
    setPendingTypeChange(null);
    if (!next) return;
    if (next === "production") await applySetProductionType();
    else if (next === "context") await applySetContextType();
    else await applySetIgnoredType();
  };

  const handleRemoveContextType = async () => {
    if (!meshKey) return;
    await onUpdate(meshKey, {
      ignored: false,
      visible: true,
      service_macro_id: null,
      service_scope_id: null,
      production_visible: false,
      progress_percent: 0,
    });
    toast.success("Contexto removido da mesh.");
  };

  const handleApplyLink = async () => {
    if (!meshKey) return;
    if (meshData?.ignored) {
      toast.error("Remova Ignorar mesh antes de vincular.");
      return;
    }
    if (!Number.isFinite(selectedHouseNumber) || !selectedService) {
      toast.error("Selecione Casa e Serviço para aplicar o vínculo.");
      return;
    }

    setSavingLink(true);
    const payload: Partial<ProjectModelMesh> = {
      assigned_house_number: selectedHouseNumber,
      service_macro_id: selectedService.macro_id,
      service_scope_id: selectedService.scope_id,
      ignored: false,
      visible: true,
      mesh_name: meshData?.mesh_name || selectedSceneMesh?.name || "",
      material_name: meshData?.material_name || materialNameFromScene || "",
      detected_house_number:
        meshData?.detected_house_number ?? parseHouseNumberFromMesh(selectedSceneMesh?.name || ""),
    };
    try {
      await onUpdate(meshKey, payload);
      toast.success("Vínculo aplicado à mesh. Clique em Sincronizar 3D Real para atualizar a produção.");
    } catch (error) {
      console.error("[MeshReviewPanel] apply link error", error);
      toast.error("Falha ao aplicar vínculo da mesh.");
    } finally {
      setSavingLink(false);
    }
  };

  const handleClearLink = async () => {
    if (!meshKey) return;
    setSavingLink(true);
    try {
      await onUpdate(meshKey, {
        assigned_house_number: null,
        service_macro_id: null,
        service_scope_id: null,
        production_visible: false,
        progress_percent: 0,
      });
      setDraftHouse("_none");
      setDraftService("_none");
      toast.success("Vínculo limpo. A mesh ficou sem vínculo de produção.");
    } catch (error) {
      console.error("[MeshReviewPanel] clear link error", error);
      toast.error("Falha ao limpar vínculo da mesh.");
    } finally {
      setSavingLink(false);
    }
  };

  const pendingLabel = pendingTypeChange === "production"
    ? "Produção"
    : pendingTypeChange === "context"
      ? "Contexto"
      : pendingTypeChange === "ignored"
        ? "Ignorar"
        : "";

  return (
    <Card className="absolute top-4 right-4 bottom-4 z-20 flex w-80 flex-col overflow-hidden shadow-2xl border-primary/30">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Box className="h-4 w-4 text-primary" /> Revisar Mesh
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-4 pb-8 pt-1 space-y-3">
            {/* Identificação (recolhível) */}
            <section className="space-y-1.5">
              <button
                type="button"
                onClick={() => setIdentExpanded(v => !v)}
                className="flex items-center gap-1 text-[10px] uppercase font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {identExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Identificação
                {!identExpanded && meshData?.mesh_name && (
                  <span className="ml-1 normal-case font-normal text-muted-foreground/80 truncate">— {meshData.mesh_name}</span>
                )}
              </button>
              {identExpanded && (
                <div className="space-y-1.5 pl-4">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-muted-foreground shrink-0">UUID:</span>
                    <span className="font-mono truncate flex-1" title={meshKey}>{meshKey}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => copy(meshKey)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-[11px]">
                    <span className="text-muted-foreground">Nome: </span>
                    <span className="font-medium">{meshData?.mesh_name || "—"}</span>
                  </div>
                  <div className="text-[11px]">
                    <span className="text-muted-foreground">Material: </span>
                    <span className="font-medium">{meshData?.material_name || "—"}</span>
                  </div>
                  {meshData?.detected_house_number != null && (
                    <Badge variant="secondary" className="text-[10px]">Casa detectada: {meshData.detected_house_number}</Badge>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Tipo da mesh</p>
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  variant={meshType === "production" ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => requestTypeChange("production")}
                >
                  Produção
                </Button>
                <Button
                  type="button"
                  variant={meshType === "context" ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => requestTypeChange("context")}
                >
                  Contexto
                </Button>
                <Button
                  type="button"
                  variant={meshType === "ignored" ? "destructive" : "outline"}
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => requestTypeChange("ignored")}
                >
                  Ignorar
                </Button>
              </div>
              {meshType === "context" && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    Contexto fica sempre visível no 3D Real e não precisa de Casa/Serviço.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-[11px]"
                    onClick={handleRemoveContextType}
                  >
                    Remover contexto
                  </Button>
                </div>
              )}
            </section>

            {/* Geometria */}
            {bbox && (
              <section className="space-y-1.5">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Geometria</p>
                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                  <div className="bg-muted/40 rounded px-1.5 py-1">
                    <p className="text-[9px] text-muted-foreground">Larg X</p>
                    <p>{fmt(bbox.size.x)}</p>
                  </div>
                  <div className="bg-muted/40 rounded px-1.5 py-1">
                    <p className="text-[9px] text-muted-foreground">Alt Y</p>
                    <p>{fmt(bbox.size.y)}</p>
                  </div>
                  <div className="bg-muted/40 rounded px-1.5 py-1">
                    <p className="text-[9px] text-muted-foreground">Prof Z</p>
                    <p>{fmt(bbox.size.z)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Centro: {fmt(bbox.center.x)}, {fmt(bbox.center.y)}, {fmt(bbox.center.z)}
                </p>
              </section>
            )}

            {smartLinkCandidate && (
              <section className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase font-semibold text-primary">Sugestão SmartLink</p>
                  <Badge variant={smartLinkCanSelectCandidate ? "default" : "outline"} className="text-[9px]">
                    {smartLinkStatusLabel[smartLinkCandidate.status]}
                  </Badge>
                </div>
                <div className="space-y-1 text-[10px] text-muted-foreground">
                  <p className="font-mono text-foreground">{smartLinkCandidate.layerKey}</p>
                  <p>{smartLinkCandidate.meshName || "sem nome"} | {smartLinkCandidate.materialName || "sem material"}</p>
                  <p>
                    Casa: {smartLinkCandidate.suggestedHouseNumber != null ? `Casa ${smartLinkCandidate.suggestedHouseNumber}` : "-"}
                    {" | "}confiança {smartLinkCandidate.suggestionConfidence}
                  </p>
                  <p>
                    fonte: {smartLinkCandidate.suggestionSource}
                    {smartLinkCandidate.suggestionDistance != null ? ` | ancora ${smartLinkCandidate.suggestionDistance.toFixed(1)}m` : ""}
                  </p>
                  {smartLinkCandidate.secondSuggestionDistance != null && (
                    <p>
                      2a ancora {smartLinkCandidate.secondSuggestionDistance.toFixed(1)}m
                      {smartLinkCandidate.suggestionDistanceGap != null ? ` | gap ${smartLinkCandidate.suggestionDistanceGap.toFixed(1)}m` : ""}
                      {smartLinkCandidate.suggestionDistanceRatio != null ? ` | ratio ${smartLinkCandidate.suggestionDistanceRatio.toFixed(2)}` : ""}
                    </p>
                  )}
                  <p>motivo: {smartLinkCandidate.houseSuggestionRejectReason || smartLinkCandidate.suggestionReason}</p>
                  <p>{smartLinkSelected ? "Selecionada para aplicar" : "Não selecionada"}</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={smartLinkSelected ? "outline" : "default"}
                    className="h-7 text-[11px]"
                    disabled={!smartLinkCanSelectCandidate || !onSmartLinkToggleCandidate}
                    title={smartLinkCanSelectCandidate ? "Alternar seleção desta candidata" : smartLinkSelectionBlockReason}
                    onClick={() => onSmartLinkToggleCandidate?.(smartLinkCandidate.layerKey, !smartLinkSelected)}
                  >
                    {smartLinkSelected ? "Desselecionar" : "Selecionar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={onSmartLinkClearFocus}
                  >
                    Limpar foco
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="col-span-2 h-7 text-[11px]"
                    onClick={onSmartLinkReturnToList}
                  >
                    Voltar para lista
                  </Button>
                </div>
                {!smartLinkCanSelectCandidate && smartLinkSelectionBlockReason && (
                  <p className="text-[10px] text-amber-600">Não selecionável: {smartLinkSelectionBlockReason}</p>
                )}
              </section>
            )}

            {/* Vínculos */}
            <section className="space-y-2">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Vínculos</p>
              <div>
                <label className="text-[10px] text-muted-foreground">Casa</label>
                <Select
                  value={draftHouse}
                  onValueChange={setDraftHouse}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="_none">Sem vínculo</SelectItem>
                    {houses.map(n => (
                      <SelectItem key={n} value={String(n)}>
                        <span className="flex items-center gap-1.5"><Home className="h-3 w-3" /> Casa {String(n).padStart(2, "0")}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Serviço</label>
                <Select
                  value={draftService}
                  onValueChange={setDraftService}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="_none">Sem vínculo</SelectItem>
                    {services.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {meshData?.ignored && (
                <p className="text-[10px] text-destructive">Remova Ignorar mesh antes de vincular.</p>
              )}
              <p className={canFindSimilar ? "text-[10px] text-emerald-600" : "text-[10px] text-muted-foreground"}>
                {smartLinkStatusText}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-full text-[11px]"
                disabled={!canFindSimilar || savingLink}
                title={canFindSimilar ? "Encontrar meshes semelhantes para vincular em lote" : hasDraftCompleteLink ? "Clique em Aplicar vínculo antes de encontrar similares." : "Vincule Casa e Serviço primeiro."}
                onClick={() => {
                  if (!onFindSimilar) {
                    toast.error("Busca de similares indisponível neste painel.");
                    return;
                  }
                  onFindSimilar(meshKey);
                }}
              >
                <Search className="h-3.5 w-3.5 mr-1" />
                {canFindSimilar ? "Encontrar similares" : hasDraftCompleteLink ? "Aplique vínculo primeiro" : "Vincule Casa e Serviço primeiro."}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-[11px]"
                disabled={!canApplyLink}
                onClick={handleApplyLink}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {savingLink ? "Aplicando..." : "Aplicar vínculo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full text-[11px]"
                disabled={!meshKey || savingLink}
                onClick={handleClearLink}
              >
                Limpar vínculo
              </Button>
            </section>

            {/* Estado atual */}
            {meshData && (
              <section className="flex items-center gap-2 text-[10px]">
                <Badge variant={meshData.visible ? "default" : "outline"} className="text-[9px]">
                  {meshData.visible ? "Visível" : "Oculta"}
                </Badge>
                {meshData.ignored && <Badge variant="destructive" className="text-[9px]">Ignorada</Badge>}
                {meshData.production_visible && <Badge className="text-[9px] bg-emerald-600">Em produção</Badge>}
              </section>
            )}

            {/* Ações */}
            <section className="grid grid-cols-2 gap-1.5 pt-1">
              {isolated && (
                <div className="col-span-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-[10px] text-primary">
                  Isolando 1 mesh. Use Mostrar tudo para voltar sem sair da Revisão.
                </div>
              )}
              <Button
                variant="outline" size="sm" className="h-8 text-[11px]"
                onClick={() => onUpdate(meshKey, { visible: !(meshData?.visible ?? true) })}
              >
                {meshData?.visible ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {meshData?.visible ? "Ocultar" : "Exibir"}
              </Button>
              <Button
                variant={isolated ? "default" : "outline"} size="sm" className="h-8 text-[11px]"
                onClick={() => isolated ? onShowAll() : onIsolate(meshKey)}
              >
                <Crosshair className="h-3.5 w-3.5 mr-1" />
                {isolated ? "Mostrar tudo" : "Isolar"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="h-8 text-[11px] col-span-2">
                    <Ignore className="h-3.5 w-3.5 mr-1" /> Ignorar mesh
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Ignorar esta mesh?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ignorar esta mesh significa que ela não será usada em produção,
                      medições ou no 3D Real Executado. A geometria continua no modelo
                      original — você pode reverter a qualquer momento na Revisão.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onIgnore(meshKey)}>Ignorar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </section>
          </div>
        </ScrollArea>
      </CardContent>

      <AlertDialog open={pendingTypeChange !== null} onOpenChange={(open) => { if (!open) setPendingTypeChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar tipo para "{pendingLabel}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta mesh já possui vínculo (Casa/Serviço ou Contexto). Ao mudar o tipo, o vínculo atual será removido. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTypeChange(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingTypeChange}>Sim, mudar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
