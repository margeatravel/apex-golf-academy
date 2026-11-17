import { supabase } from '@/integrations/supabase/client';

/**
 * Extract a storage path within the `golf-media` bucket from:
 *   - public URL `.../storage/v1/object/public/golf-media/<path>`
 *   - signed URL `.../storage/v1/object/sign/golf-media/<path>?token=...`
 *   - bare path `<userId>/<filename>.jpg`
 * Returns null when the input doesn't reference the golf-media bucket.
 */
export function extractGolfMediaPath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const s = String(urlOrPath).trim();
  if (!s) return null;

  if (!/^https?:\/\//i.test(s)) {
    return s.replace(/^golf-media\//, '');
  }

  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/golf-media\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/**
 * Returns a signed URL for an object in the `golf-media` bucket. Memoised.
 * Returns null when the path can't be resolved or signing fails (e.g. no RLS access).
 */
export async function signGolfMediaUrl(
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const path = extractGolfMediaPath(urlOrPath);
  if (!path) return null;

  const key = `${path}|${expiresInSeconds}`;
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 5_000) {
    return cached.url;
  }

  const { data, error } = await supabase
    .storage
    .from('golf-media')
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  cache.set(key, {
    url: data.signedUrl,
    expiresAt: now + Math.max(60_000, (expiresInSeconds - 60) * 1000),
  });
  return data.signedUrl;
}