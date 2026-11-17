import { supabase } from '@/integrations/supabase/client';

export type HighlightPlan = 'free' | 'member' | 'scratch' | 'pro' | 'apex';

/**
 * Monthly upload quota per membership plan.
 * Counts BOTH highlight uploads (photos/videos) and profile/lesson videos
 * uploaded by the student. Analysis videos are excluded — they have their
 * own credit system.
 * `Infinity` = unlimited.
 */
export const HIGHLIGHT_MONTHLY_QUOTA: Record<HighlightPlan, number> = {
  free: 4,
  member: 4,
  scratch: 20,
  pro: 40,
  apex: Infinity,
};

export function getMonthlyQuota(plan: HighlightPlan): number {
  // TEMPORARY: upload limits disabled for all tiers. Tier table (HIGHLIGHT_MONTHLY_QUOTA)
  // is preserved above so the proper per-plan quotas can be re-enabled later by simply
  // restoring the original return statements below.
  void plan;
  return Infinity;
  // Original logic (re-enable when ready):
  // return HIGHLIGHT_MONTHLY_QUOTA[plan] ?? HIGHLIGHT_MONTHLY_QUOTA.free;
}

/** First day of next month — when monthly quota resets. */
export function getQuotaResetDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/** First moment of the current month. */
export function getMonthStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Count uploads counted against the monthly quota for this student in the
 * current calendar month: highlights + non-analysis videos.
 */
export async function getUsedThisMonth(studentId: string): Promise<number> {
  const monthStart = getMonthStart().toISOString();
  const [{ count: hCount, error: hErr }, { count: vCount, error: vErr }] = await Promise.all([
    supabase
    .from('student_highlights' as any)
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
      .gte('created_at', monthStart),
    supabase
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('uploaded_by', studentId)
      .neq('category', 'analysis')
      .gte('created_at', monthStart),
  ]);
  if (hErr) console.error('[videoQuota] highlights count error', hErr);
  if (vErr) console.error('[videoQuota] videos count error', vErr);
  return (hCount ?? 0) + (vCount ?? 0);
}

/** File requirement constants (kept here so UI + modal stay in sync). */
export const HIGHLIGHT_REQUIREMENTS = {
  imageMaxMB: 10,
  videoMaxSeconds: 8,
  videoMaxMB: 100,
  imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  videoTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
};