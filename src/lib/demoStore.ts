/**
 * DEMO STORE — the single source of truth for Demo Mode data.
 *
 * - Seeded once per browser session from src/data/demoData.ts (all fictitious).
 * - Persisted to sessionStorage after every mutation, so demo writes survive
 *   a refresh *within the same tab session* but never leave the browser.
 * - NOTHING here ever touches Supabase: the demo client guard + fetch guard
 *   route every demo-mode data call into this store instead of the network.
 *
 * The store also owns the identity mapping: Santiago's real auth id is mapped
 * to the fictitious demo coach id (`demoCoachId`), so every query that filters
 * by coach/user id resolves against demo rows and the greeting reads
 * "Bienvenido, Coach" — never "Bienvenido, Santiago".
 */

import {
  demoStudents,
  demoClassPackages,
  demoPackagePayments,
  demoManualLessonPayments,
  demoSubscriptions,
  demoStripePayments,
  demoBillingPlans,
  demoLessonPricing,
  demoCoachProfile,
  demoCoachId,
  demoNotifications,
  demoBroadcastNotifications,
  demoPointRewards,
  demoPointRedemptions,
  demoAnalysisRequests,
  demoVideos,
  demoAvailabilityRules,
  demoBookingSettingsRow,
  demoFamilyLinks,
  demoStudentInvites,
  demoProZoneMedia,
  demoGolfRounds,
  demoHandicapHistory,
  demoGolfCourses,
  demoStaffMembers,
  demoAcademySettings,
  demoStudentMedia,
  demoSwingAnalyses,
  buildDemoLessons,
  buildDemoBlocks,
  demoRecurringSlots,
  getDemoFixedScheduleSlots,
  getDemoStudentPoints,
} from '@/data/demoData';

export { demoCoachId };
export const DEMO_COACH_ID = demoCoachId;

/** Santiago's real user id (also hardcoded in useCoachLessonPricing). */
export const SANTIAGO_USER_ID = '13480fb4-e4d2-423c-b035-c65846b061fc';

const STORE_KEY = 'apex_demo_store_v1';
const SEQ_KEY = 'apex_demo_store_seq_v1';

/** The signed-in user's real auth id, read from the Supabase session in storage. */
export function getRealUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('sb-') || !k.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const id = parsed?.user?.id;
      if (typeof id === 'string' && id) return id;
    }
  } catch { /* ignore */ }
  return null;
}

/** Map a real identity to its demo counterpart (coach id only — students stay as-is). */
export function mapDemoId(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value === SANTIAGO_USER_ID) return DEMO_COACH_ID;
  const real = getRealUserId();
  if (real && value === real) return DEMO_COACH_ID;
  return value;
}

function mapDeep(value: unknown): unknown {
  if (typeof value === 'string') return mapDemoId(value);
  if (Array.isArray(value)) return value.map(mapDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapDeep(v);
    return out;
  }
  return value;
}

/** New demo ids use the same `-00000000-0000-4000-8000-<12 digits>` shape as the seed data. */
export function nextDemoId(prefix: string): string {
  let seq = 1000;
  try {
    const raw = sessionStorage.getItem(SEQ_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    seq = (map[prefix] ?? 999) + 1;
    map[prefix] = seq;
    sessionStorage.setItem(SEQ_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
  return `${prefix}-00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

type StoreShape = Record<string, any[]>;

function withCoachId(rows: any[]): any[] {
  return rows.map((r) => ({ coach_id: DEMO_COACH_ID, ...r }));
}

function seed(): StoreShape {
  return {
    profiles: [
      { ...demoCoachProfile, ...{ id: DEMO_COACH_ID } },
      ...demoStudents.map((s) => ({ ...s })),
    ],
    user_roles: [{ id: nextDemoId('rol'), user_id: DEMO_COACH_ID, role: 'admin' }],
    academy_settings: demoAcademySettings.map((r) => ({ ...r })),
    coach_lesson_pricing: [{ id: nextDemoId('clp'), coach_id: DEMO_COACH_ID, pricing: demoLessonPricing }],
    billing_plans: demoBillingPlans.map((r) => ({ ...r })),
    lessons: buildDemoLessons(60, 30),
    recurring_lesson_slots: withCoachId(demoRecurringSlots.map((r) => ({ ...r }))),
    fixed_schedule_slots: withCoachId(getDemoFixedScheduleSlots().map((r) => ({ ...r }))),
    class_packages: demoClassPackages.map((r) => ({ ...r })),
    package_payments: demoPackagePayments.map((r) => ({ ...r })),
    payments: demoManualLessonPayments.map((r) => ({ ...r })),
    package_members: [],
    subscriptions: demoSubscriptions.map((r) => ({ ...r })),
    stripe_payments: demoStripePayments.map((r) => ({ ...r })),
    notifications: demoNotifications.map((r) => ({ ...r })),
    broadcast_notifications: demoBroadcastNotifications.map((r) => ({ ...r })),
    broadcast_notification_reads: [],
    point_rewards: demoPointRewards.map((r) => ({ ...r })),
    point_redemptions: demoPointRedemptions.map((r) => ({ ...r })),
    student_points: demoStudents.map((s) => ({ id: nextDemoId('pts'), student_id: s.id, ...getDemoStudentPoints(s.id) })),
    analysis_requests: demoAnalysisRequests.map((r) => ({ ...r })),
    videos: demoVideos.map((r) => ({ ...r })),
    coach_availability_rules: demoAvailabilityRules.map((r) => ({ ...r })),
    coach_availability_blocks: withCoachId(buildDemoBlocks(30, 30).map((r) => ({ ...r }))),
    booking_settings: [{ ...demoBookingSettingsRow }],
    family_links: demoFamilyLinks.map((r) => ({ ...r })),
    student_invites: demoStudentInvites.map((r) => ({ ...r })),
    invite_redemptions: [],
    pro_zone_media: demoProZoneMedia.map((r) => ({ ...r })),
    pro_zone_category_labels: [],
    pro_zone_custom_categories: [],
    golf_rounds: demoGolfRounds.map((r) => ({ ...r })),
    handicap_history: demoHandicapHistory.map((r) => ({ ...r })),
    golf_courses: demoGolfCourses.map((r) => ({ ...r })),
    student_media: demoStudentMedia.map((r) => ({ ...r })),
    swing_analyses: demoSwingAnalyses.map((r) => ({ ...r })),
    student_reports: [],
    revenue_scenarios: [],
    coach_ai_conversations: [],
    coach_ai_messages: [],
    staff_permissions: [],
    push_subscriptions: [],
    // Not a real table: backing list for the demo `manage-staff` function.
    demo_staff: demoStaffMembers.map((r) => ({ ...r })),
  };
}

let cache: StoreShape | null = null;

function load(): StoreShape {
  if (cache) return cache;
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw) {
      cache = JSON.parse(raw) as StoreShape;
      return cache;
    }
  } catch { /* corrupted — reseed below */ }
  cache = seed();
  persist();
  return cache;
}

function persist() {
  if (!cache) return;
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(cache));
  } catch { /* storage full/blocked — in-memory copy still works for the session */ }
}

function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

/** All rows of a collection (cloned). Unknown tables read as empty — never real data. */
export function demoGetAll(table: string): any[] {
  const store = load();
  const rows = store[table];
  return rows ? clone(rows) : [];
}

/** Raw (mutable) rows — internal use by the query layer only. */
export function demoGetRaw(table: string): any[] {
  const store = load();
  if (!store[table]) store[table] = [];
  return store[table];
}

export function demoInsert(table: string, rows: any[]): any[] {
  const store = load();
  if (!store[table]) store[table] = [];
  const inserted = rows.map((input) => {
    const row = clone(mapDeep(input)) as Record<string, any>;
    if (row.id == null) row.id = nextDemoId(table.slice(0, 3) || 'row');
    if (row.created_at == null) row.created_at = new Date().toISOString();
    store[table].push(row);
    return clone(row);
  });
  persist();
  return inserted;
}

export function demoUpdate(table: string, match: (row: any) => boolean, patch: Record<string, any>): any[] {
  const store = load();
  if (!store[table]) return [];
  const cleanPatch = clone(mapDeep(patch)) as Record<string, any>;
  delete cleanPatch.id;
  const updated: any[] = [];
  for (const row of store[table]) {
    if (!match(row)) continue;
    Object.assign(row, cleanPatch);
    row.updated_at = new Date().toISOString();
    updated.push(clone(row));
  }
  if (updated.length) persist();
  return updated;
}

export function demoDelete(table: string, match: (row: any) => boolean): any[] {
  const store = load();
  if (!store[table]) return [];
  const kept: any[] = [];
  const removed: any[] = [];
  for (const row of store[table]) {
    if (match(row)) removed.push(clone(row));
    else kept.push(row);
  }
  store[table] = kept;
  if (removed.length) persist();
  return removed;
}

export function demoUpsert(table: string, rows: any[], onConflict?: string[]): any[] {
  const store = load();
  if (!store[table]) store[table] = [];
  const out: any[] = [];
  for (const input of rows) {
    const row = clone(mapDeep(input)) as Record<string, any>;
    let existing: any = null;
    if (onConflict && onConflict.length) {
      existing = store[table].find((r) => onConflict.every((c) => String(r?.[c]) === String(row?.[c])));
    } else if (row.id != null) {
      existing = store[table].find((r) => String(r?.id) === String(row.id));
    }
    if (existing) {
      Object.assign(existing, row);
      existing.updated_at = new Date().toISOString();
      out.push(clone(existing));
    } else {
      if (row.id == null) row.id = nextDemoId(table.slice(0, 3) || 'row');
      if (row.created_at == null) row.created_at = new Date().toISOString();
      store[table].push(row);
      out.push(clone(row));
    }
  }
  persist();
  return out;
}

/** Find one demo student profile by id (or null). */
export function demoFindStudent(id: string): any | null {
  const rows = demoGetAll('profiles');
  return rows.find((r) => r.id === id && r.id !== DEMO_COACH_ID) ?? null;
}

/** Is this id a demo student / demo coach / demo-shaped id? */
export function isDemoEntityId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  if (id === DEMO_COACH_ID) return true;
  return demoGetAll('profiles').some((p) => p.id === id) || /-00000000-0000-4000-8000-\d{12}$/.test(id) || id.startsWith('demo-');
}
