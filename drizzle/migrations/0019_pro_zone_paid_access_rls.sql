create or replace function public.has_pro_zone_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_effective_plan(_user_id) in ('scratch','pro','apex'), false)
    or public.has_role(_user_id, 'admin'::app_role)
    or public.has_staff_permission(_user_id, 'pro_zone');
$$;

grant execute on function public.has_pro_zone_access(uuid) to authenticated, service_role;

drop policy if exists "Authenticated users can view active media" on public.pro_zone_media;
create policy "Paid members can view active media"
on public.pro_zone_media for select to authenticated
using (is_active = true and public.has_pro_zone_access(auth.uid()));

drop policy if exists "Authenticated users can view active tips" on public.pro_zone_tips;
create policy "Paid members can view active tips"
on public.pro_zone_tips for select to authenticated
using (is_active = true and public.has_pro_zone_access(auth.uid()));

drop policy if exists "Authenticated users can view active custom categories" on public.pro_zone_custom_categories;
create policy "Paid members can view active custom categories"
on public.pro_zone_custom_categories for select to authenticated
using ((is_active = true and public.has_pro_zone_access(auth.uid()))
  or has_role(auth.uid(), 'admin'::app_role)
  or has_staff_permission(auth.uid(), 'pro_zone'));

drop policy if exists "Authenticated users can read category labels" on public.pro_zone_category_labels;
create policy "Paid members can read category labels"
on public.pro_zone_category_labels for select to authenticated
using (public.has_pro_zone_access(auth.uid()));

drop policy if exists "Public can read pro-zone media" on storage.objects;
create policy "Paid members can read pro-zone media"
on storage.objects for select to authenticated
using (bucket_id = 'golf-media'
  and (storage.foldername(name))[1] = 'pro-zone'
  and public.has_pro_zone_access(auth.uid()));