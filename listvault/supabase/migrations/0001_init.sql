-- ListVault v1 schema (PRD 5.1, 5.2, 5.3, 5.4, 8)
-- Apply with: supabase db push, or paste into the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Profiles (PRD 8: provider column now so adding Apple later is a migration)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  email text,
  provider text not null default 'google',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email, provider)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email,
    coalesce(new.raw_app_meta_data ->> 'provider', 'google')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Lists & items (PRD 5.1)
-- ---------------------------------------------------------------------------

-- Join code: 6 chars, unambiguous alphabet — no 0/O/1/I (PRD 5.2)
create or replace function public.generate_join_code()
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

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  emoji text,
  color text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  join_code text not null unique default public.generate_join_code(),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  checked boolean not null default false,
  added_by uuid references public.profiles (id) on delete set null,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_list_idx on public.items (list_id, position);
create index lists_owner_idx on public.lists (owner_id);
create index list_members_user_idx on public.list_members (user_id);

-- Owner is always a member.
create or replace function public.handle_new_list()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_list_created
  after insert on public.lists
  for each row execute function public.handle_new_list();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Full-text search (PRD 5.3: Postgres tsvector, no external service)
-- ---------------------------------------------------------------------------
alter table public.lists
  add column search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(name, ''))) stored;

alter table public.items
  add column search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(text, ''))) stored;

create index lists_search_idx on public.lists using gin (search_tsv);
create index items_search_idx on public.items using gin (search_tsv);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.items enable row level security;

-- Security-definer membership check avoids RLS recursion between
-- lists and list_members policies.
create or replace function public.is_list_member(p_list_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.list_members
    where list_id = p_list_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_list_owner(p_list_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.lists
    where id = p_list_id and owner_id = auth.uid()
  );
$$;

create or replace function public.list_is_active(p_list_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.lists
    where id = p_list_id and status = 'active'
  );
$$;

-- Profiles: any signed-in user can read (needed for member avatars /
-- attribution); only the owner can update their own row.
create policy "profiles readable by signed-in users"
  on public.profiles for select using (auth.role() = 'authenticated');
create policy "own profile updatable"
  on public.profiles for update using (id = auth.uid());

-- Lists
create policy "members read lists"
  on public.lists for select using (public.is_list_member(id));
create policy "users create own lists"
  on public.lists for insert with check (owner_id = auth.uid());
create policy "owner updates list"
  on public.lists for update using (owner_id = auth.uid());
create policy "owner deletes list"
  on public.lists for delete using (owner_id = auth.uid());

-- Members
create policy "members read members"
  on public.list_members for select using (public.is_list_member(list_id));
create policy "owner manages members"
  on public.list_members for delete
  using (public.is_list_owner(list_id) or user_id = auth.uid());
create policy "member updates own row"
  on public.list_members for update using (user_id = auth.uid());

-- Items: archived lists are read-only (PRD 5.4) — writes require active status.
create policy "members read items"
  on public.items for select using (public.is_list_member(list_id));
create policy "editors add items"
  on public.items for insert
  with check (public.is_list_member(list_id) and public.list_is_active(list_id) and added_by = auth.uid());
create policy "editors update items"
  on public.items for update
  using (public.is_list_member(list_id) and public.list_is_active(list_id));
create policy "editors delete items"
  on public.items for delete
  using (public.is_list_member(list_id) and public.list_is_active(list_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Join by code (PRD 5.2). Also serves the unauthenticated preview:
-- peek_list exposes only name + member count.
create or replace function public.peek_list(p_code text)
returns table (name text, emoji text, member_count bigint)
language sql
security definer set search_path = public
stable
as $$
  select l.name, l.emoji, count(m.user_id)
  from public.lists l
  left join public.list_members m on m.list_id = l.id
  where upper(l.join_code) = upper(p_code) and l.status = 'active'
  group by l.name, l.emoji;
$$;

create or replace function public.join_list_by_code(p_code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_list_id uuid;
  v_members int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select id into v_list_id
  from public.lists
  where upper(join_code) = upper(p_code) and status = 'active';

  if v_list_id is null then
    raise exception 'invalid or expired code';
  end if;

  select count(*) into v_members from public.list_members where list_id = v_list_id;
  if v_members >= 30 then
    -- PRD 5.1 soft cap: 30 members/list
    raise warning 'listvault: member cap hit for list %', v_list_id;
  end if;

  insert into public.list_members (list_id, user_id, role)
  values (v_list_id, auth.uid(), 'editor')
  on conflict do nothing;

  return v_list_id;
end;
$$;

create or replace function public.regenerate_join_code(p_list_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_list_owner(p_list_id) then
    raise exception 'only the owner can regenerate the code';
  end if;
  v_code := public.generate_join_code();
  update public.lists set join_code = v_code where id = p_list_id;
  return v_code;
end;
$$;

-- Full-text search across list names + item text (PRD 5.3).
create or replace function public.search_lists(
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
  from public.lists l
  cross join q
  join public.list_members m on m.list_id = l.id and m.user_id = auth.uid()
  left join public.items i on i.list_id = l.id and i.search_tsv @@ q.tsq
  where (l.search_tsv @@ q.tsq or i.id is not null)
    and (p_status = 'all' or l.status = p_status)
    and (p_year is null or extract(year from l.created_at) = p_year)
  order by l.id, i.created_at desc;
$$;

-- Duplicate an archived (or active) list into a new active list (PRD 5.4).
create or replace function public.duplicate_list(p_list_id uuid, p_include_checked boolean default true)
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
  if not public.is_list_member(p_list_id) then
    raise exception 'not a member of this list';
  end if;

  select name, emoji, color into v_name, v_emoji, v_color
  from public.lists where id = p_list_id;

  insert into public.lists (name, emoji, color, owner_id)
  values (v_name, v_emoji, v_color, auth.uid())
  returning id into v_new_id;

  -- Items restored unchecked (PRD 5.4)
  insert into public.items (list_id, text, checked, added_by, position)
  select v_new_id, text, false, auth.uid(), position
  from public.items
  where list_id = p_list_id and (p_include_checked or not checked)
  order by position;

  return v_new_id;
end;
$$;

-- Data export (PRD 4: export my data as JSON).
create or replace function public.export_my_data()
returns jsonb
language sql
security definer set search_path = public
stable
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'id' from public.profiles p where p.id = auth.uid()),
    'lists', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'name', l.name, 'emoji', l.emoji, 'status', l.status,
          'created_at', l.created_at, 'closed_at', l.closed_at,
          'items', (
            select coalesce(jsonb_agg(
              jsonb_build_object('text', i.text, 'checked', i.checked, 'created_at', i.created_at)
              order by i.position), '[]'::jsonb)
            from public.items i where i.list_id = l.id
          )
        )), '[]'::jsonb)
      from public.lists l
      join public.list_members m on m.list_id = l.id
      where m.user_id = auth.uid()
    )
  );
$$;

-- Account deletion (PRD 4). Owned lists cascade; memberships cascade.
create or replace function public.delete_my_account()
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

-- ---------------------------------------------------------------------------
-- Realtime (PRD: propagation <2s p95 via Supabase Realtime)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.lists;
alter publication supabase_realtime add table public.list_members;
