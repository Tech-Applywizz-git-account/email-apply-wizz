// prepareSyncBatch — pure batch preparation for the Leads API → clients sync
// (Live Monitor V1, Phase S1). Normalizes every raw lead, applies duplicate
// policy, and produces the aggregate metrics that client_sync_runs records.
//
// Duplicate policy (approved design):
// - Duplicate external ids: the payload's identity is untrustworthy → fail the
//   whole batch (DUPLICATE_EXTERNAL_ID), no records returned.
// - Duplicate @applywizard.ai recipients: never pick a winner — every record in
//   the conflicting group is quarantined from mapping (recipient_email = null,
//   is_recipient_mappable = false) but stays in the batch, so unrelated valid
//   rows are never blocked.

import { normalizeLead } from "@/lib/leadsSync/normalizeLead";
import type {
  LeadsApiLead,
  NormalizedClientRecord,
  PrepareSyncBatchResult,
  SyncBatchMetrics,
} from "@/lib/leadsSync/types";

function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase();
}

function buildMetrics(
  fetched: number,
  invalid: number,
  records: NormalizedClientRecord[],
  duplicateExternalIdCount: number,
  duplicateRecipientCount: number,
): SyncBatchMetrics {
  return {
    fetched_count: fetched,
    valid_count: records.length,
    invalid_count: invalid,
    mappable_count: records.filter((r) => r.is_recipient_mappable).length,
    contact_only_count: records.filter((r) => !r.is_recipient_mappable && r.contact_email !== null).length,
    missing_email_count: records.filter((r) => r.contact_email === null).length,
    duplicate_external_id_count: duplicateExternalIdCount,
    duplicate_recipient_count: duplicateRecipientCount,
    null_associate_count: records.filter(
      (r) => r.assigned_ca_external_id === null && r.assigned_ca_name === null && r.assigned_ca_email === null,
    ).length,
  };
}

export function prepareSyncBatch(leads: LeadsApiLead[]): PrepareSyncBatchResult {
  const records: NormalizedClientRecord[] = [];
  let invalidCount = 0;

  for (const lead of leads) {
    const result = normalizeLead(lead);
    if (result.ok) records.push(result.record);
    else invalidCount++;
  }

  // Duplicate external ids → fail the whole batch.
  const seenIds = new Set<string>();
  let duplicateExternalIdCount = 0;
  for (const record of records) {
    if (seenIds.has(record.external_client_id)) duplicateExternalIdCount++;
    else seenIds.add(record.external_client_id);
  }
  if (duplicateExternalIdCount > 0) {
    return {
      ok: false,
      errorCode: "DUPLICATE_EXTERNAL_ID",
      metrics: buildMetrics(leads.length, invalidCount, records, duplicateExternalIdCount, 0),
    };
  }

  // Duplicate recipients → quarantine every record in the conflicting group.
  const byRecipient = new Map<string, NormalizedClientRecord[]>();
  for (const record of records) {
    if (!record.recipient_email) continue;
    const key = normalizeRecipient(record.recipient_email);
    byRecipient.set(key, [...(byRecipient.get(key) ?? []), record]);
  }

  let duplicateRecipientCount = 0;
  for (const group of byRecipient.values()) {
    if (group.length < 2) continue;
    duplicateRecipientCount += group.length;
    for (const record of group) {
      record.recipient_email = null;
      record.is_recipient_mappable = false;
    }
  }

  return {
    ok: true,
    records,
    metrics: buildMetrics(leads.length, invalidCount, records, 0, duplicateRecipientCount),
  };
}
