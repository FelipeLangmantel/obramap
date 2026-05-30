import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCoordenadorAccess } from "@/hooks/useCoordenadorAccess";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Save, Trash2, ClipboardList, CheckCircle2, ChevronRight, Users,
  Loader2, Camera, X, Printer, MapPin, Building2, Pencil, FileText, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { geocodeMunicipio, fetchClimaHoje } from "@/lib/geocode";
import { PrintDiarioDialog } from "./diario/PrintDiarioDialog";
import type { DiarioPDFData } from "./diario/generateDiarioPDF";
import { DiarioSummaryPanel } from "./diario/DiarioSummaryPanel";
import { ConfirmRainDialog } from "./diario/ConfirmRainDialog";
import { ImportPreviousDayButton } from "./diario/ImportPreviousDayButton";
import { RequestDeleteItemDialog } from "./diario/RequestDeleteItemDialog";
import { DiaryItemPhotoButton } from "./diario/DiaryItemPhotoButton";
import { EditDiaryItemDialog, type EditableDiaryItem } from "./diario/EditDiaryItemDialog";
import { useDiaryLegalConfig } from "@/hooks/useDiaryLegalConfig";
import { useNavigate } from "react-router-dom";
import { FileSignature } from "lucide-react";

// RDO modular components
import { RdoSidebar } from "./diario/rdo/RdoSidebar";
import { RdoSectionShell } from "./diario/rdo/RdoSectionShell";
import { RdoClimaSection, type ClimaState, type ClimaTurno } from "./diario/rdo/RdoClimaSection";
import { RdoLaborSection } from "./diario/rdo/RdoLaborSection";
import { RdoEquipmentSection } from "./diario/rdo/RdoEquipmentSection";
import { RdoActivitiesSection } from "./diario/rdo/RdoActivitiesSection";
import { RdoOccurrencesSection } from "./diario/rdo/RdoOccurrencesSection";
import { RdoChecklistSection } from "./diario/rdo/RdoChecklistSection";
import { RdoCommentsSection } from "./diario/rdo/RdoCommentsSection";
import { RdoVideosSection } from "./diario/rdo/RdoVideosSection";
import { RdoAttachmentsSection } from "./diario/rdo/RdoAttachmentsSection";
import { AddLaborDialog } from "./diario/rdo/AddLaborDialog";
import { AddEquipmentDialog } from "./diario/rdo/AddEquipmentDialog";
import { AddActivityDialog } from "./diario/rdo/AddActivityDialog";
import { AddOccurrenceDialog } from "./diario/rdo/AddOccurrenceDialog";
import { AddChecklistDialog } from "./diario/rdo/AddChecklistDialog";
import { AddCommentDialog } from "./diario/rdo/AddCommentDialog";
import { useRdoData } from "./diario/rdo/useRdoData";
import { useDiaryWorkers } from "@/hooks/useDiaryWorkers";
import { RdoWorkersSection } from "./diario/rdo/RdoWorkersSection";
import { DiaryItemAssignmentPopover } from "./diario/rdo/DiaryItemAssignmentPopover";
import type { RdoSectionKey } from "./diario/rdo/types";
import { RdoApprovalSection, type StatusAprovacao } from "./diario/rdo/RdoApprovalSection";
import { RdoFooterNav } from "./diario/rdo/RdoFooterNav";
import { RdoEditRequestDialog } from "./diario/rdo/RdoEditRequestDialog";
import { RdoProductionCharts } from "./diario/rdo/RdoProductionCharts";
import { Send, Unlock } from "lucide-react";
import {
  createDiaryEntryAware,
  createProductionAware,
  createWeeklyProductionAware,
  createDiaryItemAware,
} from "@/offline/diaryAdapter";
import { OfflineBanner } from "@/components/offline/OfflineStatusBadge";
import { subscribeSync } from "@/offline/sync";
import { compressImageSafe } from "@/lib/compressImage";

// Compressão segura via createImageBitmap (evita estouro de memória em mobile)
async function comprimirImagem(file: File, maxDim = 1024, quality = 0.7): Promise<Blob> {
  return compressImageSafe(file, { maxSide: maxDim, quality });
}

// Mapeia código antigo de clima (sol/nublado/chuva_*) → novo (claro/nublado/chuvoso)
function legacyToTurno(code: string | null): ClimaTurno {
  if (!code) return "claro";
  if (code === "sol") return "claro";
  if (code === "nublado") return "nublado";
  if (code === "chuva_fraca" || code === "chuva_forte") return "chuvoso";
  if (code === "claro" || code === "chuvoso") return code as ClimaTurno;
  return "claro";
}

interface DiaryItem {
  id: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_id: string;
  scope_name: string;
  house_ids: number[];
  houses_count: number;
  percentual_executado: number;
  observacao: string | null;
  production_id: string | null;
  contractor_contract_id: string | null;
}

type HousePercentMap = Record<number, number>;

const DEFAULT_CLIMA: ClimaState = {
  noiteAtiva: false,
  climaManha: "claro",
  climaTarde: "claro",
  climaNoite: null,
  condicaoManha: "praticavel",
  condicaoTarde: "praticavel",
  condicaoNoite: null,
  mmChuva: null,
};

interface DiarioObraViewProps {
  /** Data inicial (YYYY-MM-DD). Quando informada, o editor abre direto naquele dia. */
  initialDate?: string;
  /** Callback para voltar à tela de calendário. Quando definido, mostra um botão "Voltar". */
  onBack?: () => void;
  /** Oculta o alerta amarelo de configuração legal — útil quando há aba dedicada. */
  hideLegalConfigAlert?: boolean;
}

export default function DiarioObraView({ initialDate, onBack, hideLegalConfigAlert }: DiarioObraViewProps = {}) {
  const { currentProject, updateBatchScopeProgress, refreshHousesFromDB } = useConstruction();
  const { user, profile, company, canEdit, requireEdit } = useAuth();
  const houses = currentProject?.houses || [];
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { config: legalConfig } = useDiaryLegalConfig(currentProject?.id);

  // Header state
  const [entryDate, setEntryDate] = useState(initialDate || format(new Date(), "yyyy-MM-dd"));

  // Sincroniza com initialDate quando o consumidor troca o dia (ex.: clique em outro card do calendário)
  useEffect(() => {
    if (initialDate && initialDate !== entryDate) {
      setEntryDate(initialDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate]);
  const [equipePres, setEquipePres] = useState(0);
  const [obsGeral, setObsGeral] = useState("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [entryStatus, setEntryStatus] = useState<string>("rascunho");
  const [statusAprovacao, setStatusAprovacao] = useState<StatusAprovacao>("preenchendo");
  const [numRelatorio, setNumRelatorio] = useState<number | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [correcoesDoDia, setCorrecoesDoDia] = useState<any[]>([]);
  const [entryMeta, setEntryMeta] = useState<{ created_at: string | null; updated_at: string | null; engineer_name: string | null }>({
    created_at: null, updated_at: null, engineer_name: null,
  });

  // Clima (novo formato)
  const [climaState, setClimaState] = useState<ClimaState>(DEFAULT_CLIMA);
  const [climaAutoPreenchido, setClimaAutoPreenchido] = useState(false);

  // Project header info
  const [projectInfo, setProjectInfo] = useState<{
    location: string | null;
    contractor: string | null;
    engenheiroResidente: string | null;
    startDate: string | null;
    endDate: string | null;
    lat: number | null;
    lng: number | null;
  }>({ location: null, contractor: null, engenheiroResidente: null, startDate: null, endDate: null, lat: null, lng: null });

  const [confirmRainOpen, setConfirmRainOpen] = useState(false);
  const [approvalWarningsOpen, setApprovalWarningsOpen] = useState(false);
  const [approvalMissingPhotoWarnings, setApprovalMissingPhotoWarnings] = useState<Array<{
    house: number;
    macroName: string;
    scopeName: string;
  }>>([]);
  const [cancelEmptyOpen, setCancelEmptyOpen] = useState(false);
  const [cancelBlockedOpen, setCancelBlockedOpen] = useState(false);
  const [cancelingEmptyDiary, setCancelingEmptyDiary] = useState(false);

  // Service steps (produção física existente)
  const [selectedMacro, setSelectedMacro] = useState<{ id: string; name: string; color: string } | null>(null);
  const [selectedScope, setSelectedScope] = useState<{ id: string; name: string } | null>(null);
  const [selectedHouses, setSelectedHouses] = useState<number[]>([]);
  const [percentual, setPercentual] = useState(100);
  const [housePercents, setHousePercents] = useState<HousePercentMap>({});
  const [obsItem, setObsItem] = useState("");
  const [registering, setRegistering] = useState(false);

  const [printOpen, setPrintOpen] = useState(false);
  const [diaryItems, setDiaryItems] = useState<DiaryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [realtimeCount, setRealtimeCount] = useState(0);

  // Fotos do dia
  const [fotos, setFotos] = useState<Array<{
    id: string;
    url: string;
    storage_path: string;
    legenda: string | null;
    diary_item_id: string | null;
    scope_name?: string | null;
    macro_name?: string | null;
    house_number?: number | null;
  }>>([]);
  // Fotos vinculadas a serviços específicos (para PDF jurídico)
  const [fotosPorServico, setFotosPorServico] = useState<Record<string, { url: string; legenda: string | null }[]>>({});
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<{ id: string; url: string; legenda: string | null } | null>(null);
  const [fotoLegendaDraft, setFotoLegendaDraft] = useState("");
  const [savingFotoLegenda, setSavingFotoLegenda] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const inlineCameraInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveHydratedRef = useRef(false);
  const autosaveSavingRef = useRef(false);
  const loadEntryRequestRef = useRef(0);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);

  // RDO data
  const rdo = useRdoData(entryId);
  const dWorkers = useDiaryWorkers(entryId);
  const [contractorContracts, setContractorContracts] = useState<Array<{ id: string; contractor_name: string; status: string; is_internal?: boolean }>>([]);
  const weekdayLabel = useMemo(() => {
    try {
      return format(parseISO(entryDate), "EEEE", { locale: ptBR });
    } catch {
      return "";
    }
  }, [entryDate]);

  useEffect(() => {
    if (!currentProject?.id) { setContractorContracts([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("contractor_contracts")
        .select("id, status, is_internal, contractor:contractors(name)")
        .eq("project_id", currentProject.id);
      if (error) { console.error("[Diario] contractor_contracts:", error); return; }
      const mapped = ((data || []) as any[])
        .map((r) => ({
          id: r.id,
          status: r.status,
          is_internal: !!r.is_internal,
          contractor_name: r.contractor?.name || "(sem nome)",
        }))
        .filter((c) => {
          const s = (c.status || "").toLowerCase();
          // aceita ativos / vigentes; ignora encerrados/cancelados
          return !["encerrado", "cancelado", "finalizado", "closed", "cancelled"].includes(s);
        })
        .sort((a, b) => a.contractor_name.localeCompare(b.contractor_name));
      if (!cancelled) setContractorContracts(mapped as any);
    })();
    return () => { cancelled = true; };
  }, [currentProject?.id]);

  // Active section (sidebar)
  const [activeSection, setActiveSection] = useState<RdoSectionKey>("detalhes");

  // Add dialogs
  const [addLaborOpen, setAddLaborOpen] = useState(false);
  const [addEquipOpen, setAddEquipOpen] = useState(false);
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [addOccurOpen, setAddOccurOpen] = useState(false);
  const [addChecklistOpen, setAddChecklistOpen] = useState(false);
  const [addCommentOpen, setAddCommentOpen] = useState(false);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingEditRequest, setPendingEditRequest] = useState(false);
  const [sendingForApproval, setSendingForApproval] = useState(false);

  // Produtividade de referência
  const [produtividadeRef, setProdutividadeRef] = useState<number | null>(null);
  const [produtividadeRefId, setProdutividadeRefId] = useState<string | null>(null);
  const equipeCalculada = useMemo(
    () => rdo.labor.reduce((sum, item) => sum + Number(item.quantidade || 0), 0),
    [rdo.labor]
  );

  const { canApprove: canApproveObra, isAdmin: isGlobalAdmin } = useCoordenadorAccess(currentProject?.id || null);
  // 'isAdmin' aqui significa "pode aprovar/corrigir sem restrição": admin global, coordenador global ou coordenador desta obra
  const isAdmin = canApproveObra;
  const isLocked = entryStatus === "finalizado" || statusAprovacao === "aprovado";
  const canEditLockedDiary = isAdmin;
  const editingDisabled = !canEdit || (isLocked && !canEditLockedDiary);
  const isDiaryOpen = Boolean(entryId);
  const diaryFormDisabled = !isDiaryOpen || editingDisabled;

  const hasLoadedDiaryData = useMemo(() => (
    diaryItems.length > 0 ||
    rdo.labor.length > 0 ||
    rdo.equipment.length > 0 ||
    rdo.activities.length > 0 ||
    rdo.occurrences.length > 0 ||
    rdo.checklist.length > 0 ||
    rdo.comments.length > 0 ||
    rdo.videos.length > 0 ||
    rdo.attachments.length > 0 ||
    dWorkers.workers.length > 0 ||
    fotos.length > 0 ||
    obsGeral.trim().length > 0
  ), [
    diaryItems.length,
    rdo.labor.length,
    rdo.equipment.length,
    rdo.activities.length,
    rdo.occurrences.length,
    rdo.checklist.length,
    rdo.comments.length,
    rdo.videos.length,
    rdo.attachments.length,
    dWorkers.workers.length,
    fotos.length,
    obsGeral,
  ]);

  const canCancelEmptyDiary = Boolean(
    entryId &&
    !editingDisabled &&
    statusAprovacao === "preenchendo" &&
    entryStatus !== "finalizado" &&
    !hasLoadedDiaryData
  );

  // Verifica se há solicitação de edição pendente para este RDO
  useEffect(() => {
    if (!entryId) { setPendingEditRequest(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("diary_edit_requests")
        .select("id, status, unlocked_until")
        .eq("diary_entry_id", entryId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const last = data?.[0];
      setPendingEditRequest(last?.status === "pendente");
    })();
    // realtime para refletir aprovação/rejeição
    const ch = supabase
      .channel(`rdo-edit-req-${entryId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "diary_edit_requests", filter: `diary_entry_id=eq.${entryId}` },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (row?.status === "pendente") setPendingEditRequest(true);
          else if (row?.status === "aprovado") {
            setPendingEditRequest(false);
            toast.success("Sua solicitação de edição foi APROVADA. O relatório está liberado por 24h.");
          } else if (row?.status === "rejeitado") {
            setPendingEditRequest(false);
            toast.info("Sua solicitação de edição foi rejeitada pelo administrador.");
          }
        })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [entryId]);

  const handleSendForApproval = async () => {
    if (!entryId) return;
    if (!requireEdit()) return;
    // Verifica serviços sem foto e pede confirmação ao usuário
    try {
      const itemIds = diaryItems.map(i => i.id);
      if (itemIds.length > 0) {
        const { data: photoRows } = await supabase
          .from("diary_photos")
          .select("diary_item_id, house_number")
          .in("diary_item_id", itemIds);
        const photosByItem = new Map<string, Set<number | null>>();
        (photoRows || []).forEach((p: any) => {
          if (!photosByItem.has(p.diary_item_id)) photosByItem.set(p.diary_item_id, new Set());
          photosByItem.get(p.diary_item_id)!.add(p.house_number ?? null);
        });
        const semFoto = diaryItems.flatMap(i => {
          const linked = photosByItem.get(i.id) || new Set<number | null>();
          if (linked.has(null)) return [];
          return (i.house_ids || [])
            .filter(h => !linked.has(h))
            .map(h => ({
              house: h,
              macroName: i.macro_name,
              scopeName: i.scope_name,
            }));
        });
        if (semFoto.length > 0) {
          setApprovalMissingPhotoWarnings(semFoto);
          setApprovalWarningsOpen(true);
          return;
        }
      }
    } catch {/* não bloqueia envio se a verificação falhar */}
    // Abre confirmação de pluviometria — engenharia exige fechamento desse índice
    setConfirmRainOpen(true);
  };

  const handleContinueApprovalWithWarnings = () => {
    setApprovalWarningsOpen(false);
    setConfirmRainOpen(true);
  };

  const handleConfirmRainAndSend = async (mmFinal: number) => {
    if (!entryId) return;
    if (!requireEdit()) return;
    setSendingForApproval(true);
    try {
      const { error } = await supabase
        .from("diary_entries")
        .update({
          mm_chuva: mmFinal,
          status_aprovacao: "revisando",
        } as any)
        .eq("id", entryId);
      if (error) {
        toast.error("Erro ao enviar: " + error.message);
        return;
      }
      setClimaState(prev => ({ ...prev, mmChuva: mmFinal }));
      setStatusAprovacao("revisando");
      toast.success("RDO enviado ao coordenador para revisão e aprovação.");

      // ── Notificar coordenador da obra (in-app + e-mail via trigger) ──
      try {
        if (currentProject?.id && company?.id) {
          // Busca coordenador específico da obra; fallback: admins (user_id null)
          const { data: projData } = await (supabase as any)
            .from("projects")
            .select("coordenador_user_id, name")
            .eq("id", currentProject.id)
            .maybeSingle();

          // Tenta vincular à obra do portfólio (necessário pelo NOT NULL de obra_id).
          const { data: obra } = await (supabase as any)
            .from("obras_portfolio")
            .select("id, nome")
            .eq("obramap_project_id", currentProject.id)
            .maybeSingle();

          if (obra?.id) {
            const dateFmt = format(parseISO(entryDate), "dd/MM/yyyy", { locale: ptBR });
            const projName = projData?.name || currentProject.name || "Obra";
            const autor = profile?.display_name || user?.email || "Usuário";
            await (supabase as any).from("system_notifications").insert({
              company_id: company.id,
              obra_id: obra.id,
              tipo: "rdo_aguardando_aprovacao",
              titulo: `RDO aguardando aprovação — ${projName}`,
              mensagem: `${autor} enviou o Diário de Obras de ${dateFmt} para revisão e aprovação.`,
              modulo: "diario",
              user_id: projData?.coordenador_user_id || null,
            });
          }
        }
      } catch (notifyErr) {
        console.warn("[DiarioObraView] Falha ao notificar coordenador:", notifyErr);
      }
    } finally {
      setSendingForApproval(false);
    }
  };

  const macros = useMemo(() => {
    const template = currentProject?.macrosTemplate || [];
    if (!houses.length) return template;
    return template.filter(macro =>
      (macro.scopes || []).some(scope =>
        houses.some(house => {
          const hMacros = (house.macros as any[]) || [];
          const hMacro = hMacros.find((m: any) => m.id === macro.id);
          const hScope = hMacro?.scopes?.find((s: any) => s.id === scope.id);
          return (hScope?.progress || 0) < 100;
        })
      )
    );
  }, [currentProject, houses]);

  // Carrega informações do projeto (endereço, residente, prazos)
  useEffect(() => {
    if (!currentProject?.id) return;
    (async () => {
      const { data: projData } = await supabase
        .from("projects")
        .select("location, municipio, estado, lat, lng")
        .eq("id", currentProject.id)
        .maybeSingle();

      let residente: string | null = null;
      try {
        const { data: obra } = await (supabase as any)
          .from("obras_portfolio")
          .select("engenheiro_residente_nome")
          .eq("ple_project_id", currentProject.id)
          .maybeSingle();
        residente = obra?.engenheiro_residente_nome || null;
      } catch { /* opcional */ }

      const proj = projData as any;
      const loc = proj?.location ||
        (proj?.municipio ? `${proj.municipio}${proj.estado ? "/" + proj.estado : ""}` : null);

      setProjectInfo({
        location: loc,
        contractor: null, // legado — agora vem de legalConfig
        engenheiroResidente: residente,
        startDate: null,
        endDate: null,
        lat: proj?.lat != null ? Number(proj.lat) : null,
        lng: proj?.lng != null ? Number(proj.lng) : null,
      });
    })();
  }, [currentProject?.id]);

  // Load existing entry for selected date
  useEffect(() => {
    if (!currentProject?.id || !user?.id) return;
    setLoadingEntry(true);
    autosaveHydratedRef.current = false;
    loadEntry();
  }, [currentProject?.id, user?.id, entryDate]);

  const loadFotos = async (eId: string) => {
    const { data: fotosData } = await supabase
      .from("diary_photos")
      .select("id, storage_path, legenda, diary_item_id, house_number")
      .eq("diary_entry_id", eId)
      .order("created_at", { ascending: true });
    if (!fotosData || fotosData.length === 0) {
      setFotos([]); setFotosPorServico({}); return;
    }
    const itemIds = Array.from(new Set(fotosData.map((f: any) => f.diary_item_id).filter(Boolean)));
    const itemInfoById = new Map<string, { macro_name: string | null; scope_name: string | null }>();
    if (itemIds.length > 0) {
      const { data: itemInfo } = await (supabase as any)
        .from("diary_items")
        .select("id, macro_name, scope_name")
        .in("id", itemIds)
        .is("deleted_at", null);
      (itemInfo || []).forEach((item: any) => {
        itemInfoById.set(item.id, {
          macro_name: item.macro_name || null,
          scope_name: item.scope_name || null,
        });
      });
    }
    const fotosComUrl = await Promise.all(
      fotosData.map(async (f) => {
        const { data: signed } = await (supabase.storage
          .from("diary-photos") as any).createSignedUrl(f.storage_path, 60 * 60, {
            transform: { width: 900, resize: "contain", quality: 70 },
          });
        const diaryItemId = (f as any).diary_item_id as string | null;
        const itemInfo = diaryItemId ? itemInfoById.get(diaryItemId) : null;
        return {
          id: f.id, storage_path: f.storage_path, legenda: f.legenda,
          url: signed?.signedUrl || "",
          diary_item_id: diaryItemId,
          house_number: (f as any).house_number ?? null,
          macro_name: itemInfo?.macro_name ?? null,
          scope_name: itemInfo?.scope_name ?? null,
        };
      })
    );
    // A galeria geral consolida fotos avulsas e fotos vinculadas a serviços.
    const fotosVisiveis = fotosComUrl.filter(f => !f.diary_item_id || itemInfoById.has(f.diary_item_id));
    setFotos(fotosVisiveis);
    // Por serviço — agrupa para uso no PDF
    const byService: Record<string, { url: string; legenda: string | null }[]> = {};
    fotosVisiveis.forEach(f => {
      if (!f.diary_item_id) return;
      if (!byService[f.diary_item_id]) byService[f.diary_item_id] = [];
      byService[f.diary_item_id].push({ url: f.url, legenda: f.legenda });
    });
    setFotosPorServico(byService);
  };

  const tryAutoFillClima = async (eId: string | null) => {
    if (!currentProject?.id) return;
    try {
      const { data: projData } = await supabase
        .from("projects")
        .select("lat, lng, municipio, estado")
        .eq("id", currentProject.id).maybeSingle();
      if (!projData) return;
      let coords: { lat: number; lng: number } | null = null;
      if (projData.lat != null && projData.lng != null) {
        coords = { lat: Number(projData.lat), lng: Number(projData.lng) };
      } else if (projData.municipio) {
        coords = await geocodeMunicipio(projData.municipio, projData.estado || "RS");
        if (coords) {
          await supabase.from("projects")
            .update({ lat: coords.lat, lng: coords.lng })
            .eq("id", currentProject.id);
        }
      }
      if (!coords) return;
      const climaAuto = await fetchClimaHoje(coords.lat, coords.lng, entryDate);
      if (climaAuto) {
        const turno = legacyToTurno(climaAuto.codigo);
        setClimaState(prev => ({
          ...prev,
          climaManha: turno,
          climaTarde: turno,
          // Pré-preenche pluviometria do Open-Meteo apenas se ainda não houver leitura manual
          mmChuva: prev.mmChuva == null ? Number(climaAuto.mm_chuva ?? 0) : prev.mmChuva,
        }));
        setClimaAutoPreenchido(true);
        if (eId) {
          await supabase.from("diary_entries").update({
            clima: climaAuto.codigo,
            clima_manha: turno,
            clima_tarde: turno,
            mm_chuva: climaAuto.mm_chuva ?? 0,
          }).eq("id", eId);
        }
      }
    } catch (err) {
      console.warn("[DiarioObra] Falha clima automático:", err);
    }
  };

  const loadEntry = async () => {
    if (!currentProject?.id || !user?.id) return;
    const requestId = ++loadEntryRequestRef.current;
    setLoadingEntry(true);
    autosaveHydratedRef.current = false;
    const { data } = await supabase
      .from("diary_entries")
      .select("id, clima, equipe_presente, observacao_geral, status, num_relatorio, mm_chuva, noite_ativa, clima_manha, clima_tarde, clima_noite, condicao_manha, condicao_tarde, condicao_noite, status_aprovacao, created_at, updated_at, engineer_name")
      .eq("project_id", currentProject.id)
      .eq("entry_date", entryDate)
      .maybeSingle();

    if (requestId !== loadEntryRequestRef.current) return;

    if (data) {
      setEntryId(data.id);
      setEquipePres(data.equipe_presente || 0);
      setObsGeral(data.observacao_geral || "");
      setEntryStatus(data.status || "rascunho");
      setStatusAprovacao(((data as any).status_aprovacao || "preenchendo") as StatusAprovacao);
      setEntryMeta({
        created_at: (data as any).created_at || null,
        updated_at: (data as any).updated_at || null,
        engineer_name: (data as any).engineer_name || null,
      });
      setNumRelatorio((data as any).num_relatorio ?? null);
      setClimaState({
        noiteAtiva: !!(data as any).noite_ativa,
        climaManha: legacyToTurno((data as any).clima_manha || data.clima),
        climaTarde: legacyToTurno((data as any).clima_tarde || data.clima),
        climaNoite: (data as any).clima_noite ? legacyToTurno((data as any).clima_noite) : null,
        condicaoManha: ((data as any).condicao_manha || "praticavel") as any,
        condicaoTarde: ((data as any).condicao_tarde || "praticavel") as any,
        condicaoNoite: ((data as any).condicao_noite || null) as any,
        mmChuva: (data as any).mm_chuva ?? null,
      });
      setClimaAutoPreenchido(false);
      autosaveHydratedRef.current = true;
      setLoadingEntry(false);
      const { data: correcoes } = await supabase
        .from("diary_item_corrections")
        .select("tipo, macro_name, scope_name, house_ids_anterior, house_ids_posterior, percentual_anterior, percentual_posterior, justificativa, corrigido_por_nome, created_at")
        .eq("diary_entry_id", data.id)
        .order("created_at", { ascending: false });
      setCorrecoesDoDia(correcoes || []);
      loadItems(data.id);
      loadFotos(data.id);
      if (!data.clima && !(data as any).clima_manha) {
        tryAutoFillClima(data.id);
      }
      // Registrar visualização (upsert para evitar duplicatas)
      if (user?.id && company?.id) {
        try {
          await (supabase as any).from("diary_views").upsert({
            company_id: company.id,
            diary_entry_id: data.id,
            user_id: user.id,
            user_nome: profile?.display_name || user.email || "Usuário",
            viewed_at: new Date().toISOString(),
          }, { onConflict: "diary_entry_id,user_id" });
        } catch { /* silencioso */ }
      }
    } else {
      setEntryId(null);
      setEquipePres(0);
      setObsGeral("");
      setEntryStatus("rascunho");
      setStatusAprovacao("preenchendo");
      setEntryMeta({ created_at: null, updated_at: null, engineer_name: null });
      setNumRelatorio(null);
      setClimaState(DEFAULT_CLIMA);
      setDiaryItems([]);
      setCorrecoesDoDia([]);
      setFotos([]);
      setClimaAutoPreenchido(false);
      autosaveHydratedRef.current = true;
      setLoadingEntry(false);
      tryAutoFillClima(null);
    }
  };

  const loadItems = async (eId: string) => {
    setLoadingItems(true);
    const { data } = await (supabase as any)
      .from("diary_items")
      .select("id, macro_id, macro_name, macro_color, scope_id, scope_name, house_ids, houses_count, percentual_executado, observacao, production_id, contractor_contract_id")
      .eq("diary_entry_id", eId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setDiaryItems((data || []).map((d: any) => ({
      id: d.id, macro_id: d.macro_id, macro_name: d.macro_name, macro_color: d.macro_color,
      scope_id: d.scope_id, scope_name: d.scope_name, house_ids: d.house_ids || [],
      houses_count: d.houses_count, percentual_executado: Number(d.percentual_executado),
      observacao: d.observacao, production_id: d.production_id,
      contractor_contract_id: d.contractor_contract_id ?? null,
    })));
    setLoadingItems(false);
  };

  // Upload de fotos
  const handleUploadFotos = async (e: React.ChangeEvent<HTMLInputElement>, source: "camera" | "gallery" = "gallery") => {
    if (!requireEdit()) {
      e.target.value = "";
      return;
    }
    if (!entryId) {
      toast.error("Abra o diário deste dia antes de adicionar fotos.");
      e.target.value = "";
      return;
    }
    const resolvedEntryId = entryId;
    if (!resolvedEntryId || !e.target.files?.length || !company?.id) return;
    setUploadingFoto(true);
    try {
      const arquivos = Array.from(e.target.files).slice(0, 10 - fotos.length);
      let uploaded = 0;
      for (const arquivo of arquivos) {
        const isCamera = source === "camera";
        const payload = isCamera ? arquivo : await comprimirImagem(arquivo, 1024, 0.7);
        const safeName = arquivo.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const ext = isCamera ? (arquivo.type.includes("png") ? "png" : arquivo.type.includes("webp") ? "webp" : "jpg") : "jpg";
        const extSafeName = safeName.includes(".") ? safeName.replace(/\.[^.]+$/, `.${ext}`) : `${safeName}.${ext}`;
        const contentType = isCamera ? (arquivo.type || "image/jpeg") : "image/jpeg";
        const path = `${company.id}/${resolvedEntryId}/${Date.now()}_${extSafeName}`;
        const { error: uploadError } = await supabase.storage
          .from("diary-photos")
          .upload(path, payload, { contentType, upsert: false });
        if (uploadError) throw uploadError;
        const { error: dbError } = await supabase.from("diary_photos").insert({
          diary_entry_id: resolvedEntryId,
          storage_path: path,
          legenda: null,
        });
        if (dbError) {
          await supabase.storage.from("diary-photos").remove([path]);
          throw dbError;
        }
        uploaded++;
      }
      await loadFotos(resolvedEntryId);
      toast.success(`${uploaded} foto(s) enviada(s).`);
    } catch (err: any) {
      toast.error("Erro ao enviar foto: " + (err.message || ""));
    } finally {
      setUploadingFoto(false);
      e.target.value = "";
    }
  };

  const handleRemoverFoto = async (fotoId: string, storagePath: string) => {
    if (!requireEdit()) return;
    try {
      await supabase.storage.from("diary-photos").remove([storagePath]);
      await supabase.from("diary_photos").delete().eq("id", fotoId);
      setFotos(prev => prev.filter(f => f.id !== fotoId));
      toast.success("Foto removida.");
    } catch {
      toast.error("Erro ao remover foto.");
    }
  };

  const handleSalvarLegendaFoto = async () => {
    if (!fotoAmpliada || !entryId || !requireEdit()) return;
    setSavingFotoLegenda(true);
    try {
      const legenda = fotoLegendaDraft.trim() || null;
      const { error } = await supabase
        .from("diary_photos")
        .update({ legenda } as any)
        .eq("id", fotoAmpliada.id);
      if (error) throw error;
      setFotoAmpliada({ ...fotoAmpliada, legenda });
      await loadFotos(entryId);
      toast.success("Legenda salva.");
    } catch (err: any) {
      toast.error("Erro ao salvar legenda: " + (err.message || ""));
    } finally {
      setSavingFotoLegenda(false);
    }
  };

  // Produtividade de referência
  useEffect(() => {
    if (!selectedScope?.id || !company?.id) {
      setProdutividadeRef(null); setProdutividadeRefId(null); return;
    }
    (async () => {
      const { data } = await supabase
        .from("service_productivities")
        .select("id, base_productivity")
        .eq("company_id", company.id)
        .eq("scope_id", selectedScope.id)
        .maybeSingle();
      if (data) {
        setProdutividadeRef(Number(data.base_productivity) || null);
        setProdutividadeRefId(data.id);
      } else {
        setProdutividadeRef(null);
        setProdutividadeRefId(null);
      }
    })();
  }, [selectedScope?.id, company?.id]);

  useEffect(() => {
    if (!currentProject?.id) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      channel = supabase
        .channel(`diary-productions-${currentProject.id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "productions",
          filter: `project_id=eq.${currentProject.id}`,
        }, (payload) => {
          if (payload.new && (payload.new as any).created_by !== user?.id) {
            setRealtimeCount(prev => prev + 1);
          }
        })
        .on("postgres_changes", {
          event: "*", schema: "public", table: "diary_items",
          filter: entryId ? `diary_entry_id=eq.${entryId}` : undefined,
        }, async () => {
          await loadEntry();
          await refreshHousesFromDB();
        })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "diary_entries",
          filter: `project_id=eq.${currentProject.id}`,
        }, (payload) => {
          const next: any = payload.new;
          if (next?.id === entryId && next?.status === "finalizado") {
            setEntryStatus("finalizado");
            toast.info("Esta semana foi fechada pelo coordenador.");
          }
        })
        .subscribe();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (channel) { supabase.removeChannel(channel); channel = null; }
      } else if (!channel) {
        subscribe();
        // Reload garante que nada foi perdido enquanto o canal estava pausado
        void loadEntry();
        void refreshHousesFromDB();
      }
    };

    subscribe();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentProject?.id, user?.id, entryId, refreshHousesFromDB]);

  // Contencao: nao chamar recompute_house_progress_from_diary automaticamente.
  // A RPC antiga recalcula houses.macros apenas por diary_items e pode apagar
  // visualmente producao legitima vinda de weekly_productions/productions.
  useEffect(() => {
    if (!currentProject?.id) return;
    // 1) Quando volta online, apenas recarrega o estado consolidado atual.
    const onOnline = () => {
      void refreshHousesFromDB();
      queryClient.invalidateQueries({ queryKey: ["houses"] });
    };
    window.addEventListener("online", onOnline);

    // 2) Quando o sync worker termina, apenas sincroniza a UI com o banco.
    const unsub = subscribeSync((ev) => {
      if (ev.type === "done" && ev.synced > 0) {
        void refreshHousesFromDB();
      }
    });

    return () => {
      window.removeEventListener("online", onOnline);
      unsub();
    };
  }, [currentProject?.id, refreshHousesFromDB, queryClient]);

  useEffect(() => {
    setEquipePres(equipeCalculada);
    if (!entryId) return;
    void supabase.from("diary_entries").update({ equipe_presente: equipeCalculada }).eq("id", entryId);
  }, [equipeCalculada, entryId]);

  const buildClimaPayload = useCallback(() => ({
    clima_manha: climaState.climaManha,
    clima_tarde: climaState.climaTarde,
    clima_noite: climaState.climaNoite,
    condicao_manha: climaState.condicaoManha,
    condicao_tarde: climaState.condicaoTarde,
    condicao_noite: climaState.condicaoNoite,
    noite_ativa: climaState.noiteAtiva,
    mm_chuva: climaState.mmChuva,
    clima: climaState.climaManha === "chuvoso" ? "chuva_fraca"
      : climaState.climaManha === "nublado" ? "nublado" : "sol",
  }), [climaState]);

  const ensureEntryExists = useCallback(async () => {
    if (entryId) return entryId;
    if (!requireEdit()) return null;
    if (!currentProject?.id || !user?.id || !company?.id) return null;

    try {
      const result = await createDiaryEntryAware({
        project_id: currentProject.id,
        company_id: company.id,
        user_id: user.id,
        data: entryDate,
        payload: {
          engineer_id: user.id,
          engineer_name: profile?.display_name || user.email || "Engenheiro",
          entry_date: entryDate,
          equipe_presente: equipePres,
          observacao_geral: obsGeral || null,
          ...buildClimaPayload(),
        },
      });

      setEntryId(result.id);
      if (result.mode === "online") {
        setNumRelatorio(result.num_relatorio ?? null);
        setEntryStatus("rascunho");
        setStatusAprovacao("preenchendo");
        setEntryMeta({
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          engineer_name: profile?.display_name || user.email || null,
        });
      } else {
        // Modo offline: número do relatório só é gerado pelo servidor
        setNumRelatorio(null);
        setEntryStatus("rascunho");
        setStatusAprovacao("preenchendo");
        setEntryMeta({
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          engineer_name: profile?.display_name || user.email || null,
        });
        toast.info("Sem internet — relatório salvo no celular. Será enviado quando a conexão voltar.");
      }
      return result.id;
    } catch (error: any) {
      toast.error("Erro ao iniciar relatório: " + (error.message || ""));
      return null;
    }
  }, [entryId, requireEdit, currentProject?.id, user?.id, company?.id, profile?.display_name, user?.email, entryDate, equipePres, obsGeral, buildClimaPayload]);

  const handleOpenDiary = useCallback(async () => {
    const ensuredEntryId = await ensureEntryExists();
    if (ensuredEntryId) {
      toast.success("Diário aberto. A numeração foi definida automaticamente.");
      await loadEntry();
    }
  }, [ensureEntryExists]);

  const checkDiaryHasPersistedData = useCallback(async (eId: string) => {
    const activeCounts = await Promise.all([
      supabase.from("diary_items").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId).is("deleted_at", null),
      supabase.from("diary_labor").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId).is("deleted_at", null),
      supabase.from("diary_equipment").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId).is("deleted_at", null),
      supabase.from("diary_activities").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId).is("deleted_at", null),
      supabase.from("diary_occurrences").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId).is("deleted_at", null),
      supabase.from("diary_checklist").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId).is("deleted_at", null),
      supabase.from("diary_comments").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId).is("deleted_at", null),
    ]);

    const otherCounts = await Promise.all([
      supabase.from("diary_photos").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId),
      supabase.from("diary_attachments").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId),
      supabase.from("diary_signatures").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId),
      supabase.from("diary_workers").select("id", { count: "exact", head: true }).eq("diary_entry_id", eId),
    ]);

    const results = [...activeCounts, ...otherCounts];
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;

    return results.some((result) => (result.count || 0) > 0);
  }, []);

  const handleCancelEmptyDiary = useCallback(async () => {
    if (!entryId) return;
    if (!requireEdit()) return;
    if (statusAprovacao !== "preenchendo" || entryStatus === "finalizado") {
      setCancelBlockedOpen(true);
      return;
    }

    try {
      const hasPersistedData = await checkDiaryHasPersistedData(entryId);
      if (hasPersistedData || obsGeral.trim()) {
        setCancelBlockedOpen(true);
        return;
      }

      setCancelEmptyOpen(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      toast.error("Não foi possível verificar o diário: " + message);
    }
  }, [entryId, requireEdit, statusAprovacao, entryStatus, checkDiaryHasPersistedData, obsGeral]);

  const confirmCancelEmptyDiary = useCallback(async () => {
    if (!entryId) return;
    if (!requireEdit()) return;
    setCancelingEmptyDiary(true);
    try {
      const hasPersistedData = await checkDiaryHasPersistedData(entryId);
      if (hasPersistedData || obsGeral.trim()) {
        setCancelEmptyOpen(false);
        setCancelBlockedOpen(true);
        return;
      }

      const { error } = await supabase.from("diary_entries").delete().eq("id", entryId);
      if (error) throw error;

      setEntryId(null);
      setNumRelatorio(null);
      setEntryStatus("rascunho");
      setStatusAprovacao("preenchendo");
      setObsGeral("");
      setEquipePres(0);
      setFotos([]);
      setFotosPorServico({});
      setDiaryItems([]);
      setCorrecoesDoDia([]);
      setEntryMeta({} as unknown as { created_at: string; updated_at: string; engineer_name: string });
      await rdo.reload(null);
      await dWorkers.reload(null);
      setCancelEmptyOpen(false);
      toast.success("Abertura do diário cancelada.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      toast.error("Não foi possível cancelar a abertura: " + message);
    } finally {
      setCancelingEmptyDiary(false);
    }
  }, [entryId, requireEdit, checkDiaryHasPersistedData, obsGeral, rdo, dWorkers]);

  const openDialogWithEntry = useCallback(async (openDialog: () => void) => {
    if (!entryId) {
      toast.error("Abra o diário deste dia antes de preencher esta seção.");
      return;
    }
    openDialog();
  }, [entryId]);

  const handleOpenFotoPicker = useCallback(async () => {
    if (!entryId) {
      toast.error("Abra o diário deste dia antes de adicionar fotos.");
      return;
    }
    setPhotoSourceOpen(true);
  }, [entryId]);

  const handlePickPhotoSource = useCallback((source: "camera" | "gallery") => {
    setPhotoSourceOpen(false);
    if (source === "camera" && entryId && company?.id) {
      try {
        sessionStorage.setItem("obramap_route_state_root", JSON.stringify({ activeView: "diario-obra" }));
        sessionStorage.setItem("obramap_diario_tab", JSON.stringify({ tab: "editor", selectedDate: entryDate }));
      } catch { /* noop */ }
      // Câmera inline — sem navegar para outra página
      inlineCameraInputRef.current?.click();
    } else {
      galleryInputRef.current?.click();
    }
  }, [company?.id, entryDate, entryId, navigate]);

  // Save header (cabeçalho + clima novo)
  const handleSaveHeader = async () => {
    if (!currentProject?.id || !user?.id || !company?.id) return;
    if (!requireEdit()) return;
    setSavingHeader(true);
    try {
      const climaPayload = buildClimaPayload();

      const savedEntryId = entryId;
      if (entryId) {
        await supabase.from("diary_entries").update({
          equipe_presente: equipePres,
          observacao_geral: obsGeral || null,
          ...climaPayload,
        }).eq("id", entryId);
      } else {
        toast.error("Abra o diário deste dia antes de salvar o relatório.");
        return;
      }
      // Registrar log de edição
      if (savedEntryId) {
        try {
          const ua = navigator.userAgent;
          const dispositivo = /Android/i.test(ua) ? "android"
            : /iPhone|iPad|iPod/i.test(ua) ? "ios"
            : /Tablet|iPad/i.test(ua) ? "tablet" : "web";
          await (supabase as any).from("diary_edit_log").insert({
            company_id: company.id,
            diary_entry_id: savedEntryId,
            user_id: user.id,
            user_nome: profile?.display_name || user.email || "Usuário",
            user_email: user.email || null,
            dispositivo,
          });
        } catch { /* silencioso */ }
      }
      toast.success("Relatório salvo!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setSavingHeader(false);
    }
  };

  const saveHeaderSilently = useCallback(async () => {
    if (!entryId || !currentProject?.id || !user?.id || !company?.id) return;
    if (editingDisabled || autosaveSavingRef.current) return;
    autosaveSavingRef.current = true;
    setAutosaveStatus("saving");
    try {
      const climaPayload = buildClimaPayload();
      const { error } = await supabase.from("diary_entries").update({
        equipe_presente: equipePres,
        observacao_geral: obsGeral || null,
        ...climaPayload,
      }).eq("id", entryId);
      if (error) throw error;
      setAutosaveStatus("saved");
    } catch (err) {
      console.error("[DiarioObra] autosave failed", err);
      setAutosaveStatus("error");
    } finally {
      autosaveSavingRef.current = false;
    }
  }, [buildClimaPayload, company?.id, currentProject?.id, editingDisabled, entryId, equipePres, obsGeral, user?.id]);

  useEffect(() => {
    if (!entryId || editingDisabled || !autosaveHydratedRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void saveHeaderSilently();
    }, 1000);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [buildClimaPayload, editingDisabled, entryId, equipePres, obsGeral, saveHeaderSilently]);

  useEffect(() => {
    const flushAutosave = () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      void saveHeaderSilently();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushAutosave();
    };
    window.addEventListener("beforeunload", flushAutosave);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flushAutosave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [saveHeaderSilently]);

  const getProgressFor = useCallback((houseId: number, macroId: string, scopeId: string): number => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return 0;
    const hMacros = (house.macros as any[]) || [];
    const hMacro = hMacros.find((m: any) => m.id === macroId);
    const hScope = hMacro?.scopes?.find((s: any) => s.id === scopeId);
    return hScope?.progress || 0;
  }, [houses]);

  const scopesForMacro = useMemo(() => {
    if (!selectedMacro) return [];
    const macro = macros.find(m => m.id === selectedMacro.id);
    const scopes = macro?.scopes || [];
    return scopes.map(scope => {
      const totalHouses = houses.length;
      const completedHouses = houses.filter(h => getProgressFor(h.id, selectedMacro.id, scope.id) >= 100).length;
      return {
        ...scope,
        isFullyCompleted: totalHouses > 0 && completedHouses === totalHouses,
        completedHouses, totalHouses,
      };
    });
  }, [selectedMacro, macros, houses, getProgressFor]);

  const housesGroupedByQuadra = useMemo(() => {
    if (!currentProject) return [];
    const quadras = currentProject.quadras || [];
    // Fallback: sem quadras configuradas ou casas não vinculadas a nenhuma quadra,
    // exibe todas as casas em um grupo único para não bloquear o lançamento.
    if (quadras.length === 0 && houses.length > 0) {
      return [{ name: "Casas", houses: [...houses].sort((a, b) => a.id - b.id) }];
    }
    const grouped = quadras
      .map(q => ({
        name: q.name,
        houses: houses.filter(h => q.houses.includes(h.id)).sort((a, b) => a.id - b.id),
      }))
      .filter(g => g.houses.length > 0);
    // Segundo fallback: quadras existem mas nenhuma casa foi vinculada a elas
    // (ex: projeto novo ainda não configurado ou cache incompleto)
    if (grouped.length === 0 && houses.length > 0) {
      return [{ name: "Casas", houses: [...houses].sort((a, b) => a.id - b.id) }];
    }
    return grouped;
  }, [currentProject, houses]);

  const getHouseProgress = useCallback((houseId: number): number => {
    if (!selectedMacro || !selectedScope) return 0;
    return getProgressFor(houseId, selectedMacro.id, selectedScope.id);
  }, [selectedMacro, selectedScope, getProgressFor]);

  const getPctLancadoHoje = useCallback((houseId: number): number => {
    if (!selectedScope) return 0;
    return diaryItems
      .filter(item => item.scope_id === selectedScope.id && item.house_ids.includes(houseId))
      .reduce((sum, item) => sum + (item.percentual_executado || 0), 0);
  }, [diaryItems, selectedScope]);

  const toggleHouse = (houseId: number) => {
    if (getHouseProgress(houseId) >= 100) return;
    setSelectedHouses(prev => {
      const next = prev.includes(houseId) ? prev.filter(h => h !== houseId) : [...prev, houseId];
      setHousePercents(prevP => {
        const np = { ...prevP };
        if (next.includes(houseId) && np[houseId] == null) np[houseId] = percentual;
        if (!next.includes(houseId)) delete np[houseId];
        return np;
      });
      return next;
    });
  };

  const selectQuadra = (houseIds: number[]) => {
    const selectableIds = houseIds.filter(id => getHouseProgress(id) < 100);
    setSelectedHouses(prev => {
      const allSelected = selectableIds.every(id => prev.includes(id));
      const next = allSelected
        ? prev.filter(id => !selectableIds.includes(id))
        : [...new Set([...prev, ...selectableIds])];
      setHousePercents(prevP => {
        const np = { ...prevP };
        next.forEach(id => { if (np[id] == null) np[id] = percentual; });
        Object.keys(np).forEach(k => { if (!next.includes(Number(k))) delete np[Number(k)]; });
        return np;
      });
      return next;
    });
  };

  const setHousePercent = (houseId: number, value: number) => {
    setHousePercents(prev => ({ ...prev, [houseId]: Math.max(0, Math.min(100, value)) }));
  };

  const applyPercentToAll = () => {
    setHousePercents(prev => {
      const np = { ...prev };
      selectedHouses.forEach(id => { np[id] = percentual; });
      return np;
    });
  };

  const handleRegister = async () => {
    if (!requireEdit()) return;
    if (!entryId) {
      toast.error("Abra o diário deste dia antes de registrar serviços.");
      return;
    }
    if (!entryId || !selectedMacro || !selectedScope || selectedHouses.length === 0 || !currentProject?.id) {
      toast.error("Salve o cabeçalho e selecione etapa, serviço e casas.");
      return;
    }
    const casasLimitadas = selectedHouses.filter(hId => {
      const housePct = housePercents[hId] ?? percentual;
      return getHouseProgress(hId) + housePct > 100;
    });
    if (casasLimitadas.length > 0) {
      const disponivel = 100 - getHouseProgress(casasLimitadas[0]);
      toast.warning(`${casasLimitadas.length} casa(s) têm apenas ${disponivel}% disponível.`, { duration: 5000 });
    }
    if (produtividadeRef && produtividadeRef > 0 && equipePres > 0) {
      const produtividadeReal = selectedHouses.length / equipePres;
      const pct = produtividadeReal / produtividadeRef;
      if (pct > 1.5) toast.warning(`⚠️ Produtividade ${Math.round(pct * 100)}% acima do padrão.`);
      else if (pct < 0.5) toast.warning(`⚠️ Produtividade ${Math.round(pct * 100)}% abaixo do padrão.`);
    }

    setRegistering(true);
    try {
      // Garantir que a entry existe antes de criar lançamentos.
      // Só cria o diary_entry agora — quando o usuário efetivamente lança.
      const guaranteedEntryId = entryId || await ensureEntryExists();
      if (!guaranteedEntryId) {
        toast.error("Não foi possível iniciar o relatório. Tente novamente.");
        setRegistering(false);
        return;
      }

      const productionDate = entryDate;
      const isOffline = !navigator.onLine;

      // 1) productions
      const prodResult = await createProductionAware(guaranteedEntryId, {
        project_id: currentProject.id,
        macro_id: selectedMacro.id, macro_name: selectedMacro.name, macro_color: selectedMacro.color,
        scope_id: selectedScope.id, scope_name: selectedScope.name,
        house_ids: selectedHouses, houses_count: selectedHouses.length,
        production_date: productionDate, notes: obsItem || null,
        created_by: user?.id || null,
      });

      // 2) weekly_productions
      const entryDateObj = parseISO(entryDate);
      const weekStart = format(startOfWeek(entryDateObj, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(entryDateObj, { weekStartsOn: 1 }), "yyyy-MM-dd");
      await createWeeklyProductionAware(guaranteedEntryId, {
        project_id: currentProject.id, week_start: weekStart, week_end: weekEnd,
        scope_id: selectedScope.id, scope_name: selectedScope.name,
        macro_id: selectedMacro.id, macro_name: selectedMacro.name, macro_color: selectedMacro.color,
        house_ids: selectedHouses, houses_count: selectedHouses.length,
        created_by_user_id: profile?.user_id || null,
        created_by_name: profile?.display_name || null,
      });

      // 3) diary_items (vincula à production criada acima — id local quando offline)
      await createDiaryItemAware(guaranteedEntryId, prodResult.id, {
        macro_id: selectedMacro.id, macro_name: selectedMacro.name, macro_color: selectedMacro.color,
        scope_id: selectedScope.id, scope_name: selectedScope.name,
        house_ids: selectedHouses, houses_count: selectedHouses.length,
        percentual_executado: percentual, observacao: obsItem || null,
      });

      // 4) Progresso das casas — só atualiza no servidor quando online.
      // Offline: o progresso será recalculado na próxima reabertura quando os dados voltarem.
      if (!isOffline) {
        const progressMap: Record<number, number> = {};
        for (const houseId of selectedHouses) {
          const housePct = housePercents[houseId] ?? percentual;
          const currentProg = getHouseProgress(houseId);
          const remaining = 100 - currentProg;
          const addPct = Math.min(housePct, remaining);
          progressMap[houseId] = Math.min(100, currentProg + addPct);
        }
        await updateBatchScopeProgress(selectedHouses, selectedMacro.id, selectedScope.id, 100, progressMap);

        queryClient.invalidateQueries({ queryKey: ["productions"] });
        queryClient.invalidateQueries({ queryKey: ["weekly_productions"] });
        queryClient.invalidateQueries({ queryKey: ["houses"] });

        toast.success(`Registrado: ${selectedScope.name} em ${selectedHouses.length} casas`);
      } else {
        toast.success(`Salvo offline: ${selectedScope.name} em ${selectedHouses.length} casas. Sincroniza quando voltar a internet.`);
      }

      try {
        if (!isOffline && produtividadeRefId && produtividadeRef && equipePres > 0) {
          const produtividadeReal = selectedHouses.length / equipePres;
          if (produtividadeReal > 0) {
            const novaMedia = produtividadeRef * 0.8 + produtividadeReal * 0.2;
            await supabase.from("service_productivities")
              .update({ base_productivity: Math.round(novaMedia * 100) / 100 })
              .eq("id", produtividadeRefId);
            setProdutividadeRef(Math.round(novaMedia * 100) / 100);
          }
        }
      } catch { /* silencioso */ }

      setSelectedHouses([]); setHousePercents({}); setObsItem(""); setPercentual(100);
      if (!isOffline) loadItems(guaranteedEntryId);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("Capacidade excedida")) {
        toast.error("Capacidade da casa excedida", { description: msg, duration: 9000 });
      } else {
        toast.error("Erro ao registrar: " + msg);
      }
    } finally {
      setRegistering(false);
    }
  };

  const [deleteRequestItem, setDeleteRequestItem] = useState<DiaryItem | null>(null);

  const handleDeleteItem = async (item: DiaryItem) => {
    if (!requireEdit()) return;
    // Engenheiro/usuário comum: precisa abrir pedido de exclusão (governança)
    if (!isAdmin) {
      setDeleteRequestItem(item);
      return;
    }
    // Admin/coordenador: soft-delete imediato com reversao de progresso.
    try {
      const nowIso = new Date().toISOString();
      const deletionReason = "Excluido pelo Diario de Obras";
      if (item.production_id) {
        const { error: productionDeleteError } = await (supabase as any)
          .from("productions")
          .update({
            deleted_at: nowIso,
            deleted_by: user?.id || null,
            deleted_reason: deletionReason,
          })
          .eq("id", item.production_id)
          .is("deleted_at", null);
        if (productionDeleteError) throw productionDeleteError;
      }

      const entryDateObj = parseISO(entryDate);
      const weekStart = format(startOfWeek(entryDateObj, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(entryDateObj, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const sameHouseSet = (left: number[] = [], right: number[] = []) => {
        if (left.length !== right.length) return false;
        const rightSet = new Set(right.map(Number));
        return left.every(houseId => rightSet.has(Number(houseId)));
      };

      const { data: weeklyCandidates, error: weeklyCandidatesError } = await (supabase as any)
        .from("weekly_productions")
        .select("id, house_ids")
        .eq("project_id", currentProject.id)
        .eq("macro_id", item.macro_id)
        .eq("scope_id", item.scope_id)
        .eq("week_start", weekStart)
        .eq("week_end", weekEnd)
        .is("deleted_at", null);
      if (weeklyCandidatesError) throw weeklyCandidatesError;

      const weeklyIdsToDelete = (weeklyCandidates || [])
        .filter((candidate: any) => sameHouseSet((candidate.house_ids || []).map(Number), item.house_ids.map(Number)))
        .map((candidate: any) => candidate.id);

      if (weeklyIdsToDelete.length > 0) {
        const { error: weeklyDeleteError } = await (supabase as any)
          .from("weekly_productions")
          .update({
            deleted_at: nowIso,
            deleted_by: user?.id || null,
            deleted_reason: deletionReason,
          })
          .in("id", weeklyIdsToDelete);
        if (weeklyDeleteError) throw weeklyDeleteError;
      } else {
        console.warn("[DiarioObra] Nenhuma weekly_production correspondente encontrada para exclusao", {
          projectId: currentProject.id,
          macroId: item.macro_id,
          scopeId: item.scope_id,
          weekStart,
          weekEnd,
          houseIds: item.house_ids,
        });
      }

      const { error: diaryDeleteError } = await (supabase as any)
        .from("diary_items")
        .update({ deleted_at: nowIso, deleted_by: user?.id || null })
        .eq("id", item.id)
        .is("deleted_at", null);
      if (diaryDeleteError) throw diaryDeleteError;
      const revertMap: Record<number, number> = {};
      for (const houseId of item.house_ids) {
        const house = houses.find(h => h.id === houseId);
        const hMacros = (house?.macros as any[]) || [];
        const hMacro = hMacros.find((m: any) => m.id === item.macro_id);
        const hScope = hMacro?.scopes?.find((s: any) => s.id === item.scope_id);
        const current = hScope?.progress || 0;
        revertMap[houseId] = Math.max(0, current - item.percentual_executado);
      }
      await updateBatchScopeProgress(item.house_ids, item.macro_id, item.scope_id, 100, revertMap);
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      queryClient.invalidateQueries({ queryKey: ["weekly_productions"] });
      queryClient.invalidateQueries({ queryKey: ["houses"] });
      toast.success("Item removido e progresso revertido.");
      if (entryId) {
        loadItems(entryId);
        loadFotos(entryId);
      }
    } catch (err: any) {
      toast.error("Erro ao remover: " + (err.message || ""));
    }
  };

  // ─── Edição de lançamento (somente antes de "Enviar para aprovação")
  const [editItem, setEditItem] = useState<EditableDiaryItem | null>(null);

  const handleApplyEditItem = useCallback(async (params: {
    item: EditableDiaryItem;
    newHouseIds: number[];
    newPercent: number;
    newObs: string;
    housePercents?: Record<number, number>;
  }) => {
    if (!requireEdit()) return;
    const { item, newHouseIds, newPercent, newObs, housePercents } = params;

    // Resolve o percentual a aplicar em cada casa: usa per-casa quando vier,
    // caso contrário usa o valor único (newPercent) para todas.
    const pctFor = (houseId: number) =>
      housePercents && housePercents[houseId] != null
        ? Number(housePercents[houseId])
        : newPercent;

    // 1) Reverte o item antigo casa-a-casa (sempre o percentual original do item)
    const revertMap: Record<number, number> = {};
    for (const houseId of item.house_ids) {
      const house = houses.find(h => h.id === houseId);
      const hMacros = (house?.macros as any[]) || [];
      const hMacro = hMacros.find((m: any) => m.id === item.macro_id);
      const hScope = hMacro?.scopes?.find((s: any) => s.id === item.scope_id);
      const current = hScope?.progress || 0;
      revertMap[houseId] = Math.max(0, current - item.percentual_executado);
    }
    await updateBatchScopeProgress(item.house_ids, item.macro_id, item.scope_id, 100, revertMap);

    // O diary_items grava UM percentual (representativo). Quando há valores
    // por casa, salvamos a MÉDIA — o valor real por casa fica nas houses.
    const avgPct = housePercents && newHouseIds.length > 0
      ? Math.round(newHouseIds.reduce((s, id) => s + pctFor(id), 0) / newHouseIds.length)
      : newPercent;

    // 2) Atualiza diary_items + production
    const { error: updErr } = await supabase
      .from("diary_items")
      .update({
        house_ids: newHouseIds,
        houses_count: newHouseIds.length,
        percentual_executado: avgPct,
        observacao: newObs || null,
      } as any)
      .eq("id", item.id);
    if (updErr) throw updErr;

    if (item.production_id) {
      await supabase
        .from("productions")
        .update({ house_ids: newHouseIds, percentage: avgPct } as any)
        .eq("id", item.production_id);
    }

    // 3) Aplica o novo a partir do baseline já revertido (per-house quando houver)
    const applyMap: Record<number, number> = {};
    for (const houseId of newHouseIds) {
      const house = houses.find(h => h.id === houseId);
      const hMacros = (house?.macros as any[]) || [];
      const hMacro = hMacros.find((m: any) => m.id === item.macro_id);
      const hScope = hMacro?.scopes?.find((s: any) => s.id === item.scope_id);
      let baseline = hScope?.progress || 0;
      if (revertMap[houseId] !== undefined) baseline = revertMap[houseId];
      applyMap[houseId] = Math.min(100, baseline + pctFor(houseId));
    }
    await updateBatchScopeProgress(newHouseIds, item.macro_id, item.scope_id, 100, applyMap);

    queryClient.invalidateQueries({ queryKey: ["productions"] });
    queryClient.invalidateQueries({ queryKey: ["weekly_productions"] });
    queryClient.invalidateQueries({ queryKey: ["houses"] });
    if (entryId) await loadItems(entryId);
  }, [requireEdit, houses, updateBatchScopeProgress, queryClient, entryId]);

  const summaryStats = useMemo(() => {
    const totalServicos = diaryItems.length;
    const servicosConcluidos = diaryItems.filter(it => it.percentual_executado >= 100).length;
    const casasUnicas = new Set<number>();
    diaryItems.forEach(it => it.house_ids.forEach(h => casasUnicas.add(h)));
    return {
      totalServicos, servicosConcluidos,
      casasTrabalhadas: casasUnicas.size, totalCasas: houses.length,
      totalFotos: fotos.length,
    };
  }, [diaryItems, houses.length, fotos.length]);

  const buildPrintData = useCallback(async (): Promise<DiarioPDFData | null> => {
    if (!entryId || !currentProject) return null;
    const [{ data: projData }, { data: companyData }] = await Promise.all([
      supabase.from("projects").select("logo_url, location, municipio, estado").eq("id", currentProject.id).maybeSingle(),
      company?.id ? supabase.from("companies").select("logo_url").eq("id", company.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const logoUrl = projData?.logo_url || (companyData as any)?.logo_url || null;
    const { count } = await supabase.from("diary_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", currentProject.id).lte("entry_date", entryDate);
    const reportNumber = numRelatorio || count || null;
    const photoUrls = Array.from(new Set(
      fotos
        .filter((f) => !f.diary_item_id && f.url)
        .map((f) => f.url)
    ));
    const generalPhotos = Array.from(new Map(
      fotos
        .filter((f) => !f.diary_item_id && f.url)
        .map((f) => [f.url, { url: f.url, legenda: f.legenda || null }])
    ).values());
    const projectLocation = projData?.location ||
      (projData?.municipio ? `${projData.municipio}${projData.estado ? "/" + projData.estado : ""}` : null);

    // Monta legal config (com fallback para empresa cadastrada se não houver dados)
    const legal = legalConfig ? {
      pdf_template: legalConfig.pdf_template,
      contratante_tipo: legalConfig.contratante_tipo,
      contratante_nome: legalConfig.contratante_nome,
      contratante_cnpj_cpf: legalConfig.contratante_cnpj_cpf,
      contratante_orgao: legalConfig.contratante_orgao,
      contratante_endereco: legalConfig.contratante_endereco,
      contratante_municipio: legalConfig.contratante_municipio,
      contratante_estado: legalConfig.contratante_estado,
      contratada_razao_social: legalConfig.contratada_razao_social || company?.name || null,
      contratada_cnpj: legalConfig.contratada_cnpj,
      contratada_endereco: legalConfig.contratada_endereco,
      contratada_municipio: legalConfig.contratada_municipio,
      contratada_estado: legalConfig.contratada_estado,
      contrato_numero: legalConfig.contrato_numero,
      contrato_data_assinatura: legalConfig.contrato_data_assinatura,
      contrato_objeto: legalConfig.contrato_objeto,
      contrato_valor: legalConfig.contrato_valor,
      contrato_modalidade: legalConfig.contrato_modalidade,
      processo_licitatorio: legalConfig.processo_licitatorio,
      responsavel_tecnico_nome: legalConfig.responsavel_tecnico_nome,
      responsavel_tecnico_crea: legalConfig.responsavel_tecnico_crea,
      responsavel_tecnico_art: legalConfig.responsavel_tecnico_art,
      rodape_observacoes: legalConfig.rodape_observacoes,
    } : null;

    return {
      logoUrl, companyName: company?.name || "Empresa",
      projectName: currentProject.name || "Projeto",
      projectLocation, contractor: null,
      engineerName: profile?.display_name || user?.email || "Engenheiro",
      entryDate,
      clima: climaState.climaManha === "chuvoso" ? "chuva_fraca" : (climaState.climaManha === "nublado" ? "nublado" : "sol"),
      equipePresente: equipePres, observacaoGeral: obsGeral || null,
      items: diaryItems.map(it => ({
        macro_name: it.macro_name, scope_name: it.scope_name,
        house_ids: it.house_ids, percentual_executado: it.percentual_executado, observacao: it.observacao,
      })),
      correcoes: correcoesDoDia.map(c => ({
        tipo: c.tipo, macro_name: c.macro_name, scope_name: c.scope_name,
        house_ids_anterior: c.house_ids_anterior, house_ids_posterior: c.house_ids_posterior,
        percentual_anterior: c.percentual_anterior, percentual_posterior: c.percentual_posterior,
        justificativa: c.justificativa, corrigido_por_nome: c.corrigido_por_nome,
      })),
      photoUrls, generalPhotos, reportNumber, legal,
      videos: rdo.videos
        .filter((video) => video.url)
        .map((video) => ({
          url: video.url,
          nome_original: video.nome_original,
          storage_path: video.storage_path,
        })),
      photosByService: diaryItems
        .filter(it => fotosPorServico[it.id]?.length)
        .map(it => ({
          macro_name: it.macro_name,
          scope_name: it.scope_name,
          macro_color: it.macro_color,
          house_ids: it.house_ids,
          percentual_executado: it.percentual_executado,
          photos: Array.from(new Map(
            fotosPorServico[it.id]
              .filter((foto) => foto.url)
              .map((foto) => [foto.url, foto])
          ).values()),
        })),
    };
  }, [entryId, currentProject, company, profile, user, entryDate, climaState, equipePres, obsGeral, diaryItems, correcoesDoDia, fotos, fotosPorServico, rdo.videos, numRelatorio, legalConfig]);

  // Prazo decorrido / a vencer
  const prazoInfo = useMemo(() => {
    if (!projectInfo.startDate || !projectInfo.endDate) return null;
    const today = new Date();
    const start = parseISO(projectInfo.startDate);
    const end = parseISO(projectInfo.endDate);
    const decorrido = Math.max(0, differenceInDays(today, start));
    const aVencer = Math.max(0, differenceInDays(end, today));
    return { decorrido, aVencer };
  }, [projectInfo]);

  // Counts para sidebar
  const counts = useMemo(() => ({
    labor: rdo.labor.length,
    equipment: rdo.equipment.length,
    activities: rdo.activities.length + diaryItems.length, // produção física + descritivas
    occurrences: rdo.occurrences.length,
    checklist: rdo.checklist.length,
    comments: rdo.comments.length,
    photos: fotos.length,
    videos: rdo.videos.length,
    attachments: rdo.attachments.length,
  }), [rdo, fotos.length, diaryItems.length]);

  const navigateTo = (key: RdoSectionKey) => {
    setActiveSection(key);
    const el = document.getElementById(key);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ClipboardList className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground">Selecione uma obra para abrir o Diário.</p>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-4 w-full max-w-full min-w-0 overflow-x-hidden">
      <OfflineBanner />
      {/* HEADER do RDO */}
      <div className="bg-card border rounded-lg p-3 sm:p-4 mb-4 w-full max-w-full min-w-0 overflow-hidden">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3 sm:gap-4 min-w-0">
          <div className="flex-1 min-w-0">
            {/* Linha 1: voltar + ícone + título (sem badges para não comprimir) */}
            <div className="flex items-center gap-2 mb-1 min-w-0">
              {onBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  className="h-8 w-8 -ml-1 shrink-0"
                  title="Voltar ao calendário"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </Button>
              )}
              <ClipboardList className="h-5 w-5 text-primary shrink-0" />
              <h2 className="text-base sm:text-lg font-bold min-w-0 flex-1 truncate">
                {entryId ? "Editar relatório" : "Novo relatório"}: {format(parseISO(entryDate), "dd/MM/yyyy")}
                {numRelatorio != null && <span className="text-muted-foreground"> · n° {numRelatorio}</span>}
              </h2>
            </div>
            {/* Linha 2: status badges */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {entryStatus === "finalizado" && (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">✅ Aprovado</Badge>
              )}
              {entryStatus !== "finalizado" && statusAprovacao === "revisando" && (
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">🔍 Em revisão</Badge>
              )}
              {entryStatus !== "finalizado" && statusAprovacao === "solicitando_edicao" && (
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">⏳ Edição solicitada</Badge>
              )}
              {entryStatus !== "finalizado" && statusAprovacao === "preenchendo" && entryId && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">📝 Preenchendo</Badge>
              )}
              {pendingEditRequest && statusAprovacao !== "solicitando_edicao" && (
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">⏳ Edição solicitada</Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground min-w-0">
              {projectInfo.location && (
                <div className="flex items-center gap-1.5 min-w-0"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{projectInfo.location}</span></div>
              )}
              {legalConfig?.contratante_nome && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="shrink-0">Contratante:</span>
                  <span className="text-foreground font-medium truncate min-w-0">{legalConfig.contratante_nome}</span>
                </div>
              )}
              {(legalConfig?.contratada_razao_social || company?.name) && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="shrink-0">Contratada:</span>
                  <span className="text-foreground font-medium truncate min-w-0">{legalConfig?.contratada_razao_social || company?.name}</span>
                </div>
              )}
              {legalConfig?.contrato_numero && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileSignature className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Contrato nº <span className="text-foreground font-medium">{legalConfig.contrato_numero}</span></span>
                </div>
              )}
              {projectInfo.engenheiroResidente && (
                <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Resp.: {projectInfo.engenheiroResidente}</div>
              )}
              {prazoInfo && (
                <div className="flex items-center gap-3">
                  <span>Decorrido: <strong className="text-foreground">{prazoInfo.decorrido}d</strong></span>
                  <span>A vencer: <strong className="text-foreground">{prazoInfo.aVencer}d</strong></span>
                </div>
              )}
            </div>
            {!legalConfig?.contrato_numero && !hideLegalConfigAlert && (
              <button
                type="button"
                onClick={() => navigate("/diario-config")}
                className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <FileSignature className="h-3 w-3" />
                Configurar documentação legal do RDO →
              </button>
            )}
          </div>
          <div className="flex gap-2 shrink-0 self-start flex-wrap w-full xl:w-auto">
            {!loadingEntry && !entryId && !editingDisabled && (
              <Button onClick={handleOpenDiary} className="min-h-[40px]">
                <FileText className="h-4 w-4 mr-2" />
                Abrir Diário
              </Button>
            )}
            {canCancelEmptyDiary && (
              <Button variant="outline" onClick={handleCancelEmptyDiary} className="min-h-[40px]">
                <X className="h-4 w-4 mr-2" />
                Cancelar abertura
              </Button>
            )}
            {entryId && !editingDisabled && currentProject?.id && company?.id && (
              <ImportPreviousDayButton
                projectId={currentProject.id}
                companyId={company.id}
                currentEntryId={entryId}
                currentEntryDate={entryDate}
                isLocked={editingDisabled}
                onImported={async () => {
                  if (entryId) {
                    await rdo.reload(entryId);
                    await loadItems(entryId);
                  }
                }}
                ensureEntryExists={ensureEntryExists}
              />
            )}
            {entryId && !editingDisabled && (
              <Button onClick={handleSaveHeader} disabled={savingHeader} variant="ghost" size="sm" className="h-8 text-xs">
                {savingHeader ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar agora
              </Button>
            )}
            {entryId && !editingDisabled && (
              <span className="flex h-8 items-center px-1 text-[11px] text-muted-foreground">
                {autosaveStatus === "saving" && "Salvando..."}
                {autosaveStatus === "saved" && "Salvo"}
                {autosaveStatus === "error" && <span className="text-destructive">Erro ao salvar</span>}
                {autosaveStatus === "idle" && ""}
              </span>
            )}
            {entryId && !editingDisabled && statusAprovacao === "preenchendo" && (
              <Button
                variant="default"
                onClick={handleSendForApproval}
                disabled={sendingForApproval}
                className="min-h-[40px] bg-blue-600 hover:bg-blue-700"
              >
                {sendingForApproval ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                <span className="hidden sm:inline">Enviar para aprovação</span>
                <span className="sm:hidden">Enviar</span>
              </Button>
            )}
            {entryId && editingDisabled && !pendingEditRequest && (
              <Button
                variant="outline"
                onClick={() => setEditRequestOpen(true)}
                className="min-h-[40px] border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                <Unlock className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Solicitar edição</span>
                <span className="sm:hidden">Editar</span>
              </Button>
            )}
            {entryId && (
              <Button variant="outline" onClick={() => setPrintOpen(true)} className="min-h-[40px]">
                <Printer className="h-4 w-4 mr-2" /><span className="hidden sm:inline">Imprimir</span>
              </Button>
            )}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
        {/* CONTEÚDO PRINCIPAL */}
        <div className="space-y-4 min-w-0">
          {/* PAINEL DE RESUMO */}
          {entryId && (
            <DiarioSummaryPanel
              equipePresente={equipePres}
              totalServicos={summaryStats.totalServicos}
              servicosConcluidos={summaryStats.servicosConcluidos}
              casasTrabalhadas={summaryStats.casasTrabalhadas}
              totalCasas={summaryStats.totalCasas}
              totalFotos={summaryStats.totalFotos}
              clima={climaState.climaManha === "chuvoso" ? "chuva_fraca" : (climaState.climaManha === "nublado" ? "nublado" : "sol")}
            />
          )}

          {loadingEntry && (
            <Card className="border-muted bg-muted/20">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando diário...
                </div>
              </CardContent>
            </Card>
          )}

          {!loadingEntry && !isDiaryOpen && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-amber-900 dark:text-amber-100">Diário ainda não aberto</p>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Abra o diário deste dia para preencher clima, mão de obra, equipamentos, produção, ocorrências, checklist, comentários, fotos, vídeos e anexos.
                    </p>
                  </div>
                  {!editingDisabled && (
                    <Button onClick={handleOpenDiary} className="shrink-0">
                      <FileText className="h-4 w-4 mr-2" />
                      Abrir Diário
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* DETALHES */}
          <section id="detalhes" className="scroll-mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                  Detalhes do relatório
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Data</label>
                    <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                      className="mt-1" disabled={editingDisabled} />
                    {weekdayLabel && (
                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {weekdayLabel}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Equipe presente</label>
                    <div className="mt-1 flex min-h-10 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>
                        {equipeCalculada} colaborador(es) calculados automaticamente pela seção de mão de obra
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Observação geral</label>
                  <Textarea value={obsGeral} onChange={e => setObsGeral(e.target.value)}
                    placeholder="Observações do dia..." className="mt-1 min-h-[60px]" disabled={diaryFormDisabled} />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* CLIMA */}
          <section id="clima" className="scroll-mt-4">
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Condição climática {climaAutoPreenchido && <Badge variant="secondary" className="ml-2 text-[10px]">Auto</Badge>}
              </h3>
            </div>
            <RdoClimaSection
              value={climaState}
              onChange={(v) => { setClimaState(v); setClimaAutoPreenchido(false); }}
              disabled={diaryFormDisabled}
            />
          </section>

          {/* MÃO DE OBRA (resumo por categoria) */}
          <RdoLaborSection
            items={rdo.labor}
            onAdd={() => openDialogWithEntry(() => setAddLaborOpen(true))}
            disabled={diaryFormDisabled}
            onChanged={() => entryId && rdo.reload(entryId)}
          />

          {/* EQUIPE DO DIA (horas individuais por nome) */}
          {entryId && currentProject?.id && company?.id && (
            <RdoWorkersSection
              workers={dWorkers.workers}
              contractors={contractorContracts}
              entryId={entryId}
              companyId={company.id}
              projectId={currentProject.id}
              disabled={diaryFormDisabled}
              onChanged={() => dWorkers.reload(entryId)}
            />
          )}

          {/* EQUIPAMENTOS */}
          <RdoEquipmentSection
            items={rdo.equipment}
            onAdd={() => openDialogWithEntry(() => setAddEquipOpen(true))}
            disabled={diaryFormDisabled}
            onChanged={() => entryId && rdo.reload(entryId)}
          />

          {/* ATIVIDADES DESCRITIVAS */}
          <RdoActivitiesSection
            items={rdo.activities}
            onAdd={() => openDialogWithEntry(() => setAddActivityOpen(true))}
            disabled={diaryFormDisabled}
            onChanged={() => entryId && rdo.reload(entryId)}
          />

          {/* PRODUÇÃO POR CASA (existente) */}
          {!editingDisabled && (
            <section id="producao" className="scroll-mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 flex items-center gap-2">
                    <ChevronRight className="h-4 w-4" />
                    Lançar produção por casa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!entryId && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                          Diário ainda não aberto
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Abra o diário deste dia antes de registrar serviços. A numeração será gerada automaticamente e ficará vinculada a esta data.
                        </p>
                      </div>
                      <Button onClick={handleOpenDiary} className="min-h-[40px]">
                        <FileText className="h-4 w-4 mr-2" />
                        Abrir Diário
                      </Button>
                    </div>
                  )}

                  {entryId && (
                  <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-2 block">1. Selecionar Etapa</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 min-w-0">
                      {macros.map(macro => (
                        <Button key={macro.id}
                          variant={selectedMacro?.id === macro.id ? "default" : "outline"}
                          className={cn("min-h-[40px] justify-start gap-2 text-xs sm:text-sm font-medium min-w-0 px-2 sm:px-3", selectedMacro?.id === macro.id && "ring-2")}
                          style={{
                            backgroundColor: selectedMacro?.id === macro.id ? macro.color : undefined,
                            borderColor: macro.color,
                            color: selectedMacro?.id === macro.id ? "#fff" : undefined,
                          }}
                          onClick={() => {
                            // Não criar entry aqui — só registrar seleção.
                            // Entry é criada apenas quando o lançamento for salvo (handleRegister).
                            setSelectedMacro(selectedMacro?.id === macro.id ? null : { id: macro.id, name: macro.name, color: macro.color });
                            setSelectedScope(null); setSelectedHouses([]);
                          }}>
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: macro.color }} />
                          <span className="truncate min-w-0" title={macro.name}>{macro.name}</span>
                        </Button>
                      ))}
                    </div>
                  </div>

                  {selectedMacro && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">2. Selecionar Serviço</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {scopesForMacro.map((scope: any) => {
                          const done = scope.isFullyCompleted;
                          return (
                            <Button key={scope.id}
                              variant={selectedScope?.id === scope.id ? "default" : "outline"}
                              className={cn("min-h-[40px] justify-start text-sm gap-2", done && "opacity-60 cursor-not-allowed")}
                              disabled={done}
                              onClick={() => {
                                if (done) return;
                                setSelectedScope(selectedScope?.id === scope.id ? null : { id: scope.id, name: scope.name });
                                setSelectedHouses([]); setHousePercents({});
                              }}>
                              <span className="flex-1 text-left truncate">{scope.name}</span>
                              {done && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                              {!done && scope.completedHouses > 0 && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                                  {scope.completedHouses}/{scope.totalHouses}
                                </Badge>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedScope && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">3. Selecionar Casas</label>
                      {selectedScope && houses.length === 0 && (
                        <p className="text-xs text-muted-foreground italic py-2">
                          Carregando casas da obra…
                        </p>
                      )}
                      {housesGroupedByQuadra.map(group => (
                        <div key={group.name} className="mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-muted-foreground">{group.name}</span>
                            <Button variant="ghost" size="sm" className="text-xs h-7"
                              onClick={() => selectQuadra(group.houses.map(h => h.id))}>
                              Selecionar quadra
                            </Button>
                          </div>
                          <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
                            {group.houses.map(house => {
                              const prog = getHouseProgress(house.id);
                              const isSelected = selectedHouses.includes(house.id);
                              const isDone = prog >= 100;
                              return (
                                <Button key={house.id} variant="outline" disabled={isDone}
                                  className={cn(
                                    "h-14 w-full p-0 flex flex-col items-center justify-center gap-0 text-xs font-bold relative",
                                    isSelected && "ring-2 ring-primary bg-primary/20 border-primary",
                                    !isSelected && prog === 0 && "bg-background",
                                    !isSelected && prog > 0 && prog < 100 && "bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-800 dark:text-amber-300",
                                    isDone && "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 text-emerald-700 dark:text-emerald-300 opacity-70 cursor-not-allowed"
                                  )}
                                  onClick={() => toggleHouse(house.id)}>
                                  <span className="text-xs font-bold leading-tight">{String(house.id).padStart(2, "0")}</span>
                                  {prog > 0 && prog < 100 && (
                                    <span className="text-[9px] font-medium leading-tight text-amber-600 dark:text-amber-400">{prog}%</span>
                                  )}
                                  {isDone && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                  {getPctLancadoHoje(house.id) > 0 && (
                                    <span className="text-[8px] font-semibold leading-tight text-blue-600 dark:text-blue-400">
                                      +{getPctLancadoHoje(house.id)}% hoje
                                    </span>
                                  )}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {selectedHouses.length > 0 && (
                        <Badge variant="secondary" className="mt-1">{selectedHouses.length} casa(s) selecionada(s)</Badge>
                      )}
                    </div>
                  )}

                  {selectedHouses.length > 0 && (
                    <div className="space-y-3">
                      <label className="text-xs font-medium text-muted-foreground block">4. Percentual Executado</label>
                      <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Padrão (aplica a todas):</span>
                          <span className="text-xl font-bold text-primary">{percentual}%</span>
                        </div>
                        <Slider min={10} max={100} step={10} value={[percentual]} onValueChange={v => setPercentual(v[0])} />
                        <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={applyPercentToAll}>
                          Aplicar {percentual}% a todas as casas
                        </Button>
                      </div>
                      {selectedHouses.length > 1 && (
                        <div className="rounded-lg border overflow-hidden">
                          <div className="bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground flex items-center justify-between">
                            <span>% individual por casa</span>
                            <span>{selectedHouses.length} casa(s)</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto divide-y">
                            {[...selectedHouses].sort((a, b) => a - b).map(houseId => {
                              const currentProg = getHouseProgress(houseId);
                              const remaining = 100 - currentProg;
                              const value = housePercents[houseId] ?? percentual;
                              return (
                                <div key={houseId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                                  <span className="font-mono font-bold w-10">{String(houseId).padStart(2, "0")}</span>
                                  {currentProg > 0 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      (atual {currentProg}% · resta {remaining}%)
                                    </span>
                                  )}
                                  <div className="flex-1" />
                                  <Input type="number" min={0} max={100} value={value}
                                    onChange={e => setHousePercent(houseId, Number(e.target.value))}
                                    className="h-8 w-20 text-right" />
                                  <span className="text-xs text-muted-foreground w-4">%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <Textarea value={obsItem} onChange={e => setObsItem(e.target.value)}
                        placeholder="Observação do serviço (opcional)..." className="min-h-[50px]" />
                      <Button onClick={handleRegister} disabled={registering || !selectedMacro || !selectedScope}
                        className="w-full min-h-[48px] text-base font-semibold">
                        {registering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                        Registrar Serviço
                      </Button>
                    </div>
                  )}

                  {/* Lista de itens já lançados hoje */}
                  </>
                  )}

                  {diaryItems.length > 0 && (
                    <div className="pt-3 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-muted-foreground">Lançamentos do dia:</span>
                        {realtimeCount > 0 && (
                          <Badge variant="secondary" className="text-xs">+{realtimeCount} de outros</Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        {diaryItems.map(item => (
                          <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border bg-card">
                            <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: item.macro_color }} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{item.macro_name} · {item.scope_name}</div>
                              <div className="text-xs text-muted-foreground">
                                Casas: {item.house_ids.sort((a, b) => a - b).map(id => String(id).padStart(2, "0")).join(", ")} — {item.percentual_executado}%
                              </div>
                            </div>
                            {entryId && company?.id && (
                              <DiaryItemPhotoButton
                                diaryEntryId={entryId}
                                diaryItemId={item.id}
                                companyId={company.id}
                                houseIds={item.house_ids}
                                entryDate={entryDate}
                                disabled={editingDisabled}
                                onChanged={() => loadFotos(entryId)}
                              />
                            )}
                            {entryId && company?.id && (
                              <DiaryItemAssignmentPopover
                                diaryItemId={item.id}
                                contractorContractId={item.contractor_contract_id}
                                workers={dWorkers.workers}
                                links={dWorkers.links}
                                contractors={contractorContracts}
                                companyId={company.id}
                                disabled={editingDisabled}
                                onChanged={() => {
                                  dWorkers.reload(entryId);
                                  loadItems(entryId);
                                }}
                              />
                            )}
                            {!isLocked && statusAprovacao === "preenchendo" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-blue-600 hover:text-blue-700"
                                onClick={() => setEditItem({
                                  id: item.id,
                                  macro_id: item.macro_id,
                                  macro_name: item.macro_name,
                                  scope_id: item.scope_id,
                                  scope_name: item.scope_name,
                                  house_ids: item.house_ids,
                                  percentual_executado: item.percentual_executado,
                                  observacao: item.observacao,
                                  production_id: item.production_id,
                                })}
                                title="Editar lançamento"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="text-destructive"
                              onClick={() => handleDeleteItem(item)} disabled={editingDisabled}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {loadingItems && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {/* GRÁFICOS DE PRODUÇÃO DO DIA */}
          {entryId && (
            <RdoProductionCharts
              items={diaryItems}
              totalCasas={houses.length}
              projectId={currentProject?.id}
              entryDate={entryDate}
              macrosTemplate={currentProject?.macrosTemplate || []}
            />
          )}

          {/* OCORRÊNCIAS */}
          <RdoOccurrencesSection
            items={rdo.occurrences}
            onAdd={() => openDialogWithEntry(() => setAddOccurOpen(true))}
            disabled={diaryFormDisabled}
            onChanged={() => entryId && rdo.reload(entryId)}
          />

          {/* CHECKLIST */}
          <RdoChecklistSection
            items={rdo.checklist}
            onAdd={() => openDialogWithEntry(() => setAddChecklistOpen(true))}
            disabled={diaryFormDisabled}
            onChanged={() => entryId && rdo.reload(entryId)}
          />

          {/* COMENTÁRIOS */}
          <RdoCommentsSection
            items={rdo.comments}
            onAdd={() => openDialogWithEntry(() => setAddCommentOpen(true))}
            disabled={diaryFormDisabled}
            currentUserId={user?.id || null}
            onChanged={() => entryId && rdo.reload(entryId)}
          />

          {/* FOTOS */}
          <RdoSectionShell
            id="fotos"
            title="Fotos"
            count={fotos.length}
            onAdd={!diaryFormDisabled && fotos.length < 10 ? handleOpenFotoPicker : undefined}
            disabled={diaryFormDisabled || uploadingFoto}
            alwaysShowChildren
          >
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleUploadFotos(e, "gallery")}
              disabled={diaryFormDisabled || uploadingFoto}
            />
              <input
                ref={inlineCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleUploadFotos(e, "camera")}
                disabled={diaryFormDisabled || uploadingFoto}
              />
            <div className="space-y-3">
              {fotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fotos.map(foto => (
                    <div key={foto.id} className="relative group w-24">
                      <button type="button" onClick={() => {
                        setFotoAmpliada(foto);
                        setFotoLegendaDraft(foto.legenda || "");
                      }}
                        className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
                        <img src={foto.url} alt={foto.legenda || "Foto do diário"}
                          className="w-20 h-20 object-cover rounded-lg border" />
                      </button>
                      {foto.legenda && (
                        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{foto.legenda}</p>
                      )}
                      {!diaryFormDisabled && (
                        <button type="button" onClick={() => handleRemoverFoto(foto.id, foto.storage_path)}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {uploadingFoto && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando fotos...
                </div>
              )}
              {fotos.length === 0 && !uploadingFoto && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Toque em <strong>Adicionar</strong> para enviar fotos da obra (máx 10).
                </p>
              )}
            </div>
          </RdoSectionShell>

          {/* VÍDEOS */}
          <RdoVideosSection
            videos={rdo.videos}
            entryId={entryId}
            companyId={company?.id || null}
            disabled={diaryFormDisabled}
            onChanged={() => entryId && rdo.loadAttachments(entryId)}
            onRequestCreateEntry={isDiaryOpen ? ensureEntryExists : undefined}
          />

          {/* ANEXOS */}
          <RdoAttachmentsSection
            attachments={rdo.attachments}
            entryId={entryId}
            companyId={company?.id || null}
            disabled={diaryFormDisabled}
            onChanged={() => entryId && rdo.loadAttachments(entryId)}
            onRequestCreateEntry={isDiaryOpen ? ensureEntryExists : undefined}
          />

          {/* APROVAÇÃO E ASSINATURAS */}
          <RdoApprovalSection
            entryId={entryId}
            companyId={company?.id || null}
            status={statusAprovacao}
            onStatusChange={(s) => {
              setStatusAprovacao(s);
              if (s === "aprovado") setEntryStatus("finalizado");
              else if (entryStatus === "finalizado") setEntryStatus("rascunho");
            }}
            canApprove={isAdmin}
            signerId={user?.id || null}
            signerName={profile?.display_name || user?.email || null}
            isLocked={diaryFormDisabled}
          />

          {/* FOOTER: navegação + log + visualizações */}
          {entryId && (
            <RdoFooterNav
              entryId={entryId}
              projectId={currentProject?.id || null}
              entryDate={entryDate}
              onNavigate={(d) => setEntryDate(d)}
              createdByName={entryMeta.engineer_name}
              createdAt={entryMeta.created_at}
              updatedByName={profile?.display_name || null}
              updatedAt={entryMeta.updated_at}
            />
          )}

          {/* CORREÇÕES */}
          {correcoesDoDia.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                ⚠️ {correcoesDoDia.length} correção(ões) aplicada(s) pelo coordenador:
              </p>
              {correcoesDoDia.map((c, i) => (
                <div key={i} className="text-xs text-amber-700 dark:text-amber-400 border-t border-amber-200 dark:border-amber-800 pt-2">
                  <span className="font-medium">{c.corrigido_por_nome}</span>
                  {" — "}{c.macro_name} / {c.scope_name}
                  <br />
                  {c.tipo === "exclusao" && `Itens removidos das casas: ${(c.house_ids_anterior as number[])?.join(", ")}`}
                  {c.tipo === "ajuste_casas" && `Casas: ${(c.house_ids_anterior as number[])?.join(", ")} → ${(c.house_ids_posterior as number[])?.join(", ")}`}
                  {c.tipo === "ajuste_percentual" && `Percentual: ${c.percentual_anterior}% → ${c.percentual_posterior}%`}
                  <br />
                  <span className="italic text-amber-600 dark:text-amber-500">"{c.justificativa}"</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SIDEBAR DE NAVEGAÇÃO (lateral direita, escondido no mobile) */}
        <aside className="hidden lg:block">
          <RdoSidebar counts={counts} active={activeSection} onNavigate={navigateTo} />
        </aside>
      </div>

      {/* Foto ampliada */}
      {fotoAmpliada && (
        <Dialog open={!!fotoAmpliada} onOpenChange={(open) => {
          if (!open) setFotoAmpliada(null);
        }}>
          <DialogContent className="max-w-3xl p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>Foto ampliada</DialogTitle>
              <DialogDescription>Visualização ampliada da foto anexada ao diário.</DialogDescription>
            </DialogHeader>
            <img src={fotoAmpliada.url} alt={fotoAmpliada.legenda || "Foto do diário"} className="w-full rounded-lg" />
            {!diaryFormDisabled ? (
              <div className="space-y-2 px-2 pb-2">
                <label className="text-xs font-medium text-muted-foreground">Legenda opcional</label>
                <Textarea
                  value={fotoLegendaDraft}
                  onChange={(e) => setFotoLegendaDraft(e.target.value)}
                  placeholder="Escreva uma legenda para esta foto..."
                  className="min-h-[70px]"
                />
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={handleSalvarLegendaFoto} disabled={savingFotoLegenda}>
                    {savingFotoLegenda && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Salvar legenda
                  </Button>
                </div>
              </div>
            ) : fotoAmpliada.legenda ? (
              <p className="px-2 pb-2 text-sm text-center text-muted-foreground">{fotoAmpliada.legenda}</p>
            ) : null}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={photoSourceOpen} onOpenChange={setPhotoSourceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar foto</DialogTitle>
            <DialogDescription>
              Escolha se deseja tirar uma nova foto ou selecionar uma imagem da galeria.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button type="button" onClick={() => handlePickPhotoSource("camera")} disabled={uploadingFoto} className="h-11 justify-start">
              <Camera className="h-4 w-4 mr-2" /> Tirar foto
            </Button>
            <Button type="button" variant="outline" onClick={() => handlePickPhotoSource("gallery")} disabled={uploadingFoto} className="h-11 justify-start">
              <ClipboardList className="h-4 w-4 mr-2" /> Escolher da galeria
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={approvalWarningsOpen} onOpenChange={setApprovalWarningsOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Confirmar envio para aprovação
            </AlertDialogTitle>
            <AlertDialogDescription>
              O diário possui alguns alertas antes do envio. Revise os itens abaixo antes de continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/30 p-3">
            <ul className="space-y-2 text-sm">
              {approvalMissingPhotoWarnings.map((warning, index) => (
                <li
                  key={`${warning.house}-${warning.macroName}-${warning.scopeName}-${index}`}
                  className="flex gap-2"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>
                    Casa {String(warning.house).padStart(2, "0")} — {warning.macroName} · {warning.scopeName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            Mesmo com estes avisos, deseja enviar o diário para aprovação?
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleContinueApprovalWithWarnings}>
              Enviar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelEmptyOpen} onOpenChange={setCancelEmptyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar abertura do diário?</AlertDialogTitle>
            <AlertDialogDescription>
              Este diário ainda não possui dados lançados. Ao cancelar, ele voltará para o estado de diário não aberto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelingEmptyDiary}>Manter diário</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelEmptyDiary}
              disabled={cancelingEmptyDiary}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelingEmptyDiary && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar abertura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelBlockedOpen} onOpenChange={setCancelBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este diário já possui dados lançados</AlertDialogTitle>
            <AlertDialogDescription>
              Exclua os dados antes ou mantenha o diário aberto. Diários enviados, finalizados ou com informações
              vinculadas não podem ter a abertura cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCancelBlockedOpen(false)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print dialog */}
      <PrintDiarioDialog open={printOpen} onOpenChange={setPrintOpen} buildData={buildPrintData} />
      <ConfirmRainDialog
        open={confirmRainOpen}
        onOpenChange={setConfirmRainOpen}
        lat={projectInfo.lat}
        lng={projectInfo.lng}
        entryDate={entryDate}
        currentMm={climaState.mmChuva}
        onConfirm={handleConfirmRainAndSend}
      />

      {/* ADD DIALOGS */}
      {entryId && company?.id && (
        <>
          <AddLaborDialog open={addLaborOpen} onOpenChange={setAddLaborOpen}
            entryId={entryId} companyId={company.id} onSaved={() => rdo.reload(entryId)} />
          <AddEquipmentDialog open={addEquipOpen} onOpenChange={setAddEquipOpen}
            entryId={entryId} companyId={company.id} onSaved={() => rdo.reload(entryId)} />
          <AddActivityDialog open={addActivityOpen} onOpenChange={setAddActivityOpen}
            entryId={entryId} companyId={company.id} onSaved={() => rdo.reload(entryId)} />
          <AddOccurrenceDialog open={addOccurOpen} onOpenChange={setAddOccurOpen}
            entryId={entryId} companyId={company.id} onSaved={() => rdo.reload(entryId)} />
          <AddChecklistDialog open={addChecklistOpen} onOpenChange={setAddChecklistOpen}
            entryId={entryId} companyId={company.id} onSaved={() => rdo.reload(entryId)} />
          <AddCommentDialog open={addCommentOpen} onOpenChange={setAddCommentOpen}
            entryId={entryId} companyId={company.id}
            autorId={user?.id || null} autorNome={profile?.display_name || user?.email || null}
            onSaved={() => rdo.reload(entryId)} />
        </>
      )}

      {/* Solicitar edição (RDO bloqueado) */}
      {entryId && currentProject?.id && company?.id && user?.id && (
        <RdoEditRequestDialog
          open={editRequestOpen}
          onOpenChange={setEditRequestOpen}
          diaryEntryId={entryId}
          projectId={currentProject.id}
          companyId={company.id}
          userId={user.id}
          userName={profile?.display_name || user.email || "Usuário"}
          numRelatorio={numRelatorio}
          entryDate={entryDate}
        />
      )}

      {/* Solicitar exclusão de lançamento */}
      <RequestDeleteItemDialog
        open={!!deleteRequestItem}
        onOpenChange={(v) => { if (!v) setDeleteRequestItem(null); }}
        itemId={deleteRequestItem?.id || null}
        itemDescription={deleteRequestItem ? `${deleteRequestItem.macro_name} · ${deleteRequestItem.scope_name} (${deleteRequestItem.percentual_executado}%)` : undefined}
        onRequested={() => { if (entryId) loadItems(entryId); }}
      />

      {/* Editar lançamento (antes da aprovação) */}
      <EditDiaryItemDialog
        open={!!editItem}
        onOpenChange={(v) => { if (!v) setEditItem(null); }}
        item={editItem}
        housesGrouped={housesGroupedByQuadra}
        getHouseProgress={getProgressFor}
        onApply={handleApplyEditItem}
      />
    </div>
  );
}
