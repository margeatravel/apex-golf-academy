import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Sparkles, Loader2, Info, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AiCoachResponseCard, type AiCoachSession } from "@/components/AiCoachResponseCard";
import {
  ApexAiSpecialResponseCard,
  type SpecialResponse,
} from "@/components/ApexAiSpecialResponseCard";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type ChatMessage =
  | { role: "user"; id: string; text: string; createdAt: string }
  | { role: "assistant"; id: string; session: AiCoachSession; createdAt: string }
  | { role: "assistant-special"; id: string; response: SpecialResponse; createdAt: string }
  | { role: "assistant-loading"; id: string; createdAt: string };

export function AiCoachChatModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Reset the visible conversation each time the sheet opens. Backend keeps
  // rolling memory on the profile so the AI still "remembers" the student.
  useEffect(() => {
    if (open) {
      setMessages([]);
      setText("");
    }
  }, [open]);

  // Auto-scroll to the latest message whenever the conversation updates.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, submitting]);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      toast.error("Please write a bit more so the AI can help.");
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
      // Build conversation history (last 10 turns) from the visible chat.
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
          })
      );
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));
      toast.error(e?.message ?? "Margea AI is unavailable right now.");
    } finally {
      setSubmitting(false);
    }
  }

  function appendUser(text: string) {
    const userMsg: ChatMessage = {
      role: "user",
      id: `u-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
  }

  function appendLoading(): string {
    const id = `l-${Date.now()}`;
    setMessages((prev) => [...prev, { role: "assistant-loading", id, createdAt: new Date().toISOString() }]);
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
    appendUser("Show me available lesson times.");
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
      toast.error(e?.message ?? "Could not load availability.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGeneratePlan(
    planType: "weekly" | "monthly" | "bimonthly",
    days?: string[],
  ) {
    if (submitting) return;
    const labelMap = { weekly: "1-week", monthly: "1-month", bimonthly: "2-month" } as const;
    appendUser(`Generate a custom ${labelMap[planType]} training plan for me.`);
    const lid = appendLoading();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("apex-ai-training-plan", {
        body: { plan_type: planType, language, days },
      });
      if (error) throw error;
      const d: any = data;
      if (d?.code === "subscription_required" || d?.error) {
        appendSpecial(
          {
            kind: "info",
            message:
              d?.error ??
              "Custom training plans are available to active subscribers. Upgrade your plan to unlock.",
          },
          lid,
        );
        return;
      }
      if (!d?.weeks || !d?.title) throw new Error("Plan response was empty.");
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
      toast.error(e?.message ?? "Could not generate the plan.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleUpgrade() {
    onOpenChange(false);
    navigate("/plans");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!submitting && text.trim().length >= 3) handleSubmit();
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Margea AI chat"
      className="fixed z-50 flex flex-col overflow-hidden shadow-2xl rounded-2xl border border-white/10
                 inset-x-3 bottom-3 top-3
                 sm:inset-auto sm:right-4 sm:bottom-4 sm:top-auto sm:w-[380px]"
      style={{
        background: "rgba(0,0,0,0.92)",
        backdropFilter: "blur(20px)",
        color: "#F5F0E8",
        height: "min(80dvh, 640px)",
        maxHeight: "calc(100dvh - 1.5rem)",
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: "#F0C040" }} />
          <span className="font-semibold text-[#F5F0E8]">Margea AI</span>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-[#F5F0E8]/70 hover:text-[#F5F0E8]"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

        {/* Scrollable conversation area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-4 min-h-0"
        >
          <div className="space-y-4">
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
                    How can Margea AI help today?
                  </p>
                  <p className="text-xs text-[#F5F0E8]/55 max-w-sm mx-auto">
                    Ask about your swing, recent rounds, practice plans, or how the academy works.
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
                    AI-assisted feedback. Your coach can review every reply. No medical advice.
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
                      style={{
                        background: "#F0C040",
                        color: "#1a2b1a",
                      }}
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
                        <span>Thinking…</span>
                      </div>
                    </div>
                  </div>
                );
              }
              // assistant or assistant-special
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
                          appendSpecial({
                            kind: "booking_result",
                            status: "booked",
                            message: msg,
                          })
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

        {/* Fixed bottom composer */}
        <div
          className="flex-shrink-0 border-t border-white/10 px-3 py-3"
          style={{
            background: "rgba(0,0,0,0.6)",
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Margea AI…"
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
              aria-label="Send message"
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
