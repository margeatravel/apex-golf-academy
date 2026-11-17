/**
 * Hardcoded fake data for "Demo Mode" — pure client-side display.
 * No data here is ever written; nothing here ever hits the backend.
 * All values are illustrative for screenshots / demos.
 */

import type { SlotItem } from '@/components/calendar/calendarTypes';
import { toISODate } from '@/components/calendar/calendarTypes';

// ── Stable fake IDs ----------------------------------------------------------
const id = (prefix: string, n: number) =>
  `${prefix}-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};
const isoMonthsAgo = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
};
const isoMonthsAhead = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
};

// ── STUDENTS (20) -----------------------------------------------------------
// Shape matches what AdminStudents.useQuery returns (profile + computed fields)
type DemoStudent = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  handicap: number | null;
  goals: string | null;
  created_at: string;
  plan_tier: string | null;
  manual_plan_override: string | null;
  override_expires_at: string | null;
  assigned_coach_id: string | null;
  // derived
  lessonCount: number;
  videoCount: number;
  packageCount: number;
  totalPaid: number;
  effectivePlan: string;
  isOverride: boolean;
  subStatus: string | null;
  activePackageRemaining: number | null;
  activePackageSize: number | null;
};

const STUDENT_DEFS: Array<{
  n: number;
  name: string;
  pkg: 'scratch' | 'pro' | 'apex' | 'none';
  state: 'active' | 'draft' | 'expired' | 'pending_ar' | 'loose';
  remaining: number;
  size: number;
  ar: number;
  plan: 'free' | 'scratch' | 'pro' | 'apex';
  subStatus: string | null;
}> = [
  { n: 1,  name: 'Carlos Mendoza',     pkg: 'scratch', state: 'active',     remaining: 4,  size: 10, ar: 0,    plan: 'scratch', subStatus: null },
  { n: 2,  name: 'Ana Rodríguez',      pkg: 'pro',     state: 'pending_ar', remaining: 6,  size: 10, ar: 2500, plan: 'pro',     subStatus: null },
  { n: 3,  name: 'Jorge Herrera',      pkg: 'apex',    state: 'active',     remaining: 8,  size: 10, ar: 0,    plan: 'apex',    subStatus: 'active' },
  { n: 4,  name: 'Laura Vega',         pkg: 'none',    state: 'loose',      remaining: 0,  size: 0,  ar: 0,    plan: 'free',    subStatus: null },
  { n: 5,  name: 'Roberto Salinas',    pkg: 'pro',     state: 'draft',      remaining: 10, size: 10, ar: 0,    plan: 'free',    subStatus: null },
  { n: 6,  name: 'Miguel Torres',      pkg: 'scratch', state: 'expired',    remaining: 0,  size: 10, ar: 0,    plan: 'free',    subStatus: null },
  { n: 7,  name: 'Sofía Ramírez',      pkg: 'apex',    state: 'active',     remaining: 12, size: 20, ar: 0,    plan: 'pro',     subStatus: 'active' },
  { n: 8,  name: 'Diego Castillo',     pkg: 'pro',     state: 'active',     remaining: 2,  size: 10, ar: 0,    plan: 'pro',     subStatus: null },
  { n: 9,  name: 'Valentina Cruz',     pkg: 'none',    state: 'pending_ar', remaining: 0,  size: 0,  ar: 1800, plan: 'free',    subStatus: null },
  { n: 10, name: 'Andrés Morales',     pkg: 'scratch', state: 'active',     remaining: 6,  size: 10, ar: 0,    plan: 'scratch', subStatus: 'active' },
  { n: 11, name: 'Gabriela Flores',    pkg: 'apex',    state: 'active',     remaining: 10, size: 20, ar: 0,    plan: 'apex',    subStatus: null },
  { n: 12, name: 'Emilio Reyes',       pkg: 'pro',     state: 'pending_ar', remaining: 5,  size: 10, ar: 3200, plan: 'pro',     subStatus: null },
  { n: 13, name: 'Isabella Martínez',  pkg: 'scratch', state: 'draft',      remaining: 10, size: 10, ar: 0,    plan: 'free',    subStatus: null },
  { n: 14, name: 'Sebastián López',    pkg: 'pro',     state: 'active',     remaining: 5,  size: 10, ar: 0,    plan: 'apex',    subStatus: null },
  { n: 15, name: 'Camila Jiménez',     pkg: 'none',    state: 'loose',      remaining: 0,  size: 0,  ar: 0,    plan: 'free',    subStatus: null },
  { n: 16, name: 'Rodrigo Peña',       pkg: 'pro',     state: 'expired',    remaining: 0,  size: 10, ar: 0,    plan: 'free',    subStatus: null },
  { n: 17, name: 'Mariana Soto',       pkg: 'apex',    state: 'active',     remaining: 15, size: 20, ar: 0,    plan: 'apex',    subStatus: null },
  { n: 18, name: 'Fernando Díaz',      pkg: 'scratch', state: 'active',     remaining: 3,  size: 10, ar: 0,    plan: 'scratch', subStatus: 'active' },
  { n: 19, name: 'Lucía Vargas',       pkg: 'pro',     state: 'active',     remaining: 7,  size: 10, ar: 0,    plan: 'pro',     subStatus: null },
  { n: 20, name: 'Alejandro Ruiz',     pkg: 'pro',     state: 'pending_ar', remaining: 4,  size: 10, ar: 4100, plan: 'apex',    subStatus: null },
];

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.');

export const demoStudents: DemoStudent[] = STUDENT_DEFS.map((s) => ({
  id: id('std', s.n),
  email: `${slug(s.name)}@demo.apexgolf.com.mx`,
  full_name: s.name,
  phone: `+52 998 ${String(1000000 + s.n * 7331).slice(0, 7)}`,
  photo_url: null,
  handicap: 8 + ((s.n * 3) % 22),
  goals: 'Bajar handicap, ganar consistencia.',
  created_at: isoMonthsAgo(2 + (s.n % 18)),
  plan_tier: s.plan === 'free' ? null : s.plan,
  manual_plan_override: null,
  override_expires_at: null,
  assigned_coach_id: id('coach', 1),
  lessonCount: 6 + ((s.n * 5) % 35),
  videoCount: ((s.n * 3) % 12),
  packageCount: s.pkg === 'none' ? 0 : 1,
  totalPaid:
    s.pkg === 'apex' ? 14999 :
    s.pkg === 'pro' ? 7999 :
    s.pkg === 'scratch' ? 4999 :
    1200,
  effectivePlan: s.plan === 'free' ? 'free' : s.plan,
  isOverride: false,
  subStatus: s.subStatus,
  activePackageRemaining: s.state === 'expired' || s.state === 'loose' || s.state === 'draft' ? null : s.remaining,
  activePackageSize: s.pkg === 'none' ? null : s.size,
}));

// ── PROFILES list (lightweight) used by hooks that select profiles only ─────
export const demoProfiles = demoStudents.map((s) => ({
  id: s.id,
  full_name: s.full_name,
  email: s.email,
}));

// ── CLASS PACKAGES ──────────────────────────────────────────────────────────
export const demoClassPackages = STUDENT_DEFS.filter((s) => s.pkg !== 'none').map((s, i) => ({
  id: id('pkg', s.n),
  user_id: id('std', s.n),
  package_name: s.size === 20 ? '20 clases' : '10 clases',
  package_size: s.size,
  classes_remaining: s.remaining,
  classes_used: s.size - s.remaining,
  price: s.size === 20 ? 24000 : 13000,
  amount_paid: s.state === 'pending_ar'
    ? (s.size === 20 ? 24000 : 13000) - s.ar
    : (s.state === 'draft' ? 0 : (s.size === 20 ? 24000 : 13000)),
  payment_status:
    s.state === 'draft' ? 'draft' :
    s.state === 'pending_ar' ? 'partial' :
    s.state === 'expired' ? 'paid' : 'paid',
  payment_date: s.state === 'draft' ? null : isoDaysAgo(15 + (s.n % 60)),
  is_active: s.state === 'active' || s.state === 'pending_ar',
  created_at: isoDaysAgo(20 + (s.n % 90)),
  imported: false,
  ar_status: s.state === 'draft' ? 'draft' : (s.state === 'pending_ar' ? 'unpaid' : 'paid'),
  duplicate_status: null,
}));

// ── PACKAGE_PAYMENTS (one row per package paid) ─────────────────────────────
export const demoPackagePayments = demoClassPackages
  .filter((p) => p.amount_paid > 0)
  .map((p, i) => ({
    id: id('ppay', i + 1),
    amount: p.amount_paid,
    payment_date: p.payment_date,
    package_id: p.id,
    payment_method: i % 2 === 0 ? 'transfer' : 'cash',
    notes: null,
    created_at: p.payment_date,
  }));

// ── MANUAL LESSON PAYMENTS (payments table) ─────────────────────────────────
export const demoManualLessonPayments = [
  { id: id('mpay', 1), amount: 1200, payment_date: isoDaysAgo(2),  payment_method: 'cash',     concept: 'Clase suelta', notes: null, student_id: demoStudents[3].id,  created_at: isoDaysAgo(2)  },
  { id: id('mpay', 2), amount: 1200, payment_date: isoDaysAgo(5),  payment_method: 'transfer', concept: 'Clase suelta', notes: null, student_id: demoStudents[14].id, created_at: isoDaysAgo(5)  },
  { id: id('mpay', 3), amount: 2400, payment_date: isoDaysAgo(7),  payment_method: 'cash',     concept: 'Playing lesson', notes: null, student_id: demoStudents[7].id,  created_at: isoDaysAgo(7)  },
  { id: id('mpay', 4), amount: 1200, payment_date: isoDaysAgo(9),  payment_method: 'transfer', concept: 'Clase suelta', notes: null, student_id: demoStudents[3].id,  created_at: isoDaysAgo(9)  },
  { id: id('mpay', 5), amount: 1500, payment_date: isoDaysAgo(12), payment_method: 'cash',     concept: 'Clase suelta', notes: null, student_id: demoStudents[14].id, created_at: isoDaysAgo(12) },
  { id: id('mpay', 6), amount: 1200, payment_date: isoDaysAgo(15), payment_method: 'transfer', concept: 'Clase suelta', notes: null, student_id: demoStudents[3].id,  created_at: isoDaysAgo(15) },
  { id: id('mpay', 7), amount: 1200, payment_date: isoDaysAgo(18), payment_method: 'cash',     concept: 'Clase suelta', notes: null, student_id: demoStudents[14].id, created_at: isoDaysAgo(18) },
  { id: id('mpay', 8), amount: 1500, payment_date: isoDaysAgo(22), payment_method: 'transfer', concept: 'Clase suelta', notes: null, student_id: demoStudents[8].id,  created_at: isoDaysAgo(22) },
  { id: id('mpay', 9), amount: 1200, payment_date: isoDaysAgo(26), payment_method: 'cash',     concept: 'Clase suelta', notes: null, student_id: demoStudents[3].id,  created_at: isoDaysAgo(26) },
];

// ── STRIPE SUBSCRIPTIONS (6) ────────────────────────────────────────────────
type DemoSubscription = {
  id: string;
  student_id: string | null;
  student_email: string | null;
  student_name: string | null;
  plan_name: string | null;
  plan_tier: string | null;
  billing_interval: string;
  status: string;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  is_active: boolean;
  student_matched: boolean;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  last_synced_at: string | null;
  billing_plan_id: string | null;
  paused_at: string | null;
  archived_at: string | null;
  billing_plans: { price_amount: number; billing_interval: string; currency: string };
  created_at: string;
};

const SUB_DEFS = [
  // Apex subscribers — must map to existing demo students with plan: 'apex'
  // so they appear matched in the Subscribers tab AND inherit the apex tier
  // tint in the recurring/live calendar (both already schedule these IDs).
  { name: 'Gabriela Flores', email: 'gabriela.flores@demo.apexgolf.com.mx', tier: 'apex',    amount: 14999, months: 14 },
  { name: 'Mariana Soto',    email: 'mariana.soto@demo.apexgolf.com.mx',    tier: 'apex',    amount: 14999, months: 11 },
  { name: 'Sofía Ramírez',   email: 'sofia.ramirez@demo.apexgolf.com.mx',   tier: 'pro',     amount: 999,   months: 6  },
  { name: 'Jorge Herrera',   email: 'jorge.herrera@demo.apexgolf.com.mx',   tier: 'pro',     amount: 999,   months: 8  },
  { name: 'Andrés Morales',  email: 'andres.morales@demo.apexgolf.com.mx',  tier: 'scratch', amount: 599,   months: 3  },
  { name: 'Fernando Díaz',   email: 'fernando.diaz@demo.apexgolf.com.mx',   tier: 'scratch', amount: 599,   months: 2  },
];

// 7th subscription: a canceled scratch subscriber so the Subscribers tab
// has Active:6, Canceled:1, Total:7 KPIs.
const SUB_DEFS_CANCELED = [
  { name: 'Patricia Núñez',  email: 'patricia.nunez@demo.apexgolf.com.mx',  tier: 'scratch', amount: 599,   months: 4 },
];

const buildSub = (s: typeof SUB_DEFS[number], i: number, canceled = false): DemoSubscription => {
  const match = demoStudents.find((st) => st.email === s.email);
  return {
    id: id('sub', i + 1),
    student_id: match?.id ?? id('sub-stud', i + 1),
    student_email: s.email,
    student_name: s.name,
    plan_name: s.tier === 'apex' ? 'Apex Level' : s.tier === 'pro' ? 'Pro' : 'Scratch',
    plan_tier: s.tier,
    billing_interval: 'month',
    status: canceled ? 'canceled' : 'active',
    started_at: isoMonthsAgo(s.months),
    current_period_start: isoDaysAgo(5),
    current_period_end: canceled ? isoDaysAgo(2) : isoMonthsAhead(1),
    canceled_at: canceled ? isoDaysAgo(2) : null,
    cancel_at_period_end: false,
    is_active: !canceled,
    student_matched: !!match,
    stripe_subscription_id: `sub_demo_${i + 1}`,
    stripe_customer_id: `cus_demo_${i + 1}`,
    stripe_price_id: `price_demo_${s.tier}`,
    last_synced_at: new Date().toISOString(),
    billing_plan_id: id('plan', i + 1),
    paused_at: null,
    archived_at: null,
    // price_amount is stored in CENTS (Stripe convention). The UI divides
    // by 100 to get MXN, so 14,999 MXN → 1,499,900 cents.
    billing_plans: { price_amount: s.amount * 100, billing_interval: 'month', currency: 'mxn' },
    created_at: isoMonthsAgo(s.months),
  };
};

export const demoSubscriptions: DemoSubscription[] = [
  ...SUB_DEFS.map((s, i) => buildSub(s, i)),
  ...SUB_DEFS_CANCELED.map((s, i) => buildSub(s, SUB_DEFS.length + i, true)),
];

// Hardcoded MRR per spec: 2×14999 + 2×999 + 2×599 = 33,194 MXN/month
// (excludes canceled subscription).
export const DEMO_MRR = 33194;
export const DEMO_ARR = DEMO_MRR * 12;

// ── STRIPE PAYMENTS ─────────────────────────────────────────────────────────
// 6 subscription transactions this month + 14 one-time this month + extras
const buildStripePayments = () => {
  const rows: any[] = [];
  let n = 1;
  // 6 subscription payments this month
  SUB_DEFS.forEach((s, i) => {
    rows.push({
      id: id('sp', n++),
      stripe_payment_id: `pi_demo_${n}`,
      stripe_customer_id: `cus_demo_${i + 1}`,
      stripe_subscription_id: `sub_demo_${i + 1}`,
      customer_email: s.email,
      customer_name: s.name,
      amount: s.amount,
      currency: 'mxn',
      status: 'succeeded',
      payment_type: 'subscription',
      description: `Suscripción ${s.tier === 'apex' ? 'Apex Level' : s.tier === 'pro' ? 'Pro' : 'Scratch'}`,
      paid_at: isoDaysAgo(i * 3 + 1),
      created_at: isoDaysAgo(i * 3 + 1),
      student_id: demoStudents.find((st) => st.email === s.email)?.id ?? null,
      student_matched: !!demoStudents.find((st) => st.email === s.email),
      refund_amount: 0,
      metadata: { plan_tier: s.tier },
    });
  });
  // 14 one-time payments this month (packages + lessons)
  const oneTimeAmounts = [14999, 7999, 4999, 14999, 7999, 4999, 14999, 7999, 4999, 2500, 1200, 1500, 1200, 7999];
  oneTimeAmounts.forEach((amount, i) => {
    const stud = demoStudents[i % demoStudents.length];
    rows.push({
      id: id('sp', n++),
      stripe_payment_id: `pi_demo_${n}`,
      stripe_customer_id: `cus_demo_ot_${i + 1}`,
      stripe_subscription_id: null,
      customer_email: stud.email,
      customer_name: stud.full_name,
      amount,
      currency: 'mxn',
      status: 'succeeded',
      payment_type: 'one_time',
      description: amount >= 4999 ? 'Paquete de clases' : 'Clase individual',
      paid_at: isoDaysAgo(i * 2 + 1),
      created_at: isoDaysAgo(i * 2 + 1),
      student_id: stud.id,
      student_matched: true,
      refund_amount: 0,
      metadata: {},
    });
  });
  return rows;
};

export const demoStripePayments = buildStripePayments();

// ── DEMO LESSONS (recent + scheduled this month) ────────────────────────────
// Rotating weekday schedule used by both calendar generators and the lessons
// list. Tuples: [weekday (0=Sun..6=Sat), time HH:MM, studentIndex(1-based), type, duration]
type DaySlot = { time: string; studentN: number; type: string; duration: number };

const SCHEDULE: Record<number, DaySlot[]> = {
  1: [ // Mon
    { time: '07:00', studentN: 1,  type: 'individual', duration: 60 },
    { time: '08:00', studentN: 2,  type: 'individual', duration: 60 },
    { time: '09:00', studentN: 3,  type: 'individual', duration: 60 },
    { time: '10:00', studentN: 7,  type: 'individual', duration: 60 },
    { time: '11:00', studentN: 8,  type: 'playing_lesson', duration: 120 },
  ],
  2: [ // Tue
    { time: '07:00', studentN: 4,  type: 'individual', duration: 60 },
    { time: '08:00', studentN: 5,  type: 'individual', duration: 60 },
    { time: '09:00', studentN: 6,  type: 'individual', duration: 60 },
    { time: '10:00', studentN: 9,  type: 'individual', duration: 60 },
    { time: '11:00', studentN: 10, type: 'individual', duration: 60 },
  ],
  3: [ // Wed
    { time: '07:00', studentN: 11, type: 'individual', duration: 60 },
    { time: '08:00', studentN: 12, type: 'individual', duration: 60 },
    { time: '09:00', studentN: 13, type: 'individual', duration: 60 },
    { time: '10:00', studentN: 14, type: 'individual', duration: 60 },
    { time: '11:00', studentN: 15, type: 'playing_lesson', duration: 120 },
  ],
  4: [ // Thu
    { time: '07:00', studentN: 16, type: 'individual', duration: 60 },
    { time: '08:00', studentN: 17, type: 'individual', duration: 60 },
    { time: '09:00', studentN: 18, type: 'individual', duration: 60 },
    { time: '10:00', studentN: 19, type: 'individual', duration: 60 },
    { time: '11:00', studentN: 20, type: 'individual', duration: 60 },
  ],
  5: [ // Fri
    { time: '07:00', studentN: 1,  type: 'individual', duration: 60 },
    { time: '08:00', studentN: 2,  type: 'individual', duration: 60 },
    { time: '09:00', studentN: 3,  type: 'individual', duration: 60 },
    { time: '10:00', studentN: 7,  type: 'individual', duration: 60 },
  ],
  6: [ // Sat
    { time: '07:00', studentN: 6,  type: 'individual', duration: 60 },
    { time: '08:00', studentN: 9,  type: 'individual', duration: 60 },
    { time: '09:00', studentN: 10, type: 'individual', duration: 60 },
  ],
};

const FRI_BLOCK = { start_time: '11:00', end_time: '13:00', reason: 'Almuerzo / reservado' };

// ── DEMO OPEN SPOTS ─────────────────────────────────────────────────────────
// Unclaimed weekly slots (student_id = null) so the Coach Demo Live Calendar
// and Recurring Schedule both show claimable "Open" tiles, matching the look
// of a real coach with availability published.
// Tuple: [weekday(0=Sun..6=Sat), HH:MM, lesson_type, duration, notes?]
const OPEN_SPOT_DEFS: Array<[number, string, string, number, string | null]> = [
  [1, '12:00', 'Range',          60, 'Morning spot'],
  [2, '12:00', 'Range',          60, null],
  [3, '12:00', 'Range',          60, null],
  [3, '15:00', 'Playing Lesson', 120, 'Afternoon — playing lesson'],
  [4, '12:00', 'Range',          60, null],
  [5, '10:00', 'Range',          60, null],
  [6, '10:00', 'Range',          60, null],
  [6, '11:00', 'Range',          60, null],
];

export const demoOpenSpots: Array<{
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  lesson_type: string;
  student_id: string | null;
  is_available: boolean;
  notes: string | null;
  profile: null;
}> = OPEN_SPOT_DEFS.map(([wd, time, type, dur, notes], i) => ({
  id: `demo-open-${i + 1}`,
  day_of_week: wd,
  start_time: `${time}:00`,
  duration_minutes: dur,
  lesson_type: type,
  student_id: null as string | null,
  is_available: true,
  notes,
  profile: null,
}));

/**
 * Append one or more open spots to the in-memory demo store so the Coach
 * Demo "Post open spot" flow reflects in the UI without touching the DB.
 * Returns the freshly-created rows.
 */
export function addDemoOpenSpots(
  rows: Array<{
    day_of_week: number;
    start_time: string;
    duration_minutes: number;
    lesson_type: string;
    notes: string | null;
  }>,
) {
  const created = rows.map((r, i) => ({
    id: `demo-open-user-${Date.now()}-${i}`,
    day_of_week: r.day_of_week,
    start_time: r.start_time.length === 5 ? `${r.start_time}:00` : r.start_time,
    duration_minutes: r.duration_minutes,
    lesson_type: r.lesson_type,
    student_id: null as string | null,
    is_available: true,
    notes: r.notes,
    profile: null,
  }));
  demoOpenSpots.push(...created);
  return created;
}

/** Build a calendar week map for arbitrary weekDates. */
export function buildDemoCalendarWeek(weekDates: Date[]): Record<string, SlotItem[]> {
  const map: Record<string, SlotItem[]> = {};
  for (const d of weekDates) {
    const iso = toISODate(d);
    const wd = d.getDay();
    const slots: SlotItem[] = [];
    const daySlots = SCHEDULE[wd] || [];
    for (const s of daySlots) {
      const stud = demoStudents[s.studentN - 1];
      slots.push({
        id: `demo-${iso}-${s.time}`,
        kind: 'fixed',
        date: iso,
        start_time: s.time,
        duration_minutes: s.duration,
        lesson_type: s.type,
        student_id: stud.id,
        student_name: stud.full_name,
        recurring_slot_id: `demo-rec-${s.studentN}-${wd}`,
        lesson_id: `demo-lesson-${iso}-${s.time}`,
        status: 'scheduled',
        package_id: `demo-pkg-${s.studentN}`,
        has_active_subscription: !!demoSubscriptions.find((sub) => sub.student_id === stud.id),
        subscription_tier: (demoSubscriptions.find((sub) => sub.student_id === stud.id)?.plan_tier as any) ?? null,
        raw: {},
      });
    }
    // Unclaimed open spots for this weekday — claimable by Scratch/Pro students.
    for (const o of demoOpenSpots) {
      if (o.day_of_week !== wd) continue;
      const t = o.start_time.slice(0, 5);
      slots.push({
        id: `demo-open-${iso}-${t}`,
        kind: 'open',
        date: iso,
        start_time: t,
        duration_minutes: o.duration_minutes,
        lesson_type: o.lesson_type,
        student_id: null,
        student_name: null,
        recurring_slot_id: null,
        notes: o.notes,
        raw: { open: o },
      });
    }
    if (wd === 5) {
      slots.push({
        id: `demo-block-${iso}`,
        kind: 'blocked',
        date: iso,
        start_time: FRI_BLOCK.start_time,
        duration_minutes: 120,
        lesson_type: 'Blocked',
        notes: FRI_BLOCK.reason,
        raw: {},
      });
    }
    map[iso] = slots;
  }
  return map;
}

/** Build lesson rows (for AdminLessons & Revenue) for ±N days around today. */
export function buildDemoLessons(daysBack = 60, daysAhead = 30): any[] {
  const out: any[] = [];
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  let counter = 1;
  for (let i = 0; i < daysBack + daysAhead; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);
    const wd = d.getDay();
    const daySlots = SCHEDULE[wd] || [];
    const isPast = d.getTime() < Date.now();
    for (const s of daySlots) {
      const stud = demoStudents[s.studentN - 1];
      out.push({
        id: id('les', counter++),
        student_id: stud.id,
        lesson_date: iso,
        lesson_time: s.time + ':00',
        duration_minutes: s.duration,
        lesson_type: s.type,
        status: isPast ? 'completed' : 'scheduled',
        revenue: isPast ? (s.type === 'playing_lesson' ? 2400 : 1200) : 0,
        recurring_slot_id: `demo-rec-${s.studentN}-${wd}`,
        skipped: false,
        skip_keep_closed: false,
        invitee_name: null,
        invitee_email: null,
        package_id: `demo-pkg-${s.studentN}`,
        imported: false,
        payment_method: 'package',
        ar_status: 'paid',
        notes: null,
        profiles: { id: stud.id, full_name: stud.full_name, email: stud.email },
      });
    }
  }
  return out;
}

/** Coach availability blocks (Friday 11-1) for current week. */
export function buildDemoBlocks(daysBack = 30, daysAhead = 30): any[] {
  const out: any[] = [];
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  for (let i = 0; i < daysBack + daysAhead; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === 5) {
      out.push({
        id: `demo-blk-${toISODate(d)}`,
        block_date: toISODate(d),
        start_time: '11:00:00',
        end_time: '13:00:00',
        reason: FRI_BLOCK.reason,
      });
    }
  }
  return out;
}

// ── Aggregate stats ─────────────────────────────────────────────────────────
export const DEMO_PACKAGE_SUMMARY = {
  active: 12,
  drafts: 3,
  expired: 2,
  totalAR: 23200,
};

export const DEMO_REVENUE_SUMMARY = {
  mtd: 80694,
  last30: 87400,
  last90: 242800,
  ytd: 534200,
  stripeSubsThisMonth: 6,
  stripeOneTimeThisMonth: 14,
  manualThisMonth: 9,
  arUnpaid: 23200,
  mrr: DEMO_MRR,
  arr: DEMO_ARR,
};

// Explicit recurring slots (20) — Coach Demo's weekly priority spots.
// Tuple: [studentN, weekday(0=Sun..6=Sat), HH:MM, type, duration]
const RECURRING_DEFS: Array<[number, number, string, string, number]> = [
  [1,  1, '07:00', 'individual',      60],  // Carlos     Lun
  [2,  1, '08:00', 'individual',      60],  // Ana
  [3,  1, '09:00', 'individual',      60],  // Jorge
  [7,  1, '10:00', 'individual',      60],  // Sofía
  [8,  2, '07:00', 'playing_lesson', 120],  // Diego      Mar
  [4,  2, '08:00', 'individual',      60],  // Laura
  [5,  2, '09:00', 'individual',      60],  // Roberto
  [6,  2, '10:00', 'individual',      60],  // Miguel
  [9,  3, '07:00', 'individual',      60],  // Valentina  Mié
  [10, 3, '08:00', 'individual',      60],  // Andrés
  [11, 3, '09:00', 'individual',      60],  // Gabriela
  [12, 3, '10:00', 'individual',      60],  // Emilio
  [13, 4, '07:00', 'individual',      60],  // Isabella   Jue
  [14, 4, '08:00', 'individual',      60],  // Sebastián
  [15, 4, '09:00', 'individual',      60],  // Camila
  [16, 4, '10:00', 'individual',      60],  // Rodrigo
  [17, 5, '07:00', 'individual',      60],  // Mariana    Vie
  [18, 5, '08:00', 'individual',      60],  // Fernando
  [19, 5, '09:00', 'individual',      60],  // Lucía
  [20, 6, '07:00', 'individual',      60],  // Alejandro  Sáb
];

export const demoRecurringSlots: any[] = RECURRING_DEFS.map(([n, wd, time, type, dur], i) => {
  const stud = demoStudents[n - 1];
  return {
    id: `demo-rec-${n}-${wd}`,
    student_id: id('std', n),
    weekday: wd,
    start_time: `${time}:00`,
    duration_minutes: dur,
    lesson_type: type,
    notes: null,
    is_active: true,
    package_id: id('pkg', n),
    no_package_intentional: false,
    profile: { id: stud.id, full_name: stud.full_name, email: stud.email },
    shared_with: [],
    has_active_subscription: !!demoSubscriptions.find((sub) => sub.student_id === stud.id),
    subscription_tier: (demoSubscriptions.find((sub) => sub.student_id === stud.id)?.plan_tier as any) ?? null,
  };
});

/** All fixed_schedule_slots rows shown in Coach Demo (claimed + open). */
export function getDemoFixedScheduleSlots() {
  return [
    ...RECURRING_DEFS.map(([n, wd, time, type, dur]) => {
    const stud = demoStudents[n - 1];
    return {
      id: `demo-fixed-${n}-${wd}`,
      day_of_week: wd,
      start_time: `${time}:00`,
      duration_minutes: dur,
      lesson_type: type,
      student_id: stud.id,
      is_available: false,
      notes: null as string | null,
      profile: { id: stud.id, full_name: stud.full_name, email: stud.email },
    };
    }),
    ...demoOpenSpots,
  ];
}

export const demoBillingPlans = [
  // price_amount is in CENTS (Stripe convention).
  { id: id('plan', 1), stripe_price_id: 'price_demo_apex',    price_amount: 14999 * 100, billing_interval: 'month', currency: 'mxn' },
  { id: id('plan', 2), stripe_price_id: 'price_demo_pro',     price_amount: 999   * 100, billing_interval: 'month', currency: 'mxn' },
  { id: id('plan', 3), stripe_price_id: 'price_demo_scratch', price_amount: 599   * 100, billing_interval: 'month', currency: 'mxn' },
];

// ── DEMO LESSON PRICING (matches academy_settings.lesson_pricing shape) ─────
// Source of truth for booking modal, package picker, and settings preview
// when Demo Mode is active. Mirrors the LessonPricingData interface in
// AdminSettings.tsx.
export const demoLessonPricing = {
  individual_price: 1500,
  pro_individual_price: 1500,
  individual_price_id: 'price_demo_individual',
  pro_individual_price_id: 'price_demo_individual_pro',
  packages: [
    { lessons: 10, price: 13000, price_id: 'price_demo_pkg10', pro_price: 11500, pro_price_id: 'price_demo_pkg10_pro' },
    { lessons: 20, price: 24000, price_id: 'price_demo_pkg20', pro_price: 21000, pro_price_id: 'price_demo_pkg20_pro' },
    { lessons: 30, price: 33000, price_id: 'price_demo_pkg30', pro_price: 28500, pro_price_id: 'price_demo_pkg30_pro' },
  ],
  additional_products: [
    { name: 'Video Analysis', price: 550, price_id: 'price_demo_video', description: 'Video analysis with coach feedback', all_tiers: true },
  ],
};

// Subscription plan prices (MXN/month) — enforce everywhere in demo.
export const demoSubscriptionPlanPrices = {
  scratch: 599,
  pro: 999,
  apex: 14999,
};

// ── COACH PROFILE (header / nav / share section) ────────────────────────────
export const demoCoachProfile = {
  full_name: 'Coach Demo',
  initials: 'CD',
  email: 'coach.demo@apexgolf.com.mx',
  photo_url: null as string | null,
};

export const demoCoachCode = 'DEMO0000';
export const demoAccessCode = 'DEMO0001';
export const demoSiteLink = 'demo.apexgolf.com.mx';

// ── FREE TRIAL SETTINGS ─────────────────────────────────────────────────────
export const demoFreeTrialDefaultDays = 30;

const trialEnd = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
};

// 5 active, 3 expired = 8 total. No "no-trial" rows.
export const demoFreeTrialStudents = [
  { id: demoStudents[0].id,  full_name: 'Carlos Mendoza',    email: demoStudents[0].email,  trial_ends_at: trialEnd(22) },
  { id: demoStudents[1].id,  full_name: 'Ana Rodríguez',     email: demoStudents[1].email,  trial_ends_at: trialEnd(18) },
  { id: demoStudents[6].id,  full_name: 'Sofía Ramírez',     email: demoStudents[6].email,  trial_ends_at: trialEnd(12) },
  { id: demoStudents[7].id,  full_name: 'Diego Castillo',    email: demoStudents[7].email,  trial_ends_at: trialEnd(7)  },
  { id: demoStudents[9].id,  full_name: 'Andrés Morales',    email: demoStudents[9].email,  trial_ends_at: trialEnd(3)  },
  { id: demoStudents[5].id,  full_name: 'Miguel Torres',     email: demoStudents[5].email,  trial_ends_at: trialEnd(-5) },
  { id: demoStudents[15].id, full_name: 'Rodrigo Peña',      email: demoStudents[15].email, trial_ends_at: trialEnd(-12) },
  { id: demoStudents[12].id, full_name: 'Isabella Martínez', email: demoStudents[12].email, trial_ends_at: trialEnd(-2) },
];

// ── PER-STUDENT PROFILE HELPERS (for AdminStudentDetail in Demo Mode) ───────

export function getDemoStudentById(studentId: string) {
  return demoStudents.find((s) => s.id === studentId) || null;
}

/** Synthesize past completed lessons for a demo student based on lessonCount. */
export function getDemoLessonsForStudent(studentId: string): any[] {
  const stud = getDemoStudentById(studentId);
  if (!stud) return [];
  const count = Math.max(0, Number(stud.lessonCount) || 0);
  const pkg = demoClassPackages.find((p) => p.user_id === studentId) || null;
  const out: any[] = [];
  for (let i = 0; i < count; i++) {
    const daysBack = 3 + i * 4;
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    const iso = toISODate(d);
    const isPlaying = i % 6 === 0;
    out.push({
      id: id(`les-stud-${stud.id.slice(-4)}`, i + 1),
      student_id: stud.id,
      lesson_date: iso,
      lesson_time: `${String(8 + (i % 9)).padStart(2, '0')}:00:00`,
      duration_minutes: isPlaying ? 120 : 60,
      lesson_type: isPlaying ? 'playing_lesson' : 'individual',
      status: 'completed',
      revenue: isPlaying ? 2400 : 1200,
      recurring_slot_id: null,
      skipped: false,
      skip_keep_closed: false,
      invitee_name: null,
      invitee_email: null,
      package_id: pkg ? pkg.id : null,
      imported: false,
      payment_method: pkg ? 'package' : 'cash',
      ar_status: 'paid',
      notes: null,
      attendee: { id: stud.id, full_name: stud.full_name, email: stud.email },
      profiles: { id: stud.id, full_name: stud.full_name, email: stud.email },
    });
  }
  return out;
}

/** Pre-enriched packages for the AdminStudentDetail packages section. */
export function getDemoEnrichedPackagesForStudent(studentId: string): any[] {
  const pkgs = demoClassPackages.filter((p) => p.user_id === studentId);
  const allLessons = getDemoLessonsForStudent(studentId);
  return pkgs.map((p) => {
    const used = Math.max(0, (p.package_size || 0) - (p.classes_remaining || 0));
    const pkgLessons = allLessons.filter((l) => l.package_id === p.id).slice(0, used);
    return {
      ...p,
      _isShared: false,
      _isOwner: true,
      _memberProfiles: [],
      _otherMemberNames: [],
      _allLessons: pkgLessons,
      _totalLessonsUsed: used,
      _totalLessonsRemaining: Math.max(0, (p.package_size || 0) - used),
    };
  });
}

export function getDemoPackagePaymentsForStudent(studentId: string): any[] {
  const pkgIds = demoClassPackages
    .filter((p) => p.user_id === studentId)
    .map((p) => p.id);
  return demoPackagePayments.filter((pp) => pkgIds.includes(pp.package_id));
}

export function getDemoManualPaymentsForStudent(studentId: string): any[] {
  return demoManualLessonPayments.filter((p) => p.student_id === studentId);
}

export function getDemoActiveSubscriptionForStudent(studentId: string): any | null {
  return (
    demoSubscriptions.find(
      (s) => s.student_id === studentId && s.is_active,
    ) || null
  );
}

export function getDemoStudentPoints(studentId: string): any {
  const lessons = getDemoLessonsForStudent(studentId);
  const total = lessons.length * 10;
  return {
    total_points: total,
    lifetime_points: total,
    total_lessons_ever: lessons.length,
    reward_available: total >= 100,
  };
}