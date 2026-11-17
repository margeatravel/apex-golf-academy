import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { InternalHeader } from '@/components/InternalHeader';
import { SocialFooter } from '@/components/SocialFooter';
import { Button } from '@/components/ui/button';
import { SignedGolfMediaImg, SignedGolfMediaVideo } from '@/components/SignedGolfMedia';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, Loader2, Pencil, Trash2, ArrowUp, ArrowDown, Trophy, Plus } from 'lucide-react';
import { BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { PRO_ZONE_CATEGORIES } from '@/lib/proZoneCategories';
import { useProZoneCategories } from '@/hooks/useProZoneCategories';
import { ProZoneMediaUploader } from '@/components/ProZoneMediaUploader';
import { ProZoneLinkAdder } from '@/components/ProZoneLinkAdder';
import { Sparkles, Link2 as LinkIcon2, ExternalLink, PlayCircle, Image as ImageIcon, Tag } from 'lucide-react';
import { ProZoneMediaPlayer } from '@/components/ProZoneMediaPlayer';
import { AdminAllRoundsView } from '@/components/AdminAllRoundsView';

interface MediaRow {
  id: string;
  category: string;
  title: string | null;
  caption: string | null;
  file_url: string;
  file_type: 'image' | 'video' | 'link';
  thumbnail_url: string | null;
  sort_order: number;
  is_active: boolean;
  pro_name?: string | null;
}

export default function AdminProZone() {
  const { user, role, loading, hasPermission } = useAuth();
  const qc = useQueryClient();
  const { categories, refresh: refreshCategoryLabels } = useProZoneCategories();
  const [openCat, setOpenCat] = useState<string | null>(PRO_ZONE_CATEGORIES[0].key);
  const [editing, setEditing] = useState<MediaRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editProName, setEditProName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<MediaRow | null>(null);
  const [previewing, setPreviewing] = useState<MediaRow | null>(null);
  const [renamingCat, setRenamingCat] = useState<{ key: string; label: string; defaultLabel: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [newSectionEmoji, setNewSectionEmoji] = useState('⛳');
  const [newSectionSaving, setNewSectionSaving] = useState(false);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<{ key: string; label: string } | null>(null);
  const [deletingCat, setDeletingCat] = useState(false);
  const [roundsOpen, setRoundsOpen] = useState(false);

  const { data: allMedia, isLoading } = useQuery({
    queryKey: ['admin-pro-zone-media'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_zone_media')
        .select('*')
        .order('category')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as MediaRow[];
    },
    enabled: !!user && (role === 'admin' || hasPermission('pro_zone')),
  });

  const byCategory = useMemo(() => {
    const map = new Map<string, MediaRow[]>();
    (allMedia ?? []).forEach((m) => {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    });
    return map;
  }, [allMedia]);

  // Note: route-level access is enforced by <ProtectedRoute requirePermission="pro_zone" />,
  // which already handles auth loading, the transient profile-refresh state (focus event
  // after the file picker closes), and unauthorized redirects. We intentionally do NOT
  // early-return a full-screen loader here — doing so collapses the page during the
  // focus-triggered auth refresh and makes the browser snap scroll to the top after
  // an upload. Render the page; the data query is gated by `enabled` below.
  if (!user) return <Navigate to="/auth" replace />;

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-pro-zone-media'] });

  const startEdit = (m: MediaRow) => {
    setEditing(m);
    setEditTitle(m.title ?? '');
    setEditCaption(m.caption ?? '');
    setEditProName(m.pro_name ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from('pro_zone_media')
      .update({
        title: editTitle.trim() || null,
        caption: editCaption.trim() || null,
        ...(editing.category === 'tour_pros'
          ? { pro_name: editProName.trim() || null }
          : {}),
      } as any)
      .eq('id', editing.id);
    if (error) {
      toast.error('Failed to save');
    } else {
      toast.success('Saved');
      setEditing(null);
      refresh();
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const item = confirmDelete;
    setConfirmDelete(null);

    // Best-effort delete from storage (path = portion after public bucket URL)
    try {
      const marker = '/golf-media/';
      const idx = item.file_url.indexOf(marker);
      if (idx >= 0) {
        const path = item.file_url.slice(idx + marker.length);
        await supabase.storage.from('golf-media').remove([path]);
      }
    } catch {
      /* ignore storage error — DB row is the source of truth */
    }
    const { error } = await supabase.from('pro_zone_media').delete().eq('id', item.id);
    if (error) toast.error('Failed to delete');
    else {
      toast.success('Deleted');
      refresh();
    }
  };

  const move = async (m: MediaRow, dir: -1 | 1) => {
    const list = byCategory.get(m.category) ?? [];
    const idx = list.findIndex((x) => x.id === m.id);
    const swap = list[idx + dir];
    if (!swap) return;
    const a = supabase
      .from('pro_zone_media')
      .update({ sort_order: swap.sort_order })
      .eq('id', m.id);
    const b = supabase
      .from('pro_zone_media')
      .update({ sort_order: m.sort_order })
      .eq('id', swap.id);
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.error || rb.error) toast.error('Reorder failed');
    else refresh();
  };

  const startRename = (key: string, currentLabel: string) => {
    const def = PRO_ZONE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
    setRenamingCat({ key, label: currentLabel, defaultLabel: def });
    setRenameValue(currentLabel);
  };

  const saveRename = async () => {
    if (!renamingCat) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }
    setRenameSaving(true);
    const { error } = await supabase
      .from('pro_zone_category_labels' as any)
      .upsert({ key: renamingCat.key, label: trimmed, updated_by: user?.id ?? null } as any, {
        onConflict: 'key',
      });
    setRenameSaving(false);
    if (error) {
      toast.error('Failed to rename category');
      return;
    }
    toast.success('Category renamed');
    setRenamingCat(null);
    refreshCategoryLabels();
  };

  const resetRename = async () => {
    if (!renamingCat) return;
    setRenameSaving(true);
    const { error } = await supabase
      .from('pro_zone_category_labels' as any)
      .delete()
      .eq('key', renamingCat.key);
    setRenameSaving(false);
    if (error) {
      toast.error('Failed to reset name');
      return;
    }
    toast.success('Reset to default name');
    setRenamingCat(null);
    refreshCategoryLabels();
  };

  // Generate a unique slug key from a human label.
  const slugify = (input: string) => {
    const base = input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'section';
    return `custom_${base}_${Math.random().toString(36).slice(2, 7)}`;
  };

  const saveNewSection = async () => {
    const label = newSectionLabel.trim();
    if (!label) {
      toast.error('Section name is required');
      return;
    }
    setNewSectionSaving(true);
    const key = slugify(label);
    const nextOrder = (categories.length > 0 ? categories.length : 0);
    const { error } = await supabase
      .from('pro_zone_custom_categories' as any)
      .insert({
        key,
        label,
        emoji: newSectionEmoji.trim() || '⛳',
        sort_order: nextOrder,
        created_by: user?.id ?? null,
      } as any);
    setNewSectionSaving(false);
    if (error) {
      toast.error('Failed to add section');
      return;
    }
    toast.success('Section added');
    setAddingSection(false);
    setNewSectionLabel('');
    setNewSectionEmoji('⛳');
    refreshCategoryLabels();
    setOpenCat(key);
  };

  const handleDeleteCustomCategory = async () => {
    if (!confirmDeleteCat) return;
    setDeletingCat(true);
    // Note: pro_zone_media rows in this category are kept intact (admin can
    // delete them individually first if they want — no cascade by design).
    const { error } = await supabase
      .from('pro_zone_custom_categories' as any)
      .delete()
      .eq('key', confirmDeleteCat.key);
    setDeletingCat(false);
    if (error) {
      toast.error('Failed to delete section');
      return;
    }
    toast.success('Section deleted');
    setConfirmDeleteCat(null);
    refreshCategoryLabels();
    refresh();
  };

  return (
    <div className="app-bg min-h-screen pb-mobile-safe">
      <InternalHeader
        titleKey="admin.adminProZoneTitle"
        subtitleKey="admin.adminProZoneSub"
        backTo="/admin/settings"
      />
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-3">
        <div className="glass-card p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(240,192,64,0.12)' }}>
            <Sparkles className="h-4 w-4 text-gold-accent" />
          </div>
          <div className="text-xs text-ivory/70 leading-relaxed">
            Content here appears in the student <span className="text-ivory font-medium">Pro Zone</span> for{' '}
            <span className="text-gold-accent">Scratch</span> and <span className="text-gold-accent">Pro</span> members.
            Free members see a locked teaser. You can upload files <span className="text-ivory">or</span> paste a link
            (YouTube, Vimeo, Instagram, TikTok, articles…) — no upload needed for links.
          </div>
        </div>
        <Button
          onClick={() => setAddingSection(true)}
          className="w-full h-11 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
        >
          <Plus className="h-4 w-4" /> Add new section
        </Button>

        {/* Student Rounds section */}
        <Collapsible open={roundsOpen} onOpenChange={setRoundsOpen}>
          <div className="w-full glass-card p-3 flex items-center gap-2 hover:bg-white/[0.07] transition-colors border border-green-accent/20">
            <CollapsibleTrigger asChild>
              <button className="flex-1 flex items-center gap-3 text-left min-w-0 py-1">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-accent/15">
                  <BarChart3 className="h-5 w-5 text-green-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-ivory text-sm">Student Rounds</h3>
                  <p className="text-[11px] text-ivory/50">View and manage all rounds logged by students</p>
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleTrigger asChild>
              <button
                aria-label={roundsOpen ? 'Collapse' : 'Expand'}
                className="h-8 w-8 flex items-center justify-center text-ivory/40 hover:text-ivory flex-shrink-0"
              >
                <ChevronDown className={`h-5 w-5 transition-transform ${roundsOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="pt-3 px-1">
              <AdminAllRoundsView />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-ivory/40" />
          </div>
        ) : (
          categories.map((cat) => {
            const items = byCategory.get(cat.key) ?? [];
            const isOpen = openCat === cat.key;
            const nextOrder = items.length > 0 ? items[items.length - 1].sort_order + 1 : 0;
            const defaultLabel = PRO_ZONE_CATEGORIES.find((c) => c.key === cat.key)?.label ?? cat.label;
            const isCustomized = cat.label !== defaultLabel;
            const isCustomSection = cat.isCustom;
            return (
              <Collapsible
                key={cat.key}
                open={isOpen}
                onOpenChange={(o) => setOpenCat(o ? cat.key : null)}
              >
                <div className="w-full glass-card p-3 flex items-center gap-2 hover:bg-white/[0.07] transition-colors">
                  <CollapsibleTrigger asChild>
                    <button className="flex-1 flex items-center gap-3 text-left min-w-0 py-1">
                      <span className="text-2xl flex-shrink-0" aria-hidden>{cat.emoji}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-medium text-ivory text-sm truncate">{cat.label}</h3>
                          {isCustomSection && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide font-semibold text-green-accent bg-green-accent/10 border border-green-accent/20 rounded-full px-1.5 py-0.5">
                              <Plus className="h-2.5 w-2.5" /> Custom
                            </span>
                          )}
                          {isCustomized && !isCustomSection && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide font-semibold text-gold-accent bg-gold-accent/10 border border-gold-accent/20 rounded-full px-1.5 py-0.5">
                              <Tag className="h-2.5 w-2.5" /> Renamed
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ivory/50">
                          {items.length} item{items.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-ivory/50 hover:text-gold-accent flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(cat.key, cat.label);
                    }}
                    aria-label="Rename category"
                    title="Rename category"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {isCustomSection && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteCat({ key: cat.key, label: cat.label });
                      }}
                      aria-label="Delete custom section"
                      title="Delete custom section"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <CollapsibleTrigger asChild>
                    <button
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                      className="h-8 w-8 flex items-center justify-center text-ivory/40 hover:text-ivory flex-shrink-0"
                    >
                      <ChevronDown
                        className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="pt-3 px-1 space-y-3">
                    <ProZoneMediaUploader
                      category={cat.key}
                      nextSortOrder={nextOrder}
                      onUploaded={refresh}
                    />
                    <ProZoneLinkAdder
                      category={cat.key}
                      nextSortOrder={nextOrder}
                      onAdded={refresh}
                    />
                    {items.length > 0 && (
                      <div className="space-y-2">
                        {items.map((m, i) => (
                          <div key={m.id} className="glass-card p-2 flex gap-3 items-center">
                            <button
                              type="button"
                              onClick={() => setPreviewing(m)}
                              className="relative h-14 w-14 rounded-lg flex-shrink-0 bg-black/40 overflow-hidden group focus:outline-none focus:ring-2 focus:ring-gold-accent"
                              aria-label={`Preview ${m.title || 'media'}`}
                              title="Click to preview"
                            >
                              {m.file_type === 'image' ? (
                                <SignedGolfMediaImg
                                  src={m.file_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : m.file_type === 'video' ? (
                                <>
                                  {m.thumbnail_url ? (
                                    <SignedGolfMediaImg
                                      src={m.thumbnail_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <SignedGolfMediaVideo
                                      src={m.file_url}
                                      className="w-full h-full object-cover"
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  )}
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                                    <PlayCircle className="h-6 w-6 text-white drop-shadow-md" />
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gold-accent/10 border border-gold-accent/20">
                                  <LinkIcon2 className="h-5 w-5 text-gold-accent" />
                                </div>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              {m.pro_name && (
                                <span className="inline-flex items-center gap-1 text-[9px] uppercase font-semibold text-gold-accent bg-gold-accent/10 border border-gold-accent/20 rounded-full px-1.5 py-0.5 mb-0.5">
                                  <Trophy className="h-2.5 w-2.5" /> {m.pro_name}
                                </span>
                              )}
                              <p className="text-ivory text-xs font-medium truncate">
                                {m.title || <span className="text-ivory/40">Untitled</span>}
                              </p>
                              {m.caption && (
                                <p className="text-ivory/50 text-[11px] truncate">{m.caption}</p>
                              )}
                              {m.file_type === 'link' && (
                                <a
                                  href={m.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-gold-accent/80 hover:text-gold-accent inline-flex items-center gap-1 truncate max-w-full"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                  <span className="truncate">{m.file_url}</span>
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button
                                size="sm" variant="ghost"
                                disabled={i === 0}
                                className="h-7 w-7 p-0 text-ivory/50 hover:text-ivory"
                                onClick={() => move(m, -1)}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                disabled={i === items.length - 1}
                                className="h-7 w-7 p-0 text-ivory/50 hover:text-ivory"
                                onClick={() => move(m, 1)}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 w-7 p-0 text-ivory/50 hover:text-ivory"
                                onClick={() => startEdit(m)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                onClick={() => setConfirmDelete(m)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })
        )}
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-ivory">Edit media</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editing?.category === 'tour_pros' && (
              <div>
                <label className="text-[11px] text-ivory/50 mb-1 block">Pro name</label>
                <Input
                  value={editProName}
                  onChange={(e) => setEditProName(e.target.value)}
                  placeholder="e.g. Rory McIlroy"
                  className="bg-gold-accent/5 border-gold-accent/20 text-ivory"
                />
              </div>
            )}
            <div>
              <label className="text-[11px] text-ivory/50 mb-1 block">Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="bg-white/5 border-white/10 text-ivory"
              />
            </div>
            <div>
              <label className="text-[11px] text-ivory/50 mb-1 block">Caption</label>
              <Textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                rows={3}
                className="bg-white/5 border-white/10 text-ivory"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="btn-glass">
              Cancel
            </Button>
            <Button onClick={saveEdit} className="bg-gold-accent text-black hover:bg-gold-accent/90">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-zinc-950 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">Delete this item?</AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              This permanently removes the file from the Pro Zone library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="btn-glass">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview media (full player + main picture) */}
      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-w-3xl bg-zinc-950 border-white/10 p-3">
          {previewing && (
            <div className="space-y-3">
              {previewing.file_type === 'image' ? (
                <SignedGolfMediaImg
                  src={previewing.file_url}
                  alt={previewing.title ?? ''}
                  className="w-full h-auto max-h-[75vh] object-contain rounded-lg bg-black/40"
                />
              ) : (
                <ProZoneMediaPlayer
                  fileType={previewing.file_type}
                  fileUrl={previewing.file_url}
                  thumbnailUrl={previewing.thumbnail_url}
                  title={previewing.title}
                />
              )}
              <div className="px-1 space-y-1">
                {previewing.pro_name && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-gold-accent bg-gold-accent/10 border border-gold-accent/20 rounded-full px-2 py-0.5">
                    <Trophy className="h-3 w-3" /> {previewing.pro_name}
                  </span>
                )}
                <p className="text-ivory text-sm font-medium">
                  {previewing.title || <span className="text-ivory/40">Untitled</span>}
                </p>
                {previewing.caption && (
                  <p className="text-ivory/60 text-xs">{previewing.caption}</p>
                )}
                {previewing.file_type === 'video' && !previewing.thumbnail_url && (
                  <p className="text-[11px] text-ivory/40 italic flex items-center gap-1 pt-1">
                    <ImageIcon className="h-3 w-3" />
                    No main picture saved — newer uploads auto-capture one from the first frame.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rename category */}
      <Dialog open={!!renamingCat} onOpenChange={(o) => !o && setRenamingCat(null)}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-ivory">Rename category</DialogTitle>
          </DialogHeader>
          {renamingCat && (
            <div className="space-y-3">
              <p className="text-[11px] text-ivory/50">
                Default name: <span className="text-ivory/70">{renamingCat.defaultLabel}</span>
              </p>
              <div>
                <label className="text-[11px] text-ivory/50 mb-1 block">Display name</label>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder={renamingCat.defaultLabel}
                  className="bg-white/5 border-white/10 text-ivory"
                  autoFocus
                  maxLength={50}
                />
              </div>
              <p className="text-[10px] text-ivory/40 leading-relaxed">
                Students will see this name everywhere in Pro Zone. Existing uploads stay attached.
              </p>
            </div>
          )}
          <DialogFooter className="flex sm:flex-row flex-col gap-2">
            <Button
              variant="outline"
              onClick={resetRename}
              disabled={renameSaving || renamingCat?.label === renamingCat?.defaultLabel}
              className="btn-glass sm:mr-auto"
            >
              Reset to default
            </Button>
            <Button
              variant="outline"
              onClick={() => setRenamingCat(null)}
              disabled={renameSaving}
              className="btn-glass"
            >
              Cancel
            </Button>
            <Button
              onClick={saveRename}
              disabled={renameSaving}
              className="bg-gold-accent text-black hover:bg-gold-accent/90"
            >
              {renameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add new custom section */}
      <Dialog open={addingSection} onOpenChange={(o) => !o && setAddingSection(false)}>
        <DialogContent className="bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-ivory">Add new section</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-ivory/50 mb-1 block">Section name</label>
              <Input
                value={newSectionLabel}
                onChange={(e) => setNewSectionLabel(e.target.value)}
                placeholder="e.g. Chipping"
                className="bg-white/5 border-white/10 text-ivory"
                autoFocus
                maxLength={50}
              />
            </div>
            <div>
              <label className="text-[11px] text-ivory/50 mb-1 block">Emoji</label>
              <Input
                value={newSectionEmoji}
                onChange={(e) => setNewSectionEmoji(e.target.value)}
                placeholder="⛳"
                className="bg-white/5 border-white/10 text-ivory text-2xl text-center"
                maxLength={4}
              />
              <p className="text-[10px] text-ivory/40 mt-1">
                Pick a single emoji to represent the section.
              </p>
            </div>
            <p className="text-[10px] text-ivory/40 leading-relaxed">
              Custom sections behave exactly like the built-in ones — students see them in
              Pro Zone, you can upload media or paste links, rename them later, and reorder content.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddingSection(false)}
              disabled={newSectionSaving}
              className="btn-glass"
            >
              Cancel
            </Button>
            <Button
              onClick={saveNewSection}
              disabled={newSectionSaving || !newSectionLabel.trim()}
              className="bg-gold-accent text-black hover:bg-gold-accent/90"
            >
              {newSectionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add section'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete custom section */}
      <AlertDialog open={!!confirmDeleteCat} onOpenChange={(o) => !o && setConfirmDeleteCat(null)}>
        <AlertDialogContent className="bg-zinc-950 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ivory">
              Delete "{confirmDeleteCat?.label}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ivory/60">
              This removes the section from Pro Zone. Any media uploaded inside it will become
              hidden from students (but the files themselves are kept). Recreate a section with
              the same name to restore them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCat} className="btn-glass">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustomCategory}
              disabled={deletingCat}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deletingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SocialFooter />
    </div>
  );
}