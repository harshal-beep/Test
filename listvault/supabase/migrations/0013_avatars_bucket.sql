-- Profile photos: public-read bucket, each user may only write their own
-- <uid>.jpg object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lv-avatars', 'lv-avatars', true, 5242880, array['image/jpeg'])
on conflict (id) do update set public = true;

create policy "lv avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lv-avatars' and name = auth.uid()::text || '.jpg');
create policy "lv avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'lv-avatars' and name = auth.uid()::text || '.jpg')
  with check (bucket_id = 'lv-avatars' and name = auth.uid()::text || '.jpg');
create policy "lv avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lv-avatars' and name = auth.uid()::text || '.jpg');
