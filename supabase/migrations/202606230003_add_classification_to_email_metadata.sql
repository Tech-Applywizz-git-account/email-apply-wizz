alter table public.zoho_email_metadata
  add column category text,
  add column confidence numeric,
  add column source_portal text,
  add column needs_human_review boolean,
  add column action_required text,
  add column deadline date,
  add column classified_at timestamptz,
  add column classification_status text not null default 'pending'
    check (classification_status in ('pending', 'classified', 'failed'));
