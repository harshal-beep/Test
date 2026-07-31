-- Habits: weekly goal targets. 7 = daily (default, matches old behavior);
-- 1-6 = "n times a week" habits tracked against the current Mon-Sun week.
alter table public.lv_habits
  add column target_per_week int not null default 7
  check (target_per_week between 1 and 7);
