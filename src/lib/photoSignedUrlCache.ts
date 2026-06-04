import { supabase } from "@/integrations/supabase/client";

export const PHOTO_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;
const PHOTO_SIGNED_URL_CACHE_TTL_MS = 50 * 60 * 1000;

type PhotoTransformOptions = Record<string, string | number | boolean | null | undefined>;

type CachedPhotoSignedUrlOptions = {
  bucket: string;
  path: string | null | undefined;
  expiresIn?: number;
  transform?: PhotoTransformOptions;
};

const photoSignedUrlCache = new Map<string, { signedUrl: string; expiresAt: number }>();

function getStableTransformKey(transform?: PhotoTransformOptions) {
  if (!transform) return "no-transform";
  const sortedEntries = Object.entries(transform)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(sortedEntries);
}

function getCacheKey(bucket: string, path: string, transform?: PhotoTransformOptions) {
  return `${bucket}:${path}:${getStableTransformKey(transform)}`;
}

export function invalidatePhotoSignedUrlCache(bucket?: string, path?: string | null) {
  if (!bucket && !path) {
    photoSignedUrlCache.clear();
    return;
  }

  const prefix = bucket && path ? `${bucket}:${path}:` : bucket ? `${bucket}:` : "";
  Array.from(photoSignedUrlCache.keys()).forEach((key) => {
    if (!prefix || key.startsWith(prefix)) {
      photoSignedUrlCache.delete(key);
    }
  });
}

export async function getCachedPhotoSignedUrl({
  bucket,
  path,
  expiresIn = PHOTO_SIGNED_URL_EXPIRES_IN_SECONDS,
  transform,
}: CachedPhotoSignedUrlOptions): Promise<string | null> {
  if (!bucket || !path) return null;

  const cacheKey = getCacheKey(bucket, path, transform);
  const now = Date.now();
  const cached = photoSignedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.signedUrl;
  }
  if (cached) photoSignedUrlCache.delete(cacheKey);

  const options = transform ? { transform } : undefined;
  const { data, error } = await (supabase.storage.from(bucket) as any)
    .createSignedUrl(path, expiresIn, options);

  if (error || !data?.signedUrl) {
    console.warn("[photoSignedUrlCache] failed to create signed URL", {
      bucket,
      path,
      hasTransform: Boolean(transform),
      error,
    });
    return null;
  }

  photoSignedUrlCache.set(cacheKey, {
    signedUrl: data.signedUrl,
    expiresAt: Date.now() + PHOTO_SIGNED_URL_CACHE_TTL_MS,
  });
  return data.signedUrl;
}
