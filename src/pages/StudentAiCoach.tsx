import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Sparkles, Loader2, Info, X } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AiCoachResponseCard, type AiCoachSession } from "@/components/AiCoachResponseCard";
import { useAuth } from "@/contexts/AuthContext";
import { useApexAiAccess } from "@/hooks/useApexAiAccess";
import { ApexAiTeaser } from "@/components/apex-ai/ApexAiTeaser";
import {
  ApexAiSpecialResponseCard,
  type SpecialResponse,
} from "@/components/ApexAiSpecialResponseCard";

type ChatMessage =
  | { role: "user"; id: string; text: string; createdAt: string }
  | { role: "assistant"; id: string; session: AiCoachSession; createdAt: string }
  | { role: "assistant-special"; id: string; response: SpecialResponse; createdAt: string }
  | { role: "assistant-loading"; id: string; createdAt: string };

export default function StudentAiCoach() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { loading, profile, hasPermission, isStaffView, role, previewTier } = useAuth();
  const planAllowsApexAi = useApexAiAccess();
  // While an admin is previewing a tier, the preview tier alone decides access —
  // the staff/coach override must not leak paid features into a Free preview.
  const staffOverride =
    previewTier === null &&
    (role === 'admin' || role === 'coach' || isStaffView) &&
    hasPermission('pro_zone');
  const allowed = staffOverride || planAllowsApexAi;
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, submitting]);

  // No access (e.g. free plan without trial): show the in-page upsell teaser
  // instead of redirecting away. Staff override and the plan entitlement
  // logic above are reused unchanged.
  if (loading) return null;
  if (!allowed) return <ApexAiTeaser />;

  function appendUser(t: string) {
    setMessages((prev) => [
      ...prev,
      { role: "user", id: `u-${Date.now()}`, text: t, createdAt: new Date().toISOString() },
    ]);
  }
  function appendLoading(): string {
    const id = `l-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { role: "assistant-loading", id, createdAt: new Date().toISOString() },
    ]);
    return id;
  }
  function appendSpecial(response: SpecialResponse, removeLoadingId?: string) {
    setMessages((prev) =>
      (removeLoadingId ? prev.filter((m) => m.id !== removeLoadingId) : prev).concat({
        role: "assistant-special",
        id: `s-${Date.now()}`,
        response,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  async function handleCheckAvailability() {
    if (submitting) return;
    appendUser(t('prozone2.aiCoach.userAskAvailability'));
    const lid = appendLoading();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("apex-ai-availability", {
        body: { action: "list" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const slots = (data as any)?.slots ?? [];
      appendSpecial({ kind: "availability", slots }, lid);
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== lid));
      toast.error(e?.message ?? t('prozone2.aiCoach.errLoadAvailability'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGeneratePlan(
    planType: "weekly" | "monthly" | "bimonthly",
    days?: string[],
  ) {
    if (submitting) return;
    const labelMap = { weekly: t('prozone2.aiCoach.plan1Week'), monthly: t('prozone2.aiCoach.plan1Month'), bimonthly: t('prozone2.aiCoach.plan2Month') } as const;
    appendUser(t('prozone2.aiCoach.userGeneratePlan').replace('{plan}', labelMap[planType]));
    const lid = appendLoading();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("apex-ai-training-plan", {
        body: { plan_type: planType, language, days },
      });
      if (error) throw error;
      const d: any = data;
      if (d?.code === "subscription_required" || d?.error) {
        appendSpecial({ kind: "info", message: d?.error ?? t('prozone2.aiCoach.customPlanRequires') }, lid);
        return;
      }
      if (!d?.weeks || !d?.title) throw new Error(t('prozone2.aiCoach.errEmptyPlan'));
      appendSpecial(
        {
          kind: "plan",
          plan: {
            plan_id: d.plan_id,
            plan_type: d.plan_type,
            title: d.title,
            summary: d.summary ?? null,
            weeks: d.weeks,
            success_metrics: d.success_metrics ?? [],
            coach_review_note: d.coach_review_note ?? null,
          },
        },
        lid,
      );
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== lid));
      toast.error(e?.message ?? t('prozone2.aiCoach.errGeneratePlan'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleUpgrade() {
    navigate("/plans");
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      toast.error(t('prozone2.aiCoach.errWriteMore'));
      return;
    }
    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      role: "user",
      id: `u-${Date.now()}`,
      text: trimmed,
      createdAt: now,
    };
    const loadingMsg: ChatMessage = {
      role: "assistant-loading",
      id: `l-${Date.now()}`,
      createdAt: now,
    };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setText("");
    setSubmitting(true);
    try {
      const history = messages
        .map((m): { role: "user" | "assistant"; content: string } | null => {
          if (m.role === "user") return { role: "user", content: m.text };
          if (m.role === "assistant") {
            const s: any = m.session;
            const ai = s?.ai_response;
            const text = s?.answer_text
              ? String(s.answer_text)
              : ai
                ? [ai.quick_diagnosis, ai.main_priority, ai.coach_notes]
                    .filter(Boolean)
                    .join("\n")
                : "";
            return text ? { role: "assistant", content: text } : null;
          }
          return null;
        })
        .filter((x): x is { role: "user" | "assistant"; content: string } => !!x)
        .slice(-10);

      const { data, error } = await supabase.functions.invoke("ai-golf-coach", {
        body: {
          input_type: "question",
          student_input: trimmed,
          conversation_history: history,
          language,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d: any = data;
      const session: AiCoachSession = {
        id: d?.session_id ?? "latest",
        input_type: "question",
        student_input: trimmed,
        ai_response: d?.ai_response ?? null,
        status: d?.status ?? "complete",
        created_at: new Date().toISOString(),
        intent: d?.intent ?? null,
        answer_text: d?.answer_text ?? null,
      };
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== loadingMsg.id)
          .concat({
            role: "assistant",
            id: `a-${Date.now()}`,
            session,
            createdAt: new Date().toISOString(),
          }),
      );
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));
      toast.error(e?.message ?? t('prozone2.aiCoach.errUnavailable'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!submitting && text.trim().length >= 3) handleSubmit();
    }
  }

  return (
    <div
      className="fixed inset-0 lg:left-60 flex flex-col"
      style={{ background: "rgba(0,0,0,0.92)", color: "#F5F0E8" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pb-3 border-b border-white/10 flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/dashboard")}
            className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-[#F5F0E8]/70 hover:text-[#F5F0E8]"
            aria-label={t('prozone2.aiCoach.backToDashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Sparkles className="h-5 w-5" style={{ color: "#F0C040" }} />
          <span className="font-semibold text-[#F5F0E8]">Margea AI</span>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="h-9 inline-flex items-center gap-1.5 px-3 rounded-full hover:bg-white/10 transition-colors text-[#F5F0E8]/80 hover:text-[#F5F0E8] text-xs font-medium border border-white/15"
          aria-label={t('prozone2.aiCoach.closeAria')}
        >
          <X className="h-3.5 w-3.5" />
          <span>{t('prozone2.aiCoach.exit')}</span>
        </button>
        <LanguageToggle variant="header" />
      </div>

      {/* Scrollable conversation area */}
      <div className="flex-1 overflow-y-auto px-3 py-4 min-h-0">
        <div className="space-y-4 max-w-2xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-10 space-y-3">
              <div
                className="inline-flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  background: "rgba(240,192,64,0.12)",
                  border: "1px solid rgba(240,192,64,0.30)",
                }}
              >
                <Sparkles className="h-6 w-6" style={{ color: "#F0C040" }} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#F5F0E8]">
                  {t('prozone2.aiCoach.helpTitle')}
                </p>
                <p className="text-xs text-[#F5F0E8]/55 max-w-sm mx-auto">
                  {t('prozone2.aiCoach.helpDesc')}
                </p>
              </div>
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-lg max-w-md mx-auto text-left"
                style={{
                  background: "rgba(74,124,89,0.10)",
                  border: "1px solid rgba(74,124,89,0.30)",
                }}
              >
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#7CC598" }} />
                <p className="text-[11px] text-[#F5F0E8]/75 leading-relaxed">
                  {t('prozone2.aiCoach.disclaimer')}
                </p>
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm whitespace-pre-wrap"
                    style={{ background: "#F0C040", color: "#1a2b1a" }}
                  >
                    {m.text}
                  </div>
                </div>
              );
            }
            if (m.role === "assistant-loading") {
              return (
                <div key={m.id} className="flex justify-start gap-2">
                  <div
                    className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{
                      background: "rgba(240,192,64,0.15)",
                      border: "1px solid rgba(240,192,64,0.35)",
                    }}
                    aria-hidden
                  >
                    <Sparkles className="h-4 w-4" style={{ color: "#F0C040" }} />
                  </div>
                  <div className="flex flex-col gap-1 max-w-[85%]">
                    <span className="text-[10px] uppercase tracking-wider text-[#F5F0E8]/55 px-1">
                      Margea AI
                    </span>
                    <div
                      className="rounded-2xl rounded-tl-md px-4 py-3 text-sm flex items-center gap-2"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(245,240,232,0.7)",
                      }}
                    >
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#F0C040" }} />
                      <span>{t('prozone2.aiCoach.thinking')}</span>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <div
                  className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{
                    background: "rgba(240,192,64,0.15)",
                    border: "1px solid rgba(240,192,64,0.35)",
                  }}
                  aria-hidden
                >
                  <Sparkles className="h-4 w-4" style={{ color: "#F0C040" }} />
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-[10px] uppercase tracking-wider text-[#F5F0E8]/55 px-1">
                    Margea AI
                  </span>
                  {m.role === "assistant" ? (
                    <AiCoachResponseCard session={m.session} />
                  ) : (
                    <ApexAiSpecialResponseCard
                      response={m.response}
                      onBooked={(msg) =>
                        appendSpecial({ kind: "booking_result", status: "booked", message: msg })
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}

          <div ref={endRef} />
        </div>
      </div>

      {/* Sticky composer */}
      <div
        className="flex-shrink-0 border-t border-white/10 px-3 py-3"
        style={{
          background: "rgba(0,0,0,0.6)",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('prozone2.aiCoach.composerPlaceholder')}
            rows={1}
            maxLength={4000}
            className="flex-1 resize-none min-h-[44px] max-h-32 bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 rounded-xl"
            disabled={submitting}
          />
          <Button
            onClick={handleSubmit}
            disabled={submitting || text.trim().length < 3}
            size="icon"
            className="h-11 w-11 rounded-xl flex-shrink-0"
            style={{ background: "#F0C040", color: "#1a2b1a" }}
            aria-label={t('prozone2.aiCoach.sendAria')}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}