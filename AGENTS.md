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
