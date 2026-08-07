-- 0027: let the person who added an expense edit it.
-- 0025 gave lv_expenses read/insert/delete but no update, so a typo in an
-- amount could only be fixed by deleting and re-adding the whole thing.
-- Shares are rewritten via the existing creator-only insert/delete policies.

create policy "lv expenses update" on public.lv_expenses for update
  using (created_by = auth.uid() and public.lv_is_member(space_id))
  with check (created_by = auth.uid() and public.lv_is_member(space_id));

create policy "lv settlements update" on public.lv_settlements for update
  using (created_by = auth.uid() and public.lv_is_member(space_id))
  with check (created_by = auth.uid() and public.lv_is_member(space_id));
