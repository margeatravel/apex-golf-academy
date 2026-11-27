-- Joint shared-package lessons: one lesson row, one credit, several attendees.
-- Decided by Santiago 27 Nov 2026: when two members of a shared package take
-- one hour together, the package is charged 1 credit, not 2.
-- A lesson's attendees live in lesson_attendees; lessons.student_id stays the
-- primary/booker (owner) for backward compatibility.
-- Recurring slots predetermine their attendees in attendee_ids (NULL = just
-- the slot's student_id).

create table if not exists public.lesson_attendees (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

alter table public.lesson_attendees enable row level security;

-- Backfill: every existing lesson's single student becomes its attendee.
insert into public.lesson_attendees (lesson_id, student_id)
select id, student_id from public.lessons where student_id is not null
on conflict (lesson_id, student_id) do nothing;

-- Read-only for the app: a user sees attendees only of lessons they can
-- already see (own, admin, own coach, family parent, shared-package member).
drop policy if exists "Users can view attendees of visible lessons" on public.lesson_attendees;
create policy "Users can view attendees of visible lessons"
  on public.lesson_attendees for select to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_attendees.lesson_id
      and (
        l.student_id = auth.uid()
        or has_role(auth.uid(), 'admin')
        or (l.coach_id = auth.uid() and public.is_coach(auth.uid()))
        or is_family_parent_of(auth.uid(), l.student_id)
        or (l.package_id is not null and public.is_package_member(l.package_id, auth.uid()))
        or exists (
          select 1 from public.class_packages cp
          where cp.user_id = l.student_id
            and public.is_package_member(cp.id, auth.uid())
        )
      )
    )
  );

-- Recurring slots: predetermined attendees for the spot (the "predeterminar").
-- NULL/empty means just the slot's student_id.
alter table public.recurring_lesson_slots
  add column if not exists attendee_ids uuid[];
