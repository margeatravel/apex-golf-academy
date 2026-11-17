import { useState, useMemo } from "react";
import { fmtMXN } from '@/lib/formatCurrency';
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Merge, AlertTriangle, CheckCircle2, ArrowRight, Shield, Clock, XCircle, DollarSign, BookOpen, Package, User } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SocialFooter } from "@/components/SocialFooter";
import { useAuth } from "@/contexts/AuthContext";
import {
  detectDuplicates,
  isPlaceholderEmail,
  type StudentProfile,
  type DuplicateGroup,
} from "@/lib/duplicateDetection";

/** Enrich student profiles with payment totals */
interface EnrichedStudent extends StudentProfile {
  totalPaid: number;
}

/** Sorted pair key for dismissed duplicates */
function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export default function AdminMergeStudents() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [mergeTarget, setMergeTarget] = useState<DuplicateGroup | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  // Fetch all students with counts + payment totals
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["merge-students-list"],
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      const ids = (roleRows || []).map((r: any) => r.user_id);
      if (!ids.length) return [];

      const [profilesRes, lessonsRes, packagesRes, paymentsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, handicap, created_at").in("id", ids),
        supabase.from("lessons").select("student_id").in("student_id", ids).eq("status", "completed"),
        supabase.from("class_packages").select("id, user_id").in("user_id", ids),
        supabase.from("package_payments").select("package_id, amount"),
      ]);

      const lc: Record<string, number> = {};
      lessonsRes.data?.forEach((l: any) => { lc[l.student_id] = (lc[l.student_id] || 0) + 1; });

      const pc: Record<string, number> = {};
      const pkgOwner: Record<string, string> = {};
      packagesRes.data?.forEach((p: any) => {
        pc[p.user_id] = (pc[p.user_id] || 0) + 1;
        pkgOwner[p.id] = p.user_id;
      });

      const paid: Record<string, number> = {};
      paymentsRes.data?.forEach((pp: any) => {
        const uid = pkgOwner[pp.package_id];
        if (uid) paid[uid] = (paid[uid] || 0) + Number(pp.amount || 0);
      });

      return (profilesRes.data || []).map((p: any): EnrichedStudent => ({
        ...p,
        lessonCount: lc[p.id] || 0,
        packageCount: pc[p.id] || 0,
        totalPaid: paid[p.id] || 0,
      }));
    },
  });

  // Fetch dismissed pairs
  const { data: dismissedPairs = [] } = useQuery({
    queryKey: ["dismissed-duplicates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dismissed_duplicates" as any)
        .select("*");
      return (data || []) as any[];
    },
  });

  // Build set of dismissed pair keys
  const dismissedSet = useMemo(() => {
    const s = new Set<string>();
    dismissedPairs.forEach((d: any) => {
      const [a, b] = pairKey(d.student_id_a, d.student_id_b);
      s.add(`${a}|${b}|${d.decision}`);
      s.add(`${a}|${b}`); // general key
    });
    return s;
  }, [dismissedPairs]);

  const allGroups = useMemo(() => detectDuplicates(students), [students]);

  // Filter out "keep_separate" pairs; optionally filter out "review_later"
  const groups = useMemo(() => {
    return allGroups.filter((g) => {
      const [a, b] = pairKey(g.primary.id, g.duplicates[0]?.id || "");
      const generalKey = `${a}|${b}`;
      const keepSepKey = `${a}|${b}|keep_separate`;
      if (dismissedSet.has(keepSepKey)) return false;
      if (!showDismissed && dismissedSet.has(`${a}|${b}|review_later`)) return false;
      return true;
    });
  }, [allGroups, dismissedSet, showDismissed]);

  const reviewLaterCount = useMemo(() => {
    return allGroups.filter((g) => {
      const [a, b] = pairKey(g.primary.id, g.duplicates[0]?.id || "");
      return dismissedSet.has(`${a}|${b}|review_later`);
    }).length;
  }, [allGroups, dismissedSet]);

  // Merge mutation
  const mergeMutation = useMutation({
    mutationFn: async ({ primaryId, duplicateId }: { primaryId: string; duplicateId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("merge-students", {
        body: { primaryId, duplicateId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("Students merged successfully", {
        description: `Lessons: ${data.summary.lessonsReassigned}, Packages: ${data.summary.packagesReassigned}`,
      });
      queryClient.invalidateQueries({ queryKey: ["merge-students-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-students"] });
      setMergeTarget(null);
      setSwapped(false);
    },
    onError: (err: any) => {
      toast.error("Merge failed", { description: err.message });
    },
  });

  // Dismiss mutation (Keep Separate / Review Later)
  const dismissMutation = useMutation({
    mutationFn: async ({ groupIdx, decision }: { groupIdx: number; decision: "keep_separate" | "review_later" }) => {
      const g = groups[groupIdx];
      if (!g) return;
      const [idA, idB] = pairKey(g.primary.id, g.duplicates[0].id);
      await supabase.from("dismissed_duplicates" as any).upsert(
        { student_id_a: idA, student_id_b: idB, decision, decided_by: user?.id },
        { onConflict: "student_id_a,student_id_b" } as any,
      );
    },
    onSuccess: (_, vars) => {
      const label = vars.decision === "keep_separate" ? "Marked as separate" : "Saved for later review";
      toast.success(label);
      queryClient.invalidateQueries({ queryKey: ["dismissed-duplicates"] });
    },
    onError: (err: any) => toast.error("Failed", { description: err.message }),
  });

  const handleConfirmMerge = () => {
    if (!mergeTarget) return;
    const primary = swapped ? mergeTarget.duplicates[0] : mergeTarget.primary;
    const dup = swapped ? mergeTarget.primary : mergeTarget.duplicates[0];
    mergeMutation.mutate({ primaryId: primary.id, duplicateId: dup.id });
  };

  const activePrimary = mergeTarget
    ? (swapped ? mergeTarget.duplicates[0] : mergeTarget.primary) as EnrichedStudent
    : null;
  const activeDuplicate = mergeTarget
    ? (swapped ? mergeTarget.primary : mergeTarget.duplicates[0]) as EnrichedStudent
    : null;

  

  const StudentCard = ({ student, label, variant }: { student: EnrichedStudent; label: string; variant: "primary" | "destructive" }) => (
    <div className={`p-4 rounded-xl border space-y-2 min-w-0 overflow-hidden ${variant === "primary" ? "bg-primary/10 border-primary/20" : "bg-destructive/10 border-destructive/20"}`}>
      <Badge className={variant === "primary" ? "bg-primary text-primary-foreground" : ""} variant={variant === "destructive" ? "destructive" : "default"}>{label}</Badge>
      <p className="font-semibold text-sm truncate">{student.full_name || "—"}</p>
      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs truncate"><BookOpen className="h-3 w-3 text-info shrink-0" />{student.lessonCount ?? 0} lessons</div>
        <div className="flex items-center gap-1.5 text-xs truncate"><Package className="h-3 w-3 text-accent shrink-0" />{student.packageCount ?? 0} pkgs</div>
        <div className="flex items-center gap-1.5 text-xs truncate"><DollarSign className="h-3 w-3 text-warning shrink-0" />{fmtMXN(student.totalPaid || 0)}</div>
        <div className="flex items-center gap-1.5 text-xs truncate"><User className="h-3 w-3 shrink-0" />HC: {student.handicap ?? "—"}</div>
      </div>
      <Badge variant="outline" className={`text-xs ${isPlaceholderEmail(student.email) ? "text-warning border-warning/40" : "text-primary border-primary/25"}`}>
        {isPlaceholderEmail(student.email) ? "Import Placeholder" : "Real Account"}
      </Badge>
    </div>
  );

  return (
    <div className="app-bg min-h-screen">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/admin/students">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Students</Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 icon-container icon-container-primary">
              <Merge className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold text-foreground">Review Duplicates</h1>
              <p className="text-xs text-muted-foreground">Detect and manage probable duplicate students</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {groups.length > 0 && (
              <Badge variant="destructive">{groups.length} pending</Badge>
            )}
            {reviewLaterCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowDismissed(!showDismissed)} className="gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {showDismissed ? "Hide" : "Show"} {reviewLaterCount} deferred
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6 max-w-3xl">
        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted/40 rounded-lg animate-pulse" />)}</div>
        ) : groups.length === 0 ? (
          <Card className="card-elevated">
            <CardContent className="py-16 text-center">
              <CheckCircle2 className="h-16 w-16 text-primary/40 mx-auto mb-4" />
              <h3 className="font-heading font-semibold text-lg mb-2">No duplicates to review</h3>
              <p className="text-muted-foreground text-sm">
                {allGroups.length > 0 ? "All detected duplicates have been handled." : "All student records look unique."}
              </p>
              {reviewLaterCount > 0 && !showDismissed && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowDismissed(true)}>
                  <Clock className="h-4 w-4 mr-1" /> Show {reviewLaterCount} deferred pair{reviewLaterCount !== 1 ? "s" : ""}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          groups.map((group, idx) => {
            const allStudents = [group.primary, ...group.duplicates] as EnrichedStudent[];
            const [pA, pB] = pairKey(group.primary.id, group.duplicates[0]?.id || "");
            const isDeferred = dismissedSet.has(`${pA}|${pB}|review_later`);

            return (
              <Card key={`${group.primary.id}-${idx}`} className={`card-elevated ${isDeferred ? "border-info/30" : "border-warning/30"}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {isDeferred ? <Clock className="h-4 w-4 text-info" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
                        {isDeferred ? "Deferred Review" : "Possible Duplicate"}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">
                        {group.reasons.join(" · ")} — Confidence: {Math.round(group.confidence * 100)}%
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Side-by-side student cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allStudents.map((s) => (
                      <div key={s.id} className="glass-card-sm p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-sm truncate">{s.full_name || "—"}</p>
                          <Badge variant="outline" className={`text-[10px] ${isPlaceholderEmail(s.email) ? "text-warning border-warning/40" : "text-primary border-primary/25"}`}>
                            {isPlaceholderEmail(s.email) ? "Import" : "Real"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3 text-info" />{s.lessonCount ?? 0} lessons</span>
                          <span className="flex items-center gap-1"><Package className="h-3 w-3 text-accent" />{s.packageCount ?? 0} pkgs</span>
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3 text-warning" />{fmtMXN(s.totalPaid || 0)}</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />HC: {s.handicap ?? "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="destructive" onClick={() => { setMergeTarget(group); setSwapped(false); }} className="gap-1">
                      <Merge className="h-3.5 w-3.5" /> Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => dismissMutation.mutate({ groupIdx: idx, decision: "keep_separate" })}
                      disabled={dismissMutation.isPending}
                      className="gap-1"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Keep Separate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => dismissMutation.mutate({ groupIdx: idx, decision: "review_later" })}
                      disabled={dismissMutation.isPending}
                      className="gap-1"
                    >
                      <Clock className="h-3.5 w-3.5" /> Review Later
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>

      {/* Merge confirmation dialog */}
      <AlertDialog open={!!mergeTarget} onOpenChange={(o) => { if (!o) { setMergeTarget(null); setSwapped(false); } }}>
        <AlertDialogContent className="max-w-2xl w-[95vw] overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-warning" /> Confirm Student Merge
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p className="text-sm">All history from the <strong>duplicate</strong> will be moved into the <strong>surviving</strong> record. The duplicate profile will be deactivated.</p>

                {activePrimary && activeDuplicate && (
                  <>
                    {/* Desktop: side by side */}
                    <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                      <StudentCard student={activePrimary} label="Surviving" variant="primary" />
                      <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      <StudentCard student={activeDuplicate} label="Will be merged" variant="destructive" />
                    </div>
                    {/* Mobile: stacked */}
                    <div className="flex flex-col gap-3 sm:hidden">
                      <StudentCard student={activePrimary} label="Surviving" variant="primary" />
                      <div className="flex justify-center">
                        <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
                      </div>
                      <StudentCard student={activeDuplicate} label="Will be merged" variant="destructive" />
                    </div>
                  </>
                )}

                <Button variant="outline" size="sm" className="w-full" onClick={() => setSwapped(!swapped)}>
                  ↔ Swap surviving / duplicate
                </Button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmMerge}
              disabled={mergeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mergeMutation.isPending ? "Merging…" : "Confirm Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SocialFooter />
    </div>
  );
}
