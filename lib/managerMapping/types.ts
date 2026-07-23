// Manager-to-CA mapping types (foundation + Live Monitor scoping).
// Pure types only — no fetch, no Supabase, no credentials.

/** Raw CA record as received from the CA capacity API. Every field is untrusted. */
export interface CaCapacityApiRecord {
  ca_id?: unknown;
  name?: unknown;
  email?: unknown;
  designation?: unknown;
  min_capacity?: unknown;
  max_capacity?: unknown;
  system_name?: unknown;
  team_name?: unknown;
  weighted_active_load?: unknown;
  pending_assignments?: unknown;
  effective_load?: unknown;
  available_capacity?: unknown;
  deficit_to_min?: unknown;
  utilization_percentage?: unknown;
  productivity_average?: unknown;
}

/** Exactly the columns a manager_ca_assignments upsert is allowed to write. */
export interface NormalizedCaAssignment {
  ca_id: string;
  ca_name: string;
  ca_email: string;
  team_name: string;
  manager_name: string;
  manager_email: string;
  system_name: string | null;
  designation: string | null;
  is_active: true;
}

export type NormalizeCaFailureReason = "missing_ca_id" | "missing_email" | "missing_name" | "unmapped_team";

export type NormalizeCaResult =
  | { ok: true; record: NormalizedCaAssignment }
  | { ok: false; reason: NormalizeCaFailureReason };
