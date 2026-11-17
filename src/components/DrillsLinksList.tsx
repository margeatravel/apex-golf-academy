import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ExternalLink, Trash2, Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ApexMark } from '@/components/ApexBrand';
import { useLanguage } from '@/contexts/LanguageContext';
import { localeFor } from '@/lib/uiLocale';

const CATEGORIES = ['Drill', 'Tutorial', 'Article', 'Video', 'Other'];

const categoryLabelKeys: Record<string, string> = {
  Drill: 'prozone2.drills.categoryDrill',
  Tutorial: 'prozone2.drills.categoryTutorial',
  Article: 'prozone2.drills.categoryArticle',
  Video: 'prozone2.drills.categoryVideo',
  Other: 'prozone2.drills.categoryOther',
};

const categoryColors: Record<string, string> = {
  Drill: 'bg-[#4a7c59]/20 text-[#4a7c59] border-[#4a7c59]/30',
  Tutorial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Article: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Video: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Other: 'bg-white/10 text-[#F5F0E8]/60 border-white/20',
};

interface DrillsLinksListProps {
  studentId: string;
  coachId?: string;
  isCoach: boolean;
}

export function DrillsLinksList({ studentId, coachId, isCoach }: DrillsLinksListProps) {
  const { t, language } = useLanguage();
  const locale = localeFor(language);
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('Drill');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: drills = [], isLoading } = useQuery({
    queryKey: ['student-drills', studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('student_drills' as any)
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!studentId,
  });

  const handleAdd = async () => {
    if (!title.trim() || !url.trim()) {
      toast.error(t('prozone2.drills.errTitleUrlRequired'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('student_drills' as any).insert({
        student_id: studentId,
        coach_id: coachId,
        title: title.trim(),
        url: url.trim(),
        category,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success(t('prozone2.drills.toastLinkAdded'));
      queryClient.invalidateQueries({ queryKey: ['student-drills', studentId] });
      setAddOpen(false);
      setTitle(''); setUrl(''); setCategory('Drill'); setNotes('');
    } catch (err: any) {
      toast.error(err.message || t('prozone2.drills.errAddFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase.from('student_drills' as any).delete().eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['student-drills', studentId] });
      toast.success(t('prozone2.drills.toastLinkRemoved'));
    } catch (err: any) {
      toast.error(err.message || t('prozone2.drills.errDeleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ApexMark size="sm" />
          <p className="text-[#F5F0E8]/60 text-sm">
            {drills.length} {drills.length !== 1 ? t('prozone2.drills.linksCountPlural') : t('prozone2.drills.linksCount')}
          </p>
        </div>
        {isCoach && (
          <Button
            onClick={() => setAddOpen(true)}
            size="sm"
            className="gap-2 bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
          >
            <Plus className="h-4 w-4" />
            {t('prozone2.drills.addLink')}
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#F5F0E8]/30" />
        </div>
      ) : drills.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <LinkIcon className="h-12 w-12 text-[#F5F0E8]/20 mx-auto mb-3" />
          <p className="text-[#F5F0E8]/50 text-sm">{t('prozone2.drills.noDrillsYet')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drills.map((drill: any) => (
            <div
              key={drill.id}
              className="glass-card p-4 flex items-start gap-3 group hover:border-[#4a7c59]/30 transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[#F5F0E8] font-medium text-sm truncate">{drill.title}</p>
                  <Badge className={categoryColors[drill.category] || categoryColors.Other}>
                    {categoryLabelKeys[drill.category] ? t(categoryLabelKeys[drill.category]) : drill.category}
                  </Badge>
                </div>
                {drill.notes && (
                  <p className="text-[#F5F0E8]/50 text-xs line-clamp-2">{drill.notes}</p>
                )}
                <p className="text-[#F5F0E8]/30 text-[10px]">
                  {new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(drill.created_at))}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={drill.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-lg bg-[#4a7c59]/20 flex items-center justify-center hover:bg-[#4a7c59]/40 transition-colors"
                >
                  <ExternalLink className="h-4 w-4 text-[#4a7c59]" />
                </a>
                {isCoach && (
                  <button
                    onClick={() => handleDelete(drill.id)}
                    disabled={deleting === drill.id}
                    className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    {deleting === drill.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#0d1f18]/95 backdrop-blur-xl border-white/10 text-[#F5F0E8] max-w-md">
          <DialogHeader>
            <div className="flex justify-center -mt-2 mb-1">
              <ApexMark size="md" />
            </div>
            <DialogTitle className="text-[#F5F0E8] text-lg font-semibold text-center">{t('prozone2.drills.addDrillOrLink')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-[#F5F0E8]/70 text-sm">{t('prozone2.drills.titleLabel')}</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('prozone2.drills.titlePlaceholder')}
                className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[#F5F0E8]/70 text-sm">{t('prozone2.drills.urlLabel')}</label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                type="url"
                className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[#F5F0E8]/70 text-sm">{t('prozone2.drills.categoryLabel')}</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-white/5 border-white/10 text-[#F5F0E8]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1f18] border-white/10">
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c} className="text-[#F5F0E8]">{t(categoryLabelKeys[c])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[#F5F0E8]/70 text-sm">{t('prozone2.drills.notesLabel')}</label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('prozone2.drills.notesPlaceholder')}
                className="bg-white/5 border-white/10 text-[#F5F0E8] placeholder:text-[#F5F0E8]/30 min-h-[70px]"
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={saving || !title.trim() || !url.trim()}
              className="w-full bg-[#4a7c59] hover:bg-[#4a7c59]/80 text-[#F5F0E8]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? t('prozone2.drills.saving') : t('prozone2.drills.addLink')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
