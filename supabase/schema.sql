-- Run once in the SQL Editor of your own Supabase project.
create table if not exists public.user_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id bigint not null,
  status text check (status in ('saved','watched')),
  rating text check (rating in ('like','dislike')),
  corrections jsonb not null default '{}'::jsonb,
  card jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id,item_id)
);
alter table public.user_items enable row level security;
revoke all on public.user_items from anon;
grant select, insert, update, delete on public.user_items to authenticated;
drop policy if exists own_items on public.user_items;
create policy own_items on public.user_items for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);
