-- APPLIED as migration `listvault_question_options_signals`.
-- Questions can carry predefined choices; answers may be a choice, text, or both.
alter table public.lv_questions add column options text[];

alter table public.lv_question_answers alter column body drop not null;
alter table public.lv_question_answers drop constraint lv_question_answers_body_check;
alter table public.lv_question_answers add column choice text check (char_length(choice) <= 120);
alter table public.lv_question_answers add constraint lv_qa_content
  check (choice is not null or (body is not null and char_length(body) between 1 and 2000));

-- Learning signals for the recommendation engine. Written by the client on
-- explicit actions (added an event +, hid an event -); the ranker also derives
-- signals from completed-item history at refresh time.
create table public.lv_taste_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  category text not null,
  weight int not null check (weight between -10 and 10),
  source text not null,
  created_at timestamptz not null default now()
);
create index lv_taste_signals_user_idx on public.lv_taste_signals (user_id, created_at desc);

alter table public.lv_taste_signals enable row level security;
create policy "lv signals read"
  on public.lv_taste_signals for select using (auth.role() = 'authenticated');
create policy "lv signals insert"
  on public.lv_taste_signals for insert with check (user_id = auth.uid());

-- Curated choice-based questions (text stays optional alongside the chips).
insert into public.lv_questions (text, mood, options) values
('Pick our next date theme:', 'fun', array['Food crawl', 'Movie night', 'Long drive', 'Game night']),
('Rain starts mid-date. We:', 'fun', array['Dance in it', 'Run for chai', 'Uber home', 'Keep walking under one umbrella']),
('If we get ₹5000 to blow tonight:', 'fun', array['Concert', 'Feast', 'Shopping spree', 'Save it, boring 😌']),
('Who usually says sorry first?', 'fun', array['Me', 'You', 'Whoever cracks a joke first', 'We both go silent']),
('Perfect Sunday morning together?', 'preferences', array['Sleep in', 'Chai + long walk', 'Big breakfast out', 'Workout together']),
('How do you recharge after a heavy week?', 'preferences', array['Alone time', 'Time with you', 'Friends', 'Getting out of the city']),
('Choose one forever:', 'preferences', array['Street food', 'Fine dining']),
('Ideal trip length for us:', 'preferences', array['Day trip', 'Weekend', 'A full week', 'Pack up and move']),
('Late-night craving that always wins:', 'preferences', array['Maggi', 'Ice cream', 'Kebabs', 'Sleep is my craving']),
('Our best date so far was…', 'memories', array['The very first one', 'A spontaneous one', 'A planned fancy one', 'A lazy at-home one']),
('What do you crave more right now?', 'deeper', array['More time together', 'More adventure', 'More calm', 'More clarity about the future']),
('When we disagree, I mostly need…', 'deeper', array['Space first', 'To talk it out right away', 'A hug before words', 'To write it down first']);
