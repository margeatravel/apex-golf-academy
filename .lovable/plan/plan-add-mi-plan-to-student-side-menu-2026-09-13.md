# Plan: Add "Mi plan" to student side menu

Add a new "Mi plan" / "My plan" entry to the student navigation that links to the existing subscription plans page (`/plans`).

## What will change

1. **Translations** (`src/i18n/extra/misc.ts`)
   - Add `navMyPlan: 'My plan'` under `en`
   - Add `navMyPlan: 'Mi plan'` under `es`

2. **Desktop sidebar** (`src/components/StudentBottomNav.tsx`)
   - Insert a new top-level item labeled "Mi plan" / "My plan" in `desktopEntries`, placed after "Profile" and before "Settings".
   - Use the `Star` icon (same icon family already used for plans/manage actions) and navigate to `/plans?tab=plans`.
   - Highlight when `location.pathname === '/plans'`.

3. **Mobile menu sheet** (`src/components/StudentBottomNav.tsx`)
   - Add the same "Mi plan" entry inside `menuExtras` (account-level section), placed before "Manage plan".
   - Use matching gold accent styling consistent with the existing plan-related items.

## What will NOT change
- Mobile bottom bar items remain the same.
- Existing routes, data, permissions, and plan logic are untouched.
- No backend or RLS changes.
