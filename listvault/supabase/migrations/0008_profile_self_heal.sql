-- APPLIED as migration `listvault_profile_self_heal`.
-- Allow a signed-in user to (re)create their own profile row, so the client
-- can self-heal if the row is ever missing. Insert is restricted to own id;
-- the admin-flag guard trigger still prevents privilege escalation.
create policy "lv own profile insert"
  on public.lv_profiles for insert
  with check (id = auth.uid());
