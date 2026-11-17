import { useEffect, useState } from 'react';
import { signGolfMediaUrl, extractGolfMediaPath } from '@/lib/golfMediaSign';

/**
 * Short-lived signed URL for an object in the `golf-media` bucket.
 * Pass-through for any URL that isn't a golf-media URL.
 */
export function useSignedGolfMediaUrl(
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600,
): string | null {
  const [signed, setSigned] = useState<string | null>(() => {
    if (urlOrPath && extractGolfMediaPath(urlOrPath) === null) return urlOrPath;
    return null;
  });

  useEffect(() => {
    let cancelled = false;

    if (!urlOrPath) {
      setSigned(null);
      return;
    }

    if (extractGolfMediaPath(urlOrPath) === null) {
      setSigned(urlOrPath);
      return;
    }

    setSigned(null);
    signGolfMediaUrl(urlOrPath, expiresInSeconds).then((url) => {
      if (!cancelled) setSigned(url);
    });

    return () => {
      cancelled = true;
    };
  }, [urlOrPath, expiresInSeconds]);

  return signed;
}