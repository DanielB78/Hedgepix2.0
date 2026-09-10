-- Optional: dedicated follows table (app currently stores follows in auth user_metadata).
-- Apply in Supabase SQL Editor when convenient for querying at scale.

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('ticker', 'member')),
  target_key text not null,
  target_label text,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_key)
);

create index if not exists user_follows_user_id_idx
  on public.user_follows (user_id);

alter table public.user_follows enable row level security;

create policy "Users read own follows"
  on public.user_follows for select
  using (auth.uid() = user_id);

create policy "Users insert own follows"
  on public.user_follows for insert
  with check (auth.uid() = user_id);

create policy "Users delete own follows"
  on public.user_follows for delete
  using (auth.uid() = user_id);
