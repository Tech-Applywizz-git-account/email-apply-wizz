// Leads API → clients sync types (Live Monitor V1, Phase S1).
// Pure types only — no fetch, no Supabase, no credentials.

/** Raw associate object as received from the Leads API. May be null, {}, or partial. */
export interface LeadsApiAssignedAssociate {
  id?: unknown;
  name?: unknown;
  email?: unknown;
}

/** Raw lead row as received from the Leads API. Every field is untrusted. */
export interface LeadsApiLead {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  status?: unknown;
  targetRoleName?: unknown;
  yearsExp?: unknown;
  location?: unknown;
  plan?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  created_at?: unknown;
  number_of_applications?: unknown;
  /** Present in the API payload but deliberately never normalized or stored. */
  clientPreferences?: unknown;
  assigned_associate?: LeadsApiAssignedAssociate | null;
}

/** Top-level list envelope (DRF-style) from the filtered leads endpoint. */
export interface LeadsApiListResponse {
  count?: unknown;
  next?: unknown;
  previous?: unknown;
  results?: unknown;
  total_count?: unknown;
  status_counts?: unknown;
}

export type EmailDomainClass = "applywizard" | "gmail" | "external" | "missing" | "invalid";

/**
 * Exactly the clients columns a sync upsert is allowed to write.
 * recipient_email_normalized is DB-generated and must not appear here;
 * clientPreferences is never stored.
 */
export interface NormalizedClientRecord {
  external_client_id: string;
  source: "leads_api";
  client_name: string;
  contact_email: string | null;
  recipient_email: string | null;
  source_status: string | null;
  is_active: true;
  is_recipient_mappable: boolean;
  assigned_ca_external_id: string | null;
  assigned_ca_name: string | null;
  assigned_ca_email: string | null;
  plan: string | null;
  target_role: string | null;
  years_experience: number | null;
  location: string | null;
  number_of_applications: string | null;
  start_date: string | null;
  end_date: string | null;
  source_created_at: string | null;
}

export type NormalizeLeadFailureReason = "missing_id" | "missing_name";

export type NormalizeLeadResult =
  | { ok: true; record: NormalizedClientRecord; emailDomainClass: EmailDomainClass }
  | { ok: false; reason: NormalizeLeadFailureReason };

/** Aggregate counts only — column names match client_sync_runs. */
export interface SyncBatchMetrics {
  fetched_count: number;
  valid_count: number;
  invalid_count: number;
  mappable_count: number;
  contact_only_count: number;
  missing_email_count: number;
  duplicate_external_id_count: number;
  duplicate_recipient_count: number;
  null_associate_count: number;
}

export type PrepareSyncBatchResult =
  | { ok: true; records: NormalizedClientRecord[]; metrics: SyncBatchMetrics }
  | { ok: false; errorCode: "DUPLICATE_EXTERNAL_ID"; metrics: SyncBatchMetrics };
