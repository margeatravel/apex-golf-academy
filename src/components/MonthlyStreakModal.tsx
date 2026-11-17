import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Flame, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatLessonDate, formatLessonTime, getLessonSortKey } from '@/lib/formatLessonDateTime';
import { format } from 'date-fns';

interface MonthlyStreakModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** ISO date (YYYY-MM-DD) marking the first day of the streak month. */
  monthStart?: string | null;
  /** Optional: lessons count snapshot from the transaction. */
  lessonsThisMonth?: number;
}

export function MonthlyStreakModal({
  open,
  onOpenChange,
  userId,
  monthStart,
  lessonsThisMonth,
}: MonthlyStreakModalProps) {
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId || !monthStart) return;
    const load = async () => {
      setLoading(true);
      // Compute month range from monthStart
      const start = new Date(monthStart + 'T00:00:00');
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_start_at, lesson_type, status')
        .eq('student_id', userId)
        .eq('status', 'completed')
        .gte('lesson_date', startStr)
        .lt('lesson_date', endStr);
      const sorted = (data || []).sort((a: any, b: any) =>
        getLessonSortKey(a).localeCompare(getLessonSortKey(b))
      );
      setLessons(sorted);
      setLoading(false);
    };
    load();
  }, [open, userId, monthStart]);

  const monthLabel = monthStart
    ? format(new Date(monthStart + 'T00:00:00'), 'MMMM yyyy')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#F5F0E8] text-lg font-semibold flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" />
            Monthly Streak — {monthLabel}
          </DialogTitle>
          <DialogDescription className="text-[#F5F0E8]/60 text-xs">
            Awarded once a student completes 4+ lessons in the same calendar month (+15 SC Points).
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg p-3 mt-1 flex items-center justify-between"
          style={{ background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.25)' }}>
          <div>
            <div className="text-xs text-[#F5F0E8]/60">Completed this month</div>
            <div className="text-2xl font-bold text-orange-400">
              {lessonsThisMonth ?? lessons.length}
            </div>
          </div>
          <Badge className="bg-orange-400/20 text-orange-400 border-orange-400/30">+15 pts</Badge>
        </div>

        <div className="mt-2 max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#F5F0E8]/50" />
            </div>
          ) : lessons.length === 0 ? (
            <div className="text-center py-6 text-[#F5F0E8]/50 text-sm">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No completed lessons found for this month.
            </div>
          ) : (
            lessons.map((l, i) => (
              <div
                key={l.id}
                className="flex items-center gap-3 rounded-lg p-2.5"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{ background: 'rgba(251,146,60,0.18)', color: '#fb923c' }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#F5F0E8] truncate">
                    {formatLessonDate(l, 'short')}
                  </div>
                  <div className="text-[11px] text-[#F5F0E8]/60 truncate">
                    {formatLessonTime(l)} · {l.lesson_type}
                  </div>
                </div>
                <Badge className="bg-[#4a7c59]/20 text-[#4a7c59] border-[#4a7c59]/30 text-[10px] px-1.5">
                  ✅
                </Badge>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
