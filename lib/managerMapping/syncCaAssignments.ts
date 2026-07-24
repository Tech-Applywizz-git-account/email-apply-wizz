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
    select(columns: string): {
      eq(column: string, value: boolean): Promise<{ data: Array<{ ca_id: string }> | null; error: { message: string } | null }>;
    };
    update(payload: { is_active: false }): {
      in(column: string, values: string[]): Promise<SyncQueryResult>;
    };
  };
}

export interface CaSyncReport {
  ok: boolean;
  fetched_count: number;
  upserted_count: number;
  skipped_count: number;
  deactivated_count: number;
  errorCode?: string;
}

/**
 * Fetches the CA capacity API, normalizes each record (dropping unmapped
 * teams and malformed rows), and upserts the rest keyed on ca_id — safe to
 * run repeatedly without duplicating rows. If a CA transfers teams, the
 * upsert overwrites manager_name/manager_email with the freshly resolved
 * values (normalizeCaRecord recomputes them from team_name every run).
 *
 * Reconciliation: ONLY after a fetch that both succeeded AND produced at
 * least one valid record, any previously active row whose ca_id is absent
 * from this run's valid ID set is marked is_active = false — a
 * former/transferred-out/removed CA no longer authorizes its old manager.
 * A failed fetch, an all-invalid/empty pull, or a DB error while computing
 * the diff all skip reconciliation for this run rather than guessing —
 * fail closed on trusting the pull, but self-correcting on the next run.
 */
export async function syncCaAssignments(supabase: SyncSupabase): Promise<CaSyncReport> {
  let rawRecords;
  try {
    rawRecords = await fetchCaCapacity();
  } catch (error) {
    const code = error instanceof CaCapacityFetchError ? error.code : "CA_CAPACITY_UNKNOWN_ERROR";
    return { ok: false, fetched_count: 0, upserted_count: 0, skipped_count: 0, deactivated_count: 0, errorCode: code };
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
    };
  }

  const { error: upsertError } = await supabase
    .from("manager_ca_assignments")
    .upsert(records, { onConflict: "ca_id" });

  if (upsertError) {
    return {
      ok: false,
      fetched_count: rawRecords.length,
      upserted_count: 0,
      skipped_count: skipped,
      deactivated_count: 0,
      errorCode: "DATABASE_ERROR",
    };
  }

  const validCaIds = new Set(records.map((record) => record.ca_id));
  let deactivated = 0;

  const { data: activeRows, error: selectError } = await supabase
    .from("manager_ca_assignments")
    .select("ca_id")
    .eq("is_active", true);

  if (!selectError) {
    const staleIds = (activeRows ?? [])
      .map((row) => row.ca_id)
      .filter((caId) => !validCaIds.has(caId));

    if (staleIds.length > 0) {
      const { error: deactivateError } = await supabase
        .from("manager_ca_assignments")
        .update({ is_active: false })
        .in("ca_id", staleIds);

      if (!deactivateError) deactivated = staleIds.length;
    }
  }

  return {
    ok: true,
    fetched_count: rawRecords.length,
    upserted_count: records.length,
    skipped_count: skipped,
    deactivated_count: deactivated,
  };
}
