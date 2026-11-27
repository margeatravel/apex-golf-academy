// Smoke test for the demo layer (not shipped): run with `npx tsx tests/demo-smoke.ts`.
const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};
(globalThis as any).localStorage = (globalThis as any).sessionStorage;

async function main() {
  const { DemoQueryBuilder, demoRpc, demoInvokeFunction, demoAvailableDays } = await import('@/lib/demoQuery');
  const { demoGetAll, DEMO_COACH_ID } = await import('@/lib/demoStore');
  const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

  // 1. Profiles: coach identity mapped (real Santiago id -> demo coach)
  const prof = await new DemoQueryBuilder('profiles').select('*').eq('id', '13480fb4-e4d2-423c-b035-c65846b061fc').single();
  assert(!prof.error && prof.data?.full_name === 'Coach Demo', `profile maps to Coach Demo (got ${prof.data?.full_name})`);

  // 2. Students list
  const students = await new DemoQueryBuilder('profiles').select('id, full_name').eq('assigned_coach_id', '13480fb4-e4d2-423c-b035-c65846b061fc');
  assert(!students.error && students.data.length === 20, `20 demo students (got ${students.data?.length})`);

  // 3. Embed: lessons with profiles
  const lessons = await new DemoQueryBuilder('lessons').select('*, profiles!lessons_student_id_fkey(full_name, email)').limit(3);
  assert(!lessons.error && lessons.data[0]?.profiles?.full_name, `lessons embed profiles (got ${lessons.data[0]?.profiles?.full_name})`);

  // 4. Embed with table:fk form (analysis requests)
  const reqs = await new DemoQueryBuilder('analysis_requests').select('*, profiles:student_id(full_name, email)');
  assert(!reqs.error && reqs.data.length === 4 && reqs.data[0]?.profiles?.full_name, `analysis_requests embed via table:fk (got ${reqs.data[0]?.profiles?.full_name})`);

  // 5. Count + head (NotificationBell)
  const bell = await new DemoQueryBuilder('notifications').select('*', { count: 'exact', head: true }).eq('user_id', DEMO_COACH_ID).is('read_at', null);
  assert(bell.data === null && bell.count === 3, `bell count head=3 (got count=${bell.count})`);

  // 6. Insert persists + survives (store is sessionStorage-backed)
  const ins = await new DemoQueryBuilder('lessons').insert({ student_id: demoGetAll('profiles')[1].id, lesson_date: '2026-11-28', lesson_time: '09:00:00', lesson_type: 'individual', status: 'scheduled' }).select();
  assert(!ins.error && ins.data?.[0]?.id?.includes('-00000000-0000-4000-8000-'), `insert returns demo id (${ins.data?.[0]?.id})`);
  const again = await new DemoQueryBuilder('lessons').select('id').eq('id', ins.data[0].id);
  assert(again.data.length === 1, 'inserted lesson readable back');

  // 7. Update + delete
  const upd = await new DemoQueryBuilder('lessons').update({ status: 'completed' }).eq('id', ins.data[0].id).select();
  assert(upd.data?.[0]?.status === 'completed', 'update works');
  const del = await new DemoQueryBuilder('lessons').delete().eq('id', ins.data[0].id).select();
  assert(del.data?.length === 1, 'delete returns removed row');

  // 8. Upsert booking_settings (id 'default')
  const ups = await new DemoQueryBuilder('booking_settings').upsert({ id: 'default', buffer_minutes: 15 }).select();
  assert(ups.data?.[0]?.buffer_minutes === 15, 'upsert booking_settings works');

  // 9. maybeSingle miss -> null, no error
  const miss = await new DemoQueryBuilder('profiles').select('*').eq('id', 'nope').maybeSingle();
  assert(miss.data === null && !miss.error, 'maybeSingle miss -> null');

  // 10. or() filter (family preview validation shape)
  const s1 = demoGetAll('profiles')[1].id;
  const s2 = demoGetAll('profiles')[7].id;
  const fam = await new DemoQueryBuilder('family_links').select('id').or(`and(parent_user_id.eq.${s1},child_user_id.eq.${s2}),and(child_user_id.eq.${s1},parent_user_id.eq.${s2})`).maybeSingle();
  assert(fam.data?.id, 'or() with and() groups finds family link');

  // 11. RPCs
  assert(demoRpc('can_preview_student', { _student_id: s1 }) === true, 'can_preview_student true for demo student');
  assert(demoRpc('can_preview_student', { _student_id: 'real-uuid-here' }) === false, 'can_preview_student false for unknown id');
  assert(Array.isArray(demoRpc('get_visible_recurring_slots', {})) && demoRpc('get_visible_recurring_slots', {}).length === 20, 'get_visible_recurring_slots returns 20');

  // 12. Functions
  const staff = demoInvokeFunction('manage-staff', { action: 'list' });
  assert(staff.staff.length === 2, `manage-staff list = 2 (got ${staff.staff.length})`);
  const invited = demoInvokeFunction('manage-staff', { action: 'invite', email: 'nueva@demo.com', scopes: ['pro_zone'] });
  assert(/^\d{6}$/.test(invited.pin), `manage-staff invite returns pin (${invited.pin})`);
  assert(demoInvokeFunction('manage-staff', { action: 'list' }).staff.length === 3, 'invite persisted in demo store');
  const lookup = demoInvokeFunction('lookup-invite', { code: 'DEMO0000' });
  assert(lookup.valid === true && lookup.inviter_name === 'Coach Demo', 'lookup-invite DEMO0000 valid');
  assert(demoInvokeFunction('lookup-invite', { code: 'XXXX' }).valid === false, 'lookup-invite unknown invalid');
  const accept = demoInvokeFunction('accept-invite', { code: 'demo0001' });
  assert(accept.assigned_coach_id === DEMO_COACH_ID, 'accept-invite DEMO0001 links demo coach');
  // create-checkout fake success is covered in section 16 (after the
  // subscription-count assertion, because a demo subscription purchase
  // changes the active-subscription count).
  const mail = demoInvokeFunction('send-notification-email', { to: 'real@x.com' });
  assert(mail && typeof mail === 'object', 'send-notification-email fake success');

  // 13. get-available-slots days
  const days = demoAvailableDays('2026-11-30', '2026-12-06');
  assert(days.length === 7 && days.some((d: any) => d.slots.length > 0), `available days generated (mon slots: ${days[0]?.slots?.length})`);

  // 14. Unknown table reads empty, never throws
  const unk = await new DemoQueryBuilder('some_future_table').select('*');
  assert(Array.isArray(unk.data) && unk.data.length === 0, 'unknown table -> []');

  // 15. Subscriptions + billing_plans embed
  const subs = await new DemoQueryBuilder('subscriptions').select('*, billing_plans(price_amount)').eq('is_active', true);
  assert(subs.data.length === 6 && subs.data[0]?.billing_plans?.price_amount, 'subscriptions embed billing_plans');

  // 16. Fake successful card payment in demo (Santiago, 27 Nov 2026)
  // 16a. Package purchase: url goes to the in-app success page, charge +
  //      entitlement land in the demo store, verify-checkout confirms it.
  const spBefore = demoGetAll('stripe_payments').length;
  const pkgBefore = demoGetAll('class_packages').length;
  const ppBefore = demoGetAll('package_payments').length;
  const pkgCheckout = demoInvokeFunction('create-checkout', { mode: 'payment', item: 'package', packageSize: 10 });
  assert(typeof pkgCheckout.url === 'string' && pkgCheckout.url.startsWith('/payment-success?session_id='), `package checkout returns in-app success url (${pkgCheckout.url})`);
  assert(demoGetAll('stripe_payments').length === spBefore + 1, 'package checkout records a stripe payment');
  assert(demoGetAll('class_packages').length === pkgBefore + 1, 'package checkout creates the package entitlement');
  assert(demoGetAll('package_payments').length === ppBefore + 1, 'package checkout records a package payment');
  const pkgSession = pkgCheckout.url.split('session_id=')[1];
  const pkgVerify = demoInvokeFunction('verify-checkout', { session_id: pkgSession });
  assert(pkgVerify.verified === true && pkgVerify.purchase_type === 'lesson_package' && pkgVerify.package_size === 10 && pkgVerify.amount === 13000 * 100, `verify package checkout (${JSON.stringify(pkgVerify)})`);
  assert(pkgVerify.entitlement?.package_id, 'package verify returns the entitlement');

  // 16b. Subscription purchase: buyer gets an active sub + plan_tier flip.
  const buyerId = demoGetAll('profiles')[1].id; // Carlos Mendoza (no active sub)
  const subCheckout = demoInvokeFunction('create-checkout', { priceId: 'price_demo_pro' });
  assert(subCheckout.url?.startsWith('/payment-success?session_id='), `subscription checkout returns success url (${subCheckout.url})`);
  const subVerify = demoInvokeFunction('verify-checkout', { session_id: subCheckout.url.split('session_id=')[1] });
  assert(subVerify.verified === true && subVerify.purchase_type === 'subscription' && subVerify.product_name === 'Pro' && subVerify.amount === 999 * 100, `verify subscription checkout (${JSON.stringify(subVerify)})`);
  const buyerSub = demoGetAll('subscriptions').find((s) => s.student_id === buyerId && s.is_active);
  assert(buyerSub?.plan_tier === 'pro', 'subscription checkout activates a Pro sub for the buyer');
  assert(demoGetAll('profiles').find((p) => p.id === buyerId)?.plan_tier === 'pro', 'buyer plan_tier flips to pro');

  // 16c. Individual lessons (quantity 2) + video analysis.
  const indCheckout = demoInvokeFunction('create-checkout', { mode: 'payment', item: 'individual', quantity: 2 });
  const indVerify = demoInvokeFunction('verify-checkout', { session_id: indCheckout.url.split('session_id=')[1] });
  assert(indVerify.verified === true && indVerify.purchase_type === 'individual_lesson' && indVerify.package_size === 2 && indVerify.amount === 1500 * 2 * 100, `verify individual checkout (${JSON.stringify(indVerify)})`);
  const arId = demoGetAll('analysis_requests')[0].id;
  const vidCheckout = demoInvokeFunction('create-checkout', { priceId: 'price_1TKlAhRw8gEMe8Y791V28Dm4', mode: 'payment', metadata: { analysis_request_id: arId } });
  const vidVerify = demoInvokeFunction('verify-checkout', { session_id: vidCheckout.url.split('session_id=')[1] });
  assert(vidVerify.verified === true && vidVerify.purchase_type === 'video_analysis' && vidVerify.amount === 550 * 100, `verify video checkout (${JSON.stringify(vidVerify)})`);
  assert(demoGetAll('analysis_requests').find((r) => r.id === arId)?.payment_status === 'paid', 'video checkout marks the analysis request paid');

  // 16d. Unknown session does not verify.
  const badVerify = demoInvokeFunction('verify-checkout', { session_id: 'csd-nope' });
  assert(badVerify.verified === false, 'verify unknown session -> not verified');

  console.log('\nALL DEMO SMOKE TESTS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
