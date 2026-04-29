-- The Hawkeye Open — Supabase schema
-- Run this entire block in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- Tables -----------------------------------------------------------------

create table if not exists rooms (
  code        text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  room_code   text not null references rooms(code) on delete cascade,
  name        text not null,
  pee_total   int  not null default 0,
  puke_total  int  not null default 0,
  updated_at  timestamptz not null default now(),
  unique (room_code, name)
);

create table if not exists scores (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  hole_num   int  not null,
  value      numeric not null default 0,
  total      numeric not null default 0,
  hole_type  text,
  par        int,
  unique (player_id, hole_num)
);

create index if not exists players_room_idx on players(room_code);
create index if not exists scores_player_idx on scores(player_id);

-- Row-Level Security: open policies for anon-key access ------------------

alter table rooms   enable row level security;
alter table players enable row level security;
alter table scores  enable row level security;

drop policy if exists "rooms_all"   on rooms;
drop policy if exists "players_all" on players;
drop policy if exists "scores_all"  on scores;

create policy "rooms_all"   on rooms   for all using (true) with check (true);
create policy "players_all" on players for all using (true) with check (true);
create policy "scores_all"  on scores  for all using (true) with check (true);

-- Realtime publication ---------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'players'
  ) then
    execute 'alter publication supabase_realtime add table players';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'scores'
  ) then
    execute 'alter publication supabase_realtime add table scores';
  end if;
end $$;
