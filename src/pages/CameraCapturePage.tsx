import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImageSafe } from "@/lib/compressImage";

function sanitizeFileName(name: string) {
  const clean = (name || "foto.jpg").replace(/[^a-zA-Z0-9.]/g, "_");
  return clean.includes(".") ? clean : `${clean}.jpg`;
}

export default function CameraCapturePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const entryId = params.get("entryId") || "";
  const itemId = params.get("itemId") || null;
  const date = params.get("date") || null;
  const houseParam = params.get("house") || "all";
  const returnTo = params.get("returnTo") || "/dashboard";
  const companyId = params.get("companyId") || "";

  const houseNumber = useMemo(() => {
    if (houseParam === "all" || houseParam === "none") return null;
    const parsed = Number(houseParam);
    return Number.isFinite(parsed) ? parsed : null;
  }, [houseParam]);

  const goBack = () => {
    // Hard navigation de volta — mantém consistência com a ida (window.location.href).
    // Garante que a câmera encerra limpo antes de recarregar o app.
    window.location.href = returnTo;
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("obramap_camera_capture_status");
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (pending?.entryId === entryId && Date.now() - Number(pending.startedAt || 0) < 10 * 60 * 1000) {
        setMessage("A câmera foi fechada pelo Android antes de devolver a foto. Tente novamente nesta tela leve; se repetir, use Galeria após tirar a foto pela câmera do celular.");
      }
    } catch { /* noop */ }
  }, [entryId]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !entryId || !companyId) return;

    setUploading(true);
    try {
      sessionStorage.setItem("obramap_camera_capture_status", JSON.stringify({ entryId, itemId, date, startedAt: Date.now() }));
      if (date) {
        sessionStorage.setItem("obramap_diario_tab", JSON.stringify({ tab: "editor", selectedDate: date }));
      }

      // Android WebView: nunca usar fallback com new Image/canvas em foto da câmera.
      // Se createImageBitmap não reduzir com segurança, envia o arquivo original.
      let payload: Blob = file;
      try {
        payload = await compressImageSafe(file, { maxSide: 1024, quality: 0.68, allowUnsafeFallback: false });
      } catch (compressErr) {
        console.warn("[camera] compressão falhou, usando arquivo original:", compressErr);
        payload = file;
      }

      const safeName = sanitizeFileName(file.name).replace(/\.[^.]+$/, ".jpg");
      const houseSeg = itemId ? (houseNumber != null ? `casa-${houseNumber}/` : "geral/") : "";
      const path = `${companyId}/${entryId}/${itemId ? `${itemId}/` : ""}${houseSeg}${Date.now()}_${safeName}`;
      const contentType = "image/jpeg";

      const { error: uploadError } = await supabase.storage
        .from("diary-photos")
        .upload(path, payload, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("diary_photos").insert({
        diary_entry_id: entryId,
        diary_item_id: itemId,
        storage_path: path,
        legenda: null,
        house_number: houseNumber,
      });

      if (dbError) {
        await supabase.storage.from("diary-photos").remove([path]);
        throw dbError;
      }

      sessionStorage.removeItem("obramap_camera_capture_status");
      setMessage("Foto enviada. Voltando ao diário...");
      goBack();
    } catch (err: unknown) {
      setMessage("Erro ao enviar foto: " + (err instanceof Error ? err.message : ""));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <section className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-2">
          <Camera className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-xl font-semibold">Captura de foto</h1>
          <p className="text-sm text-muted-foreground">
            Tela leve para abrir a câmera sem carregar o diário inteiro em segundo plano.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleCapture}
          disabled={uploading}
        />

        <div className="grid gap-2">
          <Button type="button" size="lg" onClick={() => inputRef.current?.click()} disabled={uploading || !entryId || !companyId}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
            Abrir câmera
          </Button>
          <Button type="button" variant="outline" onClick={goBack} disabled={uploading}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </section>
    </main>
  );
}