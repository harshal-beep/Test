-- 0026: scope the SECURITY DEFINER helpers to space membership.
-- Pre-spaces these only required "signed in", which becomes a cross-space
-- leak the moment strangers can sign up.

drop function public.lv_search_lists(text, text, integer);
create or replace function public.lv_search_lists(
  p_query text,
  p_status text default 'all',
  p_year integer default null,
  p_space uuid default null
)
returns table (
  list_id uuid, list_name text, emoji text, status text,
  closed_at timestamptz, created_at timestamptz, matched_item text
)
language sql stable security definer set search_path = public as $$
  with q as (select websearch_to_tsquery('simple', p_query) as tsq)
  select distinct on (l.id)
    l.id, l.name, l.emoji, l.status, l.closed_at, l.created_at,
    case when i.search_tsv @@ q.tsq then i.text end
  from public.lv_lists l
  cross join q
  left join public.lv_items i on i.list_id = l.id and i.search_tsv @@ q.tsq
  where auth.uid() is not null
    and public.lv_is_member(l.space_id)
    and (p_space is null or l.space_id = p_space)
    and (l.search_tsv @@ q.tsq or i.id is not null)
    and (p_status = 'all' or l.status = p_status)
    and (p_year is null or extract(year from l.created_at) = p_year)
  order by l.id, i.created_at desc;
$$;

create or replace function public.lv_round_progress()
returns table (round_id uuid, answered_by uuid[])
language sql stable security definer set search_path = public as $$
  select a.round_id, array_agg(a.user_id)
  from lv_question_answers a
  join lv_question_rounds r on r.id = a.round_id
  where public.lv_is_member(r.space_id)
  group by a.round_id
$$;
