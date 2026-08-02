-- APPLIED as migration `listvault_expense_pro`.
-- Splitwise-Pro-style upgrades: categories, scanned receipt photo, line items.
alter table public.lv_expenses
  add column category text,
  add column receipt_url text,
  add column items jsonb;

-- Receipt photos: public-read bucket, write only under your own uid prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lv-receipts', 'lv-receipts', true, 10485760, array['image/jpeg'])
on conflict (id) do update set public = true;

create policy "lv receipt select" on storage.objects for select to authenticated
  using (bucket_id = 'lv-receipts');
create policy "lv receipt insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lv-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lv receipt delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lv-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
