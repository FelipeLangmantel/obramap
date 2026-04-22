import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LogoUploaderProps {
  /** URL atual (signed ou pública) */
  currentLogoUrl: string | null;
  /** Caminho lógico no bucket (ex.: companyId ou companyId/projectId) */
  pathPrefix: string;
  /** Bucket público de logos */
  bucket?: string;
  /** Callback quando o logo é alterado (passa a URL pública nova ou null) */
  onChange: (logoUrl: string | null) => void;
  /** Permite remover */
  allowRemove?: boolean;
  /** Tamanho do preview */
  size?: "sm" | "md";
}

async function comprimirImagem(file: File, maxDim = 600, quality = 0.85): Promise<Blob> {
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
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("blob")),
        file.type.includes("png") ? "image/png" : "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("img"));
    img.src = URL.createObjectURL(file);
  });
}

export function LogoUploader({
  currentLogoUrl,
  pathPrefix,
  bucket = "company-logos",
  onChange,
  allowRemove = true,
  size = "md",
}: LogoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dim = size === "sm" ? "h-16 w-16" : "h-24 w-24";

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const isPng = file.type.includes("png");
      const comprimido = await comprimirImagem(file, 600, 0.85);
      const ext = isPng ? "png" : "jpg";
      const path = `${pathPrefix}/logo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, comprimido, {
          contentType: isPng ? "image/png" : "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(pub.publicUrl);
      toast.success("Logo enviado.");
    } catch (err: any) {
      toast.error("Erro ao enviar logo: " + (err?.message || ""));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    onChange(null);
    toast.success("Logo removido.");
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          dim,
          "rounded-lg border-2 border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0"
        )}
      >
        {currentLogoUrl ? (
          <img src={currentLogoUrl} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Enviando...</>
            : <><Upload className="h-3.5 w-3.5 mr-1.5" /> {currentLogoUrl ? "Trocar logo" : "Enviar logo"}</>}
        </Button>
        {currentLogoUrl && allowRemove && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive h-7 text-xs"
            onClick={handleRemove}
            disabled={uploading}
          >
            <X className="h-3 w-3 mr-1" /> Remover
          </Button>
        )}
      </div>
    </div>
  );
}
