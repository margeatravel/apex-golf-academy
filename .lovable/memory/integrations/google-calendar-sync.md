---
name: Google Calendar Sync
description: Two-way Google Calendar integration — coach auto-sync via connector, students get one-tap "Add to Google Calendar" link
type: feature
---
**Coach side (Santi):** Lovable Google Calendar connector (connection_id std_01kq8y6dv0f5z89gew9n7pbqva, scope `calendar.events`). Edge function `sync-google-calendar` handles create/update/delete via gateway `https://connector-gateway.lovable.dev/google_calendar/calendar/v3`. Triggered automatically from `book-lesson` (create), `cancel-lesson` (delete by event id), and `SkipWeekModal` (delete on skip / create on un-skip). Lesson row stores `google_calendar_event_id`. Setting `academy_settings.google_calendar_sync` = `{enabled, calendar_id, connected_at}` gates all sync; defaults to disabled. Admin UI in `AdminSettings` → "Google Calendar Sync" section: Test connection, Save, Backfill upcoming.

**Student side:** No OAuth. `src/lib/addToGoogleCalendar.ts` builds a `calendar.google.com/calendar/render` URL with Cancun timezone. Button shown on `InternalBookingModal` confirmation step and on each upcoming lesson card in `StudentLessons`. Default reminder recommendation (1 day + 1 hour) is mentioned in the event details — Google's render URL doesn't accept programmatic reminders.
