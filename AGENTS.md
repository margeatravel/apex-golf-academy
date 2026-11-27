## Demo Mode (Margea Golf Academy) — 27 Nov 2026
- Demo is Santiago-only (gate by his email in DemoModeContext; no switch in MobileMenu, no other entry point — never add one).
- Architecture is TWO layers, both installed from main.tsx:
  1. `src/lib/demoClientGuard.ts` patches the shared Supabase client while demo is on: `from()` → DemoQueryBuilder (`src/lib/demoQuery.ts`, a mini-PostgREST over the demo store), `rpc()` → demoRpc, `functions.invoke()` → demoInvokeFunction, `storage` → fake (signed URLs → /placeholder.svg), `channel()` → no-op, `auth.updateUser` → fake success.
  2. `src/lib/demoFetchGuard.ts` is the network backstop: in demo mode EVERY fetch to `*.supabase.co` is answered locally except auth token refresh, GET /auth/v1/user and logout. This catches raw `fetch()` calls the client guard can't see (create-student, get-available-slots, book-lesson, coach-ai-chat SSE, tus resumable upload). No demo id can ever reach the real backend — interception is by host, not by id pattern.
- `src/lib/demoStore.ts`: the demo store, seeded from `src/data/demoData.ts` (all fictitious), persisted to sessionStorage after every mutation — demo writes survive refresh within the tab session, never leave the browser. Real user id is mapped to the fictitious demo coach id (`coach-00000000-0000-4000-8000-000000000001`, "Coach Demo"), so the greeting reads "Bienvenido, Coach" in demo.
- Toggling demo reloads the page (DemoModeContext.setDemoMode) so no stale real data stays in react-query caches or AuthContext.
- Edge functions in demo return fake success and NEVER send mail / charge Stripe / sync calendars; create-checkout returns a FAKE SUCCESSFUL payment (in-app `/payment-success?session_id=demo-…`, charge + entitlement recorded in the demo store) on purpose — never a Stripe URL. `claim-recurring-slot` is intentionally generic fake success only — the recurring-schedule change flow (f8a8d43) is off-limits.
- Demo banner text: "🎭 MODO DEMO — datos ficticios" (DemoModeBanner, sticky top, App level).
- Smoke test: `tests/demo-smoke.ts` (`npx tsx tests/demo-smoke.ts`).

# Project Architecture Rules
- Subscription access checks accept both Stripe active and trialing states and refresh the profile after reconciliation, so promotions retain the purchased tier without changing manual overrides.

- Student creation is authorized server-side for admin, staff, and coach roles; the authenticated caller becomes the assigned coach, preventing caller-supplied ownership.
- Lesson-picker today styling lives on inner text, with a locally gold-mapped primary token and option-focus contrast, so Radix copies the same styling into the closed value without changing the global primary theme.
- Staff access areas are defined in the shared staff-scopes module for UI and invitation validation; database policies authorize each area independently, and staff calendar/pricing use the granting coach's identity rather than the staff account.
- Customer plan PDFs have an isolated public-information-only query path and are prepared before downloading to preserve mobile browser activation.
- Customer PDF accents read billing plan colors, and lesson discount percentages derive from each configured standard/Pro price pair without changing pricing records.
- Pro Zone category previews reuse existing media thumbnails through SignedGolfMediaImg so private storage remains accessible only through the existing signed-media flow.
- Coach inbox reads existing point redemptions without mutating points or fulfillment; assigned-student filtering and database read policies isolate coaches, including owner coach-preview mode.
- Scores combines the student-scoped handicap history and profile goal with existing rounds controls; the dashboard handicap gauge links there so real student pages and student preview share the same experience without changing score calculations.
- Round-derived handicap is a read-only, explicitly unofficial performance estimate (rolling mean over par normalized to 18 holes), separate from the entered profile handicap; never present it as a WHS index without the required rating, slope and adjusted-score data.
- Pro subscriptions follow a fixed Stripe loyalty schedule attached by stripe-webhook; displayed steps come from src/lib/proPriceSteps.ts and must stay in sync with the webhook price IDs.
- Per-user Google Calendar uses the App User Connector flow: OAuth start/complete and all provider calls run in edge functions via _shared/appUserConnector.ts; each user's lovack_* key is stored AES-GCM-encrypted in app_user_connections (service_role only), keyed by auth user id — never expose keys or gateway calls to the browser.
- The Revenue page's single PDF button passes page-owned data (KPIs, trend, receivables) to the projection chart through revenuePdfBridge as a getter read at build time, and the chart waits for its own data, so early clicks still produce a complete report.
