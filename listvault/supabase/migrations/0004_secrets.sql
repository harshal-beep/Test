-- APPLIED as migration `listvault_secrets`.
-- Server-side config store for HaMaara edge functions. RLS is enabled with NO
-- policies: anon/authenticated roles can never read it; only the service role
-- (used inside edge functions) can.
--
-- The OPENROUTER_API_KEY row is inserted out-of-band (never committed here):
--   insert into public.lv_secrets (key, value) values ('OPENROUTER_API_KEY', '<key>');
create table public.lv_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.lv_secrets enable row level security;
