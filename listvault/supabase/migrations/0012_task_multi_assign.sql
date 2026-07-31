-- Tasks can be for one person, several, or the whole household ("both of us").
-- assigned_to becomes uuid[]; null/empty = unassigned. The FK to lv_profiles is
-- dropped (arrays can't carry one) — dangling ids after an account deletion are
-- simply not rendered by the client.
drop index if exists public.lv_items_assigned_idx;
alter table public.lv_items drop constraint if exists lv_items_assigned_to_fkey;
alter table public.lv_items
  alter column assigned_to type uuid[]
  using case when assigned_to is null then null else array[assigned_to] end;
create index lv_items_assigned_idx on public.lv_items using gin (assigned_to)
  where assigned_to is not null;
