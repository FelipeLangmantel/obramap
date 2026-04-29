// Compressão de imagem segura para mobile.
//
// Problema histórico: usar `new Image()` + `canvas.drawImage` carrega o
// bitmap inteiro (RGBA = width * height * 4 bytes) na RAM. Uma foto de
// celular moderno (12 MP, 4032x3024) ocupa ~48 MB **só para o bitmap
// descomprimido** — mais o JPEG original em buffer + o canvas de saída.
// No WebView de Android isso estoura o limite de heap e o app é morto
// pelo SO ("insuficiência de memória").
//
// Esta versão:
//  1) Lê dimensões pelo cabeçalho do arquivo (JPEG/PNG/WebP), sem decodificar
//     o bitmap full-size só para medir a imagem.
//  2) Tenta `createImageBitmap` com `resizeWidth/Height` — o navegador
//     decodifica diretamente no tamanho final (não aloca a versão full).
//  3) Fecha o bitmap (`.close()`) imediatamente após desenhar.
//  4) Limpa o canvas (1x1) ao terminar.
//  5) Só usa fallback `new Image()` para arquivos pequenos ou quando aceito.
//  6) Pré-validação de tamanho do arquivo cru.

export interface CompressOptions {
  /** Maior lado em pixels (default 1280). */
  maxSide?: number;
  /** Qualidade JPEG (0-1, default 0.7). */
  quality?: number;
  /** Mime de saída (default image/jpeg). */
  mime?: string;
  /** Tamanho máximo do arquivo cru em bytes (default 25 MB). Acima disso recusa. */
  maxInputBytes?: number;
  /** Permite fallback com `new Image()` para arquivos grandes quando o header não for lido. */
  allowUnsafeFallback?: boolean;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSide: 1280,
  quality: 0.7,
  mime: "image/jpeg",
  maxInputBytes: 25 * 1024 * 1024,
  allowUnsafeFallback: false,
};

const SAFE_FALLBACK_BYTES = 4 * 1024 * 1024;
const HEADER_READ_BYTES = 512 * 1024;

function calcDims(srcW: number, srcH: number, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
  return { w: Math.max(1, Math.round(srcW * ratio)), h: Math.max(1, Math.round(srcH * ratio)) };
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const buffer = await file.slice(0, HEADER_READ_BYTES).arrayBuffer();
  const view = new DataView(buffer);

  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (view.byteLength >= 30 && view.getUint32(0, true) === 0x46464952 && view.getUint32(8, true) === 0x50424557) {
    const chunk = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
    if (chunk === "VP8X" && view.byteLength >= 30) {
      const width = 1 + view.getUint8(24) + (view.getUint8(25) << 8) + (view.getUint8(26) << 16);
      const height = 1 + view.getUint8(27) + (view.getUint8(28) << 8) + (view.getUint8(29) << 16);
      return { width, height };
    }
    if (chunk === "VP8 " && view.byteLength >= 30) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === "VP8L" && view.byteLength >= 25) {
      const b0 = view.getUint8(21), b1 = view.getUint8(22), b2 = view.getUint8(23), b3 = view.getUint8(24);
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
  }

  if (view.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) { offset++; continue; }
      const marker = view.getUint8(offset + 1);
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
  }

  return null;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))),
      type,
      quality
    );
  });
}

/** Caminho rápido com createImageBitmap + resize nativo. */
async function compressWithImageBitmap(file: File, opts: Required<CompressOptions>): Promise<Blob> {
  const dimensions = await readImageDimensions(file);
  if (!dimensions) throw new Error("Não foi possível ler o tamanho da imagem sem abrir o bitmap.");
  const { w, h } = calcDims(dimensions.width, dimensions.height, opts.maxSide);

  // Decodificação JÁ no tamanho alvo — economiza muita RAM.
  const bmp = await createImageBitmap(file, {
    imageOrientation: "from-image",
    resizeWidth: w,
    resizeHeight: h,
    resizeQuality: "high",
  });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("Canvas indisponível");
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await canvasToBlob(canvas, opts.mime, opts.quality);

  // Libera memória imediatamente
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}

/** Fallback para navegadores sem createImageBitmap (Safari iOS < 15). */
async function compressWithImgFallback(file: File, opts: Required<CompressOptions>): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Imagem inválida"));
      i.src = url;
    });
    const { w, h } = calcDims(img.naturalWidth, img.naturalHeight, opts.maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    ctx.drawImage(img, 0, 0, w, h);
    // libera referência ao bitmap full
    (img as any).src = "";
    const blob = await canvasToBlob(canvas, opts.mime, opts.quality);
    canvas.width = 1;
    canvas.height = 1;
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Comprime uma imagem reduzindo seu maior lado para `maxSide` (default
 * 1280px). Seguro para fotos grandes de câmeras de celular.
 */
export async function compressImageSafe(file: File, opts: CompressOptions = {}): Promise<Blob> {
  const merged: Required<CompressOptions> = { ...DEFAULTS, ...opts };

  if (file.size > merged.maxInputBytes) {
    throw new Error(
      `Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
      `Limite: ${(merged.maxInputBytes / 1024 / 1024).toFixed(0)} MB.`
    );
  }
  // Se o arquivo já é pequeno o suficiente E não precisa de transcoding,
  // ainda assim recodificamos para aplicar EXIF orientation e tirar metadata.

  if (typeof createImageBitmap === "function") {
    try {
      return await compressWithImageBitmap(file, merged);
    } catch (err) {
      // alguns Androids antigos rejeitam resizeWidth — cai no fallback
      console.warn("[compressImageSafe] bitmap path falhou, usando fallback:", err);
    }
  }
  if (!merged.allowUnsafeFallback && file.size > SAFE_FALLBACK_BYTES) {
    throw new Error(
      "Não foi possível reduzir esta foto com segurança neste aparelho. " +
      "Tente tirar a foto em resolução menor ou anexar uma imagem menor."
    );
  }
  return compressWithImgFallback(file, merged);
}
