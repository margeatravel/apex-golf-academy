import { expect, test } from 'bun:test';
import { STAFF_ACCESS_AREAS, ALLOWED_STAFF_SCOPES } from '../supabase/functions/_shared/staff-scopes';
import { getStaffLandingRoute } from '../src/lib/staffLanding';

for (const [scope, route] of [
  ['calendar', '/admin/calendar'],
  ['pro_zone', '/admin/pro-zone'],
  ['plans_billing', '/admin/plans-billing'],
  ['lesson_pricing', '/admin/pricing'],
  ['google_calendar', '/admin/integrations/google-calendar'],
  ['stripe', '/admin/integrations/stripe'],
]) {
  test(`${scope} is an independently assignable staff area`, () => {
    expect(STAFF_ACCESS_AREAS.find(area => area.id === scope)?.route).toBe(route);
    expect(getStaffLandingRoute([scope])).toBe('/staff');
  });
}
test('no other administrative areas remain assignable', () => {
  expect(ALLOWED_STAFF_SCOPES).toHaveLength(6);
  for (const scope of ['students', 'lessons', 'settings', 'revenue', 'subscribers', 'analysis_requests', 'stripe_payments']) {
    expect(ALLOWED_STAFF_SCOPES.includes(scope)).toBe(false);
    expect(getStaffLandingRoute([scope])).toBeNull();
  }
});