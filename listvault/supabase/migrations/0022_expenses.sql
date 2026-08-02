-- APPLIED as migration `listvault_expenses`.
-- Splitwise-style shared expenses for two people.
-- owed_amount = what the OTHER person owes the payer for this expense.
create table public.lv_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (char_length(description) between 1 and 200),
  amount numeric(10,2) not null check (amount > 0),
  paid_by uuid not null references public.lv_profiles (id) on delete cascade,
  owed_amount numeric(10,2) not null check (owed_amount >= 0 and owed_amount <= amount),
  spent_on date not null default current_date,
  created_by uuid not null references public.lv_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A recorded payment that settles (part of) the balance.
create table public.lv_settlements (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.lv_profiles (id) on delete cascade,
  to_user uuid not null references public.lv_profiles (id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  created_by uuid not null references public.lv_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

alter table public.lv_expenses enable row level security;
alter table public.lv_settlements enable row level security;

create policy "lv expenses read"
  on public.lv_expenses for select using (auth.role() = 'authenticated');
create policy "lv expenses insert"
  on public.lv_expenses for insert with check (created_by = auth.uid());
create policy "lv expenses delete"
  on public.lv_expenses for delete using (created_by = auth.uid());

create policy "lv settlements read"
  on public.lv_settlements for select using (auth.role() = 'authenticated');
create policy "lv settlements insert"
  on public.lv_settlements for insert with check (created_by = auth.uid());
create policy "lv settlements delete"
  on public.lv_settlements for delete using (created_by = auth.uid());

alter publication supabase_realtime add table public.lv_expenses;
alter publication supabase_realtime add table public.lv_settlements;
