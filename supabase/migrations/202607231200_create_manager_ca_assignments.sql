create table if not exists manager_ca_assignments (
  ca_id text primary key,
  ca_name text not null,
  ca_email text not null,
  team_name text not null,
  manager_name text not null,
  manager_email text not null,
  system_name text,
  designation text,
  is_active boolean not null default true,
  -- Consecutive sync runs this CA was missing from a valid Router pull while
  -- still marked active. Reset to 0 whenever the CA reappears in a valid
  -- pull; reaching 3 quarantines it (is_active = false). See
  -- sync_ca_assignments below for the atomic reconciliation.
  missing_run_count integer not null default 0
    check (missing_run_count >= 0),
  last_synced_at timestamptz not null default now()
);

create index if not exists manager_ca_assignments_manager_email_idx
  on manager_ca_assignments (manager_email);

alter table manager_ca_assignments enable row level security;

revoke all on manager_ca_assignments from public, anon, authenticated;
grant select, insert, update, delete on manager_ca_assignments to service_role;

-- Atomically upserts a validated CA pull and reconciles missing CAs in one
-- transaction, so a failure partway through (bad row, constraint violation,
-- connection drop) rolls back the whole run instead of leaving upserts
-- applied but quarantine counters untouched (or vice versa).
--
-- Reconciliation: any currently-active row whose ca_id is NOT in this run's
-- p_records is a "missing" candidate — its missing_run_count is incremented,
-- and it is only quarantined (is_active = false) once that count reaches 3
-- consecutive missing runs. A CA that reappears in p_records has its
-- missing_run_count reset to 0 and is_active forced back to true in the same
-- upsert, regardless of prior quarantine state. Team transfers are handled by
-- the upsert overwriting manager_name/manager_email every run.
create or replace function public.sync_ca_assignments(p_records jsonb)
returns table (
  upserted_count integer,
  deactivated_count integer,
  quarantined_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid_ids text[];
  v_upserted integer := 0;
  v_deactivated integer := 0;
  v_quarantined integer := 0;
  v_conflicting_ca_id text;
begin
  -- Defense in depth: the JS caller (syncCaAssignments.ts) already refuses to
  -- call this RPC on an empty/all-invalid pull, but if this function is ever
  -- invoked directly with a null/malformed/empty payload, do nothing rather
  -- than let "zero valid records" be read as "every active CA is missing"
  -- and quarantine the whole roster.
  if p_records is null
    or jsonb_typeof(p_records) is distinct from 'array'
    or jsonb_array_length(p_records) = 0
  then
    return query select 0, 0, 0;
    return;
  end if;

  -- Conflicting-duplicate guard: a manager assignment is authorization data,
  -- so if the same ca_id appears twice in one pull with DIFFERENT field
  -- values, guessing which one is correct is not acceptable — fail the whole
  -- run instead. Byte-for-byte identical duplicates are not a conflict (the
  -- inner `distinct` collapses them to one row) and proceed normally.
  select ca_id into v_conflicting_ca_id
  from (
    select distinct
      value ->> 'ca_id' as ca_id,
      value ->> 'ca_name' as ca_name,
      value ->> 'ca_email' as ca_email,
      value ->> 'team_name' as team_name,
      value ->> 'manager_name' as manager_name,
      value ->> 'manager_email' as manager_email,
      value ->> 'system_name' as system_name,
      value ->> 'designation' as designation
    from jsonb_array_elements(p_records)
  ) distinct_incoming
  group by ca_id
  having count(*) > 1
  limit 1;

  if v_conflicting_ca_id is not null then
    raise exception 'sync_ca_assignments: ca_id % appears more than once with conflicting field values in this pull', v_conflicting_ca_id;
  end if;

  select coalesce(array_agg(value ->> 'ca_id'), array[]::text[])
    into v_valid_ids
  from jsonb_array_elements(p_records);

  with incoming as (
    -- `distinct` (whole-row): safe here because the conflict guard above
    -- already proved every ca_id has at most one distinct set of field
    -- values in this pull, so this can only be collapsing true duplicates,
    -- never picking one of several different records.
    select distinct
      value ->> 'ca_id' as ca_id,
      value ->> 'ca_name' as ca_name,
      value ->> 'ca_email' as ca_email,
      value ->> 'team_name' as team_name,
      value ->> 'manager_name' as manager_name,
      value ->> 'manager_email' as manager_email,
      value ->> 'system_name' as system_name,
      value ->> 'designation' as designation
    from jsonb_array_elements(p_records)
  ),
  upsert as (
    insert into public.manager_ca_assignments as m
      (ca_id, ca_name, ca_email, team_name, manager_name, manager_email, system_name, designation, is_active, missing_run_count, last_synced_at)
    select ca_id, ca_name, ca_email, team_name, manager_name, manager_email, system_name, designation, true, 0, now()
    from incoming
    on conflict (ca_id) do update
      set ca_name = excluded.ca_name,
          ca_email = excluded.ca_email,
          team_name = excluded.team_name,
          manager_name = excluded.manager_name,
          manager_email = excluded.manager_email,
          system_name = excluded.system_name,
          designation = excluded.designation,
          is_active = true,
          missing_run_count = 0,
          last_synced_at = now()
    returning m.ca_id
  )
  select count(*) into v_upserted from upsert;

  with missing as (
    update public.manager_ca_assignments
    set missing_run_count = missing_run_count + 1,
        is_active = (missing_run_count + 1) < 3
    where is_active = true
      and not (ca_id = any(v_valid_ids))
    returning is_active
  )
  select
    coalesce(count(*) filter (where is_active = false), 0),
    coalesce(count(*) filter (where is_active = true), 0)
    into v_deactivated, v_quarantined
  from missing;

  return query select v_upserted, v_deactivated, v_quarantined;
end;
$$;

revoke all on function public.sync_ca_assignments(jsonb) from public, anon, authenticated;
grant execute on function public.sync_ca_assignments(jsonb) to service_role;
