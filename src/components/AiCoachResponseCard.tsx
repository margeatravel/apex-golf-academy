import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Sparkles, Target, Dumbbell, CalendarDays, MessageCircle, CalendarCheck, CreditCard, HelpCircle, LifeBuoy, MessageSquare, Crown, Video } from "lucide-react";
import { format } from "date-fns";
import { useLanguage } from "@/contexts/LanguageContext";
import { localeFor } from "@/lib/uiLocale";

export type AiCoachResponse = {
  quick_diagnosis?: string;
  main_priority?: string;
  practice_drills?: Array<{
    drill_name?: string;
    description?: string;
    duration_minutes?: number;
    // legacy field names tolerated for older sessions
    name?: string;
    how_to?: string;
    reps_or_duration?: string;
  }>;
  weekly_practice_plan?: Array<{ day: string; focus: string; exercises?: string[]; minutes: number }>;
  coach_notes?: string;
  needs_human_review?: boolean;
};

export type AiCoachSession = {
  id: string;
  input_type: string;
  student_input: string;
  ai_response: AiCoachResponse | null;
  status: string;
  created_at: string;
  intent?: string | null;
  answer_text?: string | null;
};

function useInputTypeLabel(t: (k: string) => string): Record<string, string> {
  return {
    question: t('prozone2.aiResponseCard.question'),
    goal: t('prozone2.aiResponseCard.goal'),
    score: t('prozone2.aiResponseCard.score'),
    video_note: t('prozone2.aiResponseCard.videoNote'),
    practice_plan: t('prozone2.aiResponseCard.practicePlan'),
  };
}

function useIntentMeta(t: (k: string) => string): Record<string, { label: string; icon: typeof CalendarCheck }> {
  return {
    booking: { label: t('prozone2.aiResponseCard.booking'), icon: CalendarCheck },
    payments: { label: t('prozone2.aiResponseCard.payments'), icon: CreditCard },
    membership: { label: t('prozone2.aiResponseCard.membership'), icon: Crown },
    video_upload: { label: t('prozone2.aiResponseCard.videoUpload'), icon: Video },
    platform_help: { label: t('prozone2.aiResponseCard.appHelp'), icon: LifeBuoy },
    account_help: { label: t('prozone2.aiResponseCard.account'), icon: LifeBuoy },
    golf_instruction: { label: t('prozone2.aiResponseCard.coaching'), icon: Dumbbell },
    score_analysis: { label: t('prozone2.aiResponseCard.scoreReview'), icon: Target },
    video_analysis: { label: t('prozone2.aiResponseCard.videoReview'), icon: Sparkles },
    practice_plan: { label: t('prozone2.aiResponseCard.practicePlan'), icon: CalendarDays },
    unclear: { label: t('prozone2.aiResponseCard.needsMoreInfo'), icon: HelpCircle },
  };
}

const sectionStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
};

export function AiCoachResponseCard({ session }: { session: AiCoachSession }) {
  const { t, language } = useLanguage();
  const inputTypeLabel = useInputTypeLabel(t);
  const intentMeta = useIntentMeta(t);
  const r = session.ai_response;
  const failed = session.status === "failed";
  const pending = session.status === "pending";
  const intent = session.intent ?? undefined;
  const meta = intent ? intentMeta[intent] : undefined;
  const hasPlainAnswer = !!session.answer_text && session.answer_text.trim().length > 0;

  return (
    <Card className="bg-card/60 backdrop-blur border-border/50">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "#F0C040" }} />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
              {meta?.label ?? inputTypeLabel[session.input_type] ?? session.input_type}
            </span>
            {intent === "unclear" && (
              <Badge variant="outline" className="text-[10px] border-foreground/20 text-foreground/70">
                {t('prozone2.aiResponseCard.clarify')}
              </Badge>
            )}
            {session.status === "needs_review" && (
              <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-[10px]">
                {t('prozone2.aiResponseCard.needsCoachReview')}
              </Badge>
            )}
            {failed && (
              <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px]">
                {t('prozone2.aiResponseCard.failed')}
              </Badge>
            )}
            {pending && (
              <Badge variant="outline" className="text-[10px]">{t('prozone2.aiResponseCard.pending')}</Badge>
            )}
          </div>
          <span className="text-[10px] text-foreground/50">
            {new Date(session.created_at).toLocaleString(localeFor(language), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        </div>

        {failed && (
          <p className="text-sm text-destructive">
            {t('prozone2.aiResponseCard.failedBody')}
          </p>
        )}

        {/* Plain conversational answer (booking, payments, platform_help, account_help, unclear) */}
        {!failed && hasPlainAnswer && (
          <div style={sectionStyle} className="px-3 py-2 flex items-start gap-2">
            <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#7CC598" }} />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-foreground/50 mb-0.5">
                {intent === "unclear" ? t('prozone2.aiResponseCard.apexAiAsks') : t('prozone2.aiResponseCard.apexAi')}
              </p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{session.answer_text}</p>
            </div>
          </div>
        )}

        {/* Empty-state for non-coaching intents that came back without text */}
        {!failed && !pending && !r && !hasPlainAnswer && (
          <p className="text-sm text-foreground/60">
            {t('prozone2.aiResponseCard.noResponse')}
          </p>
        )}

        {r && (
          <>
            {r.needs_human_review && (
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-400" />
                <p className="text-xs text-amber-200">
                  {t('prozone2.aiResponseCard.needsReviewNotice')}
                </p>
              </div>
            )}

            {r.quick_diagnosis && (
              <div style={sectionStyle} className="px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-foreground/50 mb-1">{t('prozone2.aiResponseCard.quickDiagnosis')}</p>
                <p className="text-sm text-foreground/90">{r.quick_diagnosis}</p>
              </div>
            )}

            {r.main_priority && (
              <div style={sectionStyle} className="px-3 py-2 flex items-start gap-2">
                <Target className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#7CC598" }} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-foreground/50 mb-0.5">{t('prozone2.aiResponseCard.mainPriority')}</p>
                  <p className="text-sm font-medium text-foreground">{r.main_priority}</p>
                </div>
              </div>
            )}

            {r.practice_drills && r.practice_drills.length > 0 && (
              <div style={sectionStyle} className="px-3 py-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <Dumbbell className="h-3.5 w-3.5 text-foreground/60" />
                  <p className="text-[10px] uppercase tracking-wider text-foreground/50">{t('prozone2.aiResponseCard.practiceDrill')}</p>
                </div>
                <ul className="space-y-2">
                  {r.practice_drills.map((d, i) => {
                    const title = d.drill_name || d.name || t('prozone2.aiResponseCard.practiceDrill');
                    const body = d.description || d.how_to || "";
                    const dur =
                      typeof d.duration_minutes === "number"
                        ? `${d.duration_minutes} ${t('prozone2.aiResponseCard.minAbbrev')}`
                        : d.reps_or_duration || "";
                    return (
                      <li key={i}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">{title}</span>
                          {dur && (
                            <span className="text-[11px] text-foreground/55 whitespace-nowrap">{dur}</span>
                          )}
                        </div>
                        {body && (
                          <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">{body}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {r.weekly_practice_plan && r.weekly_practice_plan.length > 0 && (
              <div style={sectionStyle} className="px-3 py-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <CalendarDays className="h-3.5 w-3.5 text-foreground/60" />
                  <p className="text-[10px] uppercase tracking-wider text-foreground/50">{t('prozone2.aiResponseCard.weeklyPlan')}</p>
                </div>
                <ul className="space-y-1.5">
                  {r.weekly_practice_plan.map((p, i) => (
                    <li key={i} className="text-sm min-w-0">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-semibold w-12 shrink-0 text-foreground/80">{p.day}</span>
                        <span className="flex-1 min-w-0 break-words text-foreground/85">{p.focus}</span>
                        {p.minutes > 0 && (
                          <span className="text-[11px] shrink-0 text-foreground/55 whitespace-nowrap">{p.minutes} {t('prozone2.aiResponseCard.minAbbrev')}</span>
                        )}
                      </div>
                      {p.exercises && p.exercises.length > 0 && (
                        <ul className="mt-1 ml-14 space-y-0.5 list-disc pl-3">
                          {p.exercises.map((ex, j) => (
                            <li key={j} className="text-xs text-foreground/75 break-words">{ex}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {r.coach_notes && (
              <div style={sectionStyle} className="px-3 py-2 flex items-start gap-2">
                <MessageCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-foreground/55" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-foreground/50 mb-0.5">{t('prozone2.aiResponseCard.coachNotes')}</p>
                  <p className="text-xs text-foreground/75 italic">{r.coach_notes}</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}