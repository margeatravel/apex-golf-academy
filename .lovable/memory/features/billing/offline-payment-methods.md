---
name: Offline payment methods (CLABE & Cash)
description: Students can pay via CLABE bank transfer or cash instead of Stripe; coaches set CLABE in profile
type: feature
---
Payment method options for individual lessons and lesson packages:
- **Stripe (card)** — existing flow, redirects to Stripe checkout
- **CLABE Transfer** — shows coach's CLABE from `profiles.clabe` (fetched via `assigned_coach_id`); hidden if coach has no CLABE set
- **Cash** — records pending payment for in-person collection

Shared component: `PaymentMethodSelector` used in both `StudentDashboard` (individual lesson modal) and `PackageSelectionModal`.

Offline payments insert into `payments` table with `payment_method = 'Transfer'` or `'Cash'` and appropriate notes. Coach confirms manually.

Coach sets CLABE in `CoachProfile.tsx` — 18-digit numeric field stored in `profiles.clabe`.