import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Search, Filter, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableStudentSelect } from "@/components/SearchableStudentSelect";
import { AiCoachResponseCard, type AiCoachSession } from "@/components/AiCoachResponseCard";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { CoachAiChat } from "@/components/CoachAiChat";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AiInsightsModal({ open, onOpenChange }: Props) {
  const [studentId, setStudentId] = useState<string>("");
  const [tab, setTab] = useState<"sessions" | "chat">("sessions");
  const [hasUsedAiOnly, setHasUsedAiOnly] = useState(false);

  // Distinct students that have used the AI + their session counts
  const { data: studentsWithAi = {} } = useQuery<Record<string, { count: number; name: string | null }>>(
    {
      queryKey: ["coach-students-with-ai"],
      enabled: open,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("ai_coach_sessions")
          .select("student_id")
          .order("created_at", { ascending: false })
          .limit(2000);
        if (error) throw error;
        const counts: Record<string, number> = {};
        (data ?? []).forEach((r: any) => {
          if (r.student_id) counts[r.student_id] = (counts[r.student_id] || 0) + 1;
        });
        const ids = Object.keys(counts);
        let names: Record<string, string | null> = {};
        if (ids.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", ids);
          names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name || p.email]));
        }
        const result: Record<string, { count: number; name: string | null }> = {};
        ids.forEach((id) => (result[id] = { count: counts[id], name: names[id] ?? null }));
        return result;
      },
    }
  );

  const aiStudentIds = Object.keys(studentsWithAi);
  const restrictIds = hasUsedAiOnly ? aiStudentIds : undefined;
  const studentMeta: Record<string, { badge?: string }> = Object.fromEntries(
    Object.entries(studentsWithAi).map(([id, v]) => [id, { badge: `✦ ${v.count}` }])
  );
  const selectedStudentName = studentId ? studentsWithAi[studentId]?.name ?? null : null;

  // Recent sessions across all students (when no student selected)
  const { data: recentSessions = [], isLoading: loadingRecent } = useQuery({
    queryKey: ["admin-ai-coach-recent"],
    enabled: open && !studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_coach_sessions")
        .select("id, input_type, student_input, ai_response, status, created_at, student_id, intent, answer_text")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;

      const ids = Array.from(new Set((data ?? []).map((s: any) => s.student_id).filter(Boolean)));
      let names: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        names = Object.fromEntries(
          (profs ?? []).map((p: any) => [p.id, p.full_name || p.email || "Unknown"])
        );
      }
      return (data ?? []).map((s: any) => ({ ...s, _student_name: names[s.student_id] }));
    },
  });

  const { data: studentSessions = [], isLoading: loadingStudent } = useQuery<AiCoachSession[]>({
    queryKey: ["admin-ai-coach-by-student", studentId],
    enabled: open && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_coach_sessions")
        .select("id, input_type, student_input, ai_response, status, created_at, intent, answer_text")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AiCoachSession[];
    },
  });

  const flagged = studentSessions.filter((s) => s.status === "needs_review").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col overflow-hidden border-t-0 rounded-t-2xl p-0"
        style={{
          background: "rgba(0,0,0,0.92)",
          backdropFilter: "blur(20px)",
          color: "#F5F0E8",
          height: "calc(100dvh - env(safe-area-inset-top, 0px))",
          maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <SheetHeader className="shrink-0 px-4 pt-5 pb-3 border-b border-white/10">
          <SheetTitle className="flex items-center gap-2 text-[#F5F0E8]">
            <Sparkles className="h-5 w-5" style={{ color: "#F0C040" }} />
            AI Insights
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col space-y-4 overflow-hidden px-4 py-4 mx-auto">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
            <button
              onClick={() => setTab("sessions")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors",
                tab === "sessions" ? "bg-[#4a7c59] text-[#F5F0E8]" : "text-[#F5F0E8]/60 hover:text-[#F5F0E8]"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Student Sessions
            </button>
            <button
              onClick={() => setTab("chat")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors",
                tab === "chat" ? "bg-[#4a7c59] text-[#F5F0E8]" : "text-[#F5F0E8]/60 hover:text-[#F5F0E8]"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Coach Chat
            </button>
          </div>

          {tab === "sessions" ? (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-4">
              {/* Student picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-[#F5F0E8]/55 flex items-center gap-1.5">
                  <Search className="h-3 w-3" /> Filter by student
                </label>
                <SearchableStudentSelect
                  value={studentId}
                  onValueChange={setStudentId}
                  variant="dark"
                  restrictToIds={restrictIds}
                  meta={studentMeta}
                />

                {/* "Has used AI" toggle */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      setHasUsedAiOnly((v) => {
                        const next = !v;
                        // If we restrict and current selection is no longer valid, clear it.
                        if (next && studentId && !aiStudentIds.includes(studentId)) setStudentId("");
                        return next;
                      });
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors",
                      hasUsedAiOnly
                        ? "bg-[#F0C040]/15 border-[#F0C040]/40 text-[#F0C040]"
                        : "bg-white/5 border-white/10 text-[#F5F0E8]/60 hover:text-[#F5F0E8]"
                    )}
                  >
                    <Filter className="h-3 w-3" />
                    {hasUsedAiOnly ? `Has used AI (${aiStudentIds.length})` : "Show only students who used AI"}
                  </button>
                  {studentId && (
                    <button
                      onClick={() => setStudentId("")}
                      className="text-[11px] text-[#F0C040] hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

          {/* Body */}
          {studentId ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#F5F0E8]/60">
                <span>{studentSessions.length} session{studentSessions.length === 1 ? "" : "s"}</span>
                {flagged > 0 && (
                  <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-[10px]">
                    {flagged} flagged for review
                  </Badge>
                )}
              </div>

              {loadingStudent ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#F5F0E8]/40" />
                </div>
              ) : studentSessions.length === 0 ? (
                <Card className="bg-white/5 border-white/10 border-dashed">
                  <CardContent className="p-6 text-center text-sm text-[#F5F0E8]/55">
                    This student hasn't used the Margea AI yet.
                  </CardContent>
                </Card>
              ) : (
                <>
                  {studentSessions.map((s) => (
                    <AiCoachResponseCard key={s.id} session={s} />
                  ))}
                  <Link
                    to={`/admin/student/${studentId}?tab=ai`}
                    onClick={() => onOpenChange(false)}
                    className="block text-center text-xs text-[#F0C040] hover:underline pt-1"
                  >
                    Open full conversation history in student profile →
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-[#F5F0E8]/55">
                Recent across all students
              </p>
              {loadingRecent ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#F5F0E8]/40" />
                </div>
              ) : recentSessions.length === 0 ? (
                <Card className="bg-white/5 border-white/10 border-dashed">
                  <CardContent className="p-6 text-center text-sm text-[#F5F0E8]/55">
                    No AI sessions yet.
                  </CardContent>
                </Card>
              ) : (
                recentSessions.map((s: any) => (
                  <div key={s.id} className="space-y-1">
                    {s._student_name && (
                      <p className="text-[10px] uppercase tracking-wider text-[#F0C040]/80 px-1">
                        {s._student_name}
                      </p>
                    )}
                    <AiCoachResponseCard session={s} />
                  </div>
                ))
              )}
            </div>
          )}
            </div>
          ) : (
            <CoachAiChat
              studentContextId={studentId || undefined}
              studentContextName={selectedStudentName || undefined}
              onClearStudentContext={() => setStudentId("")}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
