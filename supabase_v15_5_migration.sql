-- Crypto Analyzer V15.5 migration
-- 기존 V15/V15.4 Supabase 프로젝트 사용자는 SQL Editor에서 이 파일을 1회 실행하세요.

alter table public.signal_events add column if not exists signal_candle_time timestamptz;
alter table public.signal_events add column if not exists outcome_status text;
alter table public.signal_events add column if not exists outcome_horizon integer;
alter table public.signal_events add column if not exists outcome_return_pct numeric;
alter table public.signal_events add column if not exists mfe_pct numeric;
alter table public.signal_events add column if not exists mae_pct numeric;
alter table public.signal_events add column if not exists outcome_hit boolean;
alter table public.signal_events add column if not exists evaluated_at timestamptz;

create index if not exists signal_events_outcome_pending_idx
  on public.signal_events(outcome_status, created_at);
