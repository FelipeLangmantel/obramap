import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Camera, Loader2, Trash2, ImageIcon, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { compressImageSafe } from "@/lib/compressImage";
import { getCachedPhotoSignedUrl } from "@/lib/photoSignedUrlCache";

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
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [fotos, setFotos] = useState<FotoServico[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<FotoServico | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<string>(
    houseIds.length === 1 ? String(houseIds[0]) : "all"
  );
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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
      const signedUrl = await getCachedPhotoSignedUrl({
        bucket: "diary-photos",
        path: f.storage_path,
        transform: { width: 700, resize: "contain", quality: 70 },
      });
      return { ...f, url: signedUrl || "" } as FotoServico;
    }));
    setFotos(withUrl);
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(true);
    loadFotos();
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

  const handleSaveCaption = async () => {
    if (!selectedPhoto) return;
    setSavingCaption(true);
    try {
      const legenda = captionDraft.trim() || null;
      const { error } = await supabase
        .from("diary_photos")
        .update({ legenda } as any)
        .eq("id", selectedPhoto.id);
      if (error) throw error;
      setSelectedPhoto({ ...selectedPhoto, legenda });
      setFotos(prev => prev.map(f => f.id === selectedPhoto.id ? { ...f, legenda } : f));
      onChanged?.();
      toast.success("Legenda salva.");
    } catch (err: any) {
      toast.error("Erro ao salvar legenda: " + (err.message || ""));
    } finally {
      setSavingCaption(false);
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
        <span>Fotos{count > 0 ? ` (${count})` : ""}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Fotos do serviço
            </DialogTitle>
            <DialogDescription>
              Envie, visualize e organize fotos vinculadas ao lançamento do serviço.
            </DialogDescription>
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
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
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
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleUpload(e, "camera")}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {fotos.map(f => (
                  <div
                    key={f.id}
                    className={cn(
                      "group overflow-hidden rounded-lg border bg-card shadow-sm",
                      f.house_number != null && "ring-1 ring-primary/40"
                    )}
                  >
                    <div className="relative">
                      <button
                        type="button"
                        className="flex h-36 w-full items-center justify-center bg-muted/50"
                        onClick={() => {
                          setSelectedPhoto(f);
                          setCaptionDraft(f.legenda || "");
                        }}
                      >
                        <img src={f.url} alt={f.legenda || "Foto do serviço"} className="h-full w-full object-contain" />
                      </button>
                      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {f.house_number != null
                          ? `Casa ${String(f.house_number).padStart(2, "0")}`
                          : "Geral"}
                      </div>
                      {!disabled && (
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute right-2 top-2 h-7 w-7 opacity-0 transition group-hover:opacity-100"
                          onClick={() => handleRemove(f)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="border-t bg-background p-2">
                      <p className="text-[11px] font-medium text-muted-foreground">Legenda/descrição</p>
                      {f.legenda ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-snug text-foreground">{f.legenda}</p>
                      ) : (
                        <p className="mt-1 text-xs italic text-muted-foreground">Sem legenda adicionada.</p>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 w-full text-xs"
                        onClick={() => {
                          setSelectedPhoto(f);
                          setCaptionDraft(f.legenda || "");
                        }}
                      >
                        {!disabled ? "Ver / editar legenda" : "Ver foto"}
                      </Button>
                    </div>
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

      <Dialog open={!!selectedPhoto} onOpenChange={(nextOpen) => {
        if (!nextOpen) setSelectedPhoto(null);
      }}>
        <DialogContent className="max-h-[92vh] max-w-[95vw] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Foto do serviço</DialogTitle>
            <DialogDescription>Visualize a foto e edite a legenda opcional.</DialogDescription>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-3">
              <div className="flex max-h-[66vh] min-h-[220px] items-center justify-center rounded-lg bg-muted/50">
                <img src={selectedPhoto.url} alt={selectedPhoto.legenda || "Foto do serviço"} className="max-h-[66vh] max-w-full rounded-lg object-contain" />
              </div>
              {!disabled ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Legenda opcional</label>
                  <Textarea
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    placeholder="Escreva uma legenda para esta foto..."
                    className="min-h-[70px]"
                  />
                  <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={handleSaveCaption} disabled={savingCaption}>
                      {savingCaption && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Salvar legenda
                    </Button>
                  </div>
                </div>
              ) : selectedPhoto.legenda ? (
                <p className="text-sm text-center text-muted-foreground">{selectedPhoto.legenda}</p>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
