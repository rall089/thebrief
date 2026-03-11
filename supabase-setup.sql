-- Run this in Supabase → SQL Editor → New query

create table if not exists usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null unique,
  generations int default 0 not null,
  is_subscribed boolean default false not null,
  stripe_customer_id text,
  created_at timestamptz default now()
);

alter table usage enable row level security;

create policy "Users can read own usage"
  on usage for select
  using (auth.uid() = user_id);

create index if not exists usage_stripe_idx on usage(stripe_customer_id);
