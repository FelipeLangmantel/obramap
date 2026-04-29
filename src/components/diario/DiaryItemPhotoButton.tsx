import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Camera, Loader2, Trash2, ImageIcon, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { compressImageSafe } from "@/lib/compressImage";

interface FotoServico {
  id: string;
  storage_path: string;
  legenda: string | null;
  house_number: number | null;
  url: string;
}

interface Props {
  diaryEntryId: string;
  diaryItemId: string;
  companyId: string;
  /** Casas disponíveis nesse lançamento (para escolher casa antes da foto). */
  houseIds: number[];
  entryDate?: string;
  disabled?: boolean;
  onChanged?: () => void;
}

/**
 * Anexa fotos a um serviço do diário. Cada foto pode opcionalmente
 * ser vinculada a UMA casa específica (`house_number`) — assim o
 * histórico fotográfico da casa só mostra fotos relevantes a ela.
 *
 * Fluxo:
 *  1) Usuário escolhe a casa (ou "Todas" para vincular ao serviço como um todo).
 *  2) Faz upload de uma ou várias fotos.
 *  3) Pode trocar a casa entre uploads.
 */
export function DiaryItemPhotoButton({
  diaryEntryId,
  diaryItemId,
  companyId,
  houseIds,
  entryDate,
  disabled,
  onChanged,
}: Props) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [fotos, setFotos] = useState<FotoServico[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<string>(
    houseIds.length === 1 ? String(houseIds[0]) : "all"
  );
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const refreshCount = async () => {
    const { count: c } = await supabase
      .from("diary_photos")
      .select("id", { count: "exact", head: true })
      .eq("diary_item_id", diaryItemId);
    setCount(c || 0);
  };

  useEffect(() => { refreshCount(); }, [diaryItemId]);

  const loadFotos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("diary_photos")
      .select("id, storage_path, legenda, house_number")
      .eq("diary_item_id", diaryItemId)
      .order("created_at", { ascending: true });
    if (!data) { setFotos([]); setLoading(false); return; }
    const withUrl = await Promise.all(data.map(async (f: any) => {
      const { data: signed } = await (supabase.storage
        .from("diary-photos") as any).createSignedUrl(f.storage_path, 60 * 60, {
          transform: { width: 700, resize: "contain", quality: 70 },
        });
      return { ...f, url: signed?.signedUrl || "" } as FotoServico;
    }));
    setFotos(withUrl);
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(true);
    loadFotos();
  };

  const openCameraCapture = () => {
    try {
      sessionStorage.setItem("obramap_route_state_root", JSON.stringify({ activeView: "diario-obra" }));
      sessionStorage.setItem("obramap_diario_tab", JSON.stringify({ tab: "editor", selectedDate: entryDate || null }));
    } catch { /* noop */ }
    const params = new URLSearchParams({
      entryId: diaryEntryId,
      itemId: diaryItemId,
      companyId,
      house: selectedHouse,
      returnTo: "/dashboard",
    });
    if (entryDate) params.set("date", entryDate);
    navigate(`/camera-capture?${params.toString()}`);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, source: "camera" | "gallery" = "gallery") => {
    if (!e.target.files?.length) return;
    const arquivos = Array.from(e.target.files).slice(0, 10);
    const houseNum = selectedHouse === "all" ? null : Number(selectedHouse);
    setUploading(true);
    let uploaded = 0;
    try {
      for (const arquivo of arquivos) {
        const isCamera = source === "camera";
        const payload = isCamera ? arquivo : await compressImageSafe(arquivo, { maxSide: 1024, quality: 0.7 });
        const safe = arquivo.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const houseSeg = houseNum != null ? `casa-${houseNum}/` : "geral/";
        const ext = isCamera ? (arquivo.type.includes("png") ? "png" : arquivo.type.includes("webp") ? "webp" : "jpg") : "jpg";
        const extSafeName = safe.includes(".") ? safe.replace(/\.[^.]+$/, `.${ext}`) : `${safe}.${ext}`;
        const contentType = isCamera ? (arquivo.type || "image/jpeg") : "image/jpeg";
        const path = `${companyId}/${diaryEntryId}/${diaryItemId}/${houseSeg}${Date.now()}_${extSafeName}`;
        const { error: upErr } = await supabase.storage
          .from("diary-photos")
          .upload(path, payload, { contentType, upsert: false });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from("diary_photos").insert({
          diary_entry_id: diaryEntryId,
          diary_item_id: diaryItemId,
          storage_path: path,
          legenda: null,
          house_number: houseNum,
        } as any);
        if (dbErr) {
          await supabase.storage.from("diary-photos").remove([path]);
          throw dbErr;
        }
        uploaded++;
      }
      const houseLabel = houseNum != null ? `casa ${String(houseNum).padStart(2, "0")}` : "todas as casas";
      toast.success(`${uploaded} foto(s) anexada(s) à ${houseLabel}.`);
      await loadFotos();
      await refreshCount();
      onChanged?.();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = async (foto: FotoServico) => {
    try {
      await supabase.storage.from("diary-photos").remove([foto.storage_path]);
      await supabase.from("diary_photos").delete().eq("id", foto.id);
      setFotos(prev => prev.filter(f => f.id !== foto.id));
      await refreshCount();
      onChanged?.();
      toast.success("Foto removida.");
    } catch {
      toast.error("Erro ao remover foto.");
    }
  };

  const handleRelink = async (foto: FotoServico, newHouseValue: string) => {
    const newHouse = newHouseValue === "all" ? null : Number(newHouseValue);
    if (newHouse === foto.house_number) return;
    try {
      const { error } = await supabase
        .from("diary_photos")
        .update({ house_number: newHouse } as any)
        .eq("id", foto.id);
      if (error) throw error;
      setFotos(prev => prev.map(f => f.id === foto.id ? { ...f, house_number: newHouse } : f));
      onChanged?.();
      toast.success(
        newHouse != null
          ? `Foto vinculada à Casa ${String(newHouse).padStart(2, "0")}.`
          : "Foto marcada como geral."
      );
    } catch (err: any) {
      toast.error("Erro ao revincular: " + (err.message || ""));
    }
  };

  const sortedHouses = [...houseIds].sort((a, b) => a - b);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 gap-1 text-xs"
        onClick={handleOpen}
        disabled={disabled}
        title="Anexar fotos a este serviço"
      >
        <Camera className="h-3.5 w-3.5" />
        {count > 0 ? (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{count}</Badge>
        ) : (
          <span className="hidden sm:inline">Foto</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Fotos do serviço
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escolha a casa, depois envie a(s) foto(s). A foto vai para o
              histórico daquela casa específica.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Vincular foto à casa:
                </label>
                <Select value={selectedHouse} onValueChange={setSelectedHouse}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Todas as casas (foto geral do serviço)</SelectItem>
                    {sortedHouses.map(h => (
                      <SelectItem key={h} value={String(h)}>
                        Casa {String(h).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={openCameraCapture}
                  disabled={uploading || disabled}
                  className="h-10"
                >
                  {uploading
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <Camera className="h-4 w-4 mr-1" />}
                  Tirar foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploading || disabled}
                  className="h-10"
                >
                  Galeria
                </Button>
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e, "gallery")}
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : fotos.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                Nenhuma foto anexada a este serviço ainda.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {fotos.map(f => (
                  <div
                    key={f.id}
                    className={cn(
                      "relative group rounded-md overflow-hidden border bg-muted",
                      f.house_number != null && "ring-1 ring-primary/40"
                    )}
                  >
                    <img src={f.url} alt={f.legenda || "Foto do serviço"} className="w-full h-32 object-cover" />
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {f.house_number != null
                        ? `Casa ${String(f.house_number).padStart(2, "0")}`
                        : "Geral"}
                    </div>
                    {!disabled && (
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition"
                        onClick={() => handleRemove(f)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!disabled && (
                      <div className="p-1.5 bg-background border-t">
                        <Select
                          value={f.house_number != null ? String(f.house_number) : "all"}
                          onValueChange={(v) => handleRelink(f, v)}
                        >
                          <SelectTrigger className="h-7 text-[11px] px-2">
                            <div className="flex items-center gap-1 truncate">
                              <Link2 className="h-3 w-3 shrink-0" />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="all">Geral (sem casa)</SelectItem>
                            {sortedHouses.map(h => (
                              <SelectItem key={h} value={String(h)}>
                                Casa {String(h).padStart(2, "0")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
