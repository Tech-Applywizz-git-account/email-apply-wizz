create table public.zoho_connections (
  id uuid primary key default gen_random_uuid(),
  zoho_account_id text not null unique,
  email_address text not null unique,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired', 'error')),
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  last_refresh_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zoho_connections enable row level security;

revoke all on public.zoho_connections from public, anon, authenticated;
grant select, insert, update, delete on public.zoho_connections to service_role;
