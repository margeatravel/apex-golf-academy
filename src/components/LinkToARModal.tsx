import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Package as PackageIcon, Calendar, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fmtMXN } from '@/lib/formatCurrency';
import { toast } from 'sonner';

interface LinkToARModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already-in-AR package ids (so we hide them) */
  excludePackageIds?: Set<string>;
  /** Already-in-AR lesson ids (so we hide them) */
  excludeLessonIds?: Set<string>;
  onLinked?: () => void;
}

type PkgRow = {
  id: string;
  user_id: string;
  package_name: string | null;
  package_size: number;
  price: number;
  amount_paid: number;
  payment_status: string;
  payment_date: string | null;
  imported: boolean;
  created_at: string;
  full_name: string;
  email: string;
  balance: number;
};

type LessonRow = {
  id: string;
  lesson_date: string;
  lesson_type: string;
  student_id: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  imported: boolean;
  full_name: string;
  email: string;
  revenue: number;
};

export function LinkToARModal({ open, onOpenChange, excludePackageIds, excludeLessonIds, onLinked }: LinkToARModalProps) {
  const [tab, setTab] = useState<'packages' | 'lessons' | 'new'>('packages');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pkgs, setPkgs] = useState<PkgRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [selectedPkgs, setSelectedPkgs] = useState<Set<string>>(new Set());
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  // Inline price edits for lessons that have no recorded amount yet ($0).
  // Keyed by lesson id; value is the typed string.
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [bulkAmount, setBulkAmount] = useState('');

  // === "Nuevo pendiente" (draft) tab state ===
  const [allProfiles, setAllProfiles] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [draftKind, setDraftKind] = useState<'package' | 'lesson'>('package');
  const [draftStudentQuery, setDraftStudentQuery] = useState('');
  const [draftStudentId, setDraftStudentId] = useState<string | null>(null);
  const [draftStudentName, setDraftStudentName] = useState<string>('');
  const [draftPackageSize, setDraftPackageSize] = useState<string>('4');
  const [draftAmount, setDraftAmount] = useState<string>('');
  const [draftNotes, setDraftNotes] = useState<string>('');
  const [creatingDraft, setCreatingDraft] = useState(false);

  // Load every package with an outstanding balance + every unpaid lesson —
  // including imported ones (which is the whole point: they need to be
  // surfaced so the coach can pull them into AR).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: pkgRows }, { data: lessonRows }, { data: profiles }] = await Promise.all([
          supabase
            .from('class_packages')
            .select('id, user_id, package_name, package_size, price, amount_paid, payment_status, payment_date, imported, created_at')
            .order('created_at', { ascending: false }),
          supabase
            .from('lessons')
            .select('id, lesson_date, lesson_type, student_id, invitee_name, invitee_email, revenue, package_id, imported, status')
            .neq('status', 'cancelled')
            .order('lesson_date', { ascending: false })
            .limit(2000),
          supabase.from('profiles').select('id, full_name, email'),
        ]);
        if (cancelled) return;

        const profMap = new Map<string, { full_name: string; email: string }>();
        (profiles || []).forEach((p: any) => profMap.set(p.id, { full_name: p.full_name || '', email: p.email || '' }));
        setAllProfiles((profiles || []).map((p: any) => ({ id: p.id, full_name: p.full_name || '', email: p.email || '' })));

        const enrichedPkgs: PkgRow[] = (pkgRows || [])
          .filter((p: any) => {
            const price = Number(p.price) || 0;
            const paid = Number(p.amount_paid) || 0;
            return price > 0 && paid < price;
          })
          .map((p: any) => {
            const prof = profMap.get(p.user_id) || { full_name: '', email: '' };
            return {
              ...p,
              full_name: prof.full_name,
              email: prof.email,
              balance: (Number(p.price) || 0) - (Number(p.amount_paid) || 0),
            };
          });

        const enrichedLessons: LessonRow[] = (lessonRows || [])
          .filter((l: any) => {
            // Unpaid = not linked to a package AND no payment recorded.
            // We surface BOTH lessons with a typed amount (revenue > 0) and
            // lessons that still need a price set ($0 → inline editor).
            return !l.package_id && !l.payment_method;
          })
          .map((l: any) => {
            const prof = l.student_id ? profMap.get(l.student_id) : null;
            return {
              ...l,
              full_name: prof?.full_name || l.invitee_name || '',
              email: prof?.email || l.invitee_email || '',
              revenue: Number(l.revenue) || 0,
            };
          });

        setPkgs(enrichedPkgs);
        setLessons(enrichedLessons);
      } catch (e: any) {
        console.error(e);
        toast.error('Could not load receivables');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Reset selection when reopened
  useEffect(() => {
    if (open) {
      setSelectedPkgs(new Set());
      setSelectedLessons(new Set());
      setPriceEdits({});
      setSearch('');
      setTab('packages');
      setBulkAmount('');
      setDraftKind('package');
      setDraftStudentQuery('');
      setDraftStudentId(null);
      setDraftStudentName('');
      setDraftPackageSize('4');
      setDraftAmount('');
      setDraftNotes('');
    }
  }, [open]);

  const filteredPkgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pkgs.filter(p => {
      if (excludePackageIds?.has(p.id)) return false;
      if (!q) return true;
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.package_name || '').toLowerCase().includes(q)
      );
    });
  }, [pkgs, search, excludePackageIds]);

  const filteredLessons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lessons.filter(l => {
      if (excludeLessonIds?.has(l.id)) return false;
      if (!q) return true;
      return (
        l.full_name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.lesson_type.toLowerCase().includes(q)
      );
    });
  }, [lessons, search, excludeLessonIds]);

  const getLessonAmount = (l: LessonRow): number => {
    const edited = priceEdits[l.id];
    if (edited !== undefined && edited !== '') return parseFloat(edited) || 0;
    return l.revenue || 0;
  };

  const totalSelected = useMemo(() => {
    let sum = 0;
    pkgs.forEach(p => { if (selectedPkgs.has(p.id)) sum += p.balance; });
    lessons.forEach(l => { if (selectedLessons.has(l.id)) sum += getLessonAmount(l); });
    return sum;
  }, [selectedPkgs, selectedLessons, pkgs, lessons, priceEdits]);

  const totalCount = selectedPkgs.size + selectedLessons.size;

  // How many currently selected lessons still need an amount typed in.
  const selectedNeedingAmount = useMemo(() => {
    return lessons.filter(
      (l) => selectedLessons.has(l.id) && getLessonAmount(l) <= 0
    );
  }, [lessons, selectedLessons, priceEdits]);

  const applyBulkAmount = () => {
    const raw = bulkAmount.trim();
    if (!raw) return;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    if (selectedLessons.size === 0) return;
    setPriceEdits((prev) => {
      const next = { ...prev };
      selectedLessons.forEach((id) => { next[id] = raw; });
      return next;
    });
    setBulkAmount('');
  };

  const togglePkg = (id: string) => {
    setSelectedPkgs(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleLesson = (id: string) => {
    setSelectedLessons(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleLink = async () => {
    if (totalCount === 0) return;
    setSaving(true);
    try {
      // Linking = clearing the `imported` flag, which is what currently
      // hides these rows from the AR breakdown. After clearing, the
      // receivables useMemo on AdminRevenue will pick them up immediately.
      if (selectedPkgs.size > 0) {
        const ids = Array.from(selectedPkgs);
        const { error } = await supabase
          .from('class_packages')
          .update({ imported: false })
          .in('id', ids);
        if (error) throw error;
      }
      if (selectedLessons.size > 0) {
        // First: persist any inline-edited prices for selected lessons.
        const edits = Array.from(selectedLessons)
          .map(id => ({ id, raw: priceEdits[id] }))
          .filter(e => e.raw !== undefined && e.raw !== '')
          .map(e => ({ id: e.id, amount: parseFloat(e.raw!) || 0 }))
          .filter(e => e.amount > 0);
        for (const e of edits) {
          const { error: upErr } = await supabase
            .from('lessons')
            .update({ revenue: e.amount })
            .eq('id', e.id);
          if (upErr) throw upErr;
        }
        // Then clear the imported flag so they show up in AR.
        const ids = Array.from(selectedLessons);
        const { error } = await supabase
          .from('lessons')
          .update({ imported: false })
          .in('id', ids);
        if (error) throw error;
      }
      toast.success(`Linked ${totalCount} item${totalCount === 1 ? '' : 's'} to AR (${fmtMXN(totalSelected)})`);
      onLinked?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to link to AR', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-3xl max-h-[85vh] flex flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>Agregar a Accounts Receivable</DialogTitle>
          <DialogDescription>
            Vincula paquetes o clases existentes, o crea un pendiente nuevo de paquete/clase para activar más tarde.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by student, email, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 shrink-0">
            <TabsTrigger value="packages" className="gap-1.5">
              <PackageIcon className="h-4 w-4" />
              Packages ({filteredPkgs.length})
            </TabsTrigger>
            <TabsTrigger value="lessons" className="gap-1.5">
              <Calendar className="h-4 w-4" />
              Lessons ({filteredLessons.length})
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nuevo pendiente
            </TabsTrigger>
          </TabsList>

          <TabsContent value="packages" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden data-[state=active]:flex flex-col">
            <ScrollArea className="flex-1 min-h-0 h-[50vh] rounded-md border">
              {loading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                </div>
              ) : filteredPkgs.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No matching packages with an outstanding balance.</div>
              ) : (
                <div className="divide-y">
                  {filteredPkgs.map(p => {
                    const checked = selectedPkgs.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                        onClick={() => togglePkg(p.id)}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => togglePkg(p.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="font-medium truncate">{p.full_name || p.email || 'Unknown student'}</p>
                            <p className="font-semibold text-warning shrink-0">{fmtMXN(p.balance)}</p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.package_name || `${p.package_size}-class package`} · paid {fmtMXN(p.amount_paid)} / {fmtMXN(p.price)}
                            {p.payment_date && ` · ${p.payment_date}`}
                          </p>
                          <div className="flex gap-1.5 mt-1">
                            {p.imported && <Badge variant="secondary" className="text-[10px]">imported</Badge>}
                            <Badge variant="outline" className="text-[10px]">{p.payment_status}</Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="lessons" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden data-[state=active]:flex flex-col">
            {selectedLessons.size > 0 && (
              <div className="flex items-center gap-2 mb-2 p-2 rounded-md border bg-muted/40 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {selectedLessons.size} selected
                  {selectedNeedingAmount.length > 0 && ` · ${selectedNeedingAmount.length} need amount`}
                </span>
                <Input
                  type="number" min="0" step="1" inputMode="numeric"
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBulkAmount(); } }}
                  placeholder="Set amount for all"
                  className="h-8 w-40 text-xs ml-auto"
                />
                <Button size="sm" variant="secondary" className="h-8" onClick={applyBulkAmount}
                  disabled={!bulkAmount.trim() || !(parseFloat(bulkAmount) > 0)}>
                  Apply
                </Button>
              </div>
            )}
            <ScrollArea className="flex-1 min-h-0 h-[50vh] rounded-md border">
              {loading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                </div>
              ) : filteredLessons.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No matching unpaid lessons.</div>
              ) : (
                <div className="divide-y">
                  {filteredLessons.map(l => {
                    const checked = selectedLessons.has(l.id);
                    const editedRaw = priceEdits[l.id];
                    const amount = editedRaw !== undefined && editedRaw !== ''
                      ? (parseFloat(editedRaw) || 0)
                      : l.revenue;
                    // Show the input whenever the lesson has no recorded revenue
                    // OR the user has started typing an edit (even if blank/zero).
                    // Deriving this from `amount > 0` would unmount the input on
                    // the first keystroke and trap the user at one digit.
                    const isEditing = editedRaw !== undefined || (l.revenue || 0) <= 0;
                    return (
                      <div
                        key={l.id}
                        className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleLesson(l.id)}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleLesson(l.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="font-medium truncate">{l.full_name || l.email || 'Unknown student'}</p>
                            {isEditing ? (
                              <Input
                                type="number" min="0" step="any" inputMode="decimal"
                                autoFocus
                                value={editedRaw ?? ''}
                                onChange={(e) => setPriceEdits(prev => ({ ...prev, [l.id]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                placeholder="Set amount"
                                className="h-7 w-28 text-xs shrink-0"
                              />
                            ) : (
                              <p className="font-semibold text-warning shrink-0">{fmtMXN(amount)}</p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {l.lesson_date} · {l.lesson_type}
                          </p>
                          {l.imported && (
                            <Badge variant="secondary" className="text-[10px] mt-1">imported</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="new" className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden data-[state=active]:flex flex-col">
            <div className="rounded-md border p-3 flex-1 min-h-0 overflow-y-auto space-y-3">
              {/* Kind toggle */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={draftKind === 'package' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDraftKind('package')}
                  className="gap-1.5"
                >
                  <PackageIcon className="h-4 w-4" /> Paquete
                </Button>
                <Button
                  type="button"
                  variant={draftKind === 'lesson' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDraftKind('lesson')}
                  className="gap-1.5"
                >
                  <Calendar className="h-4 w-4" /> Clase individual
                </Button>
              </div>

              {/* Student picker */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Estudiante</label>
                {draftStudentId ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <span className="text-sm font-medium truncate">{draftStudentName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setDraftStudentId(null); setDraftStudentName(''); setDraftStudentQuery(''); }}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Buscar por nombre o email…"
                      value={draftStudentQuery}
                      onChange={(e) => setDraftStudentQuery(e.target.value)}
                      className="h-9"
                    />
                    {draftStudentQuery.trim().length > 0 && (
                      <div className="absolute z-50 mt-1 left-0 right-0 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg">
                        {allProfiles
                          .filter((p) => {
                            const q = draftStudentQuery.trim().toLowerCase();
                            return (
                              p.full_name.toLowerCase().includes(q) ||
                              p.email.toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 30)
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted/60 text-sm"
                              onClick={() => {
                                setDraftStudentId(p.id);
                                setDraftStudentName(p.full_name || p.email);
                              }}
                            >
                              <p className="font-medium truncate">{p.full_name || '(sin nombre)'}</p>
                              <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {draftKind === 'package' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tamaño de paquete (clases)</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={draftPackageSize}
                    onChange={(e) => setDraftPackageSize(e.target.value)}
                    className="h-9"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {draftKind === 'package' ? 'Precio total (MXN)' : 'Monto (MXN)'}
                </label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  placeholder="0"
                  className="h-9"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
                <Input
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Ej. cliente confirmó por WhatsApp"
                  className="h-9"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Los pendientes no consumen clases ni aparecen en el calendario hasta activarlos.
              </p>

              <Button
                type="button"
                className="w-full"
                disabled={
                  creatingDraft ||
                  !draftStudentId ||
                  !(parseFloat(draftAmount) > 0) ||
                  (draftKind === 'package' && !(parseInt(draftPackageSize, 10) > 0))
                }
                onClick={async () => {
                  if (!draftStudentId) return;
                  setCreatingDraft(true);
                  try {
                    const amt = parseFloat(draftAmount) || 0;
                    if (draftKind === 'package') {
                      const size = parseInt(draftPackageSize, 10) || 0;
                      const { error } = await supabase
                        .from('class_packages')
                        .insert({
                          user_id: draftStudentId,
                          package_name: draftNotes
                            ? `${size}-Lesson Package — ${draftNotes}`
                            : `${size}-Lesson Package`,
                          package_size: size,
                          classes_remaining: size,
                          classes_used: 0,
                          price: amt,
                          amount_paid: 0,
                          payment_status: 'pending',
                          is_active: true,
                          imported: false,
                          ar_status: 'active_pending',
                        } as any);
                      if (error) throw error;
                    } else {
                      const { error } = await supabase
                        .from('lessons')
                        .insert({
                          student_id: draftStudentId,
                          lesson_date: null,
                          lesson_time: null,
                          lesson_type: 'Lesson',
                          status: 'scheduled',
                          revenue: amt,
                          imported: false,
                          ar_status: 'active',
                          coach_notes: draftNotes || null,
                        } as any);
                      if (error) throw error;
                    }
                    toast.success('Pendiente creado');
                    onLinked?.();
                    onOpenChange(false);
                  } catch (e: any) {
                    console.error(e);
                    toast.error('No se pudo crear el pendiente', { description: e?.message });
                  } finally {
                    setCreatingDraft(false);
                  }
                }}
              >
                {creatingDraft && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Crear pendiente
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 flex sm:justify-between items-center gap-3 border-t pt-3 bg-background">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? 'Nothing selected'
              : <>Selected <strong className="text-foreground">{totalCount}</strong> · <strong className="text-warning">{fmtMXN(totalSelected)}</strong></>
            }
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleLink} disabled={saving || totalCount === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Link to AR
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}