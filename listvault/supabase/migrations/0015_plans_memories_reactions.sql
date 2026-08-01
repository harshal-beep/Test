-- Items gain a planned date and, once done, a memory (note + photo).
alter table public.lv_items
  add column planned_for date,
  add column memory_note text,
  add column memory_photo text;

create index lv_items_planned_idx on public.lv_items (planned_for)
  where planned_for is not null;

-- Reactions: one row per (item, person, emoji).
create table public.lv_item_reactions (
  item_id uuid not null references public.lv_items (id) on delete cascade,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id, emoji)
);

-- Comments: the back-and-forth stays on the item.
create table public.lv_item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.lv_items (id) on delete cascade,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index lv_item_comments_item_idx on public.lv_item_comments (item_id, created_at);

alter table public.lv_item_reactions enable row level security;
alter table public.lv_item_comments enable row level security;

create policy "lv reactions read"
  on public.lv_item_reactions for select using (auth.role() = 'authenticated');
create policy "lv reactions insert"
  on public.lv_item_reactions for insert with check (user_id = auth.uid());
create policy "lv reactions delete"
  on public.lv_item_reactions for delete using (user_id = auth.uid());

create policy "lv comments read"
  on public.lv_item_comments for select using (auth.role() = 'authenticated');
create policy "lv comments insert"
  on public.lv_item_comments for insert with check (user_id = auth.uid());
create policy "lv comments delete"
  on public.lv_item_comments for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.lv_item_reactions;
alter publication supabase_realtime add table public.lv_item_comments;
