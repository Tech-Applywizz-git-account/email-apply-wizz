-- Phase 3C: add classifier audit fields to zoho_email_metadata.
-- All columns are nullable so existing classified rows remain valid.
alter table public.zoho_email_metadata
  add column priority text
    check (priority in ('critical', 'high', 'normal', 'low')),
  add column reason text,
  add column classifier_source text
    check (classifier_source in ('deterministic', 'regex', 'ai'));
