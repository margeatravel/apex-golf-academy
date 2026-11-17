import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users2, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Card shown on a student's dashboard listing any children linked to them.
 * Hidden if there are no links.
 */
export function MyChildrenCard() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const { data: children = [] } = useQuery({
    queryKey: ['my-children', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: links } = await supabase
        .from('family_links')
        .select('child_user_id')
        .eq('parent_user_id', user.id);
      const ids = (links ?? []).map((l: any) => l.child_user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, photo_url')
        .in('id', ids);
      return profiles ?? [];
    },
    enabled: !!user?.id,
  });

  if (!children.length) return null;

  return (
    <div
      className="w-full rounded-2xl px-4 py-4 border border-white/10 backdrop-blur-md"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Users2 className="h-4 w-4 text-[#F0C040]" />
        <h3 className="text-ivory/55 text-[10px] uppercase tracking-[0.18em] leading-none">{t('home.myChildren')}</h3>
      </div>
      <div className="space-y-2">
        {children.map((c: any) => (
          <Link
            key={c.id}
            to={`/family/${c.id}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2 bg-ivory/5 border border-ivory/10 hover:border-[#F0C040]/40 transition"
          >
            {c.photo_url ? (
              <img src={c.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-[#4a7c59]/40 flex items-center justify-center text-ivory text-sm font-semibold">
                {(c.full_name || c.email || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ivory truncate">{c.full_name || c.email}</p>
              <p className="text-xs text-ivory/50">{t('home.viewProgress')}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-ivory/40" />
          </Link>
        ))}
      </div>
    </div>
  );
}