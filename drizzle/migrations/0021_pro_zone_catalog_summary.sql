create or replace function public.get_pro_zone_catalog_summary()
returns table (
  key text,
  label text,
  emoji text,
  is_custom boolean,
  sort_order integer,
  video_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select lower(btrim(m.category)) as k, count(*)::int as n
    from public.pro_zone_media m
    where m.is_active = true and m.category is not null
    group by 1
  ),
  cats as (
    select lower(btrim(c.key)) as k,
           c.label,
           coalesce(nullif(c.emoji, ''), '⛳') as emoji,
           coalesce(c.sort_order, 0) as sort_order
    from public.pro_zone_custom_categories c
    where c.is_active = true
  ),
  labels as (
    select lower(btrim(l.key)) as k, l.label
    from public.pro_zone_category_labels l
  ),
  keys as (
    select k from counts
    union select k from cats
    union select k from labels
  )
  select k.k as key,
         coalesce(lb.label, ct.label) as label,
         coalesce(ct.emoji, '') as emoji,
         (ct.k is not null) as is_custom,
         coalesce(ct.sort_order, 0) as sort_order,
         coalesce(cn.n, 0) as video_count
  from keys k
  left join cats ct on ct.k = k.k
  left join labels lb on lb.k = k.k
  left join counts cn on cn.k = k.k;
$$;

revoke all on function public.get_pro_zone_catalog_summary() from public;
revoke all on function public.get_pro_zone_catalog_summary() from anon;
grant execute on function public.get_pro_zone_catalog_summary() to authenticated;
grant execute on function public.get_pro_zone_catalog_summary() to service_role;