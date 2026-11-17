import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PRO_ZONE_CATEGORIES, type ProZoneCategory } from '@/lib/proZoneCategories';

export interface ProZoneCategoryWithMeta extends ProZoneCategory {
  /** True if this section was added by a coach (not part of the built-in list). */
  isCustom: boolean;
}

/**
 * Returns Pro Zone categories with coach-renamed labels and custom coach-added
 * sections merged in.
 * - Built-in categories: `key` and `emoji` come from the hardcoded list (stable
 *   across the app); only `label` is overridable via `pro_zone_category_labels`.
 * - Custom categories: stored in `pro_zone_custom_categories` and appended after
 *   the built-in list, ordered by their `sort_order`.
 */
export function useProZoneCategories(): {
  categories: ProZoneCategoryWithMeta[];
  isLoading: boolean;
  refresh: () => void;
} {
  const qc = useQueryClient();

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['pro-zone-category-labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_category_labels' as any)
        .select('key, label');
      if (error) throw error;
      const map = new Map<string, string>();
      ((data ?? []) as any[]).forEach((r) => map.set(r.key, r.label));
      return map;
    },
    staleTime: 60_000,
  });

  const { data: custom, isLoading: customLoading } = useQuery({
    queryKey: ['pro-zone-custom-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_custom_categories' as any)
        .select('key, label, emoji, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<{
        key: string;
        label: string;
        emoji: string;
        sort_order: number;
        is_active: boolean;
      }>;
    },
    staleTime: 60_000,
  });

  const builtIns: ProZoneCategoryWithMeta[] = PRO_ZONE_CATEGORIES.map((c) => ({
    ...c,
    label: overrides?.get(c.key) ?? c.label,
    isCustom: false,
  }));

  const customCats: ProZoneCategoryWithMeta[] = (custom ?? []).map((c) => ({
    key: c.key,
    label: overrides?.get(c.key) ?? c.label,
    emoji: c.emoji || '⛳',
    isCustom: true,
  }));

  const categories = [...builtIns, ...customCats];

  return {
    categories,
    isLoading: isLoading || customLoading,
    refresh: () => {
      qc.invalidateQueries({ queryKey: ['pro-zone-category-labels'] });
      qc.invalidateQueries({ queryKey: ['pro-zone-custom-categories'] });
    },
  };
}