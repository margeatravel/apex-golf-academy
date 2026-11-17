import { supabase } from '@/integrations/supabase/client';

/**
 * Extracts the storage path within the `lesson-videos` bucket from either:
 *   - a previously stored public URL like `.../storage/v1/object/public/lesson-videos/<path>`
 *   - a current signed URL like `.../storage/v1/object/sign/lesson-videos/<path>?token=...`
 *   - a raw path like `<userId>/<filename>.mp4`
 * Returns null when the input doesn't reference the lesson-videos bucket.
 */
export function extractLessonVideoPath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const s = String(urlOrPath).trim();
  if (!s) return null;

  // Already a bare path (no protocol).
  if (!/^https?:\/\//i.test(s)) {
    // Strip a leading "lesson-videos/" if present.
    return s.replace(/^lesson-videos\//, '');
  }

  // Match both /object/public/lesson-videos/<path> and /object/sign/lesson-videos/<path>
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/lesson-videos\/([^?]+)/);
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
 * Returns a signed URL for an object in the `lesson-videos` bucket, given either
 * a stored URL or a raw path. Memoized for the requested expiry window minus a
 * 60s safety margin. Returns null when the path can't be resolved or signing
 * fails (e.g. caller lacks RLS access).
 */
export async function signLessonVideoUrl(
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const path = extractLessonVideoPath(urlOrPath);
  if (!path) return null;

  const key = `${path}|${expiresInSeconds}`;
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 5_000) {
    return cached.url;
  }

  const { data, error } = await supabase
    .storage
    .from('lesson-videos')
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