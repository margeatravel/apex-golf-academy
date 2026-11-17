# Fix final onboarding action

## Goal
Make “Start my 30 free days” complete onboarding reliably, enter the existing student Home, and stay completed after reload.

## Changes
- Keep the database update limited to `profiles.onboarding_seen_at` and stop on any returned error.
- Update the shared in-memory profile immediately after the successful save, avoiding a stale route guard.
- Navigate through the existing root role router without waiting for unrelated profile refresh requests.
- Preserve the disabled/loading protection against double taps and show visible progress on the button.

## Validation
- Confirm the app builds cleanly.
- Verify the completion handler, shared profile state, and onboarding guard use the same persisted field.
- Do not change payments, prices, packages, authentication, or database policies.
