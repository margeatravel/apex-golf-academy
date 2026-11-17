import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const STATUSES = ['scheduled', 'completed', 'cancelled', 'no-show', 'skipped'];
const TYPES = ['Range', 'Short Game', 'Putting', 'Playing Lesson'];
const KEEP = '__keep__';
const NONE = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lessonIds: string[];
  packages: any[];
  onDone: () => void;
}

export function BulkEditLessonsModal({ open, onOpenChange, lessonIds, packages, onDone }: Props) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [status, setStatus] = useState<string>(KEEP);
  const [lessonType, setLessonType] = useState<string>(KEEP);
  const [packageId, setPackageId] = useState<string>(KEEP);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStatus(KEEP);
    setLessonType(KEEP);
    setPackageId(KEEP);
  };

  const handleSave = async () => {
    const update: any = {};
    if (status !== KEEP) update.status = status;
    if (lessonType !== KEEP) {
      update.lesson_type = lessonType;
      update.duration_minutes = lessonType === 'Playing Lesson' ? 120 : 60;
      // Keep the edit from being undone by recurring regeneration.
      update.auto_generated = false;
    }
    if (packageId !== KEEP) update.package_id = packageId === NONE ? null : packageId;

    if (Object.keys(update).length === 0) {
      toast({ title: 'Nothing to update', description: 'Pick at least one field.' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('lessons').update(update).in('id', lessonIds);
      if (error) throw error;
      toast({ title: 'Lessons updated', description: `${lessonIds.length} lesson(s) updated.` });
      reset();
      onOpenChange(false);
      onDone();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {lessonIds.length} lesson{lessonIds.length !== 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>{t('ui.bulkEdit.onlyChanged')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t('ui.bulkEdit.keepCurrent')}</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Lesson type</Label>
            <Select value={lessonType} onValueChange={setLessonType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t('ui.bulkEdit.keepCurrent')}</SelectItem>
                {TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Package</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>{t('ui.bulkEdit.keepCurrent')}</SelectItem>
                <SelectItem value={NONE}>No package (single lesson)</SelectItem>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.package_name || `${p.package_size}-Lesson`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Apply to {lessonIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}