/**
 * Build a Google Calendar "create event" URL prefilled with lesson details.
 * No OAuth required — opens calendar.google.com/calendar/render in a new tab.
 *
 * Lesson date/time are stored as Cancun local time (UTC-5, no DST). We convert
 * to UTC for the `dates` parameter, which Google Calendar requires in
 * `YYYYMMDDTHHMMSSZ` format.
 *
 * Default reminders cannot be set via the public render URL (Google ignores
 * trp/`reminder` params for new events) — the user gets their own default
 * notifications, which Santi's students typically configure as 1 day + 1 hour.
 * We surface that recommendation in copy near the button.
 */
export interface AddToGoogleCalendarOptions {
  lessonDate: string;        // YYYY-MM-DD
  lessonTime: string;        // HH:MM or HH:MM:SS (Cancun local)
  durationMinutes?: number;  // defaults to 60
  lessonType?: string | null;
  location?: string | null;
  notes?: string | null;
  /** Localized "your Coach" / "tu Coach" label. Defaults to "your Coach". */
  coachLabel?: string;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function toGcalUtc(isoDate: string): string {
  const d = new Date(isoDate);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

export function buildGoogleCalendarUrl(opts: AddToGoogleCalendarOptions): string {
  const duration = opts.durationMinutes ?? 60;
  const time = opts.lessonTime.length === 5 ? `${opts.lessonTime}:00` : opts.lessonTime.slice(0, 8);
  // Cancun is UTC-5 year-round
  const startUtcIso = `${opts.lessonDate}T${time}-05:00`;
  const startMs = new Date(startUtcIso).getTime();
  const endIso = new Date(startMs + duration * 60_000).toISOString();
  const dates = `${toGcalUtc(startUtcIso)}/${toGcalUtc(endIso)}`;

  const coachLabel = opts.coachLabel ?? 'your Coach';
  const title = `Lesson with ${coachLabel} · Margea Golf Academy${opts.lessonType ? ` (${opts.lessonType})` : ''}`;
  const detailsLines = [
    `Lesson type: ${opts.lessonType ?? 'Lesson'}`,
    `Duration: ${duration} minutes`,
  ];
  if (opts.notes) detailsLines.push('', `Notes: ${opts.notes}`);
  detailsLines.push('', 'Tip: set a reminder for 1 day and 1 hour before in Google Calendar.');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details: detailsLines.join('\n'),
    ctz: 'America/Cancun',
  });
  if (opts.location) params.set('location', opts.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function openGoogleCalendar(opts: AddToGoogleCalendarOptions) {
  const url = buildGoogleCalendarUrl(opts);
  window.open(url, '_blank', 'noopener');
}