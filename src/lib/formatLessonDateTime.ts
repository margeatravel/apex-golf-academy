// Shared utility for formatting lesson dates and times consistently
// Uses America/Cancun timezone (EST, no DST) as the single source of truth

const APP_TIMEZONE = 'America/Cancun';

export interface LessonDateTimeOptions {
  lesson_start_at?: string | null;
  lesson_date?: string | null;
  lesson_time?: string | null;
}

// Format date for display (e.g., "Friday, Dec 26, 2025").
// `locale` is optional and defaults to en-US so every existing caller is unchanged.
export function formatLessonDate(
  lesson: LessonDateTimeOptions,
  formatStyle: 'full' | 'fullLong' | 'short' | 'monthDay' = 'full',
  locale: string = 'en-US',
): string {
  const opts: Intl.DateTimeFormatOptions =
    formatStyle === 'monthDay'
      ? { timeZone: APP_TIMEZONE, month: 'short', day: 'numeric' }
      : formatStyle === 'short'
        ? { timeZone: APP_TIMEZONE, month: 'short', day: '2-digit', year: 'numeric' }
        : formatStyle === 'fullLong'
          ? { timeZone: APP_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
          : { timeZone: APP_TIMEZONE, weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' };

  const shouldCapitalizeWeekday = locale.toLowerCase().startsWith('es') && opts.weekday === 'long';

  // Prefer lesson_start_at if available (it's a proper UTC timestamp)
  if (lesson.lesson_start_at) {
    const formatted = new Intl.DateTimeFormat(locale, opts).format(new Date(lesson.lesson_start_at));
    return shouldCapitalizeWeekday
      ? formatted.charAt(0).toUpperCase() + formatted.slice(1)
      : formatted;
  }

  // Fallback: use lesson_date string as-is (no Date parsing to avoid timezone shift)
  if (lesson.lesson_date) {
    const [year, month, day] = lesson.lesson_date.split('-').map(Number);
    // Noon local avoids any timezone edge shifting the weekday.
    const tempDate = new Date(year, month - 1, day, 12, 0, 0);
    // Drop the timeZone here: the date is already a plain calendar date.
    const { timeZone: _tz, ...rest } = opts;
    const formatted = new Intl.DateTimeFormat(locale, rest).format(tempDate);
    return shouldCapitalizeWeekday
      ? formatted.charAt(0).toUpperCase() + formatted.slice(1)
      : formatted;
  }

  return 'Unknown date';
}

// Format time for display (e.g., "10 AM" if on the hour, "10:30 AM" otherwise)
export function formatLessonTime(lesson: LessonDateTimeOptions): string {
  // Prefer lesson_start_at if available
  if (lesson.lesson_start_at) {
    const date = new Date(lesson.lesson_start_at);
    const minutes = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, minute: '2-digit' }).format(date),
      10,
    );
    return new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIMEZONE,
      hour: 'numeric',
      ...(minutes === 0 ? {} : { minute: '2-digit' }),
      hour12: true,
    }).format(date);
  }
  
  // Fallback: format lesson_time string (HH:MM[:SS]) to 12-hour format, hour-only if minutes are 0
  if (lesson.lesson_time) {
    const [hours, minutes] = lesson.lesson_time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return minutes === 0
      ? `${displayHour} ${period}`
      : `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
  }
  
  return 'Unknown time';
}

// Get raw time string for display (HH:MM format, 24hr)
export function getLessonTimeRaw(lesson: LessonDateTimeOptions): string {
  if (lesson.lesson_start_at) {
    const date = new Date(lesson.lesson_start_at);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
  
  if (lesson.lesson_time) {
    return lesson.lesson_time.slice(0, 5);
  }
  
  return '';
}

// Get a sortable key for lessons (ISO string or constructed string)
export function getLessonSortKey(lesson: LessonDateTimeOptions): string {
  if (lesson.lesson_start_at) {
    return lesson.lesson_start_at;
  }
  
  // Fallback: construct from date + time strings
  if (lesson.lesson_date && lesson.lesson_time) {
    return `${lesson.lesson_date}T${lesson.lesson_time}`;
  }
  
  return '';
}

// Compare if lesson is on or after today (in app timezone)
export function isLessonUpcoming(lesson: LessonDateTimeOptions): boolean {
  const now = new Date();
  
  // Get today's date in the app timezone
  const todayInTz = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  
  if (lesson.lesson_start_at) {
    const lessonDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(lesson.lesson_start_at));
    return lessonDate >= todayInTz;
  }
  
  if (lesson.lesson_date) {
    return lesson.lesson_date >= todayInTz;
  }
  
  return false;
}

// Get today's date string in the app timezone (YYYY-MM-DD)
export function getTodayInAppTimezone(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Format month and day number separately for calendar widget display
export function getLessonCalendarParts(lesson: LessonDateTimeOptions): { month: string; day: string } {
  if (lesson.lesson_start_at) {
    const date = new Date(lesson.lesson_start_at);
    return {
      month: new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIMEZONE,
        month: 'short',
      }).format(date).toUpperCase(),
      day: new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIMEZONE,
        day: 'numeric',
      }).format(date),
    };
  }
  
  if (lesson.lesson_date) {
    const [, month, day] = lesson.lesson_date.split('-').map(Number);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return {
      month: months[month - 1],
      day: String(day),
    };
  }
  
  return { month: '', day: '' };
}