create table public.revenue_scenarios (
  coach_id uuid primary key,
  overrides jsonb not null default '{}'::jsonb,
  renew_prices jsonb not null default '{}'::jsonb,
  prices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.revenue_scenarios enable row level security;
grant select, insert, update, delete on public.revenue_scenarios to authenticated;
create policy "own scenario select" on public.revenue_scenarios for select to authenticated using (coach_id = auth.uid());
create policy "own scenario insert" on public.revenue_scenarios for insert to authenticated with check (coach_id = auth.uid());
create policy "own scenario update" on public.revenue_scenarios for update to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());