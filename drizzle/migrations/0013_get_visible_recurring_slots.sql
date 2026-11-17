-- Recurring slots visible to a student: their own slots + every slot linked to a
-- SHARED package they own or are a member of. Individual packages stay private.
-- Same auth rule as the rest of the student portal: the caller must be the
-- student, or an admin previewing them (can_preview_student).
create or replace function public.get_visible_recurring_slots(_student_id uuid)
returns table (
  id uuid,
  student_id uuid,
  student_name text,
  weekday smallint,
  start_time time without time zone,
  duration_minutes integer,
  lesson_type text,
  package_id uuid,
  is_own boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.student_id,
    coalesce(p.full_name, p.email, '')::text as student_name,
    s.weekday,
    s.start_time,
    s.duration_minutes,
    s.lesson_type,
    s.package_id,
    (s.student_id = _student_id) as is_own
  from public.recurring_lesson_slots s
  left join public.profiles p on p.id = s.student_id
  where s.is_active = true
    and (auth.uid() = _student_id or public.can_preview_student(_student_id))
    and (
      s.student_id = _student_id
      or (
        s.package_id is not null
        and exists (
          select 1
          from public.class_packages cp
          where cp.id = s.package_id
            and (cp.user_id = _student_id or public.is_package_member(cp.id, _student_id))
            -- shared packages only: at least one member row exists
            and exists (select 1 from public.package_members pm where pm.package_id = cp.id)
        )
      )
    )
  order by s.weekday, s.start_time
$$;

grant execute on function public.get_visible_recurring_slots(uuid) to authenticated;
grant execute on function public.get_visible_recurring_slots(uuid) to service_role;