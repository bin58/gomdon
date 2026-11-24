create table if not exists public.gomdon_accounts (
  username text primary key,
  display_name text not null default '',
  pass_hash text not null,
  plan text not null default 'free',
  expires_at bigint,
  trial_used integer not null default 0,
  used_codes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gomdon_accounts enable row level security;

drop policy if exists "Allow anon select gomdon_accounts" on public.gomdon_accounts;
create policy "Allow anon select gomdon_accounts"
  on public.gomdon_accounts for select
  to anon
  using (true);

drop policy if exists "Allow anon insert gomdon_accounts" on public.gomdon_accounts;
create policy "Allow anon insert gomdon_accounts"
  on public.gomdon_accounts for insert
  to anon
  with check (true);

drop policy if exists "Allow anon update gomdon_accounts" on public.gomdon_accounts;
create policy "Allow anon update gomdon_accounts"
  on public.gomdon_accounts for update
  to anon
  using (true)
  with check (true);
