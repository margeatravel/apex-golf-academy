---
name: SC Points System
description: SC Points reward extra engagement and can be redeemed for a free Video Analysis (200 pts). Levels were removed — a student's "level" is now their membership plan (Member / Scratch / Pro).
type: feature
---

The old 4-tier Level system (Student / Silver / Gold / Diamond, driven by `total_lessons_ever`) has been removed from the UI. Anywhere a "level" was previously shown (StudentDashboard pill, StudentProfile card, AdminStudentDetail stat card, LevelsModal), the UI now displays the student's current **membership plan** instead: Member, Scratch, or Pro (sourced from `effectivePlan` in `AuthContext`, or `manual_plan_override`/`plan_tier` for admin views).

`LevelsModal.tsx` was deleted. The `student_points.total_lessons_ever` column still exists in the DB (used internally by `process_lesson_completion`) but is no longer surfaced to users.

**SC Points** remain unchanged as an engagement currency:
- Earning: +10 lesson completed, +5 video upload (student-uploaded only), +15 monthly streak (4+ lessons in same calendar month, awarded once/month), +20 referral (admin-marked).
- Tracked via `student_points.total_points` (current balance) and `lifetime_points`.
- Redeemable: Free Video Analysis = 200 pts (creates `analysis_request` with payment_status='comped'). VideoUploadFAB detects unused comped credits and replaces the Stripe checkout with an "Upload & Use Free Credit" flow.

**Architecture (unchanged):**
- All point movements logged in `point_transactions`.
- Redemptions logged in `point_redemptions`.
- Functions: `process_lesson_completion`, trigger `award_points_on_video_upload`, `award_referral_points`, `admin_adjust_points`, `redeem_video_analysis`.
- Edge functions: `redeem-reward`, `award-referral`.

**UI:**
- Student dashboard: Plan pill (top-right) + SC Points card with "Redeem" button → `RedeemRewardModal`.
- StudentProfile: Plan card (links to `/plans?tab=plans`).
- Coach `/admin/student/:id`: Plan stat card (read-only label), SC Points card with "Adjust" → `AwardPointsModal`, collapsible transactions history.
- `/admin/settings` → Gamification section (academy_settings.gamification) for editing earning/cost values.