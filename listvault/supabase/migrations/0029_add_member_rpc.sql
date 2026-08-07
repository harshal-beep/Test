-- 0029: an owner-only way to add someone to a space.
-- 0025 shipped lv_space_members with read and delete policies but no insert,
-- so the only route in was redeeming an invite code. Admins adding an
-- existing account to a space had no working path at all.

create or replace function public.lv_add_member(p_space uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.lv_is_space_owner(p_space) then raise exception 'owner only'; end if;
  if not exists (select 1 from lv_profiles where id = p_user) then raise exception 'no such account'; end if;
  insert into lv_space_members (space_id, user_id) values (p_space, p_user)
  on conflict (space_id, user_id) do nothing;
end $$;

revoke all on function public.lv_add_member(uuid, uuid) from public, anon;
grant execute on function public.lv_add_member(uuid, uuid) to authenticated;
