import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CalendarCheck, Video, Flag, Trophy, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Item = { id: string; date: string; kind: 'lesson' | 'video' | 'round' | 'handicap'; title: string; sub?: string; highlight?: boolean };

const ICONS = { lesson: CalendarCheck, video: Video, round: Flag, handicap: TrendingDown };

function parseLocal(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
}

export function ProfileTimeline({ studentId, language, locale }: { studentId: string; language: string; locale: string }) {
  const es = language === 'es';
  const [shown, setShown] = useState(10);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['profile-timeline', studentId],
    queryFn: async () => {
      const [lessons, videos, rounds, hcp] = await Promise.all([
        supabase.from('lessons').select('id, lesson_date, lesson_type').eq('student_id', studentId).eq('status', 'completed').order('lesson_date', { ascending: false }).limit(200),
        supabase.from('videos').select('id, title, video_date, upload_date, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(200),
        supabase.from('golf_rounds').select('id, played_on, total_score, holes_played, course_name_snapshot, round_type, tournament_position').eq('student_id', studentId).order('played_on', { ascending: true }).limit(300),
        supabase.from('handicap_history').select('id, handicap, recorded_at').eq('user_id', studentId).order('recorded_at', { ascending: true }),
      ]);
      const out: Item[] = [];
      (lessons.data || []).forEach((l: any) => out.push({ id: `l-${l.id}`, date: l.lesson_date, kind: 'lesson', title: es ? 'Clase completada' : 'Lesson completed', sub: l.lesson_type || undefined }));
      (videos.data || []).forEach((v: any) => out.push({ id: `v-${v.id}`, date: v.video_date || v.upload_date || v.created_at, kind: 'video', title: v.title || (es ? 'Video nuevo' : 'New video'), sub: es ? 'Video subido' : 'Video uploaded' }));
      const best: Record<number, number> = {};
      (rounds.data || []).forEach((r: any) => {
        const prev = best[r.holes_played];
        const isBest = prev !== undefined && r.total_score < prev;
        if (prev === undefined || r.total_score < prev) best[r.holes_played] = r.total_score;
        const tourn = r.round_type === 'tournament';
        out.push({
          id: `r-${r.id}`, date: r.played_on, kind: 'round',
          title: isBest ? (es ? `¡Mejor ronda! ${r.total_score}` : `New best round! ${r.total_score}`) : `${es ? 'Ronda' : 'Round'} ${r.total_score} · ${r.holes_played} ${es ? 'hoyos' : 'holes'}`,
          sub: [r.course_name_snapshot, tourn ? `${es ? 'Torneo' : 'Tournament'}${r.tournament_position ? ` · ${es ? 'Lugar' : 'Place'} ${r.tournament_position}` : ''}` : null].filter(Boolean).join(' · '),
          highlight: isBest || (tourn && r.tournament_position != null && r.tournament_position <= 3),
        });
      });
      let last: number | null = null;
      (hcp.data || []).forEach((h: any) => {
        const v = Number(h.handicap);
        if (last !== null && v !== last) {
          out.push({ id: `h-${h.id}`, date: h.recorded_at, kind: 'handicap', title: `Handicap ${last} → ${v}`, highlight: v < last });
        }
        last = v;
      });
      return out.sort((a, b) => parseLocal(b.date).getTime() - parseLocal(a.date).getTime());
    },
    enabled: !!studentId,
  });

  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  if (isLoading) return <p className="text-ivory/50 text-sm px-1">{es ? 'Cargando…' : 'Loading…'}</p>;
  if (!items.length) return <div className="glass-card p-5 text-center text-ivory/60 text-sm">{es ? 'Tu recorrido aparecerá aquí cuando tomes clases, subas videos o registres rondas.' : 'Your journey will show here once you take lessons, upload videos or log rounds.'}</div>;

  return (
    <div className="space-y-3">
      <ol className="relative border-l border-white/10 ml-4 space-y-3">
        {items.slice(0, shown).map((it) => {
          const Icon = it.highlight ? Trophy : ICONS[it.kind];
          return (
            <li key={it.id} className="ml-6">
              <span className={`absolute -left-4 flex h-8 w-8 items-center justify-center rounded-full border ${it.highlight ? 'bg-gold-accent/20 border-gold-accent/50 text-gold-accent' : 'bg-green-accent/15 border-green-accent/30 text-green-accent'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className={`glass-card px-4 py-3 ${it.highlight ? 'border border-gold-accent/40' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm font-semibold leading-tight ${it.highlight ? 'text-gold-accent' : 'text-ivory'}`}>{it.title}</p>
                  <span className="text-[11px] text-ivory/45 whitespace-nowrap">{fmt.format(parseLocal(it.date))}</span>
                </div>
                {it.sub && <p className="text-xs text-ivory/55 mt-0.5 truncate">{it.sub}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {shown < items.length && (
        <Button type="button" variant="ghost" className="w-full text-ivory/70" onClick={() => setShown((s) => s + 10)}>
          {es ? 'Ver más' : 'Show more'}
        </Button>
      )}
    </div>
  );
}
