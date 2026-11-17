export interface ProZoneCategory {
  key: string;
  label: string;
  emoji: string;
}

/** i18n key per category — labels are resolved via t('prozone.<labelKey>') at render time. */
export const PRO_ZONE_CATEGORY_LABEL_KEYS: Record<string, string> = {
  grip: 'catGrip',
  release: 'catRelease',
  putt: 'catPutt',
  driver: 'catDriver',
  irons: 'catIrons',
  transition: 'catTransition',
  bunker: 'catBunker',
  scoring_stats: 'catScoringStats',
  course_management: 'catCourseManagement',
  mobility_gym: 'catMobilityGym',
  mental_game: 'catMentalGame',
  backswing: 'catBackswing',
  club_face_alignment: 'catClubFaceAlignment',
  club_path_alignment: 'catClubPathAlignment',
  address_body_alignment: 'catAddressBodyAlignment',
  tour_pros: 'catTourPros',
};

/** Ordered list of the 15 Pro Zone categories (EN fallback labels; UI should prefer t(prozone.<labelKey>)). */
export const PRO_ZONE_CATEGORIES: ProZoneCategory[] = [
  { key: 'grip', label: 'Grip', emoji: '🤝' },
  { key: 'release', label: 'Release', emoji: '🎯' },
  { key: 'putt', label: 'Putt', emoji: '⛳' },
  { key: 'driver', label: 'Driver', emoji: '🏌️' },
  { key: 'irons', label: 'Irons', emoji: '🎯' },
  { key: 'transition', label: 'Transition', emoji: '🔄' },
  { key: 'bunker', label: 'Bunker', emoji: '🏖️' },
  { key: 'scoring_stats', label: 'Scoring Stats', emoji: '📊' },
  { key: 'course_management', label: 'Course Management', emoji: '🗺️' },
  { key: 'mobility_gym', label: 'Mobility & Gym', emoji: '💪' },
  { key: 'mental_game', label: 'Mental Game', emoji: '🧠' },
  { key: 'backswing', label: 'Backswing', emoji: '↩️' },
  { key: 'club_face_alignment', label: 'Club Face Alignment', emoji: '📐' },
  { key: 'club_path_alignment', label: 'Club Path Alignment', emoji: '➡️' },
  { key: 'address_body_alignment', label: 'Address & Body Alignment', emoji: '🧍' },
  { key: 'tour_pros', label: 'Tour Pros', emoji: '🏆' },
];

export const getCategoryMeta = (key: string) =>
  PRO_ZONE_CATEGORIES.find((c) => c.key === key) ?? {
    key,
    label: key,
    emoji: '⛳',
  };

/** Type stored in `pro_zone_media.file_type`. */
export type ProZoneMediaType = 'image' | 'video' | 'link';

/** Returns true if URL is well-formed (http/https). */
export function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Returns the registrable domain for a URL (best-effort), e.g. "youtube.com". */
export function getDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return '';
  }
}

/**
 * Detect whether a pasted URL should be stored as `video` (playable inline) or `link`.
 * Returns `'video'` for direct media files and known video platforms, otherwise `'link'`.
 */
export function detectMediaType(url: string): 'video' | 'link' {
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|webm|m4v|ogg)(\?|#|$)/.test(lower)) return 'video';
  if (/(youtube\.com|youtu\.be|vimeo\.com|instagram\.com\/(reel|p|tv)|tiktok\.com)/.test(lower)) {
    return 'video';
  }
  return 'link';
}

/**
 * Returns true if the URL points to a directly-playable video file
 * (i.e. an mp4/mov/webm in our golf-media bucket — NOT a YouTube/Vimeo embed).
 * Side-by-side compare requires direct files because iframe embeds can't be
 * precisely sync-scrubbed without each platform's JS SDK.
 */
export function isDirectVideoFile(url: string): boolean {
  if (!url) return false;
  const lower = url.split('?')[0].split('#')[0].toLowerCase();
  return /\.(mp4|mov|webm|m4v|ogg)$/.test(lower);
}

/**
 * Returns an embeddable iframe URL for the given external URL, or null when no
 * embed is available (caller should fall back to a plain link card).
 *
 * NOTE: Instagram and TikTok embeds are intentionally excluded — they frequently
 * render blank inside iframes (login walls, X-Frame-Options) and don't expose
 * a thumbnail. We prefer a clickable preview card that opens the original.
 */
export function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    // YouTube
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      const shortMatch = u.pathname.match(/^\/(shorts|embed)\/([a-zA-Z0-9_-]+)/);
      if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[2]}`;
    }

    // Vimeo
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }

    // Instagram & TikTok intentionally skipped — see note above.

    return null;
  } catch {
    return null;
  }
}