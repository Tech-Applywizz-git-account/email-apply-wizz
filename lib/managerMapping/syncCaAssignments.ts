import "server-only";

import { fetchCaCapacity, CaCapacityFetchError } from "@/lib/managerMapping/fetchCaCapacity";
import { normalizeCaRecord } from "@/lib/managerMapping/normalizeCaRecord";
import type { NormalizedCaAssignment } from "@/lib/managerMapping/types";

export interface SyncQueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface SyncSupabase {
  from(table: "manager_ca_assignments"): {
    upsert(payload: NormalizedCaAssignment[], options: { onConflict: string }): Promise<SyncQueryResult>;
  };
}

export interface CaSyncReport {
  ok: boolean;
  fetched_count: number;
  upserted_count: number;
  skipped_count: number;
  errorCode?: string;
}

/**
 * Fetches the CA capacity API, normalizes each record (dropping unmapped
 * teams and malformed rows), and upserts the rest keyed on ca_id — safe to
 * run repeatedly without duplicating rows. Never deactivates or deletes
 * CAs missing from a given run (mirrors the existing Leads Sync policy).
 */
export async function syncCaAssignments(supabase: SyncSupabase): Promise<CaSyncReport> {
  let rawRecords;
  try {
    rawRecords = await fetchCaCapacity();
  } catch (error) {
    const code = error instanceof CaCapacityFetchError ? error.code : "CA_CAPACITY_UNKNOWN_ERROR";
    return { ok: false, fetched_count: 0, upserted_count: 0, skipped_count: 0, errorCode: code };
  }

  const records: NormalizedCaAssignment[] = [];
  let skipped = 0;
  for (const raw of rawRecords) {
    const result = normalizeCaRecord(raw);
    if (result.ok) records.push(result.record);
    else skipped += 1;
  }

  if (records.length > 0) {
    const { error } = await supabase.from("manager_ca_assignments").upsert(records, { onConflict: "ca_id" });
    if (error) {
      return {
        ok: false,
        fetched_count: rawRecords.length,
        upserted_count: 0,
        skipped_count: skipped,
        errorCode: "DATABASE_ERROR",
      };
    }
  }

  return {
    ok: true,
    fetched_count: rawRecords.length,
    upserted_count: records.length,
    skipped_count: skipped,
  };
}
