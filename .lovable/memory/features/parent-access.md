---
name: Parent access (family magic link)
description: Coach or student emails a magic link to a parent that signs them into the student's own account
type: feature
---
Coach (AdminStudentDetail) and student (StudentProfile) can invite a parent email via `<ParentAccessManager studentId=... />`.

Flow:
1. Edge function `send-parent-access` (auth: admin or self) inserts a row into `parent_access_grants` and calls `supabase.auth.admin.generateLink({ type: 'magiclink', email: <STUDENT email> })` with `redirectTo=/auth/callback?parent=1&grant=<id>`. Sends Resend email branded Apex.
2. Parent clicks link → AuthCallback detects `parent=1`, sets `sessionStorage.apex_parent_session='1'`, marks `last_used_at`, redirects to `/dashboard`.
3. `<ParentSessionBanner />` (mounted in App.tsx) shows a gold fixed banner "Estás viendo la cuenta de [Hijo] como familiar" with Salir button (signOut + clear flag).
4. `revoke-parent-access` edge function sets `revoked_at`. Does NOT invalidate already-active sessions (token still valid until expiry).

Important: parent enters the SAME session as the student. Anything they do (book, pay, notes) is recorded as the student. Acceptable per product decision.

Table `parent_access_grants` (id, student_id, parent_email, created_by, created_at, revoked_at, last_used_at). RLS: admin all; student SELECT/INSERT/UPDATE own.
