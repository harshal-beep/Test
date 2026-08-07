-- 0028: stop one person's deletion from destroying shared content.
--
-- Every content table pointed at lv_profiles with ON DELETE CASCADE, so
-- deleting a member deleted every list, note, habit, milestone, question
-- round and expense they had ever created — including the shared ones the
-- other members still needed. Two different rules now apply:
--
--   * Authored content (lists, notes, habits, milestones, rounds) survives
--     with a null author: the row stays, "who made it" is simply forgotten.
--   * Money (expenses, shares, settlements) BLOCKS the deletion instead —
--     silently dropping ledger rows would rewrite everyone's balances.
--
-- Also: space_id becomes immutable, so a row can never be moved between
-- spaces after it is created.

-- ---------------------------------------------- authored content: SET NULL
alter table public.lv_lists alter column owner_id drop not null;
alter table public.lv_lists drop constraint lv_lists_owner_id_fkey;
alter table public.lv_lists add constraint lv_lists_owner_id_fkey
  foreign key (owner_id) references public.lv_profiles (id) on delete set null;

alter table public.lv_notes alter column owner_id drop not null;
alter table public.lv_notes drop constraint lv_notes_owner_id_fkey;
alter table public.lv_notes add constraint lv_notes_owner_id_fkey
  foreign key (owner_id) references public.lv_profiles (id) on delete set null;

alter table public.lv_habits alter column owner_id drop not null;
alter table public.lv_habits drop constraint lv_habits_owner_id_fkey;
alter table public.lv_habits add constraint lv_habits_owner_id_fkey
  foreign key (owner_id) references public.lv_profiles (id) on delete set null;

alter table public.lv_milestones alter column created_by drop not null;
alter table public.lv_milestones drop constraint lv_milestones_created_by_fkey;
alter table public.lv_milestones add constraint lv_milestones_created_by_fkey
  foreign key (created_by) references public.lv_profiles (id) on delete set null;

alter table public.lv_question_rounds alter column opened_by drop not null;
alter table public.lv_question_rounds drop constraint lv_question_rounds_opened_by_fkey;
alter table public.lv_question_rounds add constraint lv_question_rounds_opened_by_fkey
  foreign key (opened_by) references public.lv_profiles (id) on delete set null;

-- Orphaned rows would otherwise be uneditable by anyone: let the space adopt them.
drop policy "lv lists update" on public.lv_lists;
drop policy "lv lists delete" on public.lv_lists;
create policy "lv lists update" on public.lv_lists for update
  using (owner_id = auth.uid() or (owner_id is null and public.lv_is_member(space_id)));
create policy "lv lists delete" on public.lv_lists for delete
  using (owner_id = auth.uid() or (owner_id is null and public.lv_is_member(space_id)));

drop policy "lv notes update" on public.lv_notes;
drop policy "lv notes delete" on public.lv_notes;
create policy "lv notes update" on public.lv_notes for update
  using ((not is_private and public.lv_is_member(space_id)) or owner_id = auth.uid());
create policy "lv notes delete" on public.lv_notes for delete
  using (owner_id = auth.uid() or (owner_id is null and public.lv_is_member(space_id)));

drop policy "lv habits update" on public.lv_habits;
drop policy "lv habits delete" on public.lv_habits;
create policy "lv habits update" on public.lv_habits for update
  using (owner_id = auth.uid() or (owner_id is null and public.lv_is_member(space_id)));
create policy "lv habits delete" on public.lv_habits for delete
  using (owner_id = auth.uid() or (owner_id is null and public.lv_is_member(space_id)));

drop policy "lv milestones update" on public.lv_milestones;
drop policy "lv milestones delete" on public.lv_milestones;
create policy "lv milestones update" on public.lv_milestones for update
  using (created_by = auth.uid() or (created_by is null and public.lv_is_member(space_id)));
create policy "lv milestones delete" on public.lv_milestones for delete
  using (created_by = auth.uid() or (created_by is null and public.lv_is_member(space_id)));

-- --------------------------------------------------------- money: RESTRICT
alter table public.lv_expenses drop constraint lv_expenses_paid_by_fkey;
alter table public.lv_expenses add constraint lv_expenses_paid_by_fkey
  foreign key (paid_by) references public.lv_profiles (id) on delete restrict;
alter table public.lv_expenses drop constraint lv_expenses_created_by_fkey;
alter table public.lv_expenses add constraint lv_expenses_created_by_fkey
  foreign key (created_by) references public.lv_profiles (id) on delete restrict;

alter table public.lv_expense_shares drop constraint lv_expense_shares_user_id_fkey;
alter table public.lv_expense_shares add constraint lv_expense_shares_user_id_fkey
  foreign key (user_id) references public.lv_profiles (id) on delete restrict;

alter table public.lv_settlements drop constraint lv_settlements_from_user_fkey;
alter table public.lv_settlements add constraint lv_settlements_from_user_fkey
  foreign key (from_user) references public.lv_profiles (id) on delete restrict;
alter table public.lv_settlements drop constraint lv_settlements_to_user_fkey;
alter table public.lv_settlements add constraint lv_settlements_to_user_fkey
  foreign key (to_user) references public.lv_profiles (id) on delete restrict;
alter table public.lv_settlements drop constraint lv_settlements_created_by_fkey;
alter table public.lv_settlements add constraint lv_settlements_created_by_fkey
  foreign key (created_by) references public.lv_profiles (id) on delete restrict;

-- ------------------------------------------------------ space_id immutable
create or replace function public.lv_freeze_space() returns trigger
language plpgsql as $$
begin
  if new.space_id is distinct from old.space_id then
    raise exception 'space_id cannot be changed';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'lv_lists','lv_notes','lv_habits','lv_expenses','lv_settlements',
    'lv_milestones','lv_question_rounds','lv_events'
  ] loop
    execute format(
      'create trigger lv_freeze_space_trg before update on public.%I
         for each row execute function public.lv_freeze_space()', t);
  end loop;
end $$;

-- --------------------------------------------- couple membership protected
create or replace function public.lv_guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select kind from lv_spaces where id = old.space_id) = 'couple' then
    raise exception 'members of the couple space cannot be removed';
  end if;
  return old;
end $$;

create trigger lv_guard_membership_trg before delete on public.lv_space_members
  for each row execute function public.lv_guard_membership();
