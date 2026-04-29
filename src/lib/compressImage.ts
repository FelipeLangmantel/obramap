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
//  1) Tenta `createImageBitmap` com `resizeWidth/Height` — o navegador
//     decodifica diretamente no tamanho final (não aloca a versão full).
//  2) Fecha o bitmap (`.close()`) imediatamente após desenhar.
//  3) Limpa o canvas (1x1) ao terminar.
//  4) Em fallback (Safari iOS antigo) usa `new Image()` mas SEMPRE
//     revoga o objectURL e zera o canvas.
//  5) Pré-validação de tamanho do arquivo cru.

export interface CompressOptions {
  /** Maior lado em pixels (default 1280). */
  maxSide?: number;
  /** Qualidade JPEG (0-1, default 0.7). */
  quality?: number;
  /** Mime de saída (default image/jpeg). */
  mime?: string;
  /** Tamanho máximo do arquivo cru em bytes (default 25 MB). Acima disso recusa. */
  maxInputBytes?: number;
}

const DEFAULTS: Required<Omit<CompressOptions, "maxInputBytes">> & { maxInputBytes: number } = {
  maxSide: 1280,
  quality: 0.7,
  mime: "image/jpeg",
  maxInputBytes: 25 * 1024 * 1024,
};

function calcDims(srcW: number, srcH: number, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
  return { w: Math.max(1, Math.round(srcW * ratio)), h: Math.max(1, Math.round(srcH * ratio)) };
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
  // Primeiro decodifica metadata para saber dimensões originais.
  // `imageOrientation: "from-image"` corrige fotos rotacionadas (EXIF).
  const meta = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { w, h } = calcDims(meta.width, meta.height, opts.maxSide);
  meta.close();

  // Segunda decodificação JÁ no tamanho alvo — economiza muita RAM.
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
  const merged: Required<CompressOptions> = { ...DEFAULTS, ...opts } as any;

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
  return compressWithImgFallback(file, merged);
}
