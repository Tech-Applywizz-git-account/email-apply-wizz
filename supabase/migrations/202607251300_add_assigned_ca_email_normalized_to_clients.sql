-- clients (202607140001) is already live in Production, so this is a new,
-- additive migration rather than an amendment to that one.
--
-- Same pattern as the existing recipient_email_normalized column on this
-- table: DB-enforced normalization so case/whitespace differences between
-- manager_ca_assignments.ca_email (already lower(trim()) on write, see
-- normalizeCaRecord) and clients.assigned_ca_email (populated by the leads
-- sync, casing not guaranteed) can't cause a manager-scoped query to miss a
-- row it should see.
alter table public.clients
  add column assigned_ca_email_normalized text generated always as (lower(trim(assigned_ca_email))) stored;

create index if not exists idx_clients_assigned_ca_email_normalized
  on public.clients (assigned_ca_email_normalized);
