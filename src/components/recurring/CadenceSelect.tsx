import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

/** "Frecuencia": every 1–4 weeks (recurring_lesson_slots.interval_weeks). */
export function CadenceSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const opts = en
    ? ['Weekly', 'Every 2 weeks', 'Every 3 weeks', 'Every 4 weeks']
    : ['Semanal', 'Cada 2 semanas', 'Cada 3 semanas', 'Cada 4 semanas'];
  return (
    <div className="space-y-2">
      <Label className="text-xs">{en ? 'Frequency' : 'Frecuencia'}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(parseInt(v, 10))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map((label, i) => (
            <SelectItem key={i} value={String(i + 1)}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
