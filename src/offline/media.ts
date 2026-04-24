// Compressão de mídia para o Diário Offline
// - Fotos: redimensiona para ≤ 1600px no maior lado, JPEG 70% (~200-400KB)
// - Thumbnails: 300px JPEG 60% (~10-20KB) — usado para preview rápido
// - Vídeos: valida duração ≤ 30s e tamanho ≤ 50MB. Sem transcode no client
//   (transcode pesado consumiria bateria do celular)

const MAX_PHOTO_SIDE = 1600;
const PHOTO_QUALITY = 0.7;
const THUMB_SIDE = 300;
const THUMB_QUALITY = 0.6;

export const MEDIA_LIMITS = {
  PHOTO_MAX_INPUT_BYTES: 25 * 1024 * 1024,   // 25 MB foto crua
  VIDEO_MAX_BYTES: 50 * 1024 * 1024,         // 50 MB
  VIDEO_MAX_DURATION_S: 30,
} as const;

export interface CompressedPhoto {
  blob: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  original_size: number;
  compressed_size: number;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida.")); };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar blob"))),
      type,
      quality
    );
  });
}

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (file.size > MEDIA_LIMITS.PHOTO_MAX_INPUT_BYTES) {
    throw new Error("Foto excede 25 MB.");
  }
  const img = await loadImage(file);
  const mainCanvas = drawScaled(img, MAX_PHOTO_SIDE);
  const thumbCanvas = drawScaled(img, THUMB_SIDE);
  const [blob, thumbnail] = await Promise.all([
    canvasToBlob(mainCanvas, "image/jpeg", PHOTO_QUALITY),
    canvasToBlob(thumbCanvas, "image/jpeg", THUMB_QUALITY),
  ]);
  return {
    blob,
    thumbnail,
    width: mainCanvas.width,
    height: mainCanvas.height,
    original_size: file.size,
    compressed_size: blob.size,
  };
}

export interface ValidatedVideo {
  blob: Blob;
  duration_s: number;
  size: number;
}

export async function validateVideo(file: File): Promise<ValidatedVideo> {
  if (file.size > MEDIA_LIMITS.VIDEO_MAX_BYTES) {
    throw new Error(`Vídeo excede ${MEDIA_LIMITS.VIDEO_MAX_BYTES / 1024 / 1024} MB.`);
  }
  const duration = await new Promise<number>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { window.URL.revokeObjectURL(v.src); resolve(v.duration); };
    v.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    v.src = URL.createObjectURL(file);
  });
  if (duration > MEDIA_LIMITS.VIDEO_MAX_DURATION_S) {
    throw new Error(`Vídeo tem ${Math.round(duration)}s. Máximo: ${MEDIA_LIMITS.VIDEO_MAX_DURATION_S}s.`);
  }
  return { blob: file, duration_s: duration, size: file.size };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
