-- APPLIED as migration `listvault_notes`.
-- Notes: shared household notes + private notes (visible only to owner).
create table public.lv_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 20000),
  owner_id uuid not null references public.lv_profiles (id) on delete cascade,
  is_private boolean not null default false,
  updated_by uuid references public.lv_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lv_notes_owner_idx on public.lv_notes (owner_id);
create index lv_notes_updated_idx on public.lv_notes (updated_at desc);

alter table public.lv_notes
  add column search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))) stored;
create index lv_notes_search_idx on public.lv_notes using gin (search_tsv);

create trigger lv_notes_touch before update on public.lv_notes
  for each row execute function public.lv_touch_updated_at();

alter table public.lv_notes enable row level security;

-- Shared notes are visible and editable by every signed-in member (household
-- model); private notes only by their owner. Delete is owner-only.
create policy "lv notes read"
  on public.lv_notes for select
  using (auth.role() = 'authenticated' and (not is_private or owner_id = auth.uid()));
create policy "lv notes insert"
  on public.lv_notes for insert
  with check (owner_id = auth.uid());
create policy "lv notes update"
  on public.lv_notes for update
  using ((not is_private and auth.role() = 'authenticated') or owner_id = auth.uid());
create policy "lv notes delete"
  on public.lv_notes for delete
  using (owner_id = auth.uid());

alter publication supabase_realtime add table public.lv_notes;
