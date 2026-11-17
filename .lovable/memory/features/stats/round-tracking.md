---
name: Round Stats Tracking
description: Native round tracker for students lives INSIDE the Pro Zone (members-only). Quick-summary rounds (practice/tournament) on saved courses; coach views Stats tab on student profile.
type: feature
---
Tables: `golf_courses` (per-student saved courses with par/city/tees) and `golf_rounds` (quick summary: total score, FIR, GIR, putts, penalties, weather, notes; round_type enum practice|tournament; 9 or 18 holes).
RLS: students CRUD their own; admins manage all.
Student UI: `/pro-zone/stats` route (ProZoneStats page) with Log Round modal + Manage Courses modal. Gated by `hasProZoneAccess` — non-members see an upsell. Surfaced as a "Round Stats" card on the Pro Zone home grid. NOT exposed via dashboard quick link or mobile menu — entry is exclusively through Pro Zone.
Coach UI: "Stats" tab on AdminStudentDetail (read-only RoundsList).
Shared component: `src/components/RoundsList.tsx` shows last-5 trend summary (avg score, GIR%, FIR%, putts, best vs par) + chronological rounds list.
Online course lookup: `ManageCoursesModal` includes a debounced search powered by the `lookup-golf-course` edge function (modes: `search` via OpenStreetMap Nominatim, `stats` via Lovable AI Gemini 2.5 Flash). AI stats (par/rating/slope/default_tees) are pre-filled with a "verify before saving" badge — only `high`/`medium` confidence values pre-populate fields. Rate limit: 15 req/min/user.
Form fields removed (kept in DB schema for backward compat but always saved as null): tees, weather, par3_avg/par4_avg/par5_avg.
How to apply: When extending stats (e.g., per-club, hole-by-hole), add new columns/tables — current schema is intentionally "quick summary only". Keep entry point inside Pro Zone; don't add a top-level menu item.