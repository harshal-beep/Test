-- ListVault v1 schema — APPLIED to Supabase project jxpxwxnrdljqzxxhlhkx
-- ("Jugaad AI") as migration `listvault_init`. Tables are lv_ prefixed because
-- the project is shared with other apps.
--
-- Auth: email/password. The first user to sign up becomes admin; admins manage
-- members via the lv-admin-users Edge Function (supabase/functions/).

create table public.lv_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  email text,
  provider text not null default 'email',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.lv_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_first boolean;
begin
  select count(*) = 0 into v_first from public.lv_profiles;
  insert into public.lv_profiles (id, display_name, avatar_url, email, provider, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email,
    coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    v_first
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger lv_on_auth_user_created
  after insert on auth.users
  for each row execute function public.lv_handle_new_user();

-- Join code: 6 chars, unambiguous alphabet — no 0/O/1/I (PRD 5.2)
create or replace function public.lv_generate_join_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

create table public.lv_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  emoji text,
  color text,
  owner_id uuid not null references public.lv_profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  join_code text not null unique default public.lv_generate_join_code(),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.lv_list_members (
  list_id uuid not null references public.lv_lists (id) on delete cascade,
  user_id uuid not null references public.lv_profiles (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.lv_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lv_lists (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  checked boolean not null default false,
  added_by uuid references public.lv_profiles (id) on delete set null,
  checked_by uuid references public.lv_profiles (id) on delete set null,
  checked_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lv_items_list_idx on public.lv_items (list_id, position);
create index lv_lists_owner_idx on public.lv_lists (owner_id);
create index lv_list_members_user_idx on public.lv_list_members (user_id);

create or replace function public.lv_handle_new_list()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.lv_list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger lv_on_list_created
  after insert on public.lv_lists
  for each row execute function public.lv_handle_new_list();

create or replace function public.lv_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger lv_items_touch before update on public.lv_items
  for each row execute function public.lv_touch_updated_at();

-- Full-text search: Postgres tsvector, no external service (PRD 5.3)
alter table public.lv_lists
  add column search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(name, ''))) stored;

alter table public.lv_items
  add column search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(text, ''))) stored;

create index lv_lists_search_idx on public.lv_lists using gin (search_tsv);
create index lv_items_search_idx on public.lv_items using gin (search_tsv);

-- Row Level Security
alter table public.lv_profiles enable row level security;
alter table public.lv_lists enable row level security;
alter table public.lv_list_members enable row level security;
alter table public.lv_items enable row level security;

create or replace function public.lv_is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.lv_profiles where id = auth.uid()), false);
$$;

-- Security-definer membership checks avoid RLS recursion between
-- lv_lists and lv_list_members policies.
create or replace function public.lv_is_list_member(p_list_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.lv_list_members
    where list_id = p_list_id and user_id = auth.uid()
  );
$$;

create or replace function public.lv_is_list_owner(p_list_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.lv_lists
    where id = p_list_id and owner_id = auth.uid()
  );
$$;

create or replace function public.lv_list_is_active(p_list_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.lv_lists
    where id = p_list_id and status = 'active'
  );
$$;

-- Only admins may change the is_admin flag.
create or replace function public.lv_guard_admin_flag()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.lv_is_admin() then
    raise exception 'only admins can change admin status';
  end if;
  return new;
end;
$$;

create trigger lv_profiles_admin_guard before update on public.lv_profiles
  for each row execute function public.lv_guard_admin_flag();

create policy "lv profiles readable by signed-in users"
  on public.lv_profiles for select using (auth.role() = 'authenticated');
create policy "lv own or admin profile update"
  on public.lv_profiles for update using (id = auth.uid() or public.lv_is_admin());

create policy "lv members read lists"
  on public.lv_lists for select using (public.lv_is_list_member(id));
create policy "lv users create own lists"
  on public.lv_lists for insert with check (owner_id = auth.uid());
create policy "lv owner updates list"
  on public.lv_lists for update using (owner_id = auth.uid());
create policy "lv owner deletes list"
  on public.lv_lists for delete using (owner_id = auth.uid());

create policy "lv members read members"
  on public.lv_list_members for select using (public.lv_is_list_member(list_id));
create policy "lv owner manages members"
  on public.lv_list_members for delete
  using (public.lv_is_list_owner(list_id) or user_id = auth.uid());
create policy "lv member updates own row"
  on public.lv_list_members for update using (user_id = auth.uid());

-- Archived lists are read-only (PRD 5.4) — writes require active status.
create policy "lv members read items"
  on public.lv_items for select using (public.lv_is_list_member(list_id));
create policy "lv editors add items"
  on public.lv_items for insert
  with check (public.lv_is_list_member(list_id) and public.lv_list_is_active(list_id) and added_by = auth.uid());
create policy "lv editors update items"
  on public.lv_items for update
  using (public.lv_is_list_member(list_id) and public.lv_list_is_active(list_id));
create policy "lv editors delete items"
  on public.lv_items for delete
  using (public.lv_is_list_member(list_id) and public.lv_list_is_active(list_id));

-- RPCs
create or replace function public.lv_peek_list(p_code text)
returns table (name text, emoji text, member_count bigint)
language sql
security definer set search_path = public
stable
as $$
  select l.name, l.emoji, count(m.user_id)
  from public.lv_lists l
  left join public.lv_list_members m on m.list_id = l.id
  where upper(l.join_code) = upper(p_code) and l.status = 'active'
  group by l.name, l.emoji;
$$;

create or replace function public.lv_join_list_by_code(p_code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_list_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select id into v_list_id
  from public.lv_lists
  where upper(join_code) = upper(p_code) and status = 'active';
  if v_list_id is null then
    raise exception 'invalid or expired code';
  end if;
  insert into public.lv_list_members (list_id, user_id, role)
  values (v_list_id, auth.uid(), 'editor')
  on conflict do nothing;
  return v_list_id;
end;
$$;

create or replace function public.lv_regenerate_join_code(p_list_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
begin
  if not public.lv_is_list_owner(p_list_id) then
    raise exception 'only the owner can regenerate the code';
  end if;
  v_code := public.lv_generate_join_code();
  update public.lv_lists set join_code = v_code where id = p_list_id;
  return v_code;
end;
$$;

create or replace function public.lv_search_lists(
  p_query text,
  p_status text default 'all',   -- 'active' | 'archived' | 'all'
  p_year int default null
)
returns table (
  list_id uuid,
  list_name text,
  emoji text,
  status text,
  closed_at timestamptz,
  created_at timestamptz,
  matched_item text
)
language sql
security definer set search_path = public
stable
as $$
  with q as (select websearch_to_tsquery('simple', p_query) as tsq)
  select distinct on (l.id)
    l.id, l.name, l.emoji, l.status, l.closed_at, l.created_at,
    case when i.search_tsv @@ q.tsq then i.text end
  from public.lv_lists l
  cross join q
  join public.lv_list_members m on m.list_id = l.id and m.user_id = auth.uid()
  left join public.lv_items i on i.list_id = l.id and i.search_tsv @@ q.tsq
  where (l.search_tsv @@ q.tsq or i.id is not null)
    and (p_status = 'all' or l.status = p_status)
    and (p_year is null or extract(year from l.created_at) = p_year)
  order by l.id, i.created_at desc;
$$;

create or replace function public.lv_duplicate_list(p_list_id uuid, p_include_checked boolean default true)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_id uuid;
  v_name text;
  v_emoji text;
  v_color text;
begin
  if not public.lv_is_list_member(p_list_id) then
    raise exception 'not a member of this list';
  end if;
  select name, emoji, color into v_name, v_emoji, v_color
  from public.lv_lists where id = p_list_id;
  insert into public.lv_lists (name, emoji, color, owner_id)
  values (v_name, v_emoji, v_color, auth.uid())
  returning id into v_new_id;
  -- Items restored unchecked (PRD 5.4)
  insert into public.lv_items (list_id, text, checked, added_by, position)
  select v_new_id, text, false, auth.uid(), position
  from public.lv_items
  where list_id = p_list_id and (p_include_checked or not checked)
  order by position;
  return v_new_id;
end;
$$;

create or replace function public.lv_export_my_data()
returns jsonb
language sql
security definer set search_path = public
stable
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'id' from public.lv_profiles p where p.id = auth.uid()),
    'lists', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'name', l.name, 'emoji', l.emoji, 'status', l.status,
          'created_at', l.created_at, 'closed_at', l.closed_at,
          'items', (
            select coalesce(jsonb_agg(
              jsonb_build_object('text', i.text, 'checked', i.checked, 'created_at', i.created_at)
              order by i.position), '[]'::jsonb)
            from public.lv_items i where i.list_id = l.id
          )
        )), '[]'::jsonb)
      from public.lv_lists l
      join public.lv_list_members m on m.list_id = l.id
      where m.user_id = auth.uid()
    )
  );
$$;

create or replace function public.lv_delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Realtime (propagation <2s p95 via Supabase Realtime)
alter publication supabase_realtime add table public.lv_items;
alter publication supabase_realtime add table public.lv_lists;
alter publication supabase_realtime add table public.lv_list_members;
