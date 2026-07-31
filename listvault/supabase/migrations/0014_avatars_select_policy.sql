-- Storage upsert (insert ... on conflict update) needs SELECT on the bucket's
-- objects; without it the first avatar upload fails RLS.
create policy "lv avatar select" on storage.objects for select to authenticated
  using (bucket_id = 'lv-avatars');
