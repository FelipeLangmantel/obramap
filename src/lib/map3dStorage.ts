import { supabase } from "@/integrations/supabase/client";

export const MAP3D_STORAGE_BUCKET = "3d-models";
export const MAP3D_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

export async function createMap3DSignedUrlFromPath(
  path: string | null | undefined,
): Promise<string | null> {
  const normalizedPath = normalizeMap3DStoragePath(path);
  if (!normalizedPath) return null;
  const { data, error } = await supabase.storage
    .from(MAP3D_STORAGE_BUCKET)
    .createSignedUrl(normalizedPath, MAP3D_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[3D] Failed to sign URL for", normalizedPath, error);
    return null;
  }
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
  const path = extractMap3DStoragePath(url);
  if (!path) return url;
  return createMap3DSignedUrlFromPath(path);
}
