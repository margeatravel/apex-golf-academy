/**
 * DEMO QUERY LAYER — a miniature PostgREST backed by the demo store.
 *
 * The demo client guard swaps `supabase.from(table)` for DemoQueryBuilder
 * while demo mode is on, so every screen keeps calling the exact same
 * supabase-js API and gets fictitious rows back instead of real ones.
 *
 * Supported: select (incl. `*` and embedded relations like
 * `profiles:student_id(full_name, email)` / `profiles!lessons_student_id_fkey(...)`),
 * eq/neq/gt/gte/lt/lte/like/ilike/is/in/contains/or/not/filter/match,
 * order/limit/range, single/maybeSingle, count=exact (+head), and
 * insert/update/delete/upsert (with `.select()` returning rows).
 *
 * Writes mutate ONLY the demo store (sessionStorage) — never the network.
 * Edge functions and RPCs are answered by demoInvokeFunction / demoRpc below.
 */

import {
  demoGetAll,
  demoGetRaw,
  demoInsert,
  demoUpdate,
  demoDelete,
  demoUpsert,
  nextDemoId,
  mapDemoId,
  DEMO_COACH_ID,
  isDemoEntityId,
} from '@/lib/demoStore';

// ── Relation map: source table → relation key → {fk column, target table} ───
const RELATIONS: Record<string, Record<string, { fk: string; target: string }>> = {
  lessons: {
    profiles: { fk: 'student_id', target: 'profiles' },
    class_packages: { fk: 'package_id', target: 'class_packages' },
  },
  class_packages: { profiles: { fk: 'user_id', target: 'profiles' } },
  package_payments: { class_packages: { fk: 'package_id', target: 'class_packages' } },
  payments: { profiles: { fk: 'student_id', target: 'profiles' } },
  subscriptions: {
    profiles: { fk: 'student_id', target: 'profiles' },
    billing_plans: { fk: 'billing_plan_id', target: 'billing_plans' },
  },
  stripe_payments: { profiles: { fk: 'student_id', target: 'profiles' } },
  analysis_requests: { profiles: { fk: 'student_id', target: 'profiles' } },
  videos: { profiles: { fk: 'student_id', target: 'profiles' } },
  point_redemptions: { profiles: { fk: 'user_id', target: 'profiles' } },
  recurring_lesson_slots: { profiles: { fk: 'student_id', target: 'profiles' } },
  fixed_schedule_slots: { profiles: { fk: 'student_id', target: 'profiles' } },
  golf_rounds: { profiles: { fk: 'student_id', target: 'profiles' } },
  student_reports: { profiles: { fk: 'student_id', target: 'profiles' } },
  coach_ai_messages: { coach_ai_conversations: { fk: 'conversation_id', target: 'coach_ai_conversations' } },
  family_links: {
    profiles: { fk: 'parent_user_id', target: 'profiles' },
  },
  notifications: { profiles: { fk: 'user_id', target: 'profiles' } },
};

const FK_FALLBACK = ['student_id', 'user_id', 'coach_id', 'parent_user_id'];

function resolveRelation(table: string, relKey: string, hint: string | null): { fk: string; target: string } | null {
  const byTable = RELATIONS[table]?.[relKey];
  if (hint) {
    // `!lessons_student_id_fkey` → column `student_id` (strip table prefix + _fkey).
    let col = hint.replace(/_fkey$/, '');
    const prefix = `${table}_`;
    if (col.startsWith(prefix)) col = col.slice(prefix.length);
    return { fk: col, target: relKey };
  }
  if (byTable) return byTable;
  // Fallback: relation key is a table; guess the FK column from the row.
  return { fk: '', target: relKey };
}

// ── Select parsing ──────────────────────────────────────────────────────────
type SelectToken =
  | { kind: 'star' }
  | { kind: 'col'; name: string }
  | { kind: 'embed'; key: string; target: string; fk: string | null; hint: string | null; cols: SelectToken[] | null };

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseSelect(sel: string): SelectToken[] {
  return splitTopLevel(sel).map((raw) => {
    const t = raw.trim();
    if (t === '*') return { kind: 'star' } as SelectToken;
    const m = t.match(/^([^(:!]+)(?::([^(!]+))?(?:!([^()]+))?\((.*)\)$/s);
    if (m) {
      const [, first, second, hint, inner] = m;
      // PostgREST forms:
      //   `table(cols)`            → target table, FK inferred
      //   `table:fk_col(cols)`     → target table, explicit FK column
      //   `table!constraint(cols)` → target table, FK from constraint name
      //   `alias:table(cols)`      → output key `alias`, target `table`
      // A FK column always ends in `_id`; a table name never does, so that
      // disambiguates the `:` form.
      let key = first;
      let target = first;
      let fk: string | null = null;
      if (second) {
        if (second.endsWith('_id')) fk = second;
        else target = second;
      }
      return {
        kind: 'embed',
        key,
        target,
        fk,
        hint: hint ?? null,
        cols: inner.trim() === '*' ? null : parseSelect(inner),
      } as SelectToken;
    }
    return { kind: 'col', name: t } as SelectToken;
  });
}

function projectRow(table: string, row: any, tokens: SelectToken[]): any {
  const out: Record<string, any> = {};
  for (const tok of tokens) {
    if (tok.kind === 'star') {
      for (const [k, v] of Object.entries(row)) {
        if (!(k in out)) out[k] = v;
      }
    } else if (tok.kind === 'col') {
      out[tok.name] = row[tok.name] ?? null;
    } else {
      // Embedded relation (many-to-one).
      const rel = resolveRelation(table, tok.target, tok.hint);
      let fkCol = tok.fk ?? rel?.fk;
      if (!fkCol) {
        fkCol = FK_FALLBACK.find((c) => row[c] != null) ?? '';
      }
      const targetTable = rel?.target ?? tok.target;
      const fkVal = fkCol ? row[fkCol] : null;
      if (fkVal == null) {
        out[tok.key] = null;
        continue;
      }
      const target = demoGetAll(targetTable).find((r) => String(r.id) === String(fkVal));
      if (!target) {
        out[tok.key] = null;
        continue;
      }
      if (tok.cols === null) {
        out[tok.key] = { ...target };
      } else if (tok.cols.length === 1 && tok.cols[0].kind === 'col' && tok.cols[0].name === 'count') {
        out[tok.key] = [{ count: 1 }];
      } else {
        out[tok.key] = projectRow(targetTable, target, tok.cols);
      }
    }
  }
  return out;
}

// ── Filter values ───────────────────────────────────────────────────────────
function looselyEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function likeMatch(value: unknown, pattern: string, caseInsensitive: boolean): boolean {
  if (value == null) return false;
  let re = '^';
  for (const ch of pattern) {
    if (ch === '%') re += '.*';
    else if (ch === '_') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  re += '$';
  return new RegExp(re, caseInsensitive ? 'i' : '').test(String(value));
}

type Predicate = (row: any) => boolean;

function parseOrTerm(term: string): Predicate {
  const t = term.trim();
  const andMatch = t.match(/^and\((.*)\)$/s);
  if (andMatch) {
    const parts = splitTopLevel(andMatch[1]).map(parseOrTerm);
    return (row) => parts.every((p) => p(row));
  }
  const orMatch = t.match(/^or\((.*)\)$/s);
  if (orMatch) {
    const parts = splitTopLevel(orMatch[1]).map(parseOrTerm);
    return (row) => parts.some((p) => p(row));
  }
  const m = t.match(/^([^.()]+)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov)\.(.*)$/s);
  if (!m) return () => true;
  const [, col, op, rawVal] = m;
  let val: unknown = rawVal;
  if (op === 'in') {
    const inner = rawVal.replace(/^\(|\)$/g, '');
    val = splitTopLevel(inner).map((v) => mapDemoId(decodeURIComponent(v.replace(/^"|"$/g, ''))));
  } else if (op === 'is') {
    val = rawVal;
  } else {
    val = mapDemoId(decodeURIComponent(rawVal.replace(/^"|"$/g, '')));
  }
  return (row) => applyOp(row[col], op, val);
}

function applyOp(field: unknown, op: string, val: unknown): boolean {
  switch (op) {
    case 'eq': return looselyEqual(field, val);
    case 'neq': return !looselyEqual(field, val);
    case 'gt': return field != null && val != null && (field as any) > (val as any);
    case 'gte': return field != null && val != null && (field as any) >= (val as any);
    case 'lt': return field != null && val != null && (field as any) < (val as any);
    case 'lte': return field != null && val != null && (field as any) <= (val as any);
    case 'like': return likeMatch(field, String(val), false);
    case 'ilike': return likeMatch(field, String(val), true);
    case 'is':
      if (val === 'null') return field == null;
      if (val === 'true') return field === true;
      if (val === 'false') return field === false;
      return looselyEqual(field, val);
    case 'in':
      return Array.isArray(val) && val.some((v) => looselyEqual(field, v));
    case 'cs':
      return Array.isArray(field) && field.some((v) => looselyEqual(v, val));
    default: return true;
  }
}

// ── The builder ─────────────────────────────────────────────────────────────
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export interface DemoResult {
  data: any;
  error: any;
  count: number | null;
  status: number;
  statusText: string;
}

const ok = (data: any, count: number | null = null, status = 200): DemoResult => ({
  data, error: null, count, status, statusText: 'OK',
});
const err = (code: string, message: string, status = 400): DemoResult => ({
  data: null,
  error: { code, message, details: 'demo', hint: null },
  count: null, status, statusText: 'Bad Request',
});

export class DemoQueryBuilder {
  private table: string;
  private op: Op = 'select';
  private selectStr: string | null = null;
  private selectCount: 'exact' | null = null;
  private selectHead = false;
  private returning = false;
  private payload: any = null;
  private upsertConflict: string[] | null = null;
  private filters: Predicate[] = [];
  private orders: Array<{ col: string; asc: boolean; nullsFirst: boolean | null }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private promise: Promise<DemoResult> | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    this.selectStr = columns;
    if (options?.count === 'exact') this.selectCount = 'exact';
    if (options?.head) this.selectHead = true;
    if (this.op !== 'select') this.returning = true;
    return this;
  }

  insert(values: any, _options?: any): this {
    this.op = 'insert';
    this.payload = values;
    return this;
  }

  update(values: any): this {
    this.op = 'update';
    this.payload = values;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  upsert(values: any, options?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.payload = values;
    this.upsertConflict = options?.onConflict ? options.onConflict.split(',').map((s) => s.trim()) : null;
    return this;
  }

  eq(col: string, val: unknown): this { this.filters.push((r) => looselyEqual(r[col], mapDemoId(val))); return this; }
  neq(col: string, val: unknown): this { this.filters.push((r) => !looselyEqual(r[col], mapDemoId(val))); return this; }
  gt(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as any) > (val as any)); return this; }
  gte(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as any) >= (val as any)); return this; }
  lt(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as any) < (val as any)); return this; }
  lte(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as any) <= (val as any)); return this; }
  like(col: string, val: string): this { this.filters.push((r) => likeMatch(r[col], val, false)); return this; }
  ilike(col: string, val: string): this { this.filters.push((r) => likeMatch(r[col], val, true)); return this; }
  is(col: string, val: unknown): this {
    this.filters.push((r) => val === null ? r[col] == null : looselyEqual(r[col], val));
    return this;
  }
  in(col: string, vals: unknown[]): this {
    const set = (vals ?? []).map((v) => mapDemoId(v));
    this.filters.push((r) => set.some((v) => looselyEqual(r[col], v)));
    return this;
  }
  contains(col: string, val: unknown): this {
    this.filters.push((r) => Array.isArray(r[col]) && (r[col] as any[]).some((v) => looselyEqual(v, val)));
    return this;
  }
  or(expr: string): this { this.filters.push(parseOrTerm(`or(${expr})`)); return this; }
  not(col: string, op: string, val: unknown): this {
    this.filters.push((r) => !applyOp(r[col], op, mapDemoId(val)));
    return this;
  }
  filter(col: string, op: string, val: unknown): this {
    this.filters.push((r) => applyOp(r[col], op, mapDemoId(val)));
    return this;
  }
  match(obj: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  order(col: string, options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string }): this {
    this.orders.push({ col, asc: options?.ascending !== false, nullsFirst: options?.nullsFirst ?? null });
    return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  range(from: number, to: number): this { this.rangeFrom = from; this.rangeTo = to; return this; }
  single(): this { this.singleMode = 'single'; return this; }
  maybeSingle(): this { this.singleMode = 'maybeSingle'; return this; }
  throwOnError(): this { return this; }

  then<TResult1 = DemoResult, TResult2 = never>(
    onFulfilled?: ((v: DemoResult) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onFulfilled, onRejected);
  }
  catch<TResult = never>(onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<DemoResult | TResult> {
    return this.exec().catch(onRejected);
  }
  finally(onFinally?: (() => void) | null): Promise<DemoResult> {
    return this.exec().finally(onFinally);
  }

  private exec(): Promise<DemoResult> {
    if (!this.promise) this.promise = Promise.resolve().then(() => this.run());
    return this.promise;
  }

  private matches(row: any): boolean {
    return this.filters.every((f) => f(row));
  }

  private applyOrder(rows: any[]): any[] {
    if (!this.orders.length) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      for (const { col, asc, nullsFirst } of this.orders) {
        const av = a[col];
        const bv = b[col];
        if (av == null && bv == null) continue;
        const nullsFirstEffective = nullsFirst ?? !asc; // PG default: ASC nulls last, DESC nulls first
        if (av == null) return nullsFirstEffective ? -1 : 1;
        if (bv == null) return nullsFirstEffective ? 1 : -1;
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return asc ? cmp : -cmp;
      }
      return 0;
    });
    return sorted;
  }

  private run(): DemoResult {
    // ── Mutations ──
    if (this.op === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = demoInsert(this.table, rows);
      if (!this.returning) return ok(null);
      return ok(this.project(inserted));
    }
    if (this.op === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out = demoUpsert(this.table, rows, this.upsertConflict ?? undefined);
      if (!this.returning) return ok(null);
      return ok(this.project(out));
    }
    if (this.op === 'update') {
      const updated = demoUpdate(this.table, (r) => this.matches(r), this.payload ?? {});
      if (!this.returning) return ok(null);
      return ok(this.project(updated));
    }
    if (this.op === 'delete') {
      const removed = demoDelete(this.table, (r) => this.matches(r));
      if (!this.returning) return ok(null);
      return ok(this.project(removed));
    }

    // ── Select ──
    let rows = demoGetRaw(this.table).filter((r) => this.matches(r));
    const total = rows.length;
    rows = this.applyOrder(rows);
    if (this.rangeFrom != null && this.rangeTo != null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    else if (this.limitN != null) rows = rows.slice(0, this.limitN);
    const count = this.selectCount === 'exact' ? total : null;

    if (this.selectHead) return ok(null, count);

    if (this.singleMode) {
      if (rows.length === 0) {
        if (this.singleMode === 'maybeSingle') return ok(null, count);
        return err('PGRST116', 'JSON object requested, multiple (or no) rows returned', 406);
      }
      if (rows.length > 1) return err('PGRST118', 'JSON object requested, multiple rows returned', 406);
      return ok(this.project([rows[0]])[0], count);
    }
    return ok(this.project(rows), count);
  }

  private project(rows: any[]): any[] {
    const tokens = this.selectStr ? parseSelect(this.selectStr) : [{ kind: 'star' } as SelectToken];
    return rows.map((r) => projectRow(this.table, r, tokens));
  }
}

// ── RPCs ────────────────────────────────────────────────────────────────────
export function demoRpc(name: string, params?: any): any {
  const store = {
    can_preview_student: () => {
      const id = params?._student_id ?? params?.student_id;
      return typeof id === 'string' && demoGetAll('profiles').some((p) => p.id === id);
    },
    get_visible_recurring_slots: () => demoGetAll('recurring_lesson_slots'),
    staff_access_coach: () => DEMO_COACH_ID,
    staff_stripe_status: () => ({
      total: demoGetAll('stripe_payments').length,
      latest: { created_at: new Date().toISOString(), status: 'succeeded' },
    }),
    search_family_candidates: () => {
      const q = String(params?._q ?? '').toLowerCase();
      if (q.length < 2) return [];
      return demoGetAll('profiles')
        .filter((p) => p.id !== DEMO_COACH_ID && (`${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q)))
        .map((p) => ({ id: p.id, full_name: p.full_name, email: p.email, photo_url: p.photo_url ?? null }));
    },
    family_request_people: () => [],
    family_access_status: () => [{ linked_count: demoGetAll('family_links').length, has_paid_relative: true }],
    process_lesson_completion: () => ({ success: true }),
    hide_student_report: () => ({ success: true }),
    get_pro_zone_catalog_summary: () => {
      const byCat = new Map<string, number>();
      for (const m of demoGetAll('pro_zone_media')) byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1);
      return [...byCat.entries()].map(([key, count], i) => ({
        key, label: key, emoji: null, is_custom: false, sort_order: i + 1, video_count: count,
      }));
    },
    get_assigned_coach_clabe: () => [{ clabe: '002123456789012345', full_name: 'Coach Demo' }],
    admin_adjust_points: () => {
      const sid = params?.student_id ?? params?._student_id;
      const delta = Number(params?.delta ?? params?.points ?? 0);
      if (sid && delta) {
        const rows = demoGetRaw('student_points');
        const row = rows.find((r) => r.student_id === sid);
        if (row) {
          row.total_points = Math.max(0, (row.total_points ?? 0) + delta);
          row.lifetime_points = Math.max(0, (row.lifetime_points ?? 0) + Math.max(0, delta));
        }
      }
      return { success: true };
    },
  } as Record<string, () => unknown>;
  const fn = store[name];
  return fn ? fn() : null;
}

// ── Edge functions ──────────────────────────────────────────────────────────
function demoInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `DEMO${code}`;
}

export function demoInvokeFunction(name: string, body: any): any {
  switch (name) {
    case 'lookup-invite': {
      const code = String(body?.code ?? body ?? '').trim().toUpperCase();
      const row = demoGetAll('student_invites').find((r) => String(r.code).toUpperCase() === code);
      if (!row) return { valid: false, reason: 'invalid' };
      if (row.status === 'cancelled') return { valid: false, reason: 'cancelled' };
      if (row.status === 'accepted') return { valid: false, reason: 'accepted' };
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: 'expired' };
      return { valid: true, inviter_name: 'Coach Demo', inviter_is_coach: true };
    }
    case 'accept-invite': {
      const code = String(body?.code ?? '').trim().toUpperCase();
      const row = demoGetAll('student_invites').find((r) => String(r.code).toUpperCase() === code);
      if (!row) return { error: 'Código no válido (demo)' };
      return { assigned_coach_id: DEMO_COACH_ID, inviter_name: 'Coach Demo', inviter_is_coach: true };
    }
    case 'create-invite': {
      const purpose = body?.purpose as string | undefined;
      if (purpose === 'coach_code') return { code: 'DEMO0000' };
      const code = demoInviteCode();
      demoInsert('student_invites', [{
        code,
        inviter_id: DEMO_COACH_ID,
        inviter_is_coach: true,
        recipient_email: body?.recipient_email ?? null,
        recipient_name: body?.recipient_name ?? null,
        status: 'pending',
        accepted_by: null,
        accepted_at: null,
        expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        is_reusable: purpose === 'access_link',
        assigned_coach_id: body?.assign_coach_id ?? DEMO_COACH_ID,
      }]);
      return { code };
    }
    case 'manage-staff': {
      const action = body?.action as string;
      const staff = demoGetRaw('demo_staff');
      if (action === 'list') return { staff: demoGetAll('demo_staff') };
      if (action === 'invite') {
        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const row = {
          user_id: nextDemoId('stf'),
          email: String(body?.email ?? ''),
          full_name: body?.full_name ?? null,
          scopes: body?.scopes ?? ['pro_zone'],
        };
        staff.push(row);
        return { pin };
      }
      if (action === 'grant' || action === 'revoke') {
        const row = staff.find((s) => s.user_id === body?.user_id);
        if (row) {
          const scopes = new Set(row.scopes ?? []);
          if (action === 'grant') scopes.add(body.scope);
          else scopes.delete(body.scope);
          row.scopes = [...scopes];
        }
        return {};
      }
      if (action === 'set_pin') {
        return { pin: body?.pin || String(Math.floor(100000 + Math.random() * 900000)) };
      }
      if (action === 'revoke_staff' || action === 'remove' || action === 'clear_pin') {
        const idx = staff.findIndex((s) => s.user_id === body?.user_id);
        if (idx >= 0) staff.splice(idx, 1);
        if (action === 'remove') demoDelete('profiles', (r) => r.id === body?.user_id);
        return {};
      }
      return {};
    }
    case 'manage-coaches': {
      const action = body?.action as string;
      if (action === 'list') {
        return { coaches: [{ id: DEMO_COACH_ID, email: 'coach.demo@margeagolfacademy.com', full_name: 'Coach Demo', photo_url: null, created_at: new Date().toISOString(), student_count: demoGetAll('profiles').length - 1 }] };
      }
      if (action === 'students') {
        return { students: demoGetAll('profiles').filter((p) => p.id !== DEMO_COACH_ID).map((p) => ({ ...p })) };
      }
      if (action === 'create') {
        const id = nextDemoId('coach');
        demoInsert('profiles', [{ id, email: body?.email ?? '', full_name: body?.full_name ?? null, photo_url: null, assigned_coach_id: null }]);
        demoInsert('user_roles', [{ user_id: id, role: 'coach' }]);
        return { id, email: body?.email ?? '' };
      }
      if (action === 'remove') {
        if (body?.user_id && body.user_id !== DEMO_COACH_ID) {
          demoDelete('profiles', (r) => r.id === body.user_id);
          demoDelete('user_roles', (r) => r.user_id === body.user_id);
        }
        return {};
      }
      return {};
    }
    case 'manage-student-auth': {
      return { user: { id: nextDemoId('std'), email: body?.email ?? null } };
    }
    case 'redeem-reward': {
      demoInsert('point_redemptions', [{
        user_id: demoGetAll('profiles')[1]?.id ?? DEMO_COACH_ID,
        reward_id: null,
        reward_type: body?.reward_key ?? body?.reward_type ?? 'video_analysis',
        cost: 150,
        fulfillment_status: 'pending',
      }]);
      return { success: true };
    }
    case 'cancel-lesson': {
      const lid = body?.lesson_id ?? body?.lessonId;
      if (lid) demoUpdate('lessons', (r) => r.id === lid, { status: 'cancelled' });
      return {};
    }
    case 'admin-delete-subscription': {
      const sid = body?.subscription_id ?? body?.id;
      if (sid) demoDelete('subscriptions', (r) => r.id === sid);
      return {};
    }
    case 'sign-shared-video': {
      return { url: '/placeholder.svg', signedUrl: '/placeholder.svg' };
    }
    case 'lookup-golf-course': {
      const q = String(body?.query ?? '').toLowerCase();
      const results = demoGetAll('golf_courses').filter((c) => !q || c.name.toLowerCase().includes(q));
      return { results };
    }
    case 'create-student': {
      const [row] = demoInsert('profiles', [{
        full_name: body?.name ?? 'Alumno Demo',
        email: body?.email ?? null,
        phone: body?.phone ?? null,
        photo_url: null,
        handicap: null,
        goals: null,
        plan_tier: null,
        manual_plan_override: null,
        override_expires_at: null,
        assigned_coach_id: DEMO_COACH_ID,
      }]);
      return { id: row.id, email: row.email };
    }
    case 'book-lesson': {
      return { lessonId: nextDemoId('les'), lessonsRemaining: null, isSubscriber: false, paidWith: 'membership' };
    }
    // Restricted recurring-schedule flow: generic fake success only — the flow
    // itself is untouched. The slot is NOT persisted as claimed in demo.
    case 'claim-recurring-slot':
    // Mail / notifications / sync / Stripe: fake success, nothing is sent.
    case 'notify-admin':
    case 'send-notification-email':
    case 'notify-blocked-date':
    case 'send-parent-access':
    case 'send-family-invite':
    case 'revoke-parent-access':
    case 'move-videos-to-family':
    case 'resend-domain-status':
    case 'generate-recurring-lessons':
    case 'cancel-blocked-lessons':
    case 'sync-google-calendar':
    case 'sync-my-google-calendar':
    case 'merge-students':
    case 'unmerge-student':
    case 'sync-stripe-plan':
    case 'admin-resync-subscription':
      return {};
    case 'create-checkout':
    case 'verify-checkout':
    case 'customer-portal':
    case 'manage-my-subscription':
      // No real checkout in demo — callers treat a missing url as a failed
      // checkout and show an error toast. Never redirect to Stripe.
      return { url: null };
    default:
      return {};
  }
}

// ── get-available-slots (direct fetch GET) ──────────────────────────────────
export function demoAvailableDays(startDate: string, endDate: string): Array<{ date: string; slots: string[] }> {
  const rules = demoGetAll('coach_availability_rules').filter((r) => r.is_active !== false);
  const recurring = demoGetAll('recurring_lesson_slots').filter((r) => r.is_active !== false);
  const out: Array<{ date: string; slots: string[] }> = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    const taken = new Set(recurring.filter((r) => r.weekday === wd).map((r) => String(r.start_time).slice(0, 5)));
    const slots: string[] = [];
    for (const rule of rules.filter((r) => r.weekday === wd)) {
      const [sh, sm] = String(rule.start_time).slice(0, 5).split(':').map(Number);
      const [eh, em] = String(rule.end_time).slice(0, 5).split(':').map(Number);
      for (let mins = sh * 60 + sm; mins + 60 <= eh * 60 + em; mins += 60) {
        const hh = String(Math.floor(mins / 60)).padStart(2, '0');
        const mm = String(mins % 60).padStart(2, '0');
        const t = `${hh}:${mm}`;
        if (!taken.has(t)) slots.push(t);
      }
    }
    // Open spots for this weekday are bookable too.
    for (const o of demoGetAll('fixed_schedule_slots')) {
      if (o.day_of_week === wd && o.is_available) {
        const t = String(o.start_time).slice(0, 5);
        if (!slots.includes(t) && !taken.has(t)) slots.push(t);
      }
    }
    out.push({ date: iso, slots: slots.sort() });
  }
  return out;
}

// ── coach-ai-chat (direct fetch POST, SSE) ──────────────────────────────────
export function demoAiChatReply(message: string, conversationId: string | null): { sse: string; conversationId: string } {
  const convId = conversationId && demoGetAll('coach_ai_conversations').some((c) => c.id === conversationId)
    ? conversationId
    : nextDemoId('aic');
  if (!demoGetAll('coach_ai_conversations').some((c) => c.id === convId)) {
    demoInsert('coach_ai_conversations', [{
      id: convId,
      coach_id: DEMO_COACH_ID,
      title: message.slice(0, 60) || 'Conversación demo',
      student_context_id: null,
      updated_at: new Date().toISOString(),
    }]);
  }
  demoInsert('coach_ai_messages', [{ conversation_id: convId, role: 'user', content: message }]);
  const es = /[áéíóúñ¿¡]/i.test(message) || /\b(qué|cómo|cuál|clase|alumno|swing|clases)\b/i.test(message);
  const reply = es
    ? '🎭 Respuesta demo: en el modo demo el asistente no consulta datos reales. Prueba preguntando por tus alumnos demo, por ejemplo "¿quién tiene clases pendientes esta semana?"'
    : '🎭 Demo reply: in demo mode the assistant does not read real data. Try asking about your demo students, e.g. "who has pending lessons this week?"';
  demoInsert('coach_ai_messages', [{ conversation_id: convId, role: 'assistant', content: reply }]);
  const chunk = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
  return { sse: `${chunk(reply)}data: [DONE]\n\n`, conversationId: convId };
}

// ── Fake storage API (client guard) ─────────────────────────────────────────
export function demoStorageApi(_bucket: string) {
  const placeholder = { data: { signedUrl: '/placeholder.svg' }, error: null };
  return {
    upload: async (path: string) => ({ data: { path: `demo/${path}`, fullPath: `${_bucket}/demo/${path}` }, error: null }),
    update: async (path: string) => ({ data: { path: `demo/${path}`, fullPath: `${_bucket}/demo/${path}` }, error: null }),
    remove: async (_paths: string[]) => ({ data: [], error: null }),
    move: async (from: string, _to: string) => ({ data: { path: from }, error: null }),
    copy: async (from: string, _to: string) => ({ data: { path: from }, error: null }),
    createSignedUrl: async (_path: string, _expiresIn: number) => placeholder,
    createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: '/placeholder.svg', error: null })), error: null }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: path.startsWith('/') ? path : '/placeholder.svg' } }),
    list: async () => ({ data: [], error: null }),
    download: async () => ({ data: new Blob([]), error: null }),
    uploadToSignedUrl: async (path: string) => ({ data: { path: `demo/${path}`, fullPath: `${_bucket}/demo/${path}` }, error: null }),
  };
}

export { isDemoEntityId };
