import { supabase } from "@/integrations/supabase/client";
import { endMap3DPerf, logMap3DPerf, startMap3DPerf } from "@/lib/map3dPerf";

export const MAP3D_STORAGE_BUCKET = "3d-models";
export const MAP3D_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const MAP3D_SIGNED_URL_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

const missingStoragePaths = new Set<string>();
const signedUrlCache = new Map<string, { signedUrl: string; expiresAt: number }>();

function getSignedUrlCacheKey(path: string): string {
  return `${MAP3D_STORAGE_BUCKET}:${path}`;
}

export function normalizeMap3DStoragePath(path: string | null | undefined): string | null {
  if (!path) return null;
  const cleaned = path.split("?")[0].replace(/^\/+/, "");
  const bucketPrefix = `${MAP3D_STORAGE_BUCKET}/`;
  return cleaned.startsWith(bucketPrefix) ? cleaned.slice(bucketPrefix.length) : cleaned;
}

/**
 * Extract the storage object path within the 3d-models bucket from any
 * previously-saved Supabase Storage URL (public or signed).
 * Returns null if the URL does not point at this bucket.
 */
export function extractMap3DStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    let rest = u.pathname.slice(idx + marker.length);
    // rest is e.g. "public/3d-models/.." or "sign/3d-models/.." or "3d-models/.."
    rest = rest.replace(/^(public|sign|authenticated)\//, "");
    const prefix = `${MAP3D_STORAGE_BUCKET}/`;
    if (!rest.startsWith(prefix)) return null;
    return normalizeMap3DStoragePath(decodeURIComponent(rest.slice(prefix.length)));
  } catch {
    return null;
  }
}

export function invalidateMap3DSignedUrlCache(pathOrUrl?: string | null): void {
  if (!pathOrUrl) {
    signedUrlCache.clear();
    return;
  }
  const path = extractMap3DStoragePath(pathOrUrl) ?? normalizeMap3DStoragePath(pathOrUrl);
  if (!path) return;
  signedUrlCache.delete(getSignedUrlCacheKey(path));
}

export async function createMap3DSignedUrlFromPath(
  path: string | null | undefined,
): Promise<string | null> {
  const normalizedPath = normalizeMap3DStoragePath(path);
  if (!normalizedPath) return null;
  if (missingStoragePaths.has(normalizedPath)) {
    logMap3DPerf("resolveMap3DSignedUrl skip missing", {
      bucket: MAP3D_STORAGE_BUCKET,
      path: normalizedPath,
    });
    return null;
  }
  const cacheKey = getSignedUrlCacheKey(normalizedPath);
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logMap3DPerf("signed URL cache hit", {
      bucket: MAP3D_STORAGE_BUCKET,
      path: normalizedPath,
      resolveMs: 0,
    });
    return cached.signedUrl;
  }
  if (cached) signedUrlCache.delete(cacheKey);

  const resolveStartedAt = performance.now();
  logMap3DPerf("signed URL cache miss", {
    bucket: MAP3D_STORAGE_BUCKET,
    path: normalizedPath,
  });
  const perf = startMap3DPerf("resolveMap3DSignedUrl createSignedUrl", {
    bucket: MAP3D_STORAGE_BUCKET,
    path: normalizedPath,
  });
  const { data, error } = await supabase.storage
    .from(MAP3D_STORAGE_BUCKET)
    .createSignedUrl(normalizedPath, MAP3D_SIGNED_URL_TTL_SECONDS);
  endMap3DPerf(perf, { ok: !error && !!data?.signedUrl });
  if (error || !data?.signedUrl) {
    signedUrlCache.delete(cacheKey);
    const message = error instanceof Error ? error.message : String(error ?? "");
    const details = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
    const statusCode = details.statusCode ?? details.status;
    const isMissingObject = message.toLowerCase().includes("object not found")
      || String(details.error ?? "").toLowerCase().includes("not found")
      || statusCode === "404"
      || statusCode === 404;
    const shouldInvalidateCache = statusCode === "401"
      || statusCode === 401
      || statusCode === "403"
      || statusCode === 403
      || statusCode === "404"
      || statusCode === 404;
    if (shouldInvalidateCache) signedUrlCache.delete(cacheKey);
    if (isMissingObject) {
      missingStoragePaths.add(normalizedPath);
      console.warn("[3D] Arquivo do modelo nao encontrado no Storage; ignorando nas proximas tentativas desta sessao.", {
        path: normalizedPath,
        error,
      });
    } else {
      console.error("[3D] Failed to sign URL for", normalizedPath, error);
    }
    return null;
  }
  signedUrlCache.set(cacheKey, {
    signedUrl: data.signedUrl,
    expiresAt: Date.now() + MAP3D_SIGNED_URL_CACHE_TTL_MS,
  });
  logMap3DPerf("resolveMap3DSignedUrl resolved", {
    bucket: MAP3D_STORAGE_BUCKET,
    path: normalizedPath,
    resolveMs: Math.round(performance.now() - resolveStartedAt),
    cacheTtlMinutes: MAP3D_SIGNED_URL_CACHE_TTL_MS / 60_000,
  });
  return data.signedUrl;
}

/**
 * Resolve any saved 3D-model URL (public or signed) into a fresh signed URL.
 * Falls back to the original URL if it's not a Supabase Storage URL we recognize.
 */
export async function resolveMap3DSignedUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  const perf = startMap3DPerf("resolveMap3DSignedUrl", {
    input: url.split("?")[0],
  });
  const path = extractMap3DStoragePath(url);
  if (!path) {
    endMap3DPerf(perf, { storagePath: null, passthrough: true });
    return url;
  }
  const signedUrl = await createMap3DSignedUrlFromPath(path);
  endMap3DPerf(perf, {
    storagePath: path,
    ok: Boolean(signedUrl),
  });
  return signedUrl;
}
