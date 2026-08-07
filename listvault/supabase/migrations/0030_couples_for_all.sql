-- 0030: any two people can form a couple space.
-- Invariants, enforced in the database:
--   * a couple space holds at most 2 members
--   * a person belongs to at most 1 couple space
--   * members of a couple space cannot be removed one by one — the owner
--     dissolves the whole space instead (guard from 0028 now allows the
--     cascade case)
--   * joining a full couple space is refused with a clear message

-- Owners may now delete (dissolve) couple spaces too.
drop policy "lv spaces delete" on public.lv_spaces;
create policy "lv spaces delete" on public.lv_spaces for delete
  using (public.lv_is_space_owner(id));

-- The 0028 guard blocked every couple-membership delete, which also blocked
-- the cascade when the space itself is dissolved. During a cascade the parent
-- row is already gone, so its absence tells the two cases apart.
create or replace function public.lv_guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select kind from lv_spaces where id = old.space_id) = 'couple' then
    raise exception 'couple spaces are dissolved together, not left one by one';
  end if;
  return old;
end $$;

-- Belt-and-braces on every insert path (join RPC, owner add, future code).
create or replace function public.lv_guard_couple_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select kind from lv_spaces where id = new.space_id) = 'couple' then
    if (select count(*) from lv_space_members where space_id = new.space_id) >= 2 then
      raise exception 'This couple space already has its two people';
    end if;
    if exists (
      select 1 from lv_space_members m join lv_spaces s on s.id = m.space_id
      where m.user_id = new.user_id and s.kind = 'couple' and s.id <> new.space_id
    ) then
      raise exception 'You are already in a couple space';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists lv_guard_couple_insert_trg on public.lv_space_members;
create trigger lv_guard_couple_insert_trg before insert on public.lv_space_members
  for each row execute function public.lv_guard_couple_insert();

-- Creation now takes a kind. Drop the old signature first so the two
-- overloads cannot become ambiguous.
drop function public.lv_create_space(text, text);
create function public.lv_create_space(p_name text, p_emoji text default null, p_kind text default 'group')
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  if p_kind not in ('group', 'couple') then raise exception 'unknown space kind'; end if;
  if p_kind = 'couple' and exists (
    select 1 from lv_space_members m join lv_spaces s on s.id = m.space_id
    where m.user_id = auth.uid() and s.kind = 'couple'
  ) then
    raise exception 'You are already in a couple space';
  end if;
  insert into lv_spaces (name, emoji, kind, created_by)
  values (left(trim(p_name), 60), p_emoji, p_kind, auth.uid())
  returning id into v_id;
  insert into lv_space_members (space_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;
revoke all on function public.lv_create_space(text, text, text) from public, anon;
grant execute on function public.lv_create_space(text, text, text) to authenticated;

-- Joining gives couple-specific errors before the trigger's generic ones.
create or replace function public.lv_join_space(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_kind text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id, kind into v_id, v_kind from lv_spaces where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'Invalid invite code'; end if;
  if exists (select 1 from lv_space_members where space_id = v_id and user_id = auth.uid()) then
    return v_id;
  end if;
  if v_kind = 'couple' then
    if (select count(*) from lv_space_members where space_id = v_id) >= 2 then
      raise exception 'This couple space already has its two people';
    end if;
    if exists (
      select 1 from lv_space_members m join lv_spaces s on s.id = m.space_id
      where m.user_id = auth.uid() and s.kind = 'couple'
    ) then
      raise exception 'You are already in a couple space';
    end if;
  end if;
  insert into lv_space_members (space_id, user_id) values (v_id, auth.uid());
  return v_id;
end $$;

-- The join page needs to know it's a couple invite to phrase itself right.
drop function public.lv_invite_preview(text);
create function public.lv_invite_preview(p_code text)
returns table (space_id uuid, name text, emoji text, kind text, member_count bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.emoji, s.kind, count(m.user_id)
  from lv_spaces s left join lv_space_members m on m.space_id = s.id
  where s.invite_code = upper(trim(p_code))
  group by s.id
$$;
grant execute on function public.lv_invite_preview(text) to anon, authenticated;
