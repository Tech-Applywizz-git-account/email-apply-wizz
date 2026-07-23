-- Live Monitor V1 — Phase S1: observability for Leads API → clients sync runs.
-- One row per attempt (dry runs included). Aggregate counts and safe summaries
-- only — never credentials, Authorization headers, raw API payloads, or any
-- per-client data.

create table public.client_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'leads_api',
  environment text,
  project_ref text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  http_status integer,
  declared_count integer,
  fetched_count integer,
  valid_count integer,
  invalid_count integer,
  inserted_count integer,
  updated_count integer,
  unchanged_count integer,
  mappable_count integer,
  contact_only_count integer,
  missing_email_count integer,
  duplicate_external_id_count integer,
  duplicate_recipient_count integer,
  null_associate_count integer,
  error_code text,
  safe_error_summary text
);

alter table public.client_sync_runs enable row level security;

revoke all on public.client_sync_runs from public, anon, authenticated;
grant select, insert, update on public.client_sync_runs to service_role;
