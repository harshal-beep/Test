-- APPLIED as migration `listvault_round_progress`.
-- Who-has-answered counts for unrevealed rounds, without leaking answer text.
-- RLS hides the partner's answer row pre-reveal, so the client needs this to
-- show "Waiting for you" vs "Amaara has answered — your turn".
create function public.lv_round_progress()
returns table (round_id uuid, answered_by uuid[])
language sql security definer set search_path = public as $$
  select round_id, array_agg(user_id)
  from lv_question_answers
  group by round_id
$$;

revoke all on function public.lv_round_progress() from public;
grant execute on function public.lv_round_progress() to authenticated;
