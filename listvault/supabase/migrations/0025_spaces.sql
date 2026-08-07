-- 0025: Spaces — multiple groups sharing the same features.
-- Creates lv_spaces / lv_space_members, stamps space_id on all content,
-- moves every RLS policy from "any authenticated user" to space membership,
-- adds the multi-way expense ledger (lv_expense_shares), invite RPCs, and a
-- profile-creation trigger so open signup works.

-- ---------------------------------------------------------------- spaces
create or replace function public.lv_gen_invite_code() returns text
language sql volatile as $$
  -- 6 chars, ambiguous glyphs (0/O, 1/I/L) excluded
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 31) + 1)::int, 1), '')
  from generate_series(1, 6)
$$;

create table public.lv_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  emoji text,
  kind text not null default 'group' check (kind in ('couple', 'group')),
  invite_code text not null unique default public.lv_gen_invite_code(),
  created_by uuid references public.lv_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.lv_space_members (
  space_id uuid not null references public.lv_spaces (id) on delete cascade,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index lv_space_members_user_idx on public.lv_space_members (user_id);

alter table public.lv_spaces enable row level security;
alter table public.lv_space_members enable row level security;

-- Security-definer helpers keep membership checks out of RLS recursion.
create or replace function public.lv_is_member(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lv_space_members where space_id = p_space and user_id = auth.uid())
$$;

create or replace function public.lv_is_space_owner(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lv_space_members where space_id = p_space and user_id = auth.uid() and role = 'owner')
$$;

create or replace function public.lv_shares_space_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lv_space_members a join lv_space_members b using (space_id)
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

create policy "lv spaces read" on public.lv_spaces for select using (public.lv_is_member(id));
create policy "lv spaces update" on public.lv_spaces for update using (public.lv_is_space_owner(id));
create policy "lv spaces delete" on public.lv_spaces for delete using (public.lv_is_space_owner(id) and kind = 'group');
create policy "lv space members read" on public.lv_space_members for select using (public.lv_is_member(space_id));
create policy "lv space members delete" on public.lv_space_members for delete
  using (user_id = auth.uid() or public.lv_is_space_owner(space_id));

-- Creation and joining go through guarded RPCs only.
create or replace function public.lv_create_space(p_name text, p_emoji text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  insert into lv_spaces (name, emoji, kind, created_by)
  values (left(trim(p_name), 60), p_emoji, 'group', auth.uid())
  returning id into v_id;
  insert into lv_space_members (space_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

create or replace function public.lv_join_space(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_id from lv_spaces where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'Invalid invite code'; end if;
  insert into lv_space_members (space_id, user_id) values (v_id, auth.uid())
  on conflict (space_id, user_id) do nothing;
  return v_id;
end $$;

create or replace function public.lv_invite_preview(p_code text)
returns table (space_id uuid, name text, emoji text, member_count bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.emoji, count(m.user_id)
  from lv_spaces s left join lv_space_members m on m.space_id = s.id
  where s.invite_code = upper(trim(p_code))
  group by s.id
$$;

create or replace function public.lv_regen_invite(p_space uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.lv_is_space_owner(p_space) then raise exception 'owner only'; end if;
  v_code := public.lv_gen_invite_code();
  update lv_spaces set invite_code = v_code where id = p_space;
  return v_code;
end $$;

revoke all on function public.lv_create_space(text, text) from public, anon;
revoke all on function public.lv_join_space(text) from public, anon;
revoke all on function public.lv_regen_invite(uuid) from public, anon;
grant execute on function public.lv_create_space(text, text) to authenticated;
grant execute on function public.lv_join_space(text) to authenticated;
grant execute on function public.lv_regen_invite(uuid) to authenticated;
grant execute on function public.lv_invite_preview(text) to anon, authenticated;

-- ------------------------------------------------- space_id on content
alter table public.lv_lists add column space_id uuid references public.lv_spaces (id) on delete cascade;
alter table public.lv_notes add column space_id uuid references public.lv_spaces (id) on delete cascade;
alter table public.lv_habits add column space_id uuid references public.lv_spaces (id) on delete cascade;
alter table public.lv_expenses add column space_id uuid references public.lv_spaces (id) on delete cascade;
alter table public.lv_settlements add column space_id uuid references public.lv_spaces (id) on delete cascade;
alter table public.lv_milestones add column space_id uuid references public.lv_spaces (id) on delete cascade;
alter table public.lv_question_rounds add column space_id uuid references public.lv_spaces (id) on delete cascade;
alter table public.lv_events add column space_id uuid references public.lv_spaces (id) on delete cascade;

-- Multi-way ledger: per-member share of each expense.
create table public.lv_expense_shares (
  expense_id uuid not null references public.lv_expenses (id) on delete cascade,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  amount numeric not null check (amount >= 0),
  primary key (expense_id, user_id)
);
alter table public.lv_expense_shares enable row level security;
alter table public.lv_expenses alter column owed_amount set default 0;

-- --------------------------------------- couple space + data backfill
do $$
declare cs uuid;
begin
  insert into lv_spaces (name, emoji, kind, created_by)
  values ('HaMaara', '💜', 'couple', (select id from lv_profiles where is_admin order by created_at limit 1))
  returning id into cs;

  insert into lv_space_members (space_id, user_id, role)
  select cs, id, case when is_admin then 'owner' else 'member' end from lv_profiles;

  update lv_lists set space_id = cs;
  update lv_notes set space_id = cs;
  update lv_habits set space_id = cs;
  update lv_expenses set space_id = cs;
  update lv_settlements set space_id = cs;
  update lv_milestones set space_id = cs;
  update lv_question_rounds set space_id = cs;
  update lv_events set space_id = cs;

  -- Pairwise expenses → shares: payer keeps amount − owed, the other owes `owed_amount`.
  insert into lv_expense_shares (expense_id, user_id, amount)
  select e.id, e.paid_by, e.amount - e.owed_amount from lv_expenses e;
  insert into lv_expense_shares (expense_id, user_id, amount)
  select e.id, p.id, e.owed_amount from lv_expenses e join lv_profiles p on p.id <> e.paid_by;
end $$;

alter table public.lv_lists alter column space_id set not null;
alter table public.lv_notes alter column space_id set not null;
alter table public.lv_habits alter column space_id set not null;
alter table public.lv_expenses alter column space_id set not null;
alter table public.lv_settlements alter column space_id set not null;
alter table public.lv_milestones alter column space_id set not null;
alter table public.lv_question_rounds alter column space_id set not null;
alter table public.lv_events alter column space_id set not null;

create index lv_lists_space_idx on public.lv_lists (space_id);
create index lv_notes_space_idx on public.lv_notes (space_id);
create index lv_habits_space_idx on public.lv_habits (space_id);
create index lv_expenses_space_idx on public.lv_expenses (space_id);
create index lv_settlements_space_idx on public.lv_settlements (space_id);
create index lv_milestones_space_idx on public.lv_milestones (space_id);
create index lv_rounds_space_idx on public.lv_question_rounds (space_id);
create index lv_events_space_idx on public.lv_events (space_id);

-- ------------------------------------------------------- RLS rewrite
-- Access to children goes through the parent's space.
create or replace function public.lv_list_space_ok(p_list uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lv_lists l where l.id = p_list and public.lv_is_member(l.space_id))
$$;

create or replace function public.lv_item_space_ok(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lv_items i join lv_lists l on l.id = i.list_id
    where i.id = p_item and public.lv_is_member(l.space_id)
  )
$$;

create or replace function public.lv_habit_space_ok(p_habit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lv_habits h where h.id = p_habit and public.lv_is_member(h.space_id))
$$;

create or replace function public.lv_round_space_ok(p_round uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lv_question_rounds r where r.id = p_round and public.lv_is_member(r.space_id))
$$;

-- lists
drop policy "lv household reads lists" on public.lv_lists;
drop policy "lv users create own lists" on public.lv_lists;
drop policy "lv owner updates list" on public.lv_lists;
drop policy "lv owner deletes list" on public.lv_lists;
create policy "lv lists read" on public.lv_lists for select using (public.lv_is_member(space_id));
create policy "lv lists insert" on public.lv_lists for insert
  with check (owner_id = auth.uid() and public.lv_is_member(space_id));
create policy "lv lists update" on public.lv_lists for update using (owner_id = auth.uid());
create policy "lv lists delete" on public.lv_lists for delete using (owner_id = auth.uid());

-- items
drop policy "lv household reads items" on public.lv_items;
drop policy "lv household adds items" on public.lv_items;
drop policy "lv household updates items" on public.lv_items;
drop policy "lv household deletes items" on public.lv_items;
create policy "lv items read" on public.lv_items for select using (public.lv_list_space_ok(list_id));
create policy "lv items insert" on public.lv_items for insert
  with check (added_by = auth.uid() and public.lv_list_is_active(list_id) and public.lv_list_space_ok(list_id));
create policy "lv items update" on public.lv_items for update
  using (public.lv_list_is_active(list_id) and public.lv_list_space_ok(list_id));
create policy "lv items delete" on public.lv_items for delete
  using (public.lv_list_is_active(list_id) and public.lv_list_space_ok(list_id));

-- notes
drop policy "lv notes read" on public.lv_notes;
drop policy "lv notes insert" on public.lv_notes;
drop policy "lv notes update" on public.lv_notes;
drop policy "lv notes delete" on public.lv_notes;
create policy "lv notes read" on public.lv_notes for select
  using (public.lv_is_member(space_id) and (not is_private or owner_id = auth.uid()));
create policy "lv notes insert" on public.lv_notes for insert
  with check (owner_id = auth.uid() and public.lv_is_member(space_id));
create policy "lv notes update" on public.lv_notes for update
  using ((not is_private and public.lv_is_member(space_id)) or owner_id = auth.uid());
create policy "lv notes delete" on public.lv_notes for delete using (owner_id = auth.uid());

-- habits + checks
drop policy "lv habits read" on public.lv_habits;
drop policy "lv habits insert" on public.lv_habits;
drop policy "lv habits update" on public.lv_habits;
drop policy "lv habits delete" on public.lv_habits;
create policy "lv habits read" on public.lv_habits for select using (public.lv_is_member(space_id));
create policy "lv habits insert" on public.lv_habits for insert
  with check (owner_id = auth.uid() and public.lv_is_member(space_id));
create policy "lv habits update" on public.lv_habits for update using (owner_id = auth.uid());
create policy "lv habits delete" on public.lv_habits for delete using (owner_id = auth.uid());

drop policy "lv habit checks read" on public.lv_habit_checks;
drop policy "lv habit checks insert" on public.lv_habit_checks;
drop policy "lv habit checks delete" on public.lv_habit_checks;
create policy "lv habit checks read" on public.lv_habit_checks for select using (public.lv_habit_space_ok(habit_id));
create policy "lv habit checks insert" on public.lv_habit_checks for insert
  with check (user_id = auth.uid() and public.lv_habit_space_ok(habit_id));
create policy "lv habit checks delete" on public.lv_habit_checks for delete using (user_id = auth.uid());

-- reactions + comments
drop policy "lv reactions read" on public.lv_item_reactions;
drop policy "lv reactions insert" on public.lv_item_reactions;
drop policy "lv reactions delete" on public.lv_item_reactions;
create policy "lv reactions read" on public.lv_item_reactions for select using (public.lv_item_space_ok(item_id));
create policy "lv reactions insert" on public.lv_item_reactions for insert
  with check (user_id = auth.uid() and public.lv_item_space_ok(item_id));
create policy "lv reactions delete" on public.lv_item_reactions for delete using (user_id = auth.uid());

drop policy "lv comments read" on public.lv_item_comments;
drop policy "lv comments insert" on public.lv_item_comments;
drop policy "lv comments delete" on public.lv_item_comments;
create policy "lv comments read" on public.lv_item_comments for select using (public.lv_item_space_ok(item_id));
create policy "lv comments insert" on public.lv_item_comments for insert
  with check (user_id = auth.uid() and public.lv_item_space_ok(item_id));
create policy "lv comments delete" on public.lv_item_comments for delete using (user_id = auth.uid());

-- money
drop policy "lv expenses read" on public.lv_expenses;
drop policy "lv expenses insert" on public.lv_expenses;
drop policy "lv expenses delete" on public.lv_expenses;
create policy "lv expenses read" on public.lv_expenses for select using (public.lv_is_member(space_id));
create policy "lv expenses insert" on public.lv_expenses for insert
  with check (created_by = auth.uid() and public.lv_is_member(space_id));
create policy "lv expenses delete" on public.lv_expenses for delete using (created_by = auth.uid());

create or replace function public.lv_expense_access(p_expense uuid, p_creator_only boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lv_expenses e
    where e.id = p_expense and public.lv_is_member(e.space_id)
      and (not p_creator_only or e.created_by = auth.uid())
  )
$$;
create policy "lv shares read" on public.lv_expense_shares for select
  using (public.lv_expense_access(expense_id, false));
create policy "lv shares insert" on public.lv_expense_shares for insert
  with check (public.lv_expense_access(expense_id, true));
create policy "lv shares delete" on public.lv_expense_shares for delete
  using (public.lv_expense_access(expense_id, true));

drop policy "lv settlements read" on public.lv_settlements;
drop policy "lv settlements insert" on public.lv_settlements;
drop policy "lv settlements delete" on public.lv_settlements;
create policy "lv settlements read" on public.lv_settlements for select using (public.lv_is_member(space_id));
create policy "lv settlements insert" on public.lv_settlements for insert
  with check (created_by = auth.uid() and public.lv_is_member(space_id));
create policy "lv settlements delete" on public.lv_settlements for delete using (created_by = auth.uid());

-- milestones
drop policy "lv milestones read" on public.lv_milestones;
drop policy "lv milestones insert" on public.lv_milestones;
drop policy "lv milestones update" on public.lv_milestones;
drop policy "lv milestones delete" on public.lv_milestones;
create policy "lv milestones read" on public.lv_milestones for select using (public.lv_is_member(space_id));
create policy "lv milestones insert" on public.lv_milestones for insert
  with check (created_by = auth.uid() and public.lv_is_member(space_id));
create policy "lv milestones update" on public.lv_milestones for update using (created_by = auth.uid());
create policy "lv milestones delete" on public.lv_milestones for delete using (created_by = auth.uid());

-- questions (couple space only in practice; scoped like everything else)
drop policy "lv rounds read" on public.lv_question_rounds;
drop policy "lv rounds insert" on public.lv_question_rounds;
drop policy "lv rounds discard" on public.lv_question_rounds;
create policy "lv rounds read" on public.lv_question_rounds for select using (public.lv_is_member(space_id));
create policy "lv rounds insert" on public.lv_question_rounds for insert
  with check (opened_by = auth.uid() and public.lv_is_member(space_id));
create policy "lv rounds discard" on public.lv_question_rounds for delete
  using (opened_by = auth.uid() and revealed_at is null);

drop policy "lv answers read" on public.lv_question_answers;
drop policy "lv answers insert" on public.lv_question_answers;
create policy "lv answers read" on public.lv_question_answers for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.lv_question_rounds r
      where r.id = round_id and r.revealed_at is not null and public.lv_is_member(r.space_id)
    )
  );
create policy "lv answers insert" on public.lv_question_answers for insert
  with check (user_id = auth.uid() and public.lv_round_space_ok(round_id));

-- events + hides + taste signals
drop policy "lv events read" on public.lv_events;
create policy "lv events read" on public.lv_events for select using (public.lv_is_member(space_id));

drop policy "lv event hides read" on public.lv_event_hides;
create policy "lv event hides read" on public.lv_event_hides for select
  using (user_id = auth.uid() or public.lv_shares_space_with(user_id));

drop policy "lv signals read" on public.lv_taste_signals;
create policy "lv signals read" on public.lv_taste_signals for select
  using (user_id = auth.uid() or public.lv_shares_space_with(user_id));

-- profiles: visible to yourself, space-mates, and admins
drop policy "lv profiles readable by signed-in users" on public.lv_profiles;
create policy "lv profiles read" on public.lv_profiles for select
  using (id = auth.uid() or public.lv_shares_space_with(id) or public.lv_is_admin());

-- --------------------------------------------- open signup: auto-profile
create or replace function public.lv_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lv_profiles (id, display_name, email, provider)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'friend'), '@', 1)),
    new.email,
    'email'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists lv_on_auth_user_created on auth.users;
create trigger lv_on_auth_user_created
  after insert on auth.users
  for each row execute function public.lv_handle_new_user();

-- realtime for the new tables (publication may already contain some)
do $$
begin
  begin
    alter publication supabase_realtime add table public.lv_spaces;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.lv_space_members;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.lv_expense_shares;
  exception when others then null; end;
end $$;
