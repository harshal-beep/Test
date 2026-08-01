-- APPLIED as migration `listvault_us_questions_events`.
-- "Us": question deck with blind reveal, taste profiles, Mumbai events cache.

alter table public.lv_profiles add column tastes jsonb;

-- Question bank (curated seed + AI top-ups written by the edge function).
create table public.lv_questions (
  id uuid primary key default gen_random_uuid(),
  text text not null unique,
  mood text not null check (mood in ('fun', 'memories', 'preferences', 'deeper')),
  source text not null default 'curated',
  created_at timestamptz not null default now()
);

-- A drawn card. revealed_at is set by trigger when everyone has answered.
create table public.lv_question_rounds (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.lv_questions (id) on delete cascade,
  opened_by uuid not null references public.lv_profiles (id) on delete cascade,
  opened_at timestamptz not null default now(),
  revealed_at timestamptz
);

create table public.lv_question_answers (
  round_id uuid not null references public.lv_question_rounds (id) on delete cascade,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

-- Blind reveal, enforced in the database: when the second answer lands, the
-- round reveals. Security definer so the answering user may flip the flag
-- despite rounds having no client update policy.
create function public.lv_reveal_round() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from lv_question_answers where round_id = new.round_id) >= 2 then
    update lv_question_rounds set revealed_at = now()
    where id = new.round_id and revealed_at is null;
  end if;
  return new;
end $$;

create trigger lv_question_answers_reveal
  after insert on public.lv_question_answers
  for each row execute function public.lv_reveal_round();

alter table public.lv_questions enable row level security;
alter table public.lv_question_rounds enable row level security;
alter table public.lv_question_answers enable row level security;

create policy "lv questions read"
  on public.lv_questions for select using (auth.role() = 'authenticated');

create policy "lv rounds read"
  on public.lv_question_rounds for select using (auth.role() = 'authenticated');
create policy "lv rounds insert"
  on public.lv_question_rounds for insert with check (opened_by = auth.uid());
create policy "lv rounds discard"
  on public.lv_question_rounds for delete
  using (opened_by = auth.uid() and revealed_at is null);

-- The heart of blind reveal: you can see your own answer always, and the
-- other person's only once the round is revealed.
create policy "lv answers read"
  on public.lv_question_answers for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.lv_question_rounds r
      where r.id = round_id and r.revealed_at is not null
    )
  );
create policy "lv answers insert"
  on public.lv_question_answers for insert with check (user_id = auth.uid());

-- Mumbai events cache. Written only by the lv-us edge function (service
-- role); zero client write policies.
create table public.lv_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'ai',
  title text not null,
  category text,
  venue text,
  area text,
  starts_on date,
  price_text text,
  url text,
  reason text,
  score int,
  fetched_at timestamptz not null default now(),
  unique (title, starts_on)
);

create table public.lv_event_hides (
  event_id uuid not null references public.lv_events (id) on delete cascade,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  primary key (event_id, user_id)
);

alter table public.lv_events enable row level security;
alter table public.lv_event_hides enable row level security;

create policy "lv events read"
  on public.lv_events for select using (auth.role() = 'authenticated');
create policy "lv event hides read"
  on public.lv_event_hides for select using (auth.role() = 'authenticated');
create policy "lv event hides insert"
  on public.lv_event_hides for insert with check (user_id = auth.uid());
create policy "lv event hides delete"
  on public.lv_event_hides for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.lv_question_rounds;
alter publication supabase_realtime add table public.lv_question_answers;
