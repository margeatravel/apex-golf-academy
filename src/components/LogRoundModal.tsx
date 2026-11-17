import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Trophy, Sparkles, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ManageCoursesModal } from '@/components/ManageCoursesModal';
import { useLanguage } from '@/contexts/LanguageContext';

interface LogRoundModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  /** Pre-filled when editing */
  round?: {
    id: string;
    course_id: string | null;
    course_name_snapshot: string;
    round_type: 'practice' | 'tournament';
    played_on: string;
    holes_played: number;
    course_par: number;
    total_score: number;
    fairways_hit: number | null;
    fairways_total: number | null;
    greens_in_regulation: number | null;
    putts: number | null;
    penalties: number | null;
    weather: string | null;
    notes: string | null;
    tees: string | null;
    lost_balls?: number | null;
    tournament_position?: number | null;
    up_downs_attempted?: number | null;
    up_downs_converted?: number | null;
    eagles?: number | null;
    birdies?: number | null;
    pars?: number | null;
    bogeys?: number | null;
    doubles_plus?: number | null;
    par3_avg?: number | null;
    par4_avg?: number | null;
    par5_avg?: number | null;
    nine_side?: 'front' | 'back' | null;
  } | null;
  onSaved?: () => void;
}

interface CourseRow {
  id: string;
  name: string;
  par: number;
  tees?: { tee_name: string; slope: number | null; rating: number | null }[];
  /** true when this row comes from the shared `courses` table (no FK from golf_rounds), false when from per-student `golf_courses`. */
  is_shared?: boolean;
}

export function LogRoundModal({ open, onOpenChange, studentId, round, onSaved }: LogRoundModalProps) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isEdit = !!round;

  const [courseId, setCourseId] = useState<string>('');
  const [roundType, setRoundType] = useState<'practice' | 'tournament'>('practice');
  const [playedOn, setPlayedOn] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [holesPlayed, setHolesPlayed] = useState<9 | 18>(18);
  const [coursePar, setCoursePar] = useState<number>(72);
  const [nineSide, setNineSide] = useState<'front' | 'back'>('front');
  const [teeName, setTeeName] = useState<string>('');
  const [totalScore, setTotalScore] = useState<string>('');
  const [fairwaysHit, setFairwaysHit] = useState<string>('');
  const [gir, setGir] = useState<string>('');
  const [putts, setPutts] = useState<string>('');
  const [penalties, setPenalties] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  // New advanced fields
  const [lostBalls, setLostBalls] = useState<string>('');
  const [position, setPosition] = useState<string>('');
  const [udConverted, setUdConverted] = useState<string>('');
  const [eagles, setEagles] = useState<string>('');
  const [birdies, setBirdies] = useState<string>('');
  const [pars, setPars] = useState<string>('');
  const [bogeys, setBogeys] = useState<string>('');
  const [doublesPlus, setDoublesPlus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [coursesModalOpen, setCoursesModalOpen] = useState(false);
  const [mode, setMode] = useState<null | 'quick' | 'full'>(null);

  const { data: courses = [] } = useQuery({
    queryKey: ['golf-courses', studentId],
    queryFn: async () => {
      const { data: legacy, error } = await supabase
        .from('golf_courses')
        .select('id, name, par')
        .eq('student_id', studentId)
        .eq('is_archived', false)
        .order('name');
      if (error) throw error;
      const { data: links } = await (supabase as any)
        .from('student_courses')
        .select('course:courses(id, name, par, tees)')
        .eq('student_id', studentId);
      const shared: CourseRow[] = ((links ?? []) as any[])
        .filter((l) => l.course)
        .map((l) => ({
          id: l.course.id,
          name: l.course.name,
          par: l.course.par,
          tees: Array.isArray(l.course.tees) ? l.course.tees : [],
          is_shared: true,
        }));
      const personal: CourseRow[] = ((legacy ?? []) as any[]).map((c) => ({
        id: c.id,
        name: c.name,
        par: c.par,
        is_shared: false,
      }));
      return [...shared, ...personal].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
    enabled: open,
  });

  // Reset / pre-fill when opened
  useEffect(() => {
    if (!open) return;
    setMode(round ? 'full' : null);
    if (round) {
      setCourseId(round.course_id ?? '');
      setRoundType(round.round_type);
      setPlayedOn(round.played_on);
      setHolesPlayed((round.holes_played === 9 ? 9 : 18));
      setCoursePar(round.course_par);
      setNineSide(round.nine_side === 'back' ? 'back' : 'front');
      setTotalScore(String(round.total_score));
      setFairwaysHit(round.fairways_hit != null ? String(round.fairways_hit) : '');
      setGir(round.greens_in_regulation != null ? String(round.greens_in_regulation) : '');
      setPutts(round.putts != null ? String(round.putts) : '');
      setPenalties(round.penalties != null ? String(round.penalties) : '');
      setNotes(round.notes ?? '');
      setLostBalls(round.lost_balls != null ? String(round.lost_balls) : round.penalties != null ? String(round.penalties) : '');
      setPosition(round.tournament_position != null ? String(round.tournament_position) : '');
      setUdConverted(round.up_downs_converted != null ? String(round.up_downs_converted) : '');
      setEagles(round.eagles != null ? String(round.eagles) : '');
      setBirdies(round.birdies != null ? String(round.birdies) : '');
      setPars(round.pars != null ? String(round.pars) : '');
      setBogeys(round.bogeys != null ? String(round.bogeys) : '');
      setDoublesPlus(round.doubles_plus != null ? String(round.doubles_plus) : '');
    } else {
      setCourseId('');
      setRoundType('practice');
      setPlayedOn(new Date().toISOString().slice(0, 10));
      setHolesPlayed(18);
      setCoursePar(72);
      setNineSide('front');
      setTotalScore('');
      setFairwaysHit('');
      setGir('');
      setPutts('');
      setPenalties('');
      setNotes('');
      setLostBalls('');
      setPosition('');
      setUdConverted('');
      setEagles('');
      setBirdies('');
      setPars('');
      setBogeys('');
      setDoublesPlus('');
    }
  }, [open, round]);

  // Auto-fill par from selected course
  useEffect(() => {
    if (!courseId) return;
    const c = courses.find((x) => x.id === courseId);
    if (c) {
      setCoursePar(holesPlayed === 9 ? Math.round(c.par / 2) : c.par);
      setTeeName('');
    }
  }, [courseId, courses, holesPlayed]); // eslint-disable-line react-hooks/exhaustive-deps

  // When toggling 9/18, recompute default par from the selected course
  useEffect(() => {
    const c = courses.find((x) => x.id === courseId);
    if (!c) return;
    setCoursePar(holesPlayed === 9 ? Math.round(c.par / 2) : c.par);
  }, [holesPlayed]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = parseInt(totalScore, 10);
  const overUnder = !isNaN(score) ? score - coursePar : null;
  const overUnderLabel =
    overUnder == null
      ? '—'
      : overUnder === 0
      ? 'E'
      : overUnder > 0
      ? `+${overUnder}`
      : `${overUnder}`;

  const num = (s: string): number | null => {
    if (s === '' || s == null) return null;
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  };

  // Up & down opportunities = holes played − greens in regulation (auto)
  const girNum = num(gir);
  const udOpportunities =
    girNum != null ? Math.max(0, holesPlayed - girNum) : null;
  const udAtt = udOpportunities; // auto-saved value for `up_downs_attempted`
  const udConv = num(udConverted);
  const udPct =
    udAtt != null && udAtt > 0 && udConv != null
      ? Math.round((udConv / udAtt) * 100)
      : null;

  // Clamp converted if it exceeds opportunities (e.g. user lowers GIR after entering "made")
  useEffect(() => {
    if (udOpportunities == null) return;
    const conv = num(udConverted);
    if (conv != null && conv > udOpportunities) {
      setUdConverted(String(udOpportunities));
    }
  }, [udOpportunities, udConverted]);

  const handleSave = async () => {
    if (!totalScore || isNaN(score)) {
      toast.error(t('prozone2.logRound.errEnterScore'));
      return;
    }
    if (score < 18 || score > 200) {
      toast.error(t('prozone2.logRound.errScoreRange'));
      return;
    }

    const selectedCourse = courses.find((c) => c.id === courseId);
    const courseName = selectedCourse?.name?.trim();
    if (!courseName) {
      toast.error(t('prozone2.logRound.errPickCourse'));
      return;
    }

    setSaving(true);
    try {
      // golf_rounds.course_id has a FK to golf_courses(id) only. Shared courses
      // (from the global `courses` table via `student_courses`) would violate
      // that FK, so we save them as a name snapshot with course_id = null.
      const safeCourseId = selectedCourse?.is_shared ? null : (courseId || null);

      const payload = {
        student_id: studentId,
        course_id: safeCourseId,
        course_name_snapshot: courseName,
        round_type: roundType,
        played_on: playedOn,
        holes_played: holesPlayed,
        course_par: coursePar,
        nine_side: holesPlayed === 9 ? nineSide : null,
        total_score: score,
        tournament_position: roundType === 'tournament' ? num(position) : null,
        ...(mode === 'quick'
          ? {
              fairways_hit: null, fairways_total: null, greens_in_regulation: null, putts: null,
              penalties: null, notes: null, lost_balls: null, up_downs_attempted: null,
              up_downs_converted: null, eagles: null, birdies: null, pars: null, bogeys: null, doubles_plus: null,
            }
          : {
              fairways_hit: num(fairwaysHit),
              fairways_total: fairwaysHit !== '' ? (holesPlayed === 9 ? 7 : 14) : null,
              greens_in_regulation: num(gir),
              putts: num(putts),
              penalties: null,
              notes: notes.trim() || null,
              lost_balls: num(lostBalls),
              up_downs_attempted: udAtt,
              up_downs_converted: udConv,
              eagles: num(eagles),
              birdies: num(birdies),
              pars: num(pars),
              bogeys: num(bogeys),
              doubles_plus: num(doublesPlus),
            }),
        weather: null,
        tees: teeName || null,
        par3_avg: null,
        par4_avg: null,
        par5_avg: null,
      };

      if (isEdit && round) {
        const { error } = await supabase
          .from('golf_rounds')
          .update(payload)
          .eq('id', round.id);
        if (error) {
          console.error('[LogRoundModal] update golf_rounds failed', { error, payload });
          throw error;
        }
        toast.success(t('prozone2.logRound.toastUpdated'));
      } else {
        const { error } = await supabase.from('golf_rounds').insert(payload);
        if (error) {
          console.error('[LogRoundModal] insert golf_rounds failed', { error, payload });
          throw error;
        }
      toast.success(t('prozone2.logRound.toastAdded'));
      }
      qc.invalidateQueries({ queryKey: ['golf-rounds', studentId] });
      qc.invalidateQueries({ queryKey: ['admin-golf-rounds', studentId] });
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      console.error('[LogRoundModal] save round error', err);
      toast.error(err?.message ?? t('prozone2.logRound.errSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-[#0d1f18]/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="text-ivory flex items-center gap-2 text-base sm:text-lg">
            {roundType === 'tournament' ? (
              <Trophy className="h-5 w-5 text-gold-accent" />
            ) : (
              <Sparkles className="h-5 w-5 text-green-accent" />
            )}
            {isEdit ? t('prozone2.logRound.editTitle') : t('prozone2.logRound.addTitle')}
          </DialogTitle>
          <DialogDescription className="text-ivory/60 text-xs">
            {t('prozone2.logRound.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {mode === null ? (
          <div className="space-y-3">
            <p className="text-sm text-ivory/70">{t('prozone2.logRound.modeQuestion')}</p>
            {(['quick', 'full'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="w-full text-left p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-gold-accent/50 transition-colors"
              >
                <p className="text-ivory font-semibold">{t(m === 'quick' ? 'prozone2.logRound.modeQuick' : 'prozone2.logRound.modeFull')}</p>
                <p className="text-xs text-ivory/55 mt-0.5">{t(m === 'quick' ? 'prozone2.logRound.modeQuickDesc' : 'prozone2.logRound.modeFullDesc')}</p>
              </button>
            ))}
          </div>
        ) : (
        <div className="space-y-4">
          {!isEdit && (
            <button
              type="button"
              onClick={() => setMode(null)}
              className="text-xs text-gold-accent hover:underline"
            >
              {t(mode === 'quick' ? 'prozone2.logRound.modeQuick' : 'prozone2.logRound.modeFull')} · {t('prozone2.logRound.changeMode')}
            </button>
          )}
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRoundType('practice')}
              className={`p-3 rounded-lg border transition-colors text-sm font-medium ${
                roundType === 'practice'
                  ? 'bg-green-accent/20 border-green-accent/50 text-ivory'
                  : 'bg-white/5 border-white/10 text-ivory/60 hover:bg-white/10'
              }`}
            >
              <Sparkles className="h-4 w-4 mx-auto mb-1" />
              {t('prozone2.logRound.practice')}
            </button>
            <button
              type="button"
              onClick={() => setRoundType('tournament')}
              className={`p-3 rounded-lg border transition-colors text-sm font-medium ${
                roundType === 'tournament'
                  ? 'bg-gold-accent/20 border-gold-accent/50 text-ivory'
                  : 'bg-white/5 border-white/10 text-ivory/60 hover:bg-white/10'
              }`}
            >
              <Trophy className="h-4 w-4 mx-auto mb-1" />
              {t('prozone2.logRound.tournament')}
            </button>
          </div>

          {roundType === 'tournament' && (
            <div className="space-y-1.5">
              <Label htmlFor="t-pos" className="text-ivory/70 text-xs">{t('prozone2.logRound.positionLabel')}</Label>
              <Input
                id="t-pos"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                placeholder="1"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory w-full"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-ivory/70 text-xs">{t('prozone2.logRound.courseLabel')}</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-ivory">
                <SelectValue placeholder={courses.length ? t('prozone2.logRound.selectCourse') : t('prozone2.logRound.noCoursesYet')} />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} (Par {c.par})
                  </SelectItem>
                ))}
                <div
                  role="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCoursesModalOpen(true);
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setCoursesModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-2 py-2 mt-1 border-t border-white/10 text-sm text-gold-accent hover:bg-white/5 cursor-pointer rounded-sm"
                >
                  <Plus className="h-4 w-4" />
                  {t('prozone2.logRound.addNewCourse')}
                </div>
              </SelectContent>
            </Select>
            {courses.length === 0 && (
              <button
                type="button"
                onClick={() => setCoursesModalOpen(true)}
                className="flex items-center gap-2 text-xs text-gold-accent hover:underline mt-1"
              >
                <Plus className="h-3.5 w-3.5" /> {t('prozone2.logRound.addNewCourse')}
              </button>
            )}
          </div>

          {(() => {
            const sel = courses.find((c) => c.id === courseId);
            const teeOptions = sel?.tees?.filter((t) => t.tee_name) ?? [];
            if (teeOptions.length === 0) return null;
            return (
              <div className="space-y-1.5">
                <Label className="text-ivory/70 text-xs">{t('prozone2.logRound.teeBox')}</Label>
                <Select value={teeName} onValueChange={setTeeName}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-ivory">
                    <SelectValue placeholder={t('prozone2.logRound.selectTee')} />
                  </SelectTrigger>
                  <SelectContent>
                    {teeOptions.map((t) => (
                      <SelectItem key={t.tee_name} value={t.tee_name}>
                        {t.tee_name}
                        {t.rating != null && ` · ${t.rating}`}
                        {t.slope != null && ` / ${t.slope}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="played-on" className="text-ivory/70 text-xs">{t('prozone2.logRound.dateLabel')}</Label>
              <DateField
                id="played-on"
                value={playedOn}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPlayedOn(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory w-full text-sm appearance-none overflow-hidden"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-ivory/70 text-xs">{t('prozone2.logRound.holesLabel')}</Label>
              <Select value={String(holesPlayed)} onValueChange={(v) => setHolesPlayed(v === '9' ? 9 : 18)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-ivory">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="18">18</SelectItem>
                  <SelectItem value="9">9</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {holesPlayed === 9 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-ivory/70 text-xs">{t('prozone2.logRound.whichNine')}</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNineSide('front')}
                    className={`p-2 rounded-md border text-xs font-medium transition-colors ${
                      nineSide === 'front'
                        ? 'bg-green-accent/20 border-green-accent/50 text-ivory'
                        : 'bg-white/5 border-white/10 text-ivory/60 hover:bg-white/10'
                    }`}
                  >
                    {t('prozone2.logRound.front9')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNineSide('back')}
                    className={`p-2 rounded-md border text-xs font-medium transition-colors ${
                      nineSide === 'back'
                        ? 'bg-green-accent/20 border-green-accent/50 text-ivory'
                        : 'bg-white/5 border-white/10 text-ivory/60 hover:bg-white/10'
                    }`}
                  >
                    {t('prozone2.logRound.back9')}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="nine-par" className="text-ivory/70 text-xs">
                  {t('prozone2.logRound.parForNine')}
                </Label>
                <Input
                  id="nine-par"
                  type="number"
                  inputMode="numeric"
                  min={27}
                  max={50}
                  value={coursePar}
                  onChange={(e) => setCoursePar(parseInt(e.target.value, 10) || 0)}
                  className="bg-white/5 border-white/10 text-ivory w-full"
                />
                <p className="text-[10px] text-ivory/40 leading-tight">
                  {t('prozone2.logRound.parForNineHint')}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="score" className="text-ivory/70 text-xs">{t('prozone2.logRound.totalScoreLabel')}</Label>
              <Input
                id="score"
                type="number"
                inputMode="numeric"
                placeholder="e.g. 82"
                min={18}
                max={200}
                value={totalScore}
                onChange={(e) => setTotalScore(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory text-lg font-semibold w-full"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-ivory/70 text-xs">{t('prozone2.logRound.vsPar')}</Label>
              <div
                className={`h-10 px-3 rounded-md border border-white/10 bg-white/5 flex items-center justify-center text-lg font-semibold ${
                  overUnder == null
                    ? 'text-ivory/40'
                    : overUnder < 0
                    ? 'text-green-accent'
                    : overUnder > 0
                    ? 'text-gold-accent'
                    : 'text-ivory'
                }`}
              >
                {overUnderLabel}
              </div>
            </div>
          </div>

          {mode === 'full' && (<>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="fir" className="text-ivory/70 text-xs">
                {t('prozone2.logRound.fairwaysHit')} <span className="text-ivory/40">/ {holesPlayed === 9 ? 7 : 14}</span>
              </Label>
              <Input
                id="fir"
                type="number"
                inputMode="numeric"
                min={0}
                max={holesPlayed === 9 ? 7 : 14}
                value={fairwaysHit}
                onChange={(e) => setFairwaysHit(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory w-full"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="gir" className="text-ivory/70 text-xs">
                {t('prozone2.logRound.girLabel')} <span className="text-ivory/40">/ {holesPlayed}</span>
              </Label>
              <Input
                id="gir"
                type="number"
                inputMode="numeric"
                min={0}
                max={holesPlayed}
                value={gir}
                onChange={(e) => setGir(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="putts" className="text-ivory/70 text-xs">{t('prozone2.logRound.puttsLabel')}</Label>
              <Input
                id="putts"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={putts}
                onChange={(e) => setPutts(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory w-full"
              />
            </div>
          </div>

          {/* Lost balls + Up & downs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="lost-balls" className="text-ivory/70 text-xs">{t('prozone2.logRound.lostBallsLabel')}</Label>
              <Input
                id="lost-balls"
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                value={lostBalls}
                onChange={(e) => setLostBalls(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory w-full"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="ud-made" className="text-ivory/70 text-xs truncate block">
                {t('prozone2.logRound.udMade')}
                {udOpportunities != null && (
                  <span className="text-ivory/40">
                    {' '}/ {udOpportunities}
                    {udPct != null && ` · ${udPct}%`}
                  </span>
                )}
              </Label>
              <Input
                id="ud-made"
                type="number"
                inputMode="numeric"
                placeholder={udOpportunities != null ? `0–${udOpportunities}` : t('prozone2.logRound.enterGirFirst')}
                min={0}
                max={udOpportunities ?? 0}
                disabled={udOpportunities == null}
                value={udConverted}
                onChange={(e) => setUdConverted(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory w-full disabled:opacity-50"
              />
              <p className="text-[10px] text-ivory/40 leading-tight">
                {udOpportunities != null
                  ? t('prozone2.logRound.chancesHint').replace('{gir}', String(girNum)).replace('{chances}', String(udOpportunities))
                  : t('prozone2.logRound.fillGirHint')}
              </p>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="space-y-1.5">
            <Label className="text-ivory/70 text-xs uppercase tracking-wide">{t('prozone2.logRound.scoreBreakdown')}</Label>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {[
                { label: t('prozone2.logRound.eagles'), val: eagles, set: setEagles },
                { label: t('prozone2.logRound.birdies'), val: birdies, set: setBirdies },
                { label: t('prozone2.logRound.pars'), val: pars, set: setPars },
                { label: t('prozone2.logRound.bogeys'), val: bogeys, set: setBogeys },
                { label: t('prozone2.logRound.doublePlus'), val: doublesPlus, set: setDoublesPlus },
              ].map((f) => (
                <div key={f.label} className="space-y-1 min-w-0">
                  <p className="text-[10px] text-ivory/50 text-center truncate">{f.label}</p>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={18}
                    value={f.val}
                    onChange={(e) => f.set(e.target.value)}
                    className="bg-white/5 border-white/10 text-ivory text-center px-1 w-full min-w-0"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Avg by par */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-ivory/70 text-xs">{t('prozone2.logRound.notesLabel')}</Label>
            <Textarea
              id="notes"
              placeholder={t('prozone2.logRound.notesPlaceholder')}
              value={notes}
              maxLength={1000}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30 resize-none"
            />
          </div>
          </>)}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              variant="ghost"
              className="w-full sm:flex-1 text-ivory/70 hover:text-ivory hover:bg-white/10"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('prozone2.logRound.cancel')}
            </Button>
            <Button
              className="w-full sm:flex-1 bg-gold-accent text-black hover:bg-gold-accent/90 gap-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('prozone2.logRound.saveChanges') : t('prozone2.logRound.addRound')}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
      <ManageCoursesModal
        open={coursesModalOpen}
        onOpenChange={setCoursesModalOpen}
        studentId={studentId}
      />
    </Dialog>
  );
}