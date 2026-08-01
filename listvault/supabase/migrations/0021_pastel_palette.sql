-- APPLIED as migration `listvault_pastel_palette`.
-- Pastel palette: map previously stored solid colors to their pastel versions.
create or replace function pg_temp.lv_pastel(c text) returns text language sql as $$
  select case c
    when '#6c63ff' then '#948ce9'
    when '#2563eb' then '#93bff2'
    when '#d97706' then '#f4c17e'
    when '#db2777' then '#f0a2c0'
    when '#0d9488' then '#7fcfbf'
    when '#dc2626' then '#ef9f9f'
    else c
  end
$$;
update public.lv_lists set color = pg_temp.lv_pastel(color) where color is not null;
update public.lv_habits set color = pg_temp.lv_pastel(color) where color is not null;
