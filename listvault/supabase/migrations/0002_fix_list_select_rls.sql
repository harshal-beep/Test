-- APPLIED as migration `listvault_fix_list_select_rls`.
--
-- Bug: creating a list failed with an RLS violation. The app inserts with
-- `.select()` (INSERT ... RETURNING), and RETURNING evaluates SELECT policies
-- before the AFTER-insert trigger has created the owner's lv_list_members row
-- — so the membership-based SELECT policy rejected the just-created list.
-- Owners must be able to see their lists directly, not only via membership.
drop policy "lv members read lists" on public.lv_lists;
create policy "lv members read lists"
  on public.lv_lists for select
  using (owner_id = auth.uid() or public.lv_is_list_member(id));
