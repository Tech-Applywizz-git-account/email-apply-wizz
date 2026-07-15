-- Live Monitor V1 — Phase S1: extend clients into a synchronized Leads API cache.
-- Additive only: no rows deleted, the UUID primary key is unchanged, and the
-- fk_email_client FK from zoho_email_metadata.client_id (202607140001) is untouched.

alter table public.clients
  add column external_client_id text,
  add column source text not null default 'leads_api',
  add column contact_email text,
  add column source_status text,
  add column is_recipient_mappable boolean not null default false,
  add column assigned_ca_external_id text,
  add column plan text,
  add column target_role text,
  add column years_experience integer,
  add column location text,
  add column number_of_applications text,
  add column start_date date,
  add column end_date date,
  add column source_created_at timestamptz,
  add column source_updated_at timestamptz,
  add column last_synced_at timestamptz,
  add column sync_generation uuid;

-- Gmail/external-email clients have no ApplyWizz mailbox, and a lead's
-- assigned_associate may be null — these columns can no longer be required.
alter table public.clients
  alter column recipient_email drop not null,
  alter column assigned_ca_name drop not null,
  alter column assigned_ca_email drop not null;

-- recipient_email_normalized stays the generated column from 202607140001
-- (lower(trim(recipient_email))): with recipient_email nullable it yields NULL,
-- and its existing UNIQUE constraint treats NULLs as distinct — which is exactly
-- the required partial uniqueness over non-null normalized recipients.

-- Sync identity key. Partial: rows that predate the sync (e.g. the preview seed
-- client) have no external id and must not collide with each other.
create unique index clients_source_external_id_unique
  on public.clients (source, external_client_id)
  where external_client_id is not null;

create index clients_is_active_idx on public.clients (is_active);
create index clients_is_recipient_mappable_idx on public.clients (is_recipient_mappable);
create index clients_assigned_ca_external_id_idx on public.clients (assigned_ca_external_id);
