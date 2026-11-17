import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, ChevronDown, ChevronUp, AlertCircle, User } from 'lucide-react';
import { getCurrentPackage } from '@/lib/packageStatus';

/**
 * Coach-facing summary of all lessons still owed to students via active packages.
 * E.g. a 10-lesson package with 5 used = 5 lessons owed.
 */
export function PendingLessonsOwedPanel() {
  const [expanded, setExpanded] = useState(false);

  const { data: pkgs = [], isLoading } = useQuery({
    queryKey: ['pending-lessons-owed'],
    queryFn: async () => {
      const { data: packages } = await supabase
        .from('class_packages')
        .select('id, user_id, package_size, classes_remaining, classes_used, package_name, is_active, created_at')
        .eq('is_active', true)
        .gt('classes_remaining', 0);

      if (!packages || packages.length === 0) return [];

      const userIds = Array.from(new Set(packages.map(p => p.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      return packages.map(p => ({
        ...p,
        profile: profileMap.get(p.user_id),
      }));
    },
  });

  // Aggregate per-student
  const byStudent = pkgs.reduce<Record<string, {
    studentId: string;
    name: string;
    email: string;
    used: number;
    remaining: number;
    packages: number;
    currentPackageName: string | null;
    currentRemaining: number | null;
  }>>((acc, p) => {
    const sid = p.user_id;
    if (!acc[sid]) {
      acc[sid] = {
        studentId: sid,
        name: p.profile?.full_name || p.profile?.email || 'Unknown',
        email: p.profile?.email || '',
        used: 0,
        remaining: 0,
        packages: 0,
        currentPackageName: null,
        currentRemaining: null,
      };
    }
    acc[sid].used += p.classes_used || 0;
    acc[sid].remaining += p.classes_remaining || 0;
    acc[sid].packages += 1;
    return acc;
  }, {});

  // Fill the FIFO "in use" pointer for each student
  const grouped = new Map<string, any[]>();
  for (const p of pkgs) {
    const arr = grouped.get(p.user_id) || [];
    arr.push(p);
    grouped.set(p.user_id, arr);
  }
  for (const [sid, list] of grouped) {
    const current = getCurrentPackage(list as any);
    if (current && byStudent[sid]) {
      byStudent[sid].currentPackageName =
        (current as any).package_name || `${(current as any).package_size}-Lesson`;
      byStudent[sid].currentRemaining = (current as any).classes_remaining ?? null;
    }
  }

  const students = Object.values(byStudent).sort((a, b) => b.used - a.used);
  const totalUsed = students.reduce((sum, s) => sum + s.used, 0);
  const totalStudents = students.length;

  if (isLoading || students.length === 0) return null;

  return (
    <Card className="card-elevated border-status-scheduled/30">
      <CardContent className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-status-scheduled/15 flex items-center justify-center">
              <Package className="h-5 w-5 text-status-scheduled" />
            </div>
            <div>
              <h3 className="font-heading font-semibold text-foreground">
                Lessons Used (Active Packages)
              </h3>
              <p className="text-xs text-muted-foreground">
                {totalUsed} lesson{totalUsed === 1 ? '' : 's'} used across {totalStudents} student{totalStudents === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-status-scheduled/15 text-status-scheduled border-status-scheduled/25 text-base px-3 py-1">
              {totalUsed}
            </Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
            {students.map(s => (
              <div
                key={s.studentId}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-secondary/40 transition-colors"
              >
                <Link
                  to={`/admin/student/${s.studentId}`}
                  className="flex items-center gap-3 flex-1 min-w-0 hover:underline"
                >
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.packages} active package{s.packages === 1 ? '' : 's'}
                    </p>
                    {s.currentPackageName && (
                      <p className="text-[10px] text-[#F0C040]/80 truncate">
                        ⭐ In use: {s.currentPackageName}
                        {s.currentRemaining != null ? ` (${s.currentRemaining} left)` : ''}
                      </p>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {s.remaining <= 2 && (
                    <AlertCircle className="h-4 w-4 text-destructive" aria-label="Renewal needed" />
                  )}
                  <Badge
                    className={
                      s.remaining <= 2
                        ? 'bg-destructive/15 text-destructive border-destructive/25'
                        : 'bg-success/15 text-success border-success/25'
                    }
                  >
                    {s.used} used
                  </Badge>
                  <Link to={`/admin/student/${s.studentId}`}>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <User className="h-3.5 w-3.5" />
                      Open
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
