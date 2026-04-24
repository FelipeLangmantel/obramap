import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Video, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { RdoAttachment } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  entryId: string | null;
  companyId: string | null;
  videos: RdoAttachment[];
  disabled?: boolean;
  onChanged: () => void;
  onRequestCreateEntry?: () => Promise<string | null>;
}

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DURATION_S = 50;

function checkVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { window.URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    v.src = URL.createObjectURL(file);
  });
}

export function RdoVideosSection({ entryId, companyId, videos, disabled, onChanged, onRequestCreateEntry }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ensuredEntryId, setEnsuredEntryId] = useState<string | null>(null);

  const activeEntryId = entryId || ensuredEntryId;

  const handleAdd = async () => {
    if (!companyId) {
      toast.error("Empresa não identificada para o upload.");
      return;
    }

    if (activeEntryId) {
      inputRef.current?.click();
      return;
    }

    const resolvedEntryId = await onRequestCreateEntry?.();
    if (!resolvedEntryId) return;
    setEnsuredEntryId(resolvedEntryId);
    requestAnimationFrame(() => inputRef.current?.click());
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const resolvedEntryId = activeEntryId || ensuredEntryId || await onRequestCreateEntry?.();
    if (!file || !resolvedEntryId || !companyId) return;
    setEnsuredEntryId(resolvedEntryId);
    e.target.value = "";

    if (file.size > MAX_BYTES) {
      toast.error("Vídeo excede 100 MB.");
      return;
    }
    try {
      const dur = await checkVideoDuration(file);
      if (dur > MAX_DURATION_S) {
        toast.error(`Vídeo tem ${Math.round(dur)}s. Máximo permitido: ${MAX_DURATION_S}s.`);
        return;
      }
    } catch {
      toast.error("Não foi possível validar a duração do vídeo.");
      return;
    }

    setUploading(true); setProgress(10);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `${companyId}/${resolvedEntryId}/videos/${Date.now()}_${safeName}`;
      setProgress(40);
      const { error: upErr } = await supabase.storage
        .from("diary-attachments")
        .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
      if (upErr) throw upErr;
      setProgress(80);
      const { error: dbErr } = await supabase.from("diary_attachments").insert({
        company_id: companyId,
        diary_entry_id: resolvedEntryId,
        tipo: "video",
        storage_path: path,
        nome_original: file.name,
        tamanho_bytes: file.size,
      });
      if (dbErr) {
        await supabase.storage.from("diary-attachments").remove([path]);
        throw dbErr;
      }
      setProgress(100);
      toast.success("Vídeo enviado.");
      onChanged();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleRemove = async (v: RdoAttachment) => {
    try {
      await supabase.storage.from("diary-attachments").remove([v.storage_path]);
      await supabase.from("diary_attachments").delete().eq("id", v.id);
      toast.success("Vídeo removido.");
      onChanged();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

  return (
    <RdoSectionShell
      id="videos"
      title="Vídeos"
      count={videos.length}
      onAdd={!disabled ? handleAdd : undefined}
      disabled={disabled || uploading}
      emptyText="Vídeo MP4 (50 segundos) com até 100 MB"
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4"
        className="hidden"
        onChange={handleFile}
      />
      {uploading && (
        <div className="mb-3 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />Enviando vídeo...
          </div>
          <Progress value={progress} />
        </div>
      )}
      {videos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {videos.map(v => (
            <div key={v.id} className="relative group rounded-lg border overflow-hidden bg-muted">
              <video src={v.url} controls className="w-full max-h-60 bg-black" />
              <div className="px-3 py-2 flex items-center justify-between text-xs">
                <span className="truncate flex items-center gap-1">
                  <Video className="h-3 w-3" />{v.nome_original}
                </span>
                {!disabled && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRemove(v)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </RdoSectionShell>
  );
}
