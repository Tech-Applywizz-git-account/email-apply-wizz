import { describe, expect, it } from "vitest";

import { prepareSyncBatch } from "@/lib/leadsSync/prepareSyncBatch";
import type { LeadsApiLead } from "@/lib/leadsSync/types";

function lead(overrides: Partial<LeadsApiLead>): LeadsApiLead {
  return {
    id: 1,
    name: "Client",
    email: "client@applywizard.ai",
    status: "In Progress",
    assigned_associate: { id: 9, name: "CA", email: "ca@applywizz.ai" },
    ...overrides,
  };
}

describe("prepareSyncBatch", () => {
  it("aggregates metrics across mappable, contact-only, missing-email, and invalid leads", () => {
    const result = prepareSyncBatch([
      lead({ id: 1, email: "a@applywizard.ai" }),
      lead({ id: 2, email: "b@gmail.com", assigned_associate: null }),
      lead({ id: 3, email: "c@outlook.com" }),
      lead({ id: 4, email: null }),
      lead({ id: 5, email: "broken" }),
      lead({ id: null }), // invalid: missing id
      lead({ id: 7, name: " " }), // invalid: missing name
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records).toHaveLength(5);
    expect(result.metrics).toEqual({
      fetched_count: 7,
      valid_count: 5,
      invalid_count: 2,
      mappable_count: 1,
      contact_only_count: 2, // gmail + outlook
      missing_email_count: 2, // null + malformed
      duplicate_external_id_count: 0,
      duplicate_recipient_count: 0,
      null_associate_count: 1,
    });
  });

  it("fails the whole batch on duplicate external ids", () => {
    const result = prepareSyncBatch([
      lead({ id: 1, email: "a@applywizard.ai" }),
      lead({ id: 2, email: "b@applywizard.ai" }),
      lead({ id: 1, name: "Same Id Again", email: "c@applywizard.ai" }),
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("DUPLICATE_EXTERNAL_ID");
    expect(result.metrics.duplicate_external_id_count).toBe(1);
    expect("records" in result).toBe(false);
  });

  it("quarantines every record sharing a recipient without blocking unrelated rows", () => {
    const result = prepareSyncBatch([
      lead({ id: 1, email: "Shared@ApplyWizard.ai" }),
      lead({ id: 2, email: "shared@applywizard.ai" }), // case-insensitive duplicate
      lead({ id: 3, email: "unique@applywizard.ai" }),
      lead({ id: 4, email: "contact@gmail.com" }),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byId = new Map(result.records.map((r) => [r.external_client_id, r]));
    for (const id of ["1", "2"]) {
      const quarantined = byId.get(id)!;
      expect(quarantined.recipient_email).toBeNull();
      expect(quarantined.is_recipient_mappable).toBe(false);
      // Quarantine removes mapping only — identity and contact data stay synchronized.
      expect(quarantined.is_active).toBe(true);
      expect(quarantined.contact_email).not.toBeNull();
    }

    expect(byId.get("3")!.recipient_email).toBe("unique@applywizard.ai");
    expect(byId.get("3")!.is_recipient_mappable).toBe(true);

    expect(result.metrics.duplicate_recipient_count).toBe(2);
    expect(result.metrics.mappable_count).toBe(1);
    expect(result.metrics.contact_only_count).toBe(3); // 2 quarantined + 1 gmail
  });

  it("produces only aggregate numeric metrics — no payload data in the summary", () => {
    const result = prepareSyncBatch([lead({ id: 1 })]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const value of Object.values(result.metrics)) {
      expect(typeof value).toBe("number");
    }
    expect(JSON.stringify(result.metrics)).not.toContain("@");
  });
});
