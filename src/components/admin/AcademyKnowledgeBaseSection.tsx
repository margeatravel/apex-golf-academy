import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Loader2, Pencil, Save, X, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type KbEntry = {
  id: string;
  key: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

const CATEGORIES = [
  { value: "booking", label: "Booking" },
  { value: "payments", label: "Payments" },
  { value: "membership", label: "Membership" },
  { value: "video_upload", label: "Video uploads" },
  { value: "platform_help", label: "Platform help" },
  { value: "account_help", label: "Account help" },
  { value: "general", label: "General" },
];

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function slugifyKey(input: string) {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || `entry_${Date.now()}`;
}

export function AcademyKnowledgeBaseSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<KbEntry>>({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<KbEntry>>({
    title: "",
    category: "general",
    content: "",
    is_active: true,
    sort_order: 999,
  });
  const [saving, setSaving] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["academy-knowledge-base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_knowledge_base")
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as KbEntry[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, KbEntry[]>();
    for (const e of entries) {
      const list = map.get(e.category) ?? [];
      list.push(e);
      map.set(e.category, list);
    }
    return Array.from(map.entries());
  }, [entries]);

  function startEdit(e: KbEntry) {
    setEditingId(e.id);
    setDraft({ ...e });
  }

  async function saveEdit() {
    if (!draft.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("academy_knowledge_base")
        .update({
          title: (draft.title || "").trim(),
          category: draft.category,
          content: draft.content || "",
          is_active: !!draft.is_active,
          sort_order: Number(draft.sort_order ?? 0),
          updated_by: user?.id ?? null,
        } as any)
        .eq("id", draft.id);
      if (error) throw error;
      toast.success("Entry saved");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["academy-knowledge-base"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(e: KbEntry, next: boolean) {
    const { error } = await supabase
      .from("academy_knowledge_base")
      .update({ is_active: next, updated_by: user?.id ?? null } as any)
      .eq("id", e.id);
    if (error) toast.error("Could not update");
    else qc.invalidateQueries({ queryKey: ["academy-knowledge-base"] });
  }

  async function deleteEntry(e: KbEntry) {
    if (!confirm(`Delete "${e.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("academy_knowledge_base").delete().eq("id", e.id);
    if (error) toast.error("Could not delete");
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["academy-knowledge-base"] });
    }
  }

  async function createNew() {
    const title = (newDraft.title || "").trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const baseKey = slugifyKey(title);
      const key = entries.some((e) => e.key === baseKey) ? `${baseKey}_${Date.now().toString(36)}` : baseKey;
      const { error } = await supabase.from("academy_knowledge_base").insert({
        key,
        title,
        category: newDraft.category || "general",
        content: newDraft.content || "",
        is_active: !!newDraft.is_active,
        sort_order: Number(newDraft.sort_order ?? 999),
        updated_by: user?.id ?? null,
      } as any);
      if (error) throw error;
      toast.success("Entry added");
      setShowNewForm(false);
      setNewDraft({ title: "", category: "general", content: "", is_active: true, sort_order: 999 });
      qc.invalidateQueries({ queryKey: ["academy-knowledge-base"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Could not create entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(240,192,64,0.18)" }}
          >
            <BookOpen className="h-4 w-4" style={{ color: "#F0C040" }} />
          </div>
          <div>
            <h3 style={{ color: "#F5F0E8", fontSize: 16, fontWeight: 600 }}>Academy Knowledge Base</h3>
            <p style={{ color: "#E8D5B0", opacity: 0.5, fontSize: 12 }}>
              The Apex AI uses these entries to answer academy questions. Missing info = AI will tell the student to contact the coach.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowNewForm((v) => !v)}
          className="h-8 gap-1 text-ivory/70 hover:text-ivory hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>
      <Separator className="bg-white/10" />

      {showNewForm && (
        <div className="rounded-xl p-3 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(240,192,64,0.18)" }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] mb-0.5 block" style={{ color: "#E8D5B0", opacity: 0.6 }}>Title</label>
              <Input
                value={newDraft.title || ""}
                onChange={(e) => setNewDraft({ ...newDraft, title: e.target.value })}
                className="bg-white/5 border-white/10 text-ivory h-8 text-sm"
                placeholder="e.g. Refund policy"
              />
            </div>
            <div>
              <label className="text-[10px] mb-0.5 block" style={{ color: "#E8D5B0", opacity: 0.6 }}>Category</label>
              <select
                value={newDraft.category || "general"}
                onChange={(e) => setNewDraft({ ...newDraft, category: e.target.value })}
                className="w-full h-8 text-sm rounded-md bg-white/5 border border-white/10 text-ivory px-2"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] mb-0.5 block" style={{ color: "#E8D5B0", opacity: 0.6 }}>Content</label>
            <Textarea
              rows={4}
              value={newDraft.content || ""}
              onChange={(e) => setNewDraft({ ...newDraft, content: e.target.value })}
              className="bg-white/5 border-white/10 text-ivory text-sm"
              placeholder="Write the exact answer the AI should give for this topic. Be specific (prices, links, steps)."
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)} className="h-8 text-ivory/60 hover:text-ivory hover:bg-white/10">
              Cancel
            </Button>
            <Button size="sm" onClick={createNew} disabled={saving} className="h-8 gap-1 bg-gold-accent text-black hover:bg-gold-accent/90">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save entry
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-ivory/40" />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ color: "#E8D5B0", opacity: 0.5, fontSize: 13 }}>No entries yet. Add one above.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "#E8D5B0", opacity: 0.5 }}>
                {categoryLabel(category)}
              </p>
              <div className="space-y-2">
                {items.map((e) =>
                  editingId === e.id ? (
                    <div
                      key={e.id}
                      className="rounded-xl p-3 space-y-2"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(240,192,64,0.25)" }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] mb-0.5 block" style={{ color: "#E8D5B0", opacity: 0.6 }}>Title</label>
                          <Input
                            value={draft.title || ""}
                            onChange={(ev) => setDraft({ ...draft, title: ev.target.value })}
                            className="bg-white/5 border-white/10 text-ivory h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] mb-0.5 block" style={{ color: "#E8D5B0", opacity: 0.6 }}>Category</label>
                          <select
                            value={draft.category || "general"}
                            onChange={(ev) => setDraft({ ...draft, category: ev.target.value })}
                            className="w-full h-8 text-sm rounded-md bg-white/5 border border-white/10 text-ivory px-2"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] mb-0.5 block" style={{ color: "#E8D5B0", opacity: 0.6 }}>Content</label>
                        <Textarea
                          rows={5}
                          value={draft.content || ""}
                          onChange={(ev) => setDraft({ ...draft, content: ev.target.value })}
                          className="bg-white/5 border-white/10 text-ivory text-sm"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!draft.is_active}
                            onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                          />
                          <span className="text-xs text-ivory/60">{draft.is_active ? "Visible to AI" : "Hidden from AI"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-8 text-ivory/60 hover:text-ivory hover:bg-white/10">
                            <X className="h-4 w-4" />
                          </Button>
                          <Button size="sm" onClick={saveEdit} disabled={saving} className="h-8 gap-1 bg-gold-accent text-black hover:bg-gold-accent/90">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={e.id}
                      className="rounded-xl p-3"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-ivory">{e.title}</p>
                            {!e.is_active && (
                              <Badge variant="outline" className="text-[10px] border-ivory/20 text-ivory/60">Hidden</Badge>
                            )}
                            {(!e.content || !e.content.trim()) && (
                              <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-300">Empty</Badge>
                            )}
                          </div>
                          <p
                            className="text-xs whitespace-pre-wrap mt-1"
                            style={{ color: "#E8D5B0", opacity: 0.65 }}
                          >
                            {e.content?.trim() ? e.content : "— No content yet. Tap edit to fill it in."}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <Switch
                            checked={e.is_active}
                            onCheckedChange={(v) => toggleActive(e, v)}
                          />
                          <Button size="sm" variant="ghost" onClick={() => startEdit(e)} className="h-8 w-8 p-0 text-ivory/50 hover:text-ivory hover:bg-white/10">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteEntry(e)} className="h-8 w-8 p-0 text-red-400/70 hover:text-red-300 hover:bg-red-400/10">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}