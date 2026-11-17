---
name: Invite code types
description: Three invite types (one-shot, coach code, access link) and how each affects coach assignment on signup
type: feature
---
Three invite types exist in `student_invites` (created via `create-invite`, redeemed via `accept-invite`):

1. **One-shot invite** — `is_reusable=false`, tied to a `recipient_email`. Just records `referred_by`. No coach assignment.
2. **Coach code** (`purpose: 'coach_code'`) — reusable, never expires. `inviter_is_coach=true`, `assigned_coach_id=null`. New students get `profiles.assigned_coach_id = inviter_id`. Each coach has ONE stable code.
3. **Access link** (`purpose: 'access_link'`, admin-only) — reusable, never expires. Used by the owner to give app access to students who train with another coach (or no coach). The optional `assigned_coach_id` column controls coach linkage:
   - If set → new student is linked to *that* coach (validated to still have admin role at acceptance time).
   - If null → student lands unassigned and can use `LinkCoachCard` to attach later.

`accept-invite` resolution order: `assigned_coach_id` first, then legacy `inviter_is_coach` → `inviter_id`, else none.

Generated and managed in `AdminInviteCodes.tsx`.