import { useEffect, useState } from 'react';
import { signLessonVideoUrl, extractLessonVideoPath } from '@/lib/lessonVideoSign';
import { signGolfMediaUrl, extractGolfMediaPath } from '@/lib/golfMediaSign';

/**
 * Signs a URL stored in either the `lesson-videos` or `golf-media` private
 * bucket. Pass-through for any other URL. Use this when a `videos`-style row
 * could have been uploaded to either bucket.
 */
export function useSignedMediaUrl(
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600,
): string | null {
  const [signed, setSigned] = useState<string | null>(() => {
    if (!urlOrPath) return null;
    if (extractLessonVideoPath(urlOrPath)) return null;
    if (extractGolfMediaPath(urlOrPath)) return null;
    return urlOrPath;
  });

  useEffect(() => {
    let cancelled = false;
    if (!urlOrPath) { setSigned(null); return; }

    if (extractLessonVideoPath(urlOrPath)) {
      setSigned(null);
      signLessonVideoUrl(urlOrPath, expiresInSeconds).then((u) => { if (!cancelled) setSigned(u); });
      return () => { cancelled = true; };
    }
    if (extractGolfMediaPath(urlOrPath)) {
      setSigned(null);
      signGolfMediaUrl(urlOrPath, expiresInSeconds).then((u) => { if (!cancelled) setSigned(u); });
      return () => { cancelled = true; };
    }

    setSigned(urlOrPath);
    return () => { cancelled = true; };
  }, [urlOrPath, expiresInSeconds]);

  return signed;
}