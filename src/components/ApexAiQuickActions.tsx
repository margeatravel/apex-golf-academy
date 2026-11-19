import { useState } from "react";
import { Calendar, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PlanType = "weekly" | "monthly" | "bimonthly";

interface Props {
  onCheckAvailability: () => void;
  onGeneratePlan: (planType: PlanType, days?: string[]) => void;
  onUpgrade: () => void;
  disabled?: boolean;
}

const DAYS: { key: string; es: string; en: string }[] = [
  { key: "Mon", es: "Lun", en: "Mon" },
  { key: "Tue", es: "Mar", en: "Tue" },
  { key: "Wed", es: "Mié", en: "Wed" },
  { key: "Thu", es: "Jue", en: "Thu" },
  { key: "Fri", es: "Vie", en: "Fri" },
  { key: "Sat", es: "Sáb", en: "Sat" },
  { key: "Sun", es: "Dom", en: "Sun" },
];

/**
 * Sticky quick-action chips above the composer in the Margea AI chat.
 * - "Check availability" is open to anyone who can reach the chat.
 * - Plan chips require an active subscriber; tapping one opens a day picker
 *   where the student chooses exactly 2 training days per week.
 */
export function ApexAiQuickActions({
  onCheckAvailability,
  onGeneratePlan,
  onUpgrade,
  disabled,
}: Props) {
  const { effectivePlan } = useAuth();
  const { language } = useLanguage();
  const isEs = language?.toLowerCase().startsWith("es");
  const [pendingType, setPendingType] = useState<PlanType | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const isActiveSub =
    effectivePlan === "scratch" ||
    effectivePlan === "pro" ||
    effectivePlan === "apex";

  function toggleDay(key: string) {
    setSelected((prev) =>
      prev.includes(key)
        ? prev.filter((d) => d !== key)
        : prev.length >= 3
          ? [prev[1], prev[2], key]
          : [...prev, key],
    );
  }

  function confirm() {
    if (!pendingType || selected.length < 2 || selected.length > 3) return;
    const ordered = DAYS.filter((d) => selected.includes(d.key)).map((d) => d.key);
    const type = pendingType;
    setPendingType(null);
    setSelected([]);
    onGeneratePlan(type, ordered);
  }

  function PlanChip({ label, type }: { label: string; type: PlanType }) {
    const locked = !isActiveSub;
    const base =
      "h-8 px-3 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5";
    if (locked) {
      return (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onUpgrade}
                disabled={disabled}
                className={base}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderColor: "rgba(255,255,255,0.10)",
                  color: "rgba(245,240,232,0.55)",
                }}
              >
                <Lock className="h-3 w-3" />
                {label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Custom plans are for Scratch, Pro & Apex members. Tap to upgrade.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          setSelected([]);
          setPendingType(type);
        }}
        disabled={disabled}
        className={base}
        style={{
          background: "rgba(240,192,64,0.12)",
          borderColor: "rgba(240,192,64,0.35)",
          color: "#F0C040",
        }}
      >
        <Sparkles className="h-3 w-3" />
        {label}
      </button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 px-1 pb-2">
        <button
          type="button"
          onClick={onCheckAvailability}
          disabled={disabled}
          className="h-8 px-3 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5"
          style={{
            background: "rgba(74,124,89,0.15)",
            borderColor: "rgba(74,124,89,0.40)",
            color: "#9DD3AB",
          }}
        >
          <Calendar className="h-3 w-3" />
          Book a lesson
        </button>
        <PlanChip label="Weekly plan" type="weekly" />
        <PlanChip label="Monthly plan" type="monthly" />
        <PlanChip label="Bi-monthly plan" type="bimonthly" />
      </div>

      <Dialog
        open={pendingType !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPendingType(null);
            setSelected([]);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Elige 2 o 3 días" : "Pick 2 or 3 days"}
            </DialogTitle>
            <DialogDescription>
              {isEs
                ? "4 ejercicios por día, máximo 3 días por semana."
                : "4 exercises per day, max 3 days per week."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {DAYS.map((d) => {
              const on = selected.includes(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  className="h-9 rounded-lg text-xs font-medium border transition-colors"
                  style={{
                    background: on ? "rgba(240,192,64,0.16)" : "rgba(255,255,255,0.04)",
                    borderColor: on ? "rgba(240,192,64,0.45)" : "rgba(255,255,255,0.10)",
                    color: on ? "#F0C040" : "rgba(245,240,232,0.7)",
                  }}
                >
                  {isEs ? d.es : d.en}
                </button>
              );
            })}
          </div>
          <Button
            onClick={confirm}
            disabled={selected.length < 2 || selected.length > 3}
            className="w-full mt-2"
          >
            {isEs ? "Generar plan" : "Generate plan"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
