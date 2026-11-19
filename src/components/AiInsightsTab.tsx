import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { AiCoachResponseCard, type AiCoachSession } from "@/components/AiCoachResponseCard";

export function AiInsightsTab({ studentId }: { studentId: string }) {
  const { data: sessions = [], isLoading } = useQuery<AiCoachSession[]>({
    queryKey: ["admin-ai-coach-sessions", studentId],
    enabled: !!studentId,
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center space-y-2">
          <Sparkles className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This student hasn't used the Margea AI yet.
          </p>
          <p className="text-xs text-muted-foreground/80">
            When they ask questions or request practice plans, every interaction will appear here for your review.
          </p>
        </CardContent>
      </Card>
    );
  }

  const needsReview = sessions.filter((s) => s.status === "needs_review").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
        {needsReview > 0 && (
          <span className="text-amber-500 font-semibold">
            {needsReview} flagged for review
          </span>
        )}
      </div>
      {sessions.map((s) => (
        <AiCoachResponseCard key={s.id} session={s} />
      ))}
    </div>
  );
}