import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, Trash2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

// Compressão simples — espelha a usada em DiarioObraView
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
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("blob")), "image/jpeg", quality);
    };
    img.onerror = () => reject(new Error("img"));
    img.src = URL.createObjectURL(file);
  });
}

interface FotoServico {
  id: string;
  storage_path: string;
  legenda: string | null;
  url: string;
}

interface Props {
  diaryEntryId: string;
  diaryItemId: string;
  companyId: string;
  disabled?: boolean;
  onChanged?: () => void;
}

/**
 * Botão compacto para anexar fotos a um serviço específico do diário.
 * As fotos ficam vinculadas via `diary_photos.diary_item_id` — base do
 * histórico fotográfico por casa exibido nos mapas.
 */
export function DiaryItemPhotoButton({
  diaryEntryId,
  diaryItemId,
  companyId,
  disabled,
  onChanged,
}: Props) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [fotos, setFotos] = useState<FotoServico[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Conta fotos atuais (leve)
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
      .select("id, storage_path, legenda")
      .eq("diary_item_id", diaryItemId)
      .order("created_at", { ascending: true });
    if (!data) { setFotos([]); setLoading(false); return; }
    const withUrl = await Promise.all(data.map(async (f) => {
      const { data: signed } = await supabase.storage
        .from("diary-photos").createSignedUrl(f.storage_path, 60 * 60);
      return { ...f, url: signed?.signedUrl || "" } as FotoServico;
    }));
    setFotos(withUrl);
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(true);
    loadFotos();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const arquivos = Array.from(e.target.files).slice(0, 10);
    setUploading(true);
    let uploaded = 0;
    try {
      for (const arquivo of arquivos) {
        const blob = await comprimirImagem(arquivo, 1024, 0.7);
        const safe = arquivo.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const path = `${companyId}/${diaryEntryId}/${diaryItemId}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from("diary-photos")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from("diary_photos").insert({
          diary_entry_id: diaryEntryId,
          diary_item_id: diaryItemId,
          storage_path: path,
          legenda: null,
        });
        if (dbErr) {
          await supabase.storage.from("diary-photos").remove([path]);
          throw dbErr;
        }
        uploaded++;
      }
      toast.success(`${uploaded} foto(s) anexada(s) ao serviço.`);
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
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Estas fotos ficam vinculadas a este serviço e aparecem no histórico
                de cada casa envolvida — base para auditoria.
              </p>
              <Button
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={uploading || disabled}
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
                Anexar fotos
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleUpload}
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
                  <div key={f.id} className="relative group rounded-md overflow-hidden border bg-muted">
                    <img src={f.url} alt={f.legenda || "Foto do serviço"} className="w-full h-32 object-cover" />
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
