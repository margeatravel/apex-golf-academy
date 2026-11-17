import * as React from "react";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/contexts/LanguageContext";

/** Parse 'YYYY-MM-DD' as a local date (never UTC). */
const parseLocal = (s?: string) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toStr = (d: Date) => format(d, "yyyy-MM-dd");

export interface DateFieldProps {
  value?: string;
  /** Drop-in compatible with `<Input type="date">` handlers: receives `{ target: { value } }`. */
  onChange?: (e: { target: { value: string } }) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DateField({ value, onChange, min, max, placeholder, disabled, id, className, style }: DateFieldProps) {
  const { language } = useLanguage();
  const locale = language === "es" ? es : enUS;
  const [open, setOpen] = React.useState(false);
  const selected = parseLocal(value);
  const minD = parseLocal(min);
  const maxD = parseLocal(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          style={style}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-left text-sm text-ivory transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-gold-accent/40 disabled:opacity-50",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-gold-accent" />
          <span className={cn("truncate capitalize", !selected && "text-ivory/40 normal-case")}>
            {selected ? format(selected, language === "es" ? "EEE d MMM yyyy" : "EEE, MMM d, yyyy", { locale }) : placeholder ?? (language === "es" ? "Elige fecha" : "Pick a date")}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[200] w-auto p-0 rounded-xl border border-white/10 bg-[#0d1f18]/95 backdrop-blur-xl shadow-2xl"
      >
        <Calendar
          mode="single"
          locale={locale}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (!d) return;
            onChange?.({ target: { value: toStr(d) } });
            setOpen(false);
          }}
          disabled={[...(minD ? [{ before: minD }] : []), ...(maxD ? [{ after: maxD }] : [])]}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
