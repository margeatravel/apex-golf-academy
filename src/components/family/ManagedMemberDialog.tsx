import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useStudentPreview } from '@/contexts/StudentPreviewContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';

export interface ManagedMemberDraft {
  id: string;
  full_name: string | null;
  birth_date?: string | null;
  photo_url?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provided when editing an existing managed member. */
  member?: ManagedMemberDraft | null;
  /**
   * Account the managed member belongs to. Set it when an admin/coach creates
   * the member from a student's profile; defaults to the current viewer.
   */
  ownerId?: string;
  onSaved: () => void;
}

/**
 * Create / edit a family member WITHOUT an account (e.g. a child).
 * All writes go through edge functions; the photo is uploaded to the
 * caller's own avatars folder (allowed by existing storage policies).
 */
export function ManagedMemberDialog({ open, onOpenChange, member, ownerId, onSaved }: Props) {

  const { user } = useAuth();
  // Inside the coach/owner preview, useAuth() reports the PREVIEWED student,
  // so writes must be made on their behalf while storage still uses the real
  // signed-in account's folder.
  const { isStudentPreview, studentId } = useStudentPreview();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const editing = !!member;
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(member?.full_name || '');
    setBirthDate(member?.birth_date || '');
    setPhotoUrl(member?.photo_url || null);
  }, [open, member]);

  const pickPhoto = async (file: File) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const realUid = sessionData?.session?.user?.id || user?.id;
    if (!realUid) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t('profile.fileTooLargeTitle'), variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${realUid}/managed-${member?.id || Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setPhotoUrl(`${data.publicUrl}?t=${Date.now()}`);
    } catch (e: any) {
      toast({ title: t('profile.uploadFailedTitle'), description: e?.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const errorLabel = (code?: string) => {
    if (code === 'limit_reached') return t('misc.managedLimitReached');
    if (code === 'plan_required') return t('misc.managedPlanRequired');
    if (code === 'invalid_birth_date') return t('misc.managedInvalidBirth');
    if (code === 'invalid_name') return t('misc.managedInvalidName');
    return code;
  };

  const save = async () => {
    setSaving(true);
    try {
      const fn = editing ? 'update-managed-family-member' : 'create-managed-family-member';
      const onBehalfOf = ownerId || (isStudentPreview ? studentId : undefined);
      const body = editing
        ? { memberId: member!.id, fullName: name.trim(), birthDate, photoUrl: photoUrl ?? '', onBehalfOf }
        : { fullName: name.trim(), birthDate, photoUrl, onBehalfOf };

      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) {
        // Edge functions return a JSON error body with a code we can translate.
        let code: string | undefined;
        try {
          code = (await (error as any).context?.json?.())?.error;
        } catch (_) { /* ignore */ }
        throw new Error(errorLabel(code) || error.message);
      }
      if ((data as any)?.error) throw new Error(errorLabel((data as any).error));
      toast({ title: editing ? t('misc.managedUpdated') : t('misc.managedCreated') });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast({ title: t('misc.managedSaveError'), description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const valid = name.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(birthDate);

  // Separate Day / Month / Year pickers (iOS-style) instead of the native
  // date input, so picking a child's birth year doesn't require scrolling
  // back month by month. The submitted value stays `YYYY-MM-DD`.
  const [birthYear = '', birthMonth = '', birthDay = ''] = birthDate.split('-');
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1929 }, (_, i) => String(currentYear - i));
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(language === 'es' ? 'es-MX' : 'en-US', { month: 'long' }).format(new Date(2000, i, 1))
  );
  const daysInMonth = (y: string, m: string) =>
    y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;

  const setBirthPart = (part: 'day' | 'month' | 'year', value: string) => {
    let y = birthYear, m = birthMonth, d = birthDay;
    if (part === 'year') y = value;
    if (part === 'month') m = value.padStart(2, '0');
    if (part === 'day') d = value.padStart(2, '0');
    // Clamp the day when the month/year changes (e.g. Feb 31 -> 28/29).
    if (d && m) {
      const max = daysInMonth(y, m);
      if (Number(d) > max) d = String(max).padStart(2, '0');
    }
    // Partial selections join with empty parts (e.g. "2015-05-") so the
    // pickers keep their values; only a complete date passes validation.
    setBirthDate([y, m, d].join('-'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('misc.managedEditTitle') : t('misc.managedAddTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full overflow-hidden bg-[#4a7c59]/40 flex items-center justify-center">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg text-ivory">{(name || '?').slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {t('misc.managedPhoto')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickPhoto(f);
                e.target.value = '';
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('misc.managedName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('misc.managedBirthDate')}</Label>
            <div className="grid grid-cols-3 gap-2">
              <Select value={birthDay ? String(Number(birthDay)) : ''} onValueChange={(v) => setBirthPart('day', v)}>
                <SelectTrigger><SelectValue placeholder={t('misc.managedDay')} /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {Array.from({ length: daysInMonth(birthYear, birthMonth) }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={birthMonth ? String(Number(birthMonth)) : ''} onValueChange={(v) => setBirthPart('month', v)}>
                <SelectTrigger><SelectValue placeholder={t('misc.managedMonth')} /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {monthNames.map((mn, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="capitalize">{mn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={birthYear} onValueChange={(v) => setBirthPart('year', v)}>
                <SelectTrigger><SelectValue placeholder={t('misc.managedYear')} /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('misc.managedHelp')}</p>

          <Button className="w-full" disabled={!valid || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('misc.managedSave')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
