import { useEffect, useRef, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, MapPin, Search, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface ManageCoursesModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
}

interface DisplayCourse {
  id: string;
  source: 'shared' | 'legacy';
  link_id?: string;
  name: string;
  city: string | null;
  par: number;
  tee_count?: number;
  default_tees?: string | null;
}

interface TeeInfo {
  tee_name: string;
  slope: number | null;
  rating: number | null;
}

interface SearchResult {
  external_id: string;
  name: string;
  city: string | null;
  country: string | null;
  par: number | null;
  tees: TeeInfo[];
}

export function ManageCoursesModal({ open, onOpenChange, studentId }: ManageCoursesModalProps) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [par, setPar] = useState('72');
  const [tees, setTees] = useState('');
  const [adding, setAdding] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Online search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSearchResults(null);
      setSearchError(null);
      setShowManual(false);
      setName('');
      setCity('');
      setPar('72');
      setTees('');
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        // First, search courses already saved in our DB by other students
        const { data: localRows } = await (supabase as any)
          .from('courses')
          .select('id, external_id, name, city, country, par, tees')
          .ilike('name', `%${q}%`)
          .limit(10);

        const localResults: SearchResult[] = ((localRows ?? []) as any[]).map((c) => ({
          external_id: c.external_id ?? `local:${c.id}`,
          name: c.name,
          city: c.city,
          country: c.country,
          par: c.par,
          tees: Array.isArray(c.tees) ? c.tees : [],
        }));

        // Then fetch online results to surface new courses
        let onlineResults: SearchResult[] = [];
        try {
          const { data, error } = await supabase.functions.invoke('lookup-golf-course', {
            body: { query: q },
          });
          if (!error) onlineResults = data?.results ?? [];
        } catch {
          // Online lookup failed — keep going with local matches only
        }

        // Merge, dedupe by external_id (local wins)
        const seen = new Set(localResults.map((r) => r.external_id));
        const merged = [
          ...localResults,
          ...onlineResults.filter((r) => !seen.has(r.external_id)),
        ];

        setSearchResults(merged);
        if (merged.length === 0) {
          setSearchError(t('prozone2.courses.noMatches'));
        }
      } catch (err: any) {
        setSearchError(err?.message ?? t('prozone2.courses.errSearchFailed'));
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const { data: courses = [], isLoading } = useQuery<DisplayCourse[]>({
    queryKey: ['golf-courses', studentId],
    queryFn: async () => {
      const { data: legacy, error: legacyErr } = await supabase
        .from('golf_courses')
        .select('id, name, city, par, default_tees')
        .eq('student_id', studentId)
        .eq('is_archived', false)
        .order('name');
      if (legacyErr) throw legacyErr;

      const { data: links, error: linksErr } = await (supabase as any)
        .from('student_courses')
        .select('id, course:courses(id, name, city, par, tees)')
        .eq('student_id', studentId);
      if (linksErr) throw linksErr;

      const fromLegacy: DisplayCourse[] = (legacy ?? []).map((c: any) => ({
        id: c.id,
        source: 'legacy' as const,
        name: c.name,
        city: c.city,
        par: c.par,
        default_tees: c.default_tees,
      }));

      const fromShared: DisplayCourse[] = ((links ?? []) as any[])
        .filter((l) => l.course)
        .map((l) => ({
          id: l.course.id,
          source: 'shared' as const,
          link_id: l.id,
          name: l.course.name,
          city: l.course.city,
          par: l.course.par,
          tee_count: Array.isArray(l.course.tees) ? l.course.tees.length : 0,
        }));

      return [...fromShared, ...fromLegacy].sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: open,
  });

  const handlePickResult = async (r: SearchResult) => {
    setPicking(r.external_id);
    try {
      let courseId: string | null = null;
      // Local-only result (came from our courses table, no external_id)
      if (r.external_id.startsWith('local:')) {
        courseId = r.external_id.slice('local:'.length);
      } else {
        const { data: existing } = await (supabase as any)
          .from('courses')
          .select('id')
          .eq('external_id', r.external_id)
          .maybeSingle();
        if (existing && existing.id) {
          courseId = existing.id;
        } else {
        const { data: inserted, error: insErr } = await (supabase as any)
          .from('courses')
          .insert({
            external_id: r.external_id,
            name: r.name,
            city: r.city,
            country: r.country,
            par: r.par ?? 72,
            tees: r.tees ?? [],
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        courseId = inserted.id;
        }
      }

      const { error: linkErr } = await (supabase as any)
        .from('student_courses')
        .upsert(
          { student_id: studentId, course_id: courseId },
          { onConflict: 'student_id,course_id', ignoreDuplicates: true },
        );
      if (linkErr) throw linkErr;

      toast.success(t('prozone2.courses.toastAdded').replace('{name}', r.name));
      setSearchQuery('');
      setSearchResults(null);
      qc.invalidateQueries({ queryKey: ['golf-courses', studentId] });
    } catch (err: any) {
      toast.error(err?.message ?? t('prozone2.courses.errSaveFailed'));
    } finally {
      setPicking(null);
    }
  };

  const handleAdd = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t('prozone2.courses.errNameRequired'));
      return;
    }
    if (trimmedName.length > 100) {
      toast.error(t('prozone2.courses.errNameTooLong'));
      return;
    }
    const parNum = parseInt(par, 10);
    if (isNaN(parNum) || parNum < 27 || parNum > 100) {
      toast.error(t('prozone2.courses.errParRange'));
      return;
    }

    setAdding(true);
    try {
      const insertPayload: any = {
        student_id: studentId,
        name: trimmedName,
        city: city.trim() || null,
        par: parNum,
        default_tees: tees.trim() || null,
      };
      const { error } = await supabase.from('golf_courses').insert(insertPayload);
      if (error) throw error;
      toast.success(t('prozone2.courses.toastCourseAdded'));
      setName('');
      setCity('');
      setPar('72');
      setTees('');
      setShowManual(false);
      qc.invalidateQueries({ queryKey: ['golf-courses', studentId] });
    } catch (err: any) {
      toast.error(err?.message ?? t('prozone2.courses.errAddFailed'));
    } finally {
      setAdding(false);
    }
  };

  const handleArchive = async (c: DisplayCourse) => {
    if (!confirm(t('prozone2.courses.confirmRemove'))) return;
    if (c.source === 'legacy') {
      const { error } = await supabase
        .from('golf_courses')
        .update({ is_archived: true })
        .eq('id', c.id);
      if (error) return toast.error(error.message);
    } else if (c.link_id) {
      const { error } = await (supabase as any)
        .from('student_courses')
        .delete()
        .eq('id', c.link_id);
      if (error) return toast.error(error.message);
    }
    toast.success(t('prozone2.courses.toastCourseRemoved'));
    qc.invalidateQueries({ queryKey: ['golf-courses', studentId] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-[#0d1f18]/95 backdrop-blur-xl border-white/10">
        <DialogHeader>
          <DialogTitle className="text-ivory flex items-center gap-2 text-base sm:text-lg">
            <MapPin className="h-5 w-5 text-green-accent" />
            {t('prozone2.courses.title')}
          </DialogTitle>
          <DialogDescription className="text-ivory/60 text-xs">
            {t('prozone2.courses.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Online search */}
          <div className="glass-card p-4 space-y-3">
            <Label htmlFor="course-search" className="text-ivory/70 text-xs flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {t('prozone2.courses.searchOnline')}
            </Label>
            <div className="relative">
              <Input
                id="course-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('prozone2.courses.searchPlaceholder')}
                className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30 pr-9"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-ivory/40" />
              )}
            </div>
            {searchResults && searchResults.length > 0 && (
              <div className="space-y-1 max-h-56 overflow-y-auto rounded-md border border-white/10 bg-black/20">
                {searchResults.map((r) => (
                  <button
                    key={r.external_id}
                    type="button"
                    onClick={() => handlePickResult(r)}
                    disabled={picking === r.external_id}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-ivory truncate">{r.name}</p>
                        <p className="text-[11px] text-ivory/50 truncate">
                          {[r.city, r.country].filter(Boolean).join(', ') || t('prozone2.courses.unknownLocation')}
                          {r.par != null && ` · Par ${r.par}`}
                          {r.tees.length > 0 && ` · ${r.tees.length} ${t('prozone2.courses.teesCount')}`}
                        </p>
                      </div>
                      {picking === r.external_id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-ivory/40 shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchError && (
              <p className="text-[11px] text-ivory/40">{searchError}</p>
            )}
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="text-[11px] text-ivory/50 hover:text-ivory inline-flex items-center gap-1 transition-colors"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showManual ? 'rotate-180' : ''}`} />
              {showManual ? t('prozone2.courses.hideManual') : t('prozone2.courses.orAddManually')}
            </button>
          </div>

          {/* Add form (manual / confirmation) */}
          {showManual && (
          <div className="glass-card p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="course-name" className="text-ivory/70 text-xs">{t('prozone2.courses.courseNameLabel')}</Label>
              <Input
                id="course-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('prozone2.courses.courseNamePlaceholder')}
                maxLength={100}
                className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="course-city" className="text-ivory/70 text-xs">{t('prozone2.courses.cityLabel')}</Label>
                <Input
                  id="course-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t('prozone2.courses.cityPlaceholder')}
                  maxLength={100}
                  className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="course-par" className="text-ivory/70 text-xs">{t('prozone2.courses.parLabel')}</Label>
                <Input
                  id="course-par"
                  type="number"
                  min={27}
                  max={100}
                  value={par}
                  onChange={(e) => setPar(e.target.value)}
                  className="bg-white/5 border-white/10 text-ivory"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-tees" className="text-ivory/70 text-xs">{t('prozone2.courses.defaultTeesLabel')}</Label>
              <Input
                id="course-tees"
                value={tees}
                onChange={(e) => setTees(e.target.value)}
                placeholder={t('prozone2.courses.defaultTeesPlaceholder')}
                maxLength={30}
                className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30"
              />
            </div>
            <Button
              className="w-full gap-2 bg-gold-accent text-black hover:bg-gold-accent/90"
              onClick={handleAdd}
              disabled={adding}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('prozone2.courses.saveCourse')}
            </Button>
          </div>
          )}

          {/* List */}
          <div className="space-y-2">
            <p className="text-ivory/50 text-[10px] uppercase tracking-widest">{t('prozone2.courses.yourCourses')}</p>
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-ivory/40" />
              </div>
            ) : courses.length === 0 ? (
              <p className="text-sm text-ivory/40 py-4 text-center">{t('prozone2.courses.noCoursesYet')}</p>
            ) : (
              courses.map((c) => (
                <div
                  key={`${c.source}-${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ivory font-medium truncate">{c.name}</p>
                    <p className="text-xs text-ivory/50 truncate">
                      Par {c.par}
                      {c.city ? ` · ${c.city}` : ''}
                      {c.default_tees ? ` · ${c.default_tees} ${t('prozone2.courses.teesCount')}` : ''}
                      {c.tee_count ? ` · ${c.tee_count} ${t('prozone2.courses.teesCount')}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleArchive(c)}
                    className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}