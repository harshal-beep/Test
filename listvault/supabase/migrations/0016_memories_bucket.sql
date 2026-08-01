-- Memory photos: public-read bucket, any household member may add photos under
-- their own uid prefix (<uid>/<item-id>.jpg).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lv-memories', 'lv-memories', true, 10485760, array['image/jpeg'])
on conflict (id) do update set public = true;

create policy "lv memory select" on storage.objects for select to authenticated
  using (bucket_id = 'lv-memories');
create policy "lv memory insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lv-memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lv memory update" on storage.objects for update to authenticated
  using (bucket_id = 'lv-memories' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'lv-memories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lv memory delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lv-memories' and (storage.foldername(name))[1] = auth.uid()::text);
