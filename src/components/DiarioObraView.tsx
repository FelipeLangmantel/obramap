import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import {
  Save, Trash2, ClipboardList, Sun, Cloud, CloudRain, CloudLightning, Wind,
  CheckCircle2, ChevronRight, Users, Loader2, Camera, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { geocodeMunicipio, fetchClimaHoje } from "@/lib/geocode";

// Compressão simples via Canvas — reduz tamanho das fotos antes do upload
async function comprimirImagem(file: File, maxDim = 1024, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("blob")), "image/jpeg", quality);
    };
    img.onerror = () => reject(new Error("img"));
    img.src = URL.createObjectURL(file);
  });
}

type ClimaType = "sol" | "nublado" | "chuva_fraca" | "chuva_forte" | "vento";

const CLIMA_OPTIONS: { value: ClimaType; icon: React.ReactNode; label: string }[] = [
  { value: "sol", icon: <Sun className="h-5 w-5" />, label: "Sol" },
  { value: "nublado", icon: <Cloud className="h-5 w-5" />, label: "Nublado" },
  { value: "chuva_fraca", icon: <CloudRain className="h-5 w-5" />, label: "Chuva Fraca" },
  { value: "chuva_forte", icon: <CloudLightning className="h-5 w-5" />, label: "Chuva Forte" },
  { value: "vento", icon: <Wind className="h-5 w-5" />, label: "Vento" },
];

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
}

export default function DiarioObraView() {
  const { currentProject, updateBatchScopeProgress } = useConstruction();
  const { user, profile, company } = useAuth();
  const houses = currentProject?.houses || [];
  const queryClient = useQueryClient();

  // Header state
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [clima, setClima] = useState<ClimaType | null>(null);
  const [equipePres, setEquipePres] = useState(0);
  const [obsGeral, setObsGeral] = useState("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [entryStatus, setEntryStatus] = useState<string>("rascunho");
  const [savingHeader, setSavingHeader] = useState(false);
  const [correcoesDoDia, setCorrecoesDoDia] = useState<any[]>([]);

  // Service steps
  const [selectedMacro, setSelectedMacro] = useState<{ id: string; name: string; color: string } | null>(null);
  const [selectedScope, setSelectedScope] = useState<{ id: string; name: string } | null>(null);
  const [selectedHouses, setSelectedHouses] = useState<number[]>([]);
  const [percentual, setPercentual] = useState(100);
  const [obsItem, setObsItem] = useState("");
  const [registering, setRegistering] = useState(false);

  // Summary
  const [diaryItems, setDiaryItems] = useState<DiaryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Realtime count from other engineers
  const [realtimeCount, setRealtimeCount] = useState(0);

  // Fotos do dia
  const [fotos, setFotos] = useState<{ id: string; url: string; storage_path: string; legenda: string | null }[]>([]);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<{ id: string; url: string; legenda: string | null } | null>(null);

  // Clima automático
  const [climaAutoPreenchido, setClimaAutoPreenchido] = useState(false);

  // Produtividade de referência (do scope selecionado)
  const [produtividadeRef, setProdutividadeRef] = useState<number | null>(null);
  const [produtividadeRefId, setProdutividadeRefId] = useState<string | null>(null);

  const macros = currentProject?.macrosTemplate || [];

  // Load existing entry for selected date
  useEffect(() => {
    if (!currentProject?.id || !user?.id) return;
    loadEntry();
  }, [currentProject?.id, user?.id, entryDate]);

  const loadFotos = async (eId: string) => {
    const { data: fotosData } = await supabase
      .from("diary_photos")
      .select("id, storage_path, legenda")
      .eq("diary_entry_id", eId)
      .order("created_at", { ascending: true });

    if (!fotosData || fotosData.length === 0) {
      setFotos([]);
      return;
    }

    // Bucket é privado → usar signed URL (1h)
    const fotosComUrl = await Promise.all(
      fotosData.map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("diary-photos")
          .createSignedUrl(f.storage_path, 60 * 60);
        return {
          id: f.id,
          storage_path: f.storage_path,
          legenda: f.legenda,
          url: signed?.signedUrl || "",
        };
      })
    );
    setFotos(fotosComUrl);
  };

  const tryAutoFillClima = async (eId: string) => {
    if (!currentProject?.id) return;
    const { data: projData } = await supabase
      .from("projects")
      .select("lat, lng, municipio, estado")
      .eq("id", currentProject.id)
      .maybeSingle();

    if (!projData) return;

    let coords: { lat: number; lng: number } | null = null;
    if (projData.lat != null && projData.lng != null) {
      coords = { lat: Number(projData.lat), lng: Number(projData.lng) };
    } else if (projData.municipio) {
      coords = await geocodeMunicipio(projData.municipio, projData.estado || "RS");
      // Persistir lat/lng para próxima execução não geocodificar de novo
      if (coords) {
        await supabase.from("projects")
          .update({ lat: coords.lat, lng: coords.lng })
          .eq("id", currentProject.id);
      }
    }

    if (!coords) return;

    const climaAuto = await fetchClimaHoje(coords.lat, coords.lng);
    if (climaAuto) {
      setClima(climaAuto.codigo);
      setClimaAutoPreenchido(true);
      await supabase.from("diary_entries").update({ clima: climaAuto.codigo }).eq("id", eId);
    }
  };

  const loadEntry = async () => {
    if (!currentProject?.id || !user?.id) return;
    
    const { data } = await supabase
      .from("diary_entries")
      .select("id, clima, equipe_presente, observacao_geral, status")
      .eq("project_id", currentProject.id)
      .eq("engineer_id", user.id)
      .eq("entry_date", entryDate)
      .maybeSingle();

    if (data) {
      setEntryId(data.id);
      setClima((data.clima as ClimaType) || null);
      setEquipePres(data.equipe_presente || 0);
      setObsGeral(data.observacao_geral || "");
      setEntryStatus(data.status || "rascunho");
      setClimaAutoPreenchido(false);
      const { data: correcoes } = await supabase
        .from("diary_item_corrections")
        .select("tipo, macro_name, scope_name, house_ids_anterior, house_ids_posterior, percentual_anterior, percentual_posterior, justificativa, corrigido_por_nome, created_at")
        .eq("diary_entry_id", data.id)
        .order("created_at", { ascending: false });
      setCorrecoesDoDia(correcoes || []);
      loadItems(data.id);
      loadFotos(data.id);
      // Auto-preencher clima apenas se ainda não foi preenchido manualmente
      if (!data.clima) {
        tryAutoFillClima(data.id);
      }
    } else {
      setEntryId(null);
      setClima(null);
      setEquipePres(0);
      setObsGeral("");
      setEntryStatus("rascunho");
      setDiaryItems([]);
      setCorrecoesDoDia([]);
      setFotos([]);
      setClimaAutoPreenchido(false);
    }
  };

  const loadItems = async (eId: string) => {
    setLoadingItems(true);
    const { data } = await supabase
      .from("diary_items")
      .select("id, macro_id, macro_name, macro_color, scope_id, scope_name, house_ids, houses_count, percentual_executado, observacao, production_id")
      .eq("diary_entry_id", eId)
      .order("created_at", { ascending: true });
    
    setDiaryItems((data || []).map(d => ({
      id: d.id,
      macro_id: d.macro_id,
      macro_name: d.macro_name,
      macro_color: d.macro_color,
      scope_id: d.scope_id,
      scope_name: d.scope_name,
      house_ids: d.house_ids || [],
      houses_count: d.houses_count,
      percentual_executado: Number(d.percentual_executado),
      observacao: d.observacao,
      production_id: d.production_id,
    })));
    setLoadingItems(false);
  };

  // ─── Upload de fotos ─────────────────────────────────────────────
  const handleUploadFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!entryId || !e.target.files?.length || !company?.id) return;
    setUploadingFoto(true);
    try {
      const arquivos = Array.from(e.target.files).slice(0, 10 - fotos.length);
      let uploaded = 0;
      for (const arquivo of arquivos) {
        const comprimido = await comprimirImagem(arquivo, 1024, 0.7);
        const safeName = arquivo.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const path = `${company.id}/${entryId}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("diary-photos")
          .upload(path, comprimido, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        const { error: dbError } = await supabase.from("diary_photos").insert({
          diary_entry_id: entryId,
          storage_path: path,
          legenda: null,
        });
        if (dbError) {
          await supabase.storage.from("diary-photos").remove([path]);
          throw dbError;
        }
        uploaded++;
      }
      await loadFotos(entryId);
      toast.success(`${uploaded} foto(s) enviada(s).`);
    } catch (err: any) {
      toast.error("Erro ao enviar foto: " + (err.message || ""));
    } finally {
      setUploadingFoto(false);
      e.target.value = "";
    }
  };

  const handleRemoverFoto = async (fotoId: string, storagePath: string) => {
    try {
      await supabase.storage.from("diary-photos").remove([storagePath]);
      await supabase.from("diary_photos").delete().eq("id", fotoId);
      setFotos(prev => prev.filter(f => f.id !== fotoId));
      toast.success("Foto removida.");
    } catch {
      toast.error("Erro ao remover foto.");
    }
  };

  // ─── Produtividade de referência (carrega ao trocar serviço) ──────
  useEffect(() => {
    if (!selectedScope?.id || !company?.id) {
      setProdutividadeRef(null);
      setProdutividadeRefId(null);
      return;
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
    const channel = supabase
      .channel(`diary-productions-${currentProject.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "productions",
        filter: `project_id=eq.${currentProject.id}`,
      }, (payload) => {
        if (payload.new && (payload.new as any).created_by !== user?.id) {
          setRealtimeCount(prev => prev + 1);
        }
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "diary_items",
      }, () => {
        loadEntry();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentProject?.id, user?.id]);

  // Save header
  const handleSaveHeader = async () => {
    if (!currentProject?.id || !user?.id || !company?.id) return;
    setSavingHeader(true);
    try {
      const payload = {
        company_id: company.id,
        project_id: currentProject.id,
        engineer_id: user.id,
        engineer_name: profile?.display_name || user.email || "Engenheiro",
        entry_date: entryDate,
        clima,
        equipe_presente: equipePres,
        observacao_geral: obsGeral || null,
      };

      if (entryId) {
        await supabase.from("diary_entries").update({
          clima: payload.clima,
          equipe_presente: payload.equipe_presente,
          observacao_geral: payload.observacao_geral,
        }).eq("id", entryId);
      } else {
        const { data, error } = await supabase.from("diary_entries").insert(payload).select("id").single();
        if (error) throw error;
        setEntryId(data.id);
      }
      toast.success("Cabeçalho salvo!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setSavingHeader(false);
    }
  };

  // Scopes for selected macro
  const scopesForMacro = useMemo(() => {
    if (!selectedMacro) return [];
    const macro = macros.find(m => m.id === selectedMacro.id);
    return macro?.scopes || [];
  }, [selectedMacro, macros]);

  // Houses grouped by quadra
  const housesGroupedByQuadra = useMemo(() => {
    if (!currentProject) return [];
    const quadras = currentProject.quadras || [];
    return quadras.map(q => ({
      name: q.name,
      houses: houses.filter(h => q.houses.includes(h.id)).sort((a, b) => a.id - b.id),
    })).filter(g => g.houses.length > 0);
  }, [currentProject, houses]);

  // Check house completion for selected scope
  const getHouseProgress = useCallback((houseId: number): number => {
    if (!selectedMacro || !selectedScope) return 0;
    const house = houses.find(h => h.id === houseId);
    if (!house) return 0;
    const hMacros = (house.macros as any[]) || [];
    const hMacro = hMacros.find((m: any) => m.id === selectedMacro.id);
    const hScope = hMacro?.scopes?.find((s: any) => s.id === selectedScope.id);
    return hScope?.progress || 0;
  }, [houses, selectedMacro, selectedScope]);

  const toggleHouse = (houseId: number) => {
    setSelectedHouses(prev =>
      prev.includes(houseId) ? prev.filter(h => h !== houseId) : [...prev, houseId]
    );
  };

  const selectQuadra = (houseIds: number[]) => {
    setSelectedHouses(prev => {
      const allSelected = houseIds.every(id => prev.includes(id));
      if (allSelected) return prev.filter(id => !houseIds.includes(id));
      return [...new Set([...prev, ...houseIds])];
    });
  };

  // Register item
  const handleRegister = async () => {
    if (!entryId || !selectedMacro || !selectedScope || selectedHouses.length === 0 || !currentProject?.id) {
      toast.error("Salve o cabeçalho e selecione etapa, serviço e casas.");
      return;
    }

    // ─── Aviso de produtividade fora do padrão (não bloqueia) ──────
    if (produtividadeRef && produtividadeRef > 0 && equipePres > 0) {
      const produtividadeReal = selectedHouses.length / equipePres;
      const pct = produtividadeReal / produtividadeRef;
      if (pct > 1.5) {
        toast.warning(
          `⚠️ Produtividade ${Math.round(pct * 100)}% acima do padrão. Verifique o lançamento.`
        );
      } else if (pct < 0.5) {
        toast.warning(
          `⚠️ Produtividade ${Math.round(pct * 100)}% abaixo do padrão.`
        );
      }
    }

    setRegistering(true);
    try {
      // 1. Insert into productions
      const productionDate = entryDate;
      const { data: prod, error: prodErr } = await supabase.from("productions").insert({
        project_id: currentProject.id,
        macro_id: selectedMacro.id,
        macro_name: selectedMacro.name,
        macro_color: selectedMacro.color,
        scope_id: selectedScope.id,
        scope_name: selectedScope.name,
        house_ids: selectedHouses,
        houses_count: selectedHouses.length,
        production_date: productionDate,
        notes: obsItem || null,
        created_by: user?.id || null,
      }).select("id").single();

      if (prodErr) throw prodErr;

      // 2. Insert into weekly_productions (legacy compatibility)
      const entryDateObj = parseISO(entryDate);
      const weekStart = format(startOfWeek(entryDateObj, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(entryDateObj, { weekStartsOn: 1 }), "yyyy-MM-dd");

      await supabase.from("weekly_productions").insert({
        project_id: currentProject.id,
        week_start: weekStart,
        week_end: weekEnd,
        scope_id: selectedScope.id,
        scope_name: selectedScope.name,
        macro_id: selectedMacro.id,
        macro_name: selectedMacro.name,
        macro_color: selectedMacro.color,
        house_ids: selectedHouses,
        houses_count: selectedHouses.length,
        created_by_user_id: profile?.user_id || null,
        created_by_name: profile?.display_name || null,
      });

      // 3. Insert into diary_items
      await supabase.from("diary_items").insert({
        diary_entry_id: entryId,
        production_id: prod.id,
        macro_id: selectedMacro.id,
        macro_name: selectedMacro.name,
        macro_color: selectedMacro.color,
        scope_id: selectedScope.id,
        scope_name: selectedScope.name,
        house_ids: selectedHouses,
        houses_count: selectedHouses.length,
        percentual_executado: percentual,
        observacao: obsItem || null,
      });

      // 4. Update house progress
      const progressMap: Record<number, number> = {};
      for (const houseId of selectedHouses) {
        const currentProg = getHouseProgress(houseId);
        const remaining = 100 - currentProg;
        const addPct = Math.min(percentual, remaining);
        progressMap[houseId] = Math.min(100, currentProg + addPct);
      }
      await updateBatchScopeProgress(selectedHouses, selectedMacro.id, selectedScope.id, 100, progressMap);

      // 5. Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      queryClient.invalidateQueries({ queryKey: ["weekly_productions"] });
      queryClient.invalidateQueries({ queryKey: ["houses"] });

      toast.success(`Registrado: ${selectedScope.name} em ${selectedHouses.length} casas`);

      // ─── Atualizar média móvel de produtividade (silencioso) ─────────
      try {
        if (produtividadeRefId && produtividadeRef && equipePres > 0) {
          const produtividadeReal = selectedHouses.length / equipePres;
          if (produtividadeReal > 0) {
            // EMA: 80% histórico + 20% novo
            const novaMedia = produtividadeRef * 0.8 + produtividadeReal * 0.2;
            await supabase.from("service_productivities")
              .update({ base_productivity: Math.round(novaMedia * 100) / 100 })
              .eq("id", produtividadeRefId);
            setProdutividadeRef(Math.round(novaMedia * 100) / 100);
          }
        }
      } catch {
        // silencioso — não bloquear UX
      }

      setSelectedHouses([]);
      setObsItem("");
      setPercentual(100);
      loadItems(entryId);
    } catch (err: any) {
      toast.error("Erro ao registrar: " + (err.message || ""));
    } finally {
      setRegistering(false);
    }
  };

  // Delete item
  const handleDeleteItem = async (item: DiaryItem) => {
    try {
      // Delete production
      if (item.production_id) {
        await supabase.from("productions").delete().eq("id", item.production_id);
      }
      // Delete diary item
      await supabase.from("diary_items").delete().eq("id", item.id);

      // Revert house progress
      if (selectedMacro || item.macro_id) {
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
      }

      queryClient.invalidateQueries({ queryKey: ["productions"] });
      queryClient.invalidateQueries({ queryKey: ["weekly_productions"] });
      queryClient.invalidateQueries({ queryKey: ["houses"] });

      toast.success("Item removido e progresso revertido.");
      if (entryId) loadItems(entryId);
    } catch (err: any) {
      toast.error("Erro ao remover: " + (err.message || ""));
    }
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
    <div className="space-y-4 pb-24 md:pb-4">
      {/* SEÇÃO 1 — Cabeçalho do Dia */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Cabeçalho do Dia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">Data</label>
              <Input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="mt-1 min-h-[48px]"
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">Equipe Presente</label>
              <div className="flex items-center gap-2 mt-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  value={equipePres}
                  onChange={e => setEquipePres(Number(e.target.value))}
                  className="min-h-[48px]"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Clima</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {CLIMA_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={clima === opt.value ? "default" : "outline"}
                    className={cn("min-h-[48px] min-w-[48px] flex-col gap-0.5 text-xs px-2", clima === opt.value && "ring-2 ring-primary")}
                    onClick={() => setClima(clima === opt.value ? null : opt.value)}
                  >
                    {opt.icon}
                    <span className="hidden md:inline">{opt.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Observação Geral</label>
            <Textarea
              value={obsGeral}
              onChange={e => setObsGeral(e.target.value)}
              placeholder="Observações do dia..."
              className="mt-1 min-h-[60px]"
            />
          </div>
          <Button onClick={handleSaveHeader} disabled={savingHeader} className="min-h-[48px] w-full md:w-auto">
            {savingHeader ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Cabeçalho
          </Button>
          {entryId && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {entryStatus === "finalizado" ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[11px]">
                  ✅ Semana finalizada
                </Badge>
              ) : (
                <>
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[11px]">
                    📝 Rascunho{correcoesDoDia.length > 0 ? ` — ${correcoesDoDia.length} correção(ões)` : ""}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Para finalizar: <strong>Produção → Do Diário → Fechar Semana</strong>
                  </span>
                </>
              )}
            </div>
          )}
          {entryId && correcoesDoDia.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2 mt-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                ⚠️ {correcoesDoDia.length} correção(ões) aplicada(s) pelo coordenador neste diário:
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
        </CardContent>
      </Card>

      {/* SEÇÃO 2 — Lançar Serviço */}
      {entryId && entryStatus === "finalizado" && (
        <Card>
          <CardContent className="py-8 text-center space-y-2">
            <p className="text-2xl">🔒</p>
            <p className="text-sm font-medium text-muted-foreground">
              Semana aprovada — diário fechado pelo coordenador.
            </p>
            <p className="text-xs text-muted-foreground">
              Para solicitar correções, contate o administrador.
            </p>
          </CardContent>
        </Card>
      )}
      {entryId && entryStatus !== "finalizado" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ChevronRight className="h-5 w-5 text-primary" />
              Lançar Serviço
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Passo 1 — Selecionar Etapa */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">1. Selecionar Etapa</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {macros.map(macro => (
                  <Button
                    key={macro.id}
                    variant={selectedMacro?.id === macro.id ? "default" : "outline"}
                    className={cn("min-h-[48px] justify-start gap-2 text-sm font-medium", selectedMacro?.id === macro.id && "ring-2")}
                    style={{
                      backgroundColor: selectedMacro?.id === macro.id ? macro.color : undefined,
                      borderColor: macro.color,
                      color: selectedMacro?.id === macro.id ? "#fff" : undefined,
                    }}
                    onClick={() => {
                      setSelectedMacro(selectedMacro?.id === macro.id ? null : { id: macro.id, name: macro.name, color: macro.color });
                      setSelectedScope(null);
                      setSelectedHouses([]);
                    }}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: macro.color }} />
                    {macro.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Passo 2 — Selecionar Serviço */}
            {selectedMacro && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">2. Selecionar Serviço</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {scopesForMacro.map(scope => (
                    <Button
                      key={scope.id}
                      variant={selectedScope?.id === scope.id ? "default" : "outline"}
                      className="min-h-[48px] justify-start text-sm"
                      onClick={() => {
                        setSelectedScope(selectedScope?.id === scope.id ? null : { id: scope.id, name: scope.name });
                        setSelectedHouses([]);
                      }}
                    >
                      {scope.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Passo 3 — Selecionar Casas */}
            {selectedScope && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">3. Selecionar Casas</label>
                {housesGroupedByQuadra.map(group => (
                  <div key={group.name} className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">{group.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => selectQuadra(group.houses.map(h => h.id))}
                      >
                        Selecionar quadra
                      </Button>
                    </div>
                    <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
                      {group.houses.map(house => {
                        const prog = getHouseProgress(house.id);
                        const isSelected = selectedHouses.includes(house.id);
                        return (
                          <Button
                            key={house.id}
                            variant="outline"
                            className={cn(
                              "h-14 w-full p-0 flex flex-col items-center justify-center gap-0 text-xs font-bold relative",
                              isSelected && "ring-2 ring-primary bg-primary/20 border-primary",
                              !isSelected && prog === 0 && "bg-background",
                              !isSelected && prog > 0 && prog < 100 && "bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-800 dark:text-amber-300",
                              !isSelected && prog >= 100 && "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 text-emerald-700 dark:text-emerald-300"
                            )}
                            onClick={() => toggleHouse(house.id)}
                          >
                            <span className="text-xs font-bold leading-tight">{String(house.id).padStart(2, "0")}</span>
                            {prog > 0 && prog < 100 && (
                              <span className="text-[9px] font-medium leading-tight text-amber-600 dark:text-amber-400">{prog}%</span>
                            )}
                            {prog >= 100 && (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
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

            {/* Passo 4 — Percentual */}
            {selectedHouses.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">4. Percentual Executado</label>
                <div className="text-3xl font-bold text-primary text-center my-2">{percentual}%</div>
                <Slider
                  min={10}
                  max={100}
                  step={10}
                  value={[percentual]}
                  onValueChange={v => setPercentual(v[0])}
                  className="mb-3"
                />
                <Textarea
                  value={obsItem}
                  onChange={e => setObsItem(e.target.value)}
                  placeholder="Observação do serviço (opcional)..."
                  className="min-h-[50px]"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botão Registrar fixo em mobile */}
      {entryId && selectedHouses.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t z-50 md:static md:border-0 md:p-0 md:bg-transparent">
          <Button
            onClick={handleRegister}
            disabled={registering || !selectedMacro || !selectedScope}
            className="w-full min-h-[48px] text-base font-semibold"
          >
            {registering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
            Registrar Serviço
          </Button>
        </div>
      )}

      {/* SEÇÃO 3 — Resumo do dia */}
      {entryId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Resumo do Dia
              {realtimeCount > 0 && (
                <Badge variant="secondary" className="text-xs">+{realtimeCount} de outros engenheiros</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingItems ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : diaryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum serviço lançado hoje.</p>
            ) : (
              <div className="space-y-2">
                {diaryItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: item.macro_color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.macro_name}</div>
                      <div className="text-xs text-muted-foreground">{item.scope_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Casas: {item.house_ids.sort((a, b) => a - b).map(id => String(id).padStart(2, "0")).join(", ")} — {item.percentual_executado}%
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive min-h-[48px] min-w-[48px]"
                      onClick={() => handleDeleteItem(item)}
                      disabled={entryStatus === "finalizado"}
                      title={entryStatus === "finalizado" ? "Semana fechada — use o botão Corrigir na aba Do Diário" : "Remover item"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
