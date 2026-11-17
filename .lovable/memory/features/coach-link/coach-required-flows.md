---
name: Coach-required student flows
description: Lesson booking and lesson-pricing flows are gated when student has no assigned_coach_id; subscription plans stay open
type: feature
---
A student is "linked" when `profiles.assigned_coach_id IS NOT NULL`. Exposed via `useAuth().hasLinkedCoach`. Admin previewing a student tier always returns true.

Coach-gated flows (require linked coach):
- "Book" CTA in StudentBottomNav → InternalBookingModal
- "Individual Lesson" purchase card on StudentDashboard
- "Lesson Package" purchase card on StudentDashboard / PackageSelectionModal

Gate UX: open `<RequireCoachModal reason="book|package|individual_lesson" onLinked={...} />` instead of the original modal. The modal embeds `<LinkCoachCard variant="card" />` (calls accept-invite). On success it auto-closes and `onLinked` re-triggers the original action.

NOT gated (the rest of the app works identically without a coach):
- /plans subscription tier checkout (Member/Scratch/Pro) — these are NOT lesson sales
- Pro Zone, videos, AI coach, profile, stats, fixed schedule view, social/marketing, settings

Defense-in-depth: PackageSelectionModal itself early-returns the link-coach gate if opened without a coach, so future callers can't accidentally bypass.
