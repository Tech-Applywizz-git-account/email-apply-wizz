create table public.zoho_email_metadata (
  id uuid primary key default gen_random_uuid(),
  zoho_connection_id uuid references public.zoho_connections(id) on delete cascade,
  mailbox_email text not null,
  message_id text not null,
  sender text not null,
  subject text not null,
  received_at timestamptz not null,
  folder_id text not null,
  folder_name text not null,
  has_attachments boolean not null default false,
  attachment_count integer not null default 0,
  sync_status text not null default 'synced'
    check (sync_status in ('synced', 'error', 'pending')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mailbox_email, message_id)
);

alter table public.zoho_email_metadata enable row level security;

revoke all on public.zoho_email_metadata from public, anon, authenticated;
grant select, insert, update, delete on public.zoho_email_metadata to service_role;
