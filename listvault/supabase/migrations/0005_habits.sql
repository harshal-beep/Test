-- APPLIED as migration `listvault_habits`.
-- HaMaara habit tracker. Habits are household-visible (everyone in the vault
-- sees them); each member checks off their own completion per day.
create table public.lv_habits (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  emoji text,
  color text,
  owner_id uuid not null references public.lv_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.lv_habit_checks (
  habit_id uuid not null references public.lv_habits (id) on delete cascade,
  day date not null,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (habit_id, day, user_id)
);

create index lv_habit_checks_user_idx on public.lv_habit_checks (user_id, day desc);

alter table public.lv_habits enable row level security;
alter table public.lv_habit_checks enable row level security;

create policy "lv habits read"
  on public.lv_habits for select using (auth.role() = 'authenticated');
create policy "lv habits insert"
  on public.lv_habits for insert with check (owner_id = auth.uid());
create policy "lv habits update"
  on public.lv_habits for update using (owner_id = auth.uid());
create policy "lv habits delete"
  on public.lv_habits for delete using (owner_id = auth.uid());

create policy "lv habit checks read"
  on public.lv_habit_checks for select using (auth.role() = 'authenticated');
create policy "lv habit checks insert"
  on public.lv_habit_checks for insert with check (user_id = auth.uid());
create policy "lv habit checks delete"
  on public.lv_habit_checks for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.lv_habits;
alter publication supabase_realtime add table public.lv_habit_checks;
