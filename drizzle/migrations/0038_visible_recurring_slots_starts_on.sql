-- Read-only: expose starts_on to the student portal. Same visibility rules.
drop function if exists public.get_visible_recurring_slots(uuid);
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
  is_own boolean,
  starts_on date
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
    eff.pkg_id as package_id,
    (s.student_id = _student_id) as is_own,
    s.starts_on
  from public.recurring_lesson_slots s
  left join public.profiles p on p.id = s.student_id
  cross join lateral (
    select coalesce(
      s.package_id,
      case when s.no_package_intentional is true then null else (
        select cp2.id
        from public.class_packages cp2
        where cp2.user_id = s.student_id
          and cp2.is_active = true
          and coalesce(cp2.is_paused, false) = false
          and coalesce(cp2.is_archived, false) = false
        order by cp2.created_at asc, cp2.id asc
        limit 1
      ) end
    ) as pkg_id
  ) eff
  where s.is_active = true
    and (auth.uid() = _student_id or public.can_preview_student(_student_id))
    and (
      s.student_id = _student_id
      or (
        eff.pkg_id is not null
        and exists (
          select 1
          from public.class_packages cp
          where cp.id = eff.pkg_id
            and (cp.user_id = _student_id or public.is_package_member(cp.id, _student_id))
            and exists (select 1 from public.package_members pm where pm.package_id = cp.id)
        )
      )
    )
  order by s.weekday, s.start_time
$$;

grant execute on function public.get_visible_recurring_slots(uuid) to authenticated;
grant execute on function public.get_visible_recurring_slots(uuid) to service_role;