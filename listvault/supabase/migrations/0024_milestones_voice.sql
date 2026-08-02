-- APPLIED as migration `listvault_milestones_voice`.
-- Milestones (anniversaries, birthdays, firsts) for the shared calendar.
create table public.lv_milestones (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  emoji text,
  date date not null,
  yearly boolean not null default true,
  created_by uuid not null references public.lv_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.lv_milestones enable row level security;
create policy "lv milestones read"
  on public.lv_milestones for select using (auth.role() = 'authenticated');
create policy "lv milestones insert"
  on public.lv_milestones for insert with check (created_by = auth.uid());
create policy "lv milestones update"
  on public.lv_milestones for update using (created_by = auth.uid());
create policy "lv milestones delete"
  on public.lv_milestones for delete using (created_by = auth.uid());

-- Voice-note answers on questions.
alter table public.lv_question_answers add column voice_url text;

-- Voice notes bucket: uid-prefix write, like receipts/memories.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lv-voice', 'lv-voice', true, 10485760, array['audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/webm'])
on conflict (id) do update set public = true;

create policy "lv voice select" on storage.objects for select to authenticated
  using (bucket_id = 'lv-voice');
create policy "lv voice insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lv-voice' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "lv voice delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lv-voice' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.lv_milestones;
