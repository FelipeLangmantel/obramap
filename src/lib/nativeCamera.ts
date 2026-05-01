/**
 * Helper de captura de foto.
 *
 * Estratégia em camadas (mais robusto → mais simples):
 *  1. Capacitor Camera (quando rodando como app nativo) → câmera nativa fora do WebView,
 *     retorna URI/Blob direto, NÃO estoura memória.
 *  2. Web input <input type="file" capture="environment"> → câmera do navegador (PWA).
 *  3. Web input <input type="file"> → galeria (fallback universal).
 *
 * Em alguns Android (Motorola, Samsung) o `capture` do WebView devolve imagens enormes
 * (12MP/15MB+) e o sistema mata o processo do WebView ao voltar da câmera. Por isso
 * sempre oferecemos a galeria como segunda opção visível ao usuário.
 */

export type NativeCameraResult = {
  blob: Blob;
  fileName: string;
  contentType: string;
  source: "native-camera" | "web-camera" | "web-gallery";
};

/**
 * Detecta se o Capacitor está disponível (build nativo Android/iOS).
 * Em PWA/web puro retorna false.
 */
export async function isNativePlatform(): Promise<boolean> {
  try {
    // Specifier construído em runtime para que o Vite não tente resolver no build web.
    const mod = "@capacitor/core";
    // @ts-ignore - módulo opcional, presente apenas em build Capacitor
    const cap = await import(/* @vite-ignore */ mod).catch(() => null);
    if (!cap) return false;
    // @ts-ignore - tipos opcionais
    return !!cap.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Tenta capturar foto via plugin nativo Capacitor Camera.
 * Lança erro se não estiver disponível ou usuário cancelar.
 *
 * Vantagens:
 *  - Câmera roda fora do WebView → não há process death do app
 *  - Retorna URI/path do arquivo, sem Base64 → sem estouro de heap
 *  - quality/width controláveis na origem
 */
export async function captureWithNativePlugin(opts?: {
  quality?: number;
  width?: number;
}): Promise<NativeCameraResult> {
  // Specifier em variável → Vite ignora no build web; só resolve em runtime nativo.
  const mod = "@capacitor/camera";
  // @ts-ignore - módulo opcional
  const cameraMod = await import(/* @vite-ignore */ mod).catch(() => null);
  if (!cameraMod) {
    throw new Error("Plugin nativo de câmera não disponível neste ambiente.");
  }
  // @ts-ignore - tipos opcionais
  const { Camera, CameraResultType, CameraSource } = cameraMod;

  const photo = await Camera.getPhoto({
    quality: opts?.quality ?? 70,
    width: opts?.width ?? 1600,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    saveToGallery: false,
    correctOrientation: true,
  });

  if (!photo.webPath) {
    throw new Error("Captura nativa não retornou caminho da foto.");
  }

  const resp = await fetch(photo.webPath);
  const blob = await resp.blob();
  const ext = (photo.format || "jpeg").toLowerCase();
  const contentType = blob.type || `image/${ext === "jpg" ? "jpeg" : ext}`;

  return {
    blob,
    fileName: `foto_${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`,
    contentType,
    source: "native-camera",
  };
}
