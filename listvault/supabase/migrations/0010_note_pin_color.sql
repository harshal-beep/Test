-- Notes: household pin + per-note color choice.
-- pinned notes surface at the top of the grid; color is a named pastel key
-- (null = stable auto color derived from the note id).
alter table public.lv_notes
  add column pinned boolean not null default false,
  add column color text;
