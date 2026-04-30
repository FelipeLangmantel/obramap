import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, ArrowLeft, Image as ImageIcon, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImageSafe } from "@/lib/compressImage";
import { isNativePlatform, captureWithNativePlugin } from "@/lib/nativeCamera";

function sanitizeFileName(name: string) {
  const clean = (name || "foto.jpg").replace(/[^a-zA-Z0-9.]/g, "_");
  return clean.includes(".") ? clean : `${clean}.jpg`;
}

const MAX_CAMERA_FILE_MB = 50;
const MAX_DIRECT_UPLOAD_MB = 20;

function canUploadOriginalSafely(blob: Blob) {
  return blob.type.startsWith("image/") && blob.size <= MAX_DIRECT_UPLOAD_MB * 1024 * 1024;
}

type CaptureSource = "native-camera" | "web-camera" | "web-gallery";

export default function CameraCapturePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasNative, setHasNative] = useState(false);

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
    window.location.href = returnTo;
  };

  // Detecta se Capacitor nativo está disponível
  useEffect(() => {
    isNativePlatform().then(setHasNative).catch(() => setHasNative(false));
  }, []);

  // Recupera mensagem de process death (câmera matou o WebView)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("obramap_camera_capture_status");
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (pending?.entryId === entryId && Date.now() - Number(pending.startedAt || 0) < 10 * 60 * 1000) {
        setMessage(
          "⚠️ A câmera foi fechada pelo Android antes de devolver a foto (problema comum em Motorola/Samsung). " +
          "Use \"Anexar da galeria\" abaixo: tire a foto pela câmera do celular e depois selecione a foto na galeria."
        );
      }
      sessionStorage.removeItem("obramap_camera_capture_status");
    } catch { /* noop */ }
  }, [entryId]);

  /**
   * Processa um Blob/File já capturado (câmera nativa, câmera web ou galeria)
   * e faz o upload para o Supabase Storage + diary_photos.
   */
  const processAndUpload = async (
    inputBlob: Blob,
    originalName: string,
    source: CaptureSource,
  ) => {
    if (!entryId || !companyId) return;

    if (inputBlob.size > MAX_CAMERA_FILE_MB * 1024 * 1024) {
      setMessage(
        `Erro: foto com ${(inputBlob.size / 1024 / 1024).toFixed(0)}MB. ` +
        `Máximo: ${MAX_CAMERA_FILE_MB}MB. Reduza a resolução da câmera.`
      );
      return;
    }

    setUploading(true);
    try {
      sessionStorage.setItem(
        "obramap_camera_capture_status",
        JSON.stringify({ entryId, itemId, date, source, startedAt: Date.now() })
      );
      if (date) {
        sessionStorage.setItem("obramap_diario_tab", JSON.stringify({ tab: "editor", selectedDate: date }));
      }

      let payload: Blob = inputBlob;
      let contentType = inputBlob.type || "image/jpeg";

      // Captura nativa (Capacitor) já vem com tamanho controlado → upload direto.
      // Captura web (input file) tenta compressão; se falhar, envia original se for seguro.
      if (source !== "native-camera") {
        try {
          console.log(`[camera] Comprimindo (${source}): ${(inputBlob.size / 1024 / 1024).toFixed(1)}MB`);
          payload = await compressImageSafe(inputBlob as File, {
            maxSide: 1280,
            quality: 0.7,
            allowUnsafeFallback: true,
            maxInputBytes: 50 * 1024 * 1024,
          });
          contentType = "image/jpeg";
          console.log(`[camera] Compressão ok: → ${(payload.size / 1024 / 1024).toFixed(1)}MB`);
        } catch (compressErr) {
          console.warn("[camera] Compressão falhou:", compressErr);
          if (!canUploadOriginalSafely(inputBlob)) {
            throw new Error(
              `Não foi possível reduzir a foto e o original tem ${(inputBlob.size / 1024 / 1024).toFixed(1)}MB. ` +
              `Limite seguro: ${MAX_DIRECT_UPLOAD_MB}MB. ` +
              `Tente "Anexar da galeria" e use uma foto em menor resolução, ou abaixe a resolução da câmera.`
            );
          }
          payload = inputBlob;
          contentType = inputBlob.type || "image/jpeg";
          setMessage("Compressão falhou neste aparelho; enviando a foto original com segurança...");
        }
      }

      if (payload.size > 50 * 1024 * 1024) {
        throw new Error(
          `Arquivo final muito grande: ${(payload.size / 1024 / 1024).toFixed(0)}MB. Reduza a resolução.`
        );
      }

      const safeName = sanitizeFileName(originalName).replace(/\.[^.]+$/, ".jpg");
      const houseSeg = itemId ? (houseNumber != null ? `casa-${houseNumber}/` : "geral/") : "";
      const path = `${companyId}/${entryId}/${itemId ? `${itemId}/` : ""}${houseSeg}${Date.now()}_${safeName}`;

      console.log(`[camera] Upload (${source}): ${path} (${(payload.size / 1024 / 1024).toFixed(1)}MB)`);

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
      setMessage("✅ Foto enviada com sucesso! Voltando ao diário...");
      setTimeout(() => goBack(), 1200);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[camera] Erro:", errorMsg);
      setMessage(`Erro ao enviar foto: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleWebInput = async (e: React.ChangeEvent<HTMLInputElement>, source: CaptureSource) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processAndUpload(file, file.name, source);
  };

  const handleNativeCamera = async () => {
    if (!entryId || !companyId) return;
    setMessage(null);
    try {
      const result = await captureWithNativePlugin({ quality: 70, width: 1600 });
      await processAndUpload(result.blob, result.fileName, "native-camera");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Cancelamento do usuário não é erro
      if (/cancel/i.test(msg)) return;
      console.error("[camera] Captura nativa falhou:", msg);
      setMessage(`Câmera nativa falhou: ${msg}. Tentando câmera do navegador...`);
      // Cai automaticamente para câmera web
      cameraInputRef.current?.click();
    }
  };

  const ready = !!entryId && !!companyId;

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <section className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-2">
          <Camera className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-xl font-semibold">Captura de foto</h1>
          <p className="text-sm text-muted-foreground">
            Tela leve para abrir a câmera ou anexar da galeria.
          </p>
        </div>

        {/* Inputs ocultos: câmera (com capture) e galeria (sem capture) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => handleWebInput(e, "web-camera")}
          disabled={uploading}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => handleWebInput(e, "web-gallery")}
          disabled={uploading}
        />

        <div className="grid gap-2">
          {/* Botão principal: câmera nativa se disponível, senão câmera web */}
          <Button
            type="button"
            size="lg"
            onClick={hasNative ? handleNativeCamera : () => cameraInputRef.current?.click()}
            disabled={uploading || !ready}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : hasNative ? (
              <Smartphone className="h-4 w-4 mr-2" />
            ) : (
              <Camera className="h-4 w-4 mr-2" />
            )}
            {hasNative ? "Tirar foto (nativo)" : "Tirar foto"}
          </Button>

          {/* Fallback universal — sempre visível */}
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading || !ready}
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Anexar da galeria
          </Button>

          <Button type="button" variant="outline" onClick={goBack} disabled={uploading}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>

        {!hasNative && (
          <p className="text-xs text-muted-foreground/80">
            💡 Se "Tirar foto" travar no seu aparelho (comum em Motorola/Samsung), use{" "}
            <strong>Anexar da galeria</strong>: tire a foto pela câmera do celular e depois selecione aqui.
          </p>
        )}

        {message && (
          <p
            className="text-sm text-foreground bg-muted/60 border rounded-md p-3 text-left"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
