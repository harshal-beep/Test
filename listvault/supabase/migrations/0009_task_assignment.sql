-- APPLIED as migration `listvault_task_assignment`.
-- Task assignment: optionally hand a task to a household member.
alter table public.lv_items
  add column assigned_to uuid references public.lv_profiles (id) on delete set null;
create index lv_items_assigned_idx on public.lv_items (assigned_to) where assigned_to is not null;
