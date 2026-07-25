import "server-only";

import { fetchCaCapacity, CaCapacityFetchError } from "@/lib/managerMapping/fetchCaCapacity";
import { normalizeCaRecord } from "@/lib/managerMapping/normalizeCaRecord";
import type { NormalizedCaAssignment } from "@/lib/managerMapping/types";

export interface SyncRpcResult {
  data: Array<{ upserted_count: number; deactivated_count: number; quarantined_count: number }> | null;
  error: { message: string } | null;
}

export interface SyncSupabase {
  rpc(fn: "sync_ca_assignments", args: { p_records: NormalizedCaAssignment[] }): Promise<SyncRpcResult>;
}

export interface CaSyncReport {
  ok: boolean;
  fetched_count: number;
  upserted_count: number;
  skipped_count: number;
  deactivated_count: number;
  quarantined_count: number;
  errorCode?: string;
}

/**
 * Fetches the CA capacity API, normalizes each record (dropping unmapped
 * teams and malformed rows), then hands the validated records to the
 * `sync_ca_assignments` Postgres function, which upserts them and reconciles
 * missing CAs in a single transaction (see the migration for the SQL).
 *
 * Reconciliation runs ONLY after a fetch that both succeeded AND produced at
 * least one valid record — a failed fetch or an all-invalid/empty pull skips
 * the RPC entirely rather than guessing. Within the RPC, a CA missing from
 * three consecutive valid pulls is quarantined (is_active = false); fewer
 * than three just increments its missing-run counter, and reappearing in a
 * later pull resets the counter and reactivates it. Because upsert and
 * reconciliation share one transaction, an RPC failure leaves the database
 * untouched for this run rather than applying one half — fail closed on
 * trusting the pull, self-correcting on the next run.
 */
export async function syncCaAssignments(supabase: SyncSupabase): Promise<CaSyncReport> {
  let rawRecords;
  try {
    rawRecords = await fetchCaCapacity();
  } catch (error) {
    const code = error instanceof CaCapacityFetchError ? error.code : "CA_CAPACITY_UNKNOWN_ERROR";
    return {
      ok: false,
      fetched_count: 0,
      upserted_count: 0,
      skipped_count: 0,
      deactivated_count: 0,
      quarantined_count: 0,
      errorCode: code,
    };
  }

  const records: NormalizedCaAssignment[] = [];
  let skipped = 0;
  for (const raw of rawRecords) {
    const result = normalizeCaRecord(raw);
    if (result.ok) records.push(result.record);
    else skipped += 1;
  }

  if (records.length === 0) {
    return {
      ok: true,
      fetched_count: rawRecords.length,
      upserted_count: 0,
      skipped_count: skipped,
      deactivated_count: 0,
      quarantined_count: 0,
    };
  }

  const { data, error } = await supabase.rpc("sync_ca_assignments", { p_records: records });

  if (error || !data || !data[0]) {
    return {
      ok: false,
      fetched_count: rawRecords.length,
      upserted_count: 0,
      skipped_count: skipped,
      deactivated_count: 0,
      quarantined_count: 0,
      errorCode: "DATABASE_ERROR",
    };
  }

  const { upserted_count, deactivated_count, quarantined_count } = data[0];

  return {
    ok: true,
    fetched_count: rawRecords.length,
    upserted_count,
    skipped_count: skipped,
    deactivated_count,
    quarantined_count,
  };
}
