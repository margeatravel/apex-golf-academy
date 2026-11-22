-- Temporary recurring spots: a slot can end on a date (exclusive).
-- Used when a coach books a student into a paused slot: the new spot
-- runs only while the pause lasts and ends the day the paused slot resumes
-- (ends_on = the paused slot's paused_until; nothing is generated on or
-- after ends_on). NULL = open-ended, as before.
alter table public.recurring_lesson_slots
  add column if not exists ends_on date;

comment on column public.recurring_lesson_slots.ends_on is
  'Último día (exclusivo): no se generan clases en esta fecha ni después. NULL = sin fin.';
