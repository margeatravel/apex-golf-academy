import { useState } from "react";
import { Calendar, Clock, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { localeFor } from "@/lib/uiLocale";

export type AvailabilitySlot = {
  slot_id: string;
  date: string;
  day_label: string;
  start_time: string;
  duration_minutes: number;
  lesson_type: string;
};

export type TrainingPlan = {
  plan_id: string;
  plan_type: "weekly" | "monthly" | "bimonthly";
  title: string;
  summary: string | null;
  weeks: Array<{
    week_number: number;
    theme: string;
    sessions: Array<{
      day: string;
      focus: string;
      duration_minutes: number;
      blocks: string[];
    }>;
  }>;
  success_metrics: string[];
  coach_review_note: string | null;
};

export type SpecialResponse =
  | { kind: "availability"; slots: AvailabilitySlot[] }
  | { kind: "booking_result"; status: string; message: string; lesson_id?: string }
  | { kind: "plan"; plan: TrainingPlan }
  | { kind: "info"; message: string };

function formatTime(t: string, locale: string): string {
  // "13:30:00" -> "1:30 PM"
  const [hh, mm] = t.split(":");
  const dt = new Date(2000, 0, 1, parseInt(hh, 10), parseInt(mm, 10));
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(dt);
}

function formatDate(d: string, locale: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(dt);
}

interface Props {
  response: SpecialResponse;
  onBooked?: (msg: string) => void;
}

export function ApexAiSpecialResponseCard({ response, onBooked }: Props) {
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleBook(slot: AvailabilitySlot) {
    setBookingId(slot.slot_id + slot.date);
    try {
      const { data, error } = await supabase.functions.invoke("apex-ai-availability", {
        body: {
          action: "book",
          slot_id: slot.slot_id,
          lesson_date: slot.date,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d: any = data;
      if (d.status === "booked") {
        toast.success(t("prozone2.aiSpecialCard.lessonBooked"));
        onBooked?.(
          t("prozone2.aiSpecialCard.bookedMessage")
            .replace("{type}", slot.lesson_type)
            .replace("{date}", formatDate(slot.date, locale))
            .replace("{time}", formatTime(slot.start_time, locale)),
        );
      } else if (d.status === "payment_required") {
        toast.message(t("prozone2.aiSpecialCard.needPackageTitle"), {
          description: d.message,
        });
        onBooked?.(d.message);
      } else if (d.status === "already_booked") {
        toast.message(t("prozone2.aiSpecialCard.alreadyBooked"));
      } else {
        toast.message(d.message ?? t("prozone2.aiSpecialCard.bookingSubmitted"));
      }
    } catch (e: any) {
      toast.error(e?.message ?? t("prozone2.aiSpecialCard.errBookFailed"));
    } finally {
      setBookingId(null);
      setConfirmId(null);
    }
  }

  if (response.kind === "info") {
    return (
      <div
        className="rounded-2xl rounded-tl-md px-4 py-3 text-sm"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(245,240,232,0.85)",
        }}
      >
        {response.message}
      </div>
    );
  }

  if (response.kind === "booking_result") {
    const ok = response.status === "booked";
    return (
      <div
        className="rounded-2xl rounded-tl-md px-4 py-3 text-sm flex items-start gap-2"
        style={{
          background: ok ? "rgba(74,124,89,0.12)" : "rgba(255,255,255,0.05)",
          border: ok
            ? "1px solid rgba(74,124,89,0.40)"
            : "1px solid rgba(255,255,255,0.08)",
          color: "rgba(245,240,232,0.9)",
        }}
      >
        {ok ? (
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#7CC598" }} />
        ) : (
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#F0C040" }} />
        )}
        <span>{response.message}</span>
      </div>
    );
  }

  if (response.kind === "availability") {
    if (response.slots.length === 0) {
      return (
        <div
          className="rounded-2xl rounded-tl-md px-4 py-3 text-sm"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(245,240,232,0.85)",
          }}
        >
          {t("prozone2.aiSpecialCard.noSlots")}
        </div>
      );
    }
    return (
      <div
        className="rounded-2xl rounded-tl-md px-4 py-3 space-y-2.5"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(245,240,232,0.95)",
        }}
      >
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Calendar className="h-4 w-4" style={{ color: "#F0C040" }} />
          {t("prozone2.aiSpecialCard.openSlots")}
        </p>
        <div className="space-y-1.5">
          {response.slots.map((s) => {
            const key = s.slot_id + s.date;
            const loading = bookingId === key;
            const confirming = confirmId === key;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
                style={{
                  background: "rgba(0,0,0,0.30)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#F0C040" }} />
                  <div className="min-w-0">
                    <div className="truncate text-[#F5F0E8]">
                      {formatDate(s.date, locale)} • {formatTime(s.start_time, locale)}
                    </div>
                    <div className="text-[10px] text-[#F5F0E8]/60 truncate">
                      {s.lesson_type} · {s.duration_minutes} min
                    </div>
                  </div>
                </div>
                {confirming ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => handleBook(s)}
                      disabled={loading}
                      className="h-7 px-2 text-[11px]"
                      style={{ background: "#F0C040", color: "#1a2b1a" }}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : t("prozone2.aiSpecialCard.confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmId(null)}
                      disabled={loading}
                      className="h-7 px-2 text-[11px] text-[#F5F0E8]/70 hover:text-[#F5F0E8]"
                    >
                      {t("prozone2.aiSpecialCard.cancel")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setConfirmId(key)}
                    className="h-7 px-3 text-[11px] font-semibold rounded-md transition-all duration-300 hover:scale-105 hover:brightness-110"
                    style={{
                      background: "linear-gradient(135deg, #F0C040 0%, #FFD96B 50%, #D9A520 100%)",
                      color: "#1a2b1a",
                      boxShadow:
                        "0 0 12px rgba(240,192,64,0.55), 0 0 24px rgba(240,192,64,0.25), inset 0 1px 0 rgba(255,255,255,0.4)",
                      border: "1px solid rgba(255,217,107,0.6)",
                    }}
                  >
                    {t("prozone2.aiSpecialCard.book")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[#F5F0E8]/55">
          {t("prozone2.aiSpecialCard.bookingFooter")}
        </p>
      </div>
    );
  }

  // Training plan
  const p = response.plan;
  return (
    <div
      className="rounded-2xl rounded-tl-md px-4 py-3 space-y-3 min-w-0 max-w-full break-words [overflow-wrap:anywhere]"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(240,192,64,0.30)",
        color: "rgba(245,240,232,0.95)",
      }}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#F0C040" }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#F5F0E8]">{p.title}</p>
          <p className="text-[10px] uppercase tracking-wider text-[#F5F0E8]/60">
            {p.plan_type} {t("prozone2.aiSpecialCard.plan")} · {p.weeks.length} {p.weeks.length === 1 ? t("prozone2.aiSpecialCard.week") : t("prozone2.aiSpecialCard.weeks")}
          </p>
        </div>
      </div>
      {p.summary && <p className="text-xs text-[#F5F0E8]/80">{p.summary}</p>}
      <div className="space-y-2.5">
        {p.weeks.map((w) => (
          <div
            key={w.week_number}
            className="rounded-lg px-3 py-2"
            style={{
              background: "rgba(0,0,0,0.30)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p className="text-[11px] font-semibold text-[#F0C040] uppercase tracking-wider">
              {t("prozone2.aiSpecialCard.week")} {w.week_number} · {w.theme}
            </p>
            <div className="mt-1.5 space-y-1.5">
              {w.sessions.map((s, i) => (
                <div key={i} className="text-[11px] text-[#F5F0E8]/85">
                  <span className="font-semibold text-[#F5F0E8]">
                    {s.day} · {s.focus}
                  </span>{" "}
                  <span className="text-[#F5F0E8]/55">({s.duration_minutes} min)</span>
                  <ul className="mt-0.5 ml-3 list-disc text-[#F5F0E8]/70 space-y-0.5">
                    {s.blocks.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {p.success_metrics?.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#F5F0E8]/60 mb-1">
            {t("prozone2.aiSpecialCard.successMetrics")}
          </p>
          <ul className="text-[11px] text-[#F5F0E8]/85 list-disc ml-4 space-y-0.5">
            {p.success_metrics.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {p.coach_review_note && (
        <p className="text-[10px] text-[#F5F0E8]/55 italic">{p.coach_review_note}</p>
      )}
    </div>
  );
}