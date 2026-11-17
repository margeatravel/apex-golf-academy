import { useEffect, useState } from 'react';
import { signLessonVideoUrl, extractLessonVideoPath } from '@/lib/lessonVideoSign';

/**
 * Returns a short-lived signed URL for an object in the `lesson-videos` bucket.
 * Pass the value you already have in the DB (`video_url` / `file_url` /
 * `thumbnail_url` — these are previously stored public-style URLs whose path
 * is still extractable).
 *
 * - Returns `null` while the URL is being signed (or if the user has no access).
 * - Re-signs when `urlOrPath` changes.
 * - If the input isn't a lesson-videos URL at all, the original string is
 *   returned unchanged so existing non-bucket URLs still work.
 */
export function useSignedLessonVideoUrl(
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600,
): string | null {
  const [signed, setSigned] = useState<string | null>(() => {
    // If the input isn't from lesson-videos, pass it through immediately.
    if (urlOrPath && extractLessonVideoPath(urlOrPath) === null) return urlOrPath;
    return null;
  });

  useEffect(() => {
    let cancelled = false;

    if (!urlOrPath) {
      setSigned(null);
      return;
    }

    // Inputs not from the lesson-videos bucket are returned as-is.
    if (extractLessonVideoPath(urlOrPath) === null) {
      setSigned(urlOrPath);
      return;
    }

    setSigned(null);
    signLessonVideoUrl(urlOrPath, expiresInSeconds).then((url) => {
      if (!cancelled) setSigned(url);
    });

    return () => {
      cancelled = true;
    };
  }, [urlOrPath, expiresInSeconds]);

  return signed;
}