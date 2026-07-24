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
  last_synced_at timestamptz not null default now()
);

create index if not exists manager_ca_assignments_manager_email_idx
  on manager_ca_assignments (manager_email);
