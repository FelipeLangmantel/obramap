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
import { X, Copy, Eye, EyeOff, Crosshair, EyeOff as Ignore, Box, Home, Save } from "lucide-react";
import { toast } from "sonner";
import {
  GLB_CONTEXT_MESH_MARKER,
  isContextProjectModelMesh,
  type ProjectModelMesh,
} from "@/hooks/useProjectModelMeshes";
import { parseHouseNumberFromMesh } from "./parseHouseFromMeshName";

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
}

export function MeshReviewPanel({
  meshKey, meshData, sceneRef, houses, services, isolated,
  onClose, onIsolate, onShowAll, onUpdate, onIgnore,
}: Props) {
  const [bbox, setBbox] = useState<{ size: THREE.Vector3; center: THREE.Vector3 } | null>(null);
  const [draftHouse, setDraftHouse] = useState("_none");
  const [draftService, setDraftService] = useState("_none");
  const [savingLink, setSavingLink] = useState(false);

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

  useEffect(() => {
    setDraftHouse(currentHouse);
    setDraftService(currentService);
  }, [currentHouse, currentService, meshKey]);

  useEffect(() => {
    if (!import.meta.env.DEV || !meshKey) return;
    console.log("[GLB Mesh Link] panel values", {
      meshKey,
      meshData,
      currentHouse,
      currentService,
    });
    if (meshKey.includes("Geom3D_302") || meshKey.includes("Geom3D_303")) {
      console.log("[GLB Mesh Link Check] panel values", {
        meshKey,
        meshData,
        currentHouse,
        currentService,
        draftHouse,
        draftService,
        sceneMeshUuid: selectedSceneMesh?.uuid ?? null,
        sceneMeshName: selectedSceneMesh?.name ?? null,
        sceneLayerKey: selectedSceneMesh?.userData?.obramapLayerKey ?? null,
      });
    }
  }, [currentHouse, currentService, draftHouse, draftService, meshData, meshKey, selectedSceneMesh]);

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
  const canApplyLink =
    !!meshKey &&
    !savingLink &&
    !meshData?.ignored &&
    Number.isFinite(selectedHouseNumber) &&
    !!selectedService;

  const handleSetProductionType = async () => {
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

  const handleSetContextType = async () => {
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

  const handleSetIgnoredType = async () => {
    if (!meshKey) return;
    await onUpdate(meshKey, {
      ignored: true,
      visible: false,
      production_visible: false,
      progress_percent: 0,
    });
    toast.success("Mesh marcada como ignorada.");
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
    if (import.meta.env.DEV) {
      console.log("[GLB Mesh Link] panel apply", {
        meshKey,
        sceneMeshUuid: selectedSceneMesh?.uuid ?? null,
        selectedHouseNumber,
        selectedService,
        payload,
      });
      if (meshKey.includes("Geom3D_302") || meshKey.includes("Geom3D_303")) {
        console.log("[GLB Mesh Link Check] panel apply", {
          meshKey,
          sceneMeshUuid: selectedSceneMesh?.uuid ?? null,
          sceneMeshName: selectedSceneMesh?.name ?? null,
          sceneLayerKey: selectedSceneMesh?.userData?.obramapLayerKey ?? null,
          selectedHouseNumber,
          selectedService,
          payload,
        });
      }
    }
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

  return (
    <Card className="absolute top-4 right-4 w-80 z-20 shadow-2xl border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Box className="h-4 w-4 text-primary" /> Revisar Mesh
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[calc(100vh-160px)]">
          <div className="px-4 pb-4 space-y-3">
            {/* Identificação */}
            <section className="space-y-1.5">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Identificação</p>
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
            </section>

            <section className="space-y-2">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground">Tipo da mesh</p>
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  variant={meshType === "production" ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={handleSetProductionType}
                >
                  Produção
                </Button>
                <Button
                  type="button"
                  variant={meshType === "context" ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={handleSetContextType}
                >
                  Contexto
                </Button>
                <Button
                  type="button"
                  variant={meshType === "ignored" ? "destructive" : "outline"}
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={handleSetIgnoredType}
                >
                  Ignorar
                </Button>
              </div>
              {meshType === "context" && (
                <p className="text-[10px] text-muted-foreground">
                  Contexto fica sempre visível no 3D Real e não precisa de Casa/Serviço.
                </p>
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
    </Card>
  );
}
