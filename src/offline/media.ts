// Compressão de mídia para o Diário Offline
// - Fotos: redimensiona para ≤ 1600px no maior lado, JPEG 70% (~200-400KB)
// - Thumbnails: 300px JPEG 60% (~10-20KB) — usado para preview rápido
// - Vídeos: valida duração ≤ 30s e tamanho ≤ 50MB. Sem transcode no client
//   (transcode pesado consumiria bateria do celular)
//
// IMPORTANTE: Usa `compressImageSafe` (createImageBitmap + resize nativo)
// para evitar estouro de memória em câmeras de celular modernas — antes
// usava `new Image()` + canvas full, que descomprimia ~50MB de bitmap.

import { compressImageSafe } from "@/lib/compressImage";

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

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  if (file.size > MEDIA_LIMITS.PHOTO_MAX_INPUT_BYTES) {
    throw new Error("Foto excede 25 MB.");
  }
  // SEQUENCIAL — em paralelo dobra o pico de memória (2 bitmaps simultâneos).
  const blob = await compressImageSafe(file, {
    maxSide: MAX_PHOTO_SIDE,
    quality: PHOTO_QUALITY,
    maxInputBytes: MEDIA_LIMITS.PHOTO_MAX_INPUT_BYTES,
  });
  // Thumbnail a partir do blob já reduzido (não do arquivo cru)
  const thumbInput = new File([blob], file.name, { type: blob.type });
  const thumbnail = await compressImageSafe(thumbInput, {
    maxSide: THUMB_SIDE,
    quality: THUMB_QUALITY,
  });

  let width = 0, height = 0;
  try {
    const probe = await createImageBitmap(blob);
    width = probe.width;
    height = probe.height;
    probe.close();
  } catch { /* ignore */ }

  return {
    blob,
    thumbnail,
    width,
    height,
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
