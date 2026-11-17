import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateField } from '@/components/ui/date-field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Upload, ClipboardList, Plus, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  studentId: string;
}

const num = (s: string): number | null => {
  if (s === '' || s == null) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
};

const dec = (s: string): number | null => {
  if (s === '' || s == null) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const INITIAL = {
  playedOn: new Date().toISOString().slice(0, 10),
  courseName: '',
  totalScore: '',
  coursePar: '72',
  holesPlayed: '18',
  fairwaysHit: '',
  fairwaysTotal: '',
  gir: '',
  putts: '',
  lostBalls: '',
  eagles: '',
  birdies: '',
  pars: '',
  bogeys: '',
  doublesPlus: '',
  par3Avg: '',
  par4Avg: '',
  par5Avg: '',
  udHit: '',
  udTotal: '',
};

export function AdminLogRoundSection({ studentId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  const set = (key: keyof typeof INITIAL) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['golf-rounds', studentId] });
    qc.invalidateQueries({ queryKey: ['admin-golf-rounds', studentId] });
    qc.invalidateQueries({ queryKey: ['admin-all-rounds'] });
  };

  const handleManualSubmit = async () => {
    const score = parseInt(form.totalScore, 10);
    if (!form.courseName.trim()) { toast.error('Enter the course name'); return; }
    if (isNaN(score) || score < 18 || score > 200) { toast.error('Score must be 18–200'); return; }

    setSaving(true);
    try {
      const par = parseInt(form.coursePar, 10) || 72;
      const holes = parseInt(form.holesPlayed, 10) || 18;
      const { error } = await supabase.from('golf_rounds').insert({
        student_id: studentId,
        course_name_snapshot: form.courseName.trim(),
        played_on: form.playedOn,
        total_score: score,
        course_par: par,
        holes_played: holes,
        round_type: 'practice' as const,
        fairways_hit: num(form.fairwaysHit),
        fairways_total: num(form.fairwaysTotal),
        greens_in_regulation: num(form.gir),
        putts: num(form.putts),
        penalties: null,
        lost_balls: num(form.lostBalls),
        eagles: num(form.eagles),
        birdies: num(form.birdies),
        pars: num(form.pars),
        bogeys: num(form.bogeys),
        doubles_plus: num(form.doublesPlus),
        par3_avg: dec(form.par3Avg),
        par4_avg: dec(form.par4Avg),
        par5_avg: dec(form.par5Avg),
        up_downs_converted: num(form.udHit),
        up_downs_attempted: num(form.udTotal),
        weather: null,
        tees: null,
        notes: null,
        course_id: null,
      });
      if (error) throw error;
      toast.success('Round logged');
      setForm({ ...INITIAL, playedOn: new Date().toISOString().slice(0, 10) });
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to log round');
    } finally {
      setSaving(false);
    }
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { toast.error('CSV must have a header row and at least one data row'); setImporting(false); return; }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(',').map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj;
      });

      const col = (row: Record<string, string>, ...keys: string[]) => {
        for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; }
        return '';
      };

      const payload = rows
        .filter((r) => col(r, 'total_score', 'score') && col(r, 'course_name_snapshot', 'course', 'course_name'))
        .map((r) => ({
          student_id: studentId,
          played_on: col(r, 'played_on', 'date') || new Date().toISOString().slice(0, 10),
          course_name_snapshot: col(r, 'course_name_snapshot', 'course', 'course_name'),
          total_score: parseInt(col(r, 'total_score', 'score'), 10),
          course_par: parseInt(col(r, 'course_par', 'par') || '72', 10),
          holes_played: parseInt(col(r, 'holes_played', 'holes') || '18', 10),
          round_type: (col(r, 'round_type', 'type') || 'practice') as 'practice' | 'tournament',
          fairways_hit: num(col(r, 'fairways_hit')),
          fairways_total: num(col(r, 'fairways_total')),
          greens_in_regulation: num(col(r, 'greens_in_regulation', 'gir')),
          putts: num(col(r, 'putts')),
          penalties: num(col(r, 'penalties')),
          lost_balls: num(col(r, 'lost_balls')),
          eagles: num(col(r, 'eagles')),
          birdies: num(col(r, 'birdies')),
          pars: num(col(r, 'pars')),
          bogeys: num(col(r, 'bogeys')),
          doubles_plus: num(col(r, 'doubles_plus')),
          par3_avg: dec(col(r, 'par3_avg')),
          par4_avg: dec(col(r, 'par4_avg')),
          par5_avg: dec(col(r, 'par5_avg')),
          up_downs_converted: num(col(r, 'up_downs_converted', 'ud_hit')),
          up_downs_attempted: num(col(r, 'up_downs_attempted', 'ud_total')),
          weather: null,
          tees: null,
          notes: col(r, 'notes') || null,
          course_id: null,
        }));

      if (payload.length === 0) { toast.error('No valid rows found in CSV'); setImporting(false); return; }

      const { error } = await supabase.from('golf_rounds').insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} round${payload.length > 1 ? 's' : ''} imported`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? 'CSV import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const Field = ({ label, id, value, onChange, type = 'number', placeholder, className = '' }: {
    label: string; id: string; value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string; placeholder?: string; className?: string;
  }) => (
    <div className={className}>
      <Label htmlFor={id} className="text-xs text-ivory/60">{label}</Label>
      <Input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="bg-white/5 border-white/10 text-ivory placeholder:text-ivory/30 h-9 text-sm" />
    </div>
  );

  if (!expanded) {
    return (
      <Button
        onClick={() => setExpanded(true)}
        className="w-full gap-2 bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold"
      >
        <Plus className="h-4 w-4" /> Log Round
      </Button>
    );
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <button
        onClick={() => setExpanded(false)}
        className="w-full flex items-center justify-between"
      >
        <h3 className="text-ivory font-semibold text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-gold-accent" /> Log Round
        </h3>
        <ChevronUp className="h-4 w-4 text-ivory/40" />
      </button>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="w-full bg-white/5 border border-white/10">
          <TabsTrigger value="manual" className="flex-1 text-xs data-[state=active]:bg-gold-accent/20 data-[state=active]:text-gold-accent">
            Manual Entry
          </TabsTrigger>
          <TabsTrigger value="csv" className="flex-1 text-xs data-[state=active]:bg-gold-accent/20 data-[state=active]:text-gold-accent">
            Import CSV
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="r-date" className="text-xs text-ivory/60">Date</Label>
              <DateField id="r-date" value={form.playedOn} onChange={(e) => setForm((f) => ({ ...f, playedOn: e.target.value }))} className="h-9" />
            </div>
            <Field label="Course" id="r-course" value={form.courseName} onChange={set('courseName')} type="text" placeholder="Course name" className="col-span-2" />
            <Field label="Score" id="r-score" value={form.totalScore} onChange={set('totalScore')} placeholder="e.g. 82" />
            <Field label="Par" id="r-par" value={form.coursePar} onChange={set('coursePar')} placeholder="72" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fairways Hit" id="r-fh" value={form.fairwaysHit} onChange={set('fairwaysHit')} />
            <Field label="Fairways Total" id="r-ft" value={form.fairwaysTotal} onChange={set('fairwaysTotal')} />
            <Field label="GIR (out of 18)" id="r-gir" value={form.gir} onChange={set('gir')} />
            <Field label="Putts" id="r-putts" value={form.putts} onChange={set('putts')} />
            <Field label="Lost Balls" id="r-lb" value={form.lostBalls} onChange={set('lostBalls')} />
          </div>

          <p className="text-[10px] uppercase tracking-wider text-ivory/40 pt-1">Score Breakdown</p>
          <div className="grid grid-cols-5 gap-2">
            <Field label="Eagles" id="r-eag" value={form.eagles} onChange={set('eagles')} />
            <Field label="Birdies" id="r-bir" value={form.birdies} onChange={set('birdies')} />
            <Field label="Pars" id="r-pars" value={form.pars} onChange={set('pars')} />
            <Field label="Bogeys" id="r-bog" value={form.bogeys} onChange={set('bogeys')} />
            <Field label="Dbl+" id="r-dbl" value={form.doublesPlus} onChange={set('doublesPlus')} />
          </div>

          <p className="text-[10px] uppercase tracking-wider text-ivory/40 pt-1">Par Averages</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Par 3 Avg" id="r-p3" value={form.par3Avg} onChange={set('par3Avg')} placeholder="3.5" />
            <Field label="Par 4 Avg" id="r-p4" value={form.par4Avg} onChange={set('par4Avg')} placeholder="4.8" />
            <Field label="Par 5 Avg" id="r-p5" value={form.par5Avg} onChange={set('par5Avg')} placeholder="5.5" />
          </div>

          <p className="text-[10px] uppercase tracking-wider text-ivory/40 pt-1">Ups & Downs</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="U&D Hit" id="r-udh" value={form.udHit} onChange={set('udHit')} />
            <Field label="U&D Total" id="r-udt" value={form.udTotal} onChange={set('udTotal')} />
          </div>

          <Button
            onClick={handleManualSubmit}
            disabled={saving}
            className="w-full bg-gold-accent text-black hover:bg-gold-accent/90 font-semibold gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Log Round
          </Button>
        </TabsContent>

        <TabsContent value="csv" className="space-y-3 pt-3">
          <div className="glass-card p-4 text-center space-y-3 border border-dashed border-white/20">
            <Upload className="h-8 w-8 text-ivory/40 mx-auto" />
            <p className="text-xs text-ivory/60">
              Upload a <span className="text-ivory font-medium">.csv</span> file with columns like:{' '}
              <span className="text-ivory/80">date, course, score, par, fairways_hit, fairways_total, gir, putts, lost_balls, eagles, birdies, pars, bogeys, doubles_plus, par3_avg, par4_avg, par5_avg, ud_hit, ud_total</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleCSV}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="gap-2 bg-white/5 border-white/10 text-ivory hover:bg-white/10"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? 'Importing…' : 'Choose CSV file'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
