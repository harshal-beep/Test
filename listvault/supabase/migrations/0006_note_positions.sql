-- APPLIED as migration `listvault_note_positions`.
-- Manual ordering for notes (drag & drop). Higher position = earlier in grid.
alter table public.lv_notes add column position double precision not null default 0;
update public.lv_notes set position = extract(epoch from updated_at) * 1000;
