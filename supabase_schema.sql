-- Crypto Analyzer V15.5
-- Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_device_id_idx on public.push_subscriptions(device_id);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  market text not null default 'KRW-BTC',
  tf text not null default '240',
  min_score integer not null default 5,
  min_quality integer not null default 70,
  min_adx numeric not null default 25,
  min_vol_ratio numeric not null default 0,
  require_regime text not null default 'ANY',
  cooldown_minutes integer not null default 240,
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alert_rules_device_id_idx on public.alert_rules(device_id);
create index if not exists alert_rules_enabled_idx on public.alert_rules(enabled);

create table if not exists public.signal_events (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  rule_id uuid references public.alert_rules(id) on delete set null,
  market text not null,
  tf text not null,
  score integer,
  quality integer,
  adx numeric,
  vol_ratio numeric,
  regime text,
  price numeric,
  signal_candle_time timestamptz,
  outcome_status text,
  outcome_horizon integer,
  outcome_return_pct numeric,
  mfe_pct numeric,
  mae_pct numeric,
  outcome_hit boolean,
  evaluated_at timestamptz,
  push_sent boolean not null default false,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists signal_events_device_id_created_at_idx on public.signal_events(device_id,created_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.alert_rules enable row level security;
alter table public.signal_events enable row level security;
-- 공개 policy는 만들지 않습니다. Vercel 서버의 service_role key만 사용합니다.
