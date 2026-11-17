import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isDemoModeActive } from '@/contexts/DemoModeContext';
import { demoLessonPricing } from '@/data/demoData';

const SANTIAGO_COACH_ID = '13480fb4-e4d2-423c-b035-c65846b061fc';

/**
 * Per-coach lesson pricing. Falls back to Santiago's pricing if the coach
 * hasn't set their own, then to the legacy academy_settings.lesson_pricing.
 */
export function useCoachLessonPricing(coachId?: string | null) {
  const effectiveCoachId = coachId || SANTIAGO_COACH_ID;
  return useQuery({
    queryKey: ['coach-lesson-pricing', effectiveCoachId, isDemoModeActive() ? 'demo' : 'live'],
    queryFn: async () => {
      if (isDemoModeActive()) return demoLessonPricing as any;

      // Try this coach's row first
      const { data: own } = await supabase
        .from('coach_lesson_pricing' as any)
        .select('pricing')
        .eq('coach_id', effectiveCoachId)
        .maybeSingle();
      if (own && (own as any).pricing && Object.keys((own as any).pricing).length > 0) {
        return (own as any).pricing;
      }

      // Fallback: Santiago's row
      if (effectiveCoachId !== SANTIAGO_COACH_ID) {
        const { data: santi } = await supabase
          .from('coach_lesson_pricing' as any)
          .select('pricing')
          .eq('coach_id', SANTIAGO_COACH_ID)
          .maybeSingle();
        if (santi && (santi as any).pricing && Object.keys((santi as any).pricing).length > 0) {
          return (santi as any).pricing;
        }
      }

      // Legacy fallback
      const { data: legacy } = await supabase
        .from('academy_settings')
        .select('value')
        .eq('key', 'lesson_pricing')
        .maybeSingle();
      return (legacy?.value as any) ?? null;
    },
    enabled: !!effectiveCoachId,
  });
}
