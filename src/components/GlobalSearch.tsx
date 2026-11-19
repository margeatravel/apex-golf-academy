import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  User,
  Calendar,
  Package as PackageIcon,
  Video as VideoIcon,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface GlobalSearchProps {
  /** Visual variant for the trigger button. */
  variant?: 'pill' | 'icon';
}

/**
 * App-wide search. Renders a small magnifying-glass button that opens a
 * centered Command palette. Searches across students, lessons, packages
 * and videos (media). Admin/coach can search all students; regular
 * students only see their own data.
 *
 * Cmd/Ctrl + K opens it from anywhere. Esc / outside click closes.
 */
export function GlobalSearch({ variant = 'pill' }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { role, user, hasPermission, isStaffView } = useAuth();
  // Respect the active view: a dual-role user in student mode searches as a student.
  const isStaff = (role === 'admin' || role === 'staff') && isStaffView;

  // Global keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const term = q.trim();
  const enabled = open && term.length >= 2;

  const { data: results, isFetching } = useQuery({
    queryKey: ['global-search', term, isStaff, user?.id],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const like = `%${term}%`;

      // Students (staff only) — search profiles by name or email.
      const studentsPromise = isStaff
        ? supabase
            .from('profiles')
            .select('id, full_name, email, photo_url')
            .or(`full_name.ilike.${like},email.ilike.${like}`)
            .limit(8)
        : Promise.resolve({ data: [] as any[], error: null });

      // Lessons — match notes / lesson_type. Staff searches all; students
      // only their own.
      let lessonsQuery = supabase
        .from('lessons')
        .select('id, lesson_date, lesson_time, lesson_type, student_id, coach_notes, student_notes')
        .or(`coach_notes.ilike.${like},student_notes.ilike.${like},lesson_type.ilike.${like}`)
        .order('lesson_date', { ascending: false })
        .limit(6);
      if (!isStaff && user?.id) lessonsQuery = lessonsQuery.eq('student_id', user.id);

      // Packages — by package_name. Cast to any to keep TS from generating a
      // deeply-recursive type for the conditional filter chain.
      let packagesQuery: any = supabase
        .from('class_packages')
        .select('id, package_name, package_size, student_id, classes_remaining, is_active')
        .ilike('package_name', like)
        .limit(6);
      if (!isStaff && user?.id) packagesQuery = packagesQuery.eq('student_id', user.id);

      // Videos / media — by title or category.
      let mediaQuery = supabase
        .from('student_media')
        .select('id, title, category, student_id, created_at')
        .or(`title.ilike.${like},category.ilike.${like}`)
        .order('created_at', { ascending: false })
        .limit(6);
      if (!isStaff && user?.id) mediaQuery = mediaQuery.eq('student_id', user.id);

      const [s, l, p, m] = await Promise.all([
        studentsPromise,
        lessonsQuery,
        packagesQuery,
        mediaQuery,
      ]);

      return {
        students: (s.data as any[]) || [],
        lessons: (l.data as any[]) || [],
        packages: (p.data as any[]) || [],
        media: (m.data as any[]) || [],
      };
    },
  });

  const close = () => {
    setOpen(false);
    setQ('');
  };

  const go = (path: string) => {
    close();
    navigate(path);
  };

  const triggerCls =
    variant === 'icon'
      ? 'h-8 w-8 rounded-lg flex items-center justify-center text-[#F5F0E8]/70 hover:text-[#F5F0E8] hover:bg-white/8 transition-colors'
      : 'h-9 w-9 rounded-full flex items-center justify-center';

  const triggerStyle =
    variant === 'icon'
      ? undefined
      : { background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' };

  const empty = !results || (
    results.students.length === 0 &&
    results.lessons.length === 0 &&
    results.packages.length === 0 &&
    results.media.length === 0
  );

  // Static page navigation index. Filtered client-side by the query.
  const pages = useMemo(() => {
    const staffPages = [
      { label: 'Admin Dashboard', path: '/admin', keywords: 'admin dashboard home' },
      { label: 'Students', path: '/admin/students', keywords: 'students roster people' },
      { label: 'Lessons', path: '/admin/lessons', keywords: 'lessons classes' },
      { label: 'Calendar / Schedule', path: '/admin/calendar', keywords: 'calendar schedule agenda' },
      { label: 'Fixed Schedule', path: '/admin/fixed-schedule', keywords: 'fixed schedule recurring' },
      { label: 'Availability', path: '/admin/availability', keywords: 'availability hours' },
      { label: 'Revenue', path: '/admin/revenue', keywords: 'revenue money income finance dollars' },
      { label: 'Stripe Payments', path: '/admin/stripe-payments', keywords: 'stripe payments transactions' },
      { label: 'Subscribers', path: '/admin/subscribers', keywords: 'subscribers subscriptions members' },
      { label: 'Analysis Requests', path: '/admin/analysis-requests', keywords: 'video analysis requests review' },
      { label: 'Bulk Import', path: '/admin/bulk-import', keywords: 'import csv bulk upload' },
      { label: 'Merge Students', path: '/admin/merge-students', keywords: 'merge duplicates students' },
      { label: 'Bulk Package Fix', path: '/admin/bulk-package-fix', keywords: 'packages bulk fix' },
      ...(role === 'admin' ? [{ label: 'Pro Zone Media', path: '/admin/pro-zone', keywords: 'pro zone content library media' }] : []),
      ...(role !== 'admin' && hasPermission('pro_zone') ? [{ label: 'Pro Zone', path: '/pro-zone', keywords: 'pro zone margea ai content' }] : []),
      { label: 'Family Links', path: '/admin/family', keywords: 'family parent child links' },
      { label: 'Staff', path: '/admin/staff', keywords: 'staff team coaches' },
      { label: 'Invite Codes', path: '/admin/invites', keywords: 'invite codes invitations' },
      { label: 'Email Domain', path: '/admin/email-domain', keywords: 'email domain dns' },
      { label: 'Settings', path: '/admin/settings', keywords: 'settings configuration preferences' },
      { label: 'My Profile', path: '/admin/profile', keywords: 'profile account coach me' },
      { label: 'Notifications', path: '/notifications', keywords: 'notifications alerts bell' },
    ];
    const studentPages = [
      { label: 'Dashboard', path: '/dashboard', keywords: 'dashboard home' },
      { label: 'My Profile', path: '/profile', keywords: 'profile account me' },
      { label: 'My Lessons', path: '/lessons', keywords: 'lessons classes schedule' },
      { label: 'Fixed Schedule', path: '/lessons/fixed-schedule', keywords: 'fixed schedule recurring' },
      { label: 'My Videos', path: '/videos', keywords: 'videos swing analysis' },
      { label: 'Highlights', path: '/highlights', keywords: 'highlights best' },
      { label: 'Drills', path: '/drills', keywords: 'drills practice' },
      { label: 'AI Coach', path: '/ai-coach', keywords: 'ai coach assistant chat' },
      { label: 'Upload Video', path: '/videos/upload', keywords: 'upload video new' },
      { label: 'Plans', path: '/plans', keywords: 'plans subscription pricing membership' },
      { label: 'Pro Zone', path: '/pro-zone', keywords: 'pro zone content' },
      { label: 'Notifications', path: '/notifications', keywords: 'notifications alerts bell' },
    ];
    return isStaff ? staffPages : studentPages;
  }, [isStaff, role, hasPermission]);

  const matchedPages = useMemo(() => {
    if (term.length < 2) return [];
    const t = term.toLowerCase();
    return pages
      .filter((p) => p.label.toLowerCase().includes(t) || p.keywords.includes(t))
      .slice(0, 6);
  }, [pages, term]);


  return (
    <>
      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className={triggerCls}
        style={triggerStyle}
      >
        <Search className={variant === 'icon' ? 'h-3.5 w-3.5' : 'h-4 w-4 text-ivory'} />
      </button>

      <CommandDialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <CommandInput
          placeholder={isStaff ? 'Search students, lessons, packages, videos…' : 'Search your lessons, packages, videos…'}
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          {term.length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          )}

          {enabled && isFetching && (
            <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}

          {enabled && !isFetching && empty && (
            matchedPages.length === 0 ? <CommandEmpty>No results found.</CommandEmpty> : null
          )}

          {term.length >= 2 && matchedPages.length > 0 && (
            <CommandGroup heading="Pages">
              {matchedPages.map((p) => (
                <CommandItem
                  key={`page-${p.path}`}
                  value={`page-${p.path}-${p.label}`}
                  onSelect={() => go(p.path)}
                  className="gap-2"
                >
                  <ArrowRight className="h-4 w-4 text-[#F0C040]" />
                  <span className="truncate">{p.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{p.path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results && results.students.length > 0 && (
            <CommandGroup heading="Students">
              {results.students.map((s) => (
                <CommandItem
                  key={`stu-${s.id}`}
                  value={`student-${s.id}-${s.full_name || s.email}`}
                  onSelect={() => go(`/admin/student/${s.id}`)}
                  className="gap-2"
                >
                  <User className="h-4 w-4 text-[#4a7c59]" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{s.full_name || s.email || 'Unnamed'}</span>
                    {s.full_name && s.email && (
                      <span className="text-xs text-muted-foreground truncate">{s.email}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results && results.lessons.length > 0 && (
            <CommandGroup heading="Lessons">
              {results.lessons.map((l) => (
                <CommandItem
                  key={`les-${l.id}`}
                  value={`lesson-${l.id}-${l.lesson_type}-${l.lesson_date}`}
                  onSelect={() =>
                    go(isStaff && l.student_id ? `/admin/student/${l.student_id}?tab=lessons` : '/lessons')
                  }
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4 text-primary" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{l.lesson_type} · {l.lesson_date}</span>
                    {(l.coach_notes || l.student_notes) && (
                      <span className="text-xs text-muted-foreground truncate">
                        {(l.coach_notes || l.student_notes || '').slice(0, 80)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results && results.packages.length > 0 && (
            <CommandGroup heading="Packages">
              {results.packages.map((p) => (
                <CommandItem
                  key={`pkg-${p.id}`}
                  value={`package-${p.id}-${p.package_name || ''}`}
                  onSelect={() =>
                    go(isStaff && p.student_id ? `/admin/student/${p.student_id}?tab=packages` : '/profile')
                  }
                  className="gap-2"
                >
                  <PackageIcon className="h-4 w-4 text-[#F0C040]" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{p.package_name || `${p.package_size}-Lesson Package`}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.classes_remaining ?? 0} left · {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results && results.media.length > 0 && (
            <CommandGroup heading="Videos">
              {results.media.map((v) => (
                <CommandItem
                  key={`vid-${v.id}`}
                  value={`video-${v.id}-${v.title || ''}`}
                  onSelect={() =>
                    go(isStaff && v.student_id ? `/admin/student/${v.student_id}?tab=videos` : '/videos')
                  }
                  className="gap-2"
                >
                  <VideoIcon className="h-4 w-4 text-accent" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{v.title || 'Untitled video'}</span>
                    {v.category && (
                      <span className="text-xs text-muted-foreground truncate">{v.category}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}