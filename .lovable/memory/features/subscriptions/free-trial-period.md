---
name: 30-Day Free Trial
description: Free/Member students get 30 days access to Round Tracker (NOT videos) via profiles.trial_ends_at; after expiry Pro Zone section + Round Tracker are locked with upsell
type: feature
---
**30-day trial** for new and existing Free/Member users. Grants access to Pro Zone section and Round Tracker. Videos are NOT included — shown as "Coming Soon" for ALL users (universal).

- Column: `profiles.trial_ends_at TIMESTAMPTZ`. Set to `now() + 30 days` for new students by `handle_new_user()` trigger. Staff signups get NULL. Check is dynamic — no stored flag.
- Central helpers in `src/contexts/AuthContext.tsx`: `isInTrial(trialEndsAt)` (active trial), `isTrialExpired(trialEndsAt)` (had trial but now expired). `hasProZoneAccess()` returns true while trial is active. `hasVideosAccess()` does NOT grant trial access.
- `useAuth()` exposes `trialEndsAt`. Admin preview mode forces it to null (admins always have access regardless).
- `<TrialBanner />` component (`src/components/TrialBanner.tsx`) mounted on StudentDashboard, ProZone, StudentVideos. Visual urgency tiers: normal (>7d), gold (≤7d), red (≤24h). Dismissible per session.
- **After trial expiry** (Free/Member tier only): Pro Zone section shows full upsell screen (not Coming Soon). Round Tracker (`ProZoneStats`) shows paywall: "Your free trial has ended. Upgrade to keep tracking your rounds…" with View Plans button. Scratch/Pro/Apex users are never affected.
- **Coming Soon overlay**: Universal for ALL plans. All video category cards in Pro Zone trigger a `ComingSoonModal` instead of navigating. `ProZoneCategory` pages show inline Coming Soon state. `ComingSoonModal` component at `src/components/ComingSoonModal.tsx`.
- Admin override: Trial Access card in `AdminStudentDetail.tsx` with Reset/Extend +7d/End now buttons.
