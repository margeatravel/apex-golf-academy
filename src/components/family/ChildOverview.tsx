import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Package, Video, BookOpen, FileText, Trophy } from 'lucide-react';
import { formatLessonDate, formatLessonTime } from '@/lib/formatLessonDateTime';
import { Button } from '@/components/ui/button';
import { CreateReportModal } from '@/components/CreateReportModal';
import { ReportPreviewModal } from '@/components/ReportPreviewModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { SignedGolfMediaImg } from '@/components/SignedGolfMedia';
import { useSignedGolfMediaUrl } from '@/hooks/useSignedGolfMediaUrl';
import { useSignedLessonVideoUrl } from '@/hooks/useSignedLessonVideoUrl';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanColors, resolvePlanColor } from '@/hooks/usePlanColors';

export type Visibility = {
  profile?: boolean;
  points?: boolean;
  packages?: boolean;
  lessons?: boolean;
  media?: boolean;
  plan?: boolean;
};

export const DEFAULT_VISIBILITY: Required<Visibility> = {
  profile: true,
  points: true,
  packages: true,
  lessons: true,
  media: true,
  plan: true,
};

interface Props {
  childId: string;
  visibility?: Visibility;
  canCreateReport?: boolean;
}

/**
 * One media/video tile. Files live either in golf-media or lesson-videos, so
 * both the thumbnail and the link are signed for whichever bucket applies.
 */
function FamilyMediaTile({ item, fallbackLabel, untitled }: { item: any; fallbackLabel: string; untitled: string }) {
  const signedLessonFile = useSignedLessonVideoUrl(item.file_url);
  const signedGolfFile = useSignedGolfMediaUrl(item.file_url);
  const signedLessonThumb = useSignedLessonVideoUrl(item.thumbnail_url);
  const href = signedLessonFile ?? signedGolfFile ?? undefined;

  return (
    <a href={href} target="_blank" rel="noreferrer" className="glass-card-sm block overflow-hidden">
      {item.thumbnail_url ? (
        signedLessonThumb ? (
          <img src={signedLessonThumb} alt="" className="w-full aspect-video object-cover" />
        ) : (
          <SignedGolfMediaImg src={item.thumbnail_url} alt="" className="w-full aspect-video object-cover" />
        )
      ) : (
        <div className="w-full aspect-video flex items-center justify-center text-ivory/40 text-xs">
          {item.media_type ?? fallbackLabel}
        </div>
      )}
      <p className="text-xs text-ivory/70 px-2 py-1 truncate">{item.title || untitled}</p>
    </a>
  );
}

export function ChildOverview({ childId, visibility, canCreateReport = true }: Props) {
  const v = { ...DEFAULT_VISIBILITY, ...(visibility ?? {}) };
  const { t } = useLanguage();
  const qc = useQueryClient();
  // Accent color comes from the VIEWER's plan (billing_plans via usePlanColors),
  // falling back to the portal gold when there is no paid plan.
  const { effectivePlan } = useAuth();
  const planColors = usePlanColors();
  const accent = resolvePlanColor(planColors, effectivePlan) || '#F0C040';
  const [createReportOpen, setCreateReportOpen] = useState(false);
  const [reportPreview, setReportPreview] = useState<{
    report: any;
    studentName: string;
    dateStart: string;
    dateEnd: string;
  } | null>(null);

  const { data: child } = useQuery({
    queryKey: ['family-child-profile', childId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, photo_url, plan_tier, handicap')
        .eq('id', childId)
        .maybeSingle();
      return data;
    },
    enabled: !!childId,
  });

  const { data: lessons = [] } = useQuery({
    queryKey: ['family-child-lessons', childId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_type, status, duration_minutes')
        .eq('student_id', childId)
        .order('lesson_date', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!childId && v.lessons,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['family-child-packages', childId],
    queryFn: async () => {
      const { data } = await supabase
        .from('class_packages')
        .select('id, package_name, package_size, classes_remaining, classes_used, is_active, payment_status')
        .eq('user_id', childId)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!childId && v.packages,
  });

  const { data: rounds = [] } = useQuery({
    queryKey: ['family-child-rounds', childId],
    queryFn: async () => {
      const { data } = await supabase
        .from('golf_rounds')
        .select('total_score, course_par, holes_played')
        .eq('student_id', childId);
      return data ?? [];
    },
    enabled: !!childId && v.points,
  });

  const fullRounds = (rounds as any[]).filter(
    (r) => Number(r.holes_played ?? 18) === 18 && r.total_score != null,
  );
  const bestScore = fullRounds.length
    ? Math.min(...fullRounds.map((r) => Number(r.total_score)))
    : null;
  const scoringAverage = fullRounds.length
    ? Math.round(
        (fullRounds.reduce((sum, r) => sum + Number(r.total_score), 0) / fullRounds.length) * 10,
      ) / 10
    : null;

  const lastLesson =
    (lessons as any[]).find((l) => l.status === 'completed') ?? (lessons as any[])[0] ?? null;
  const lastLessonLabel = lastLesson
    ? formatLessonDate(
        { lesson_date: lastLesson.lesson_date, lesson_time: lastLesson.lesson_time },
        'short',
      )
    : '—';

  // Both coach media and videos belong to the family member, so the section
  // shows the two sources merged and sorted by date.
  const { data: media = [] } = useQuery({
    queryKey: ['family-child-media', childId],
    queryFn: async () => {
      const [{ data: mediaRows }, { data: videoRows }] = await Promise.all([
        supabase
          .from('student_media')
          .select('id, title, file_url, thumbnail_url, media_type, created_at')
          .eq('student_id', childId)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('videos')
          .select('id, title, file_url, thumbnail_url, file_type, upload_date')
          .eq('student_id', childId)
          .order('upload_date', { ascending: false })
          .limit(8),
      ]);
      const merged = [
        ...((mediaRows ?? []) as any[]).map((m) => ({ ...m, _date: m.created_at })),
        ...((videoRows ?? []) as any[]).map((v2) => ({
          id: v2.id,
          title: v2.title,
          file_url: v2.file_url,
          thumbnail_url: v2.thumbnail_url,
          media_type: v2.file_type,
          _date: v2.upload_date,
        })),
      ];
      return merged
        .sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime())
        .slice(0, 8);
    },
    enabled: !!childId && v.media,
  });

  const { data: plan } = useQuery({
    queryKey: ['family-child-plan', childId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_training_plans')
        .select('id, title, summary, created_at')
        .eq('student_id', childId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!childId && v.plan,
  });

  const childName = child?.full_name || child?.email || t('home.childOverviewChildFallback');

  const allHidden = !v.profile && !v.points && !v.packages && !v.lessons && !v.media && !v.plan;

  return (
    <div className="space-y-4">
      {canCreateReport && (
        <Button
          onClick={() => setCreateReportOpen(true)}
          className="w-full text-[#F5F0E8] hover:opacity-90"
          style={{ background: accent }}
        >
          <FileText className="h-4 w-4 mr-2" />
          {t('reports.createTitle')}
        </Button>
      )}

      {v.profile && (
        <section
          className="glass-card p-4"
          style={{ borderColor: `${accent}55` }}
        >
          <div className="flex items-center gap-3">
            {child?.photo_url ? (
              <img src={child.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="h-14 w-14 rounded-full flex items-center justify-center text-ivory text-lg font-semibold" style={{ background: `${accent}33` }}>
                {childName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-ivory font-semibold truncate">{childName}</p>
              <p className="text-xs text-ivory/60 truncate">{child?.email}</p>
              <p className="text-xs text-ivory/50 mt-1">
                {t('home.childOverviewPlanLabel')}: {child?.plan_tier ?? '—'}
                {child?.handicap != null ? ` · HCP ${child.handicap}` : ''}
              </p>
            </div>
          </div>
        </section>
      )}

      {v.points && (
        <section className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4" style={{ color: accent }} />
            <h2 className="text-sm font-semibold text-ivory">{t('home.childOverviewPerformance')}</h2>
          </div>
          {fullRounds.length === 0 && !lastLesson ? (
            <p className="text-xs text-ivory/40">{t('home.childOverviewNoRoundsOrLessons')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-bold" style={{ color: accent }}>{bestScore ?? '—'}</p>
                <p className="text-[10px] text-ivory/50 uppercase">{t('home.childOverviewBestScore')}</p>
                <p className="text-[10px] text-ivory/40 mt-0.5">
                  {fullRounds.length
                    ? (fullRounds.length === 1
                        ? t('home.childOverviewFromRound')
                        : t('home.childOverviewFromRounds').replace('{n}', String(fullRounds.length)))
                    : t('home.childOverviewNoRounds')}
                </p>
              </div>
              <div>
                <p className="text-xl font-bold text-ivory">{scoringAverage ?? '—'}</p>
                <p className="text-[10px] text-ivory/50 uppercase">{t('home.childOverviewScoringAvg')}</p>
                <p className="text-[10px] text-ivory/40 mt-0.5">{t('home.childOverview18HoleRounds')}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-ivory leading-tight pt-1">{lastLessonLabel}</p>
                <p className="text-[10px] text-ivory/50 uppercase mt-1">{t('home.childOverviewLastLesson')}</p>
                <p className="text-[10px] text-ivory/40 mt-0.5">
                  {lastLesson ? (lastLesson.status ?? '') : t('home.childOverviewNoneYet')}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {v.packages && (
        <section className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4" style={{ color: accent }} />
            <h2 className="text-sm font-semibold text-ivory">{t('home.childOverviewLessonPackages')}</h2>
          </div>
          {packages.length === 0 ? (
            <p className="text-xs text-ivory/40">{t('home.childOverviewNoPackages')}</p>
          ) : (
            <div className="space-y-2">
              {packages.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="text-ivory">{p.package_name || t('home.childOverviewLessonPackageName').replace('{n}', String(p.package_size))}</p>
                    <p className="text-xs text-ivory/50">
                      {t('home.childOverviewRemainingUsed').replace('{remaining}', String(p.classes_remaining)).replace('{used}', String(p.classes_used))}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full text-ivory"
                    style={p.is_active ? { background: `${accent}44` } : { background: 'rgba(255,255,255,0.08)', color: 'rgba(245,240,232,0.5)' }}>
                    {p.is_active ? t('home.childOverviewActive') : t('home.childOverviewDone')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {v.lessons && (
        <section className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4" style={{ color: accent }} />
            <h2 className="text-sm font-semibold text-ivory">{t('home.childOverviewRecentLessons')}</h2>
          </div>
          {lessons.length === 0 ? (
            <p className="text-xs text-ivory/40">{t('home.childOverviewNoLessons')}</p>
          ) : (
            <ul className="space-y-2">
              {lessons.map((l: any) => (
                <li key={l.id} className="flex justify-between items-center text-sm">
                  <div className="min-w-0">
                    <p className="text-ivory truncate">{l.lesson_type}</p>
                    <p className="text-xs text-ivory/50">
                      {formatLessonDate({ lesson_date: l.lesson_date, lesson_time: l.lesson_time }, 'short')} · {formatLessonTime({ lesson_date: l.lesson_date, lesson_time: l.lesson_time })}
                    </p>
                  </div>
                  <span className="text-[10px] text-ivory/60 uppercase">{l.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {v.media && (
        <section className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Video className="h-4 w-4" style={{ color: accent }} />
            <h2 className="text-sm font-semibold text-ivory">{t('home.childOverviewRecentVideos')}</h2>
          </div>
          {media.length === 0 ? (
            <p className="text-xs text-ivory/40">{t('home.childOverviewNoUploads')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {media.map((m: any) => (
                <FamilyMediaTile
                  key={m.id}
                  item={m}
                  fallbackLabel={t('home.childOverviewMedia')}
                  untitled={t('home.childOverviewUntitled')}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {v.plan && plan && (
        <section className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4" style={{ color: accent }} />
            <h2 className="text-sm font-semibold text-ivory">{t('home.childOverviewLatestTrainingPlan')}</h2>
          </div>
          <p className="text-ivory text-sm">{plan.title}</p>
          {plan.summary && <p className="text-xs text-ivory/60 mt-1 whitespace-pre-line">{plan.summary}</p>}
        </section>
      )}

      {allHidden && (
        <div className="glass-card p-6 text-center">
          <p className="text-ivory/60 text-sm">{t('home.childOverviewAllHidden')}</p>
        </div>
      )}

      {canCreateReport && (
        <>
          <CreateReportModal
            open={createReportOpen}
            onOpenChange={setCreateReportOpen}
            studentId={childId}
            studentName={childName}
            onReportGenerated={(report, name, start, end) => {
              setReportPreview({ report, studentName: name, dateStart: start, dateEnd: end });
            }}
          />
          {reportPreview && (
            <ReportPreviewModal
              open={!!reportPreview}
              onOpenChange={(o) => !o && setReportPreview(null)}
              report={reportPreview.report}
              studentId={childId}
              studentName={reportPreview.studentName}
              dateStart={reportPreview.dateStart}
              dateEnd={reportPreview.dateEnd}
              onRegenerate={() => {
                setReportPreview(null);
                setCreateReportOpen(true);
              }}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ['student-reports', childId] });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}