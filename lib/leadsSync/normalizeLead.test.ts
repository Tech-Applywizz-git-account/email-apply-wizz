import { describe, expect, it } from "vitest";

import { classifyEmailDomain, normalizeLead } from "@/lib/leadsSync/normalizeLead";
import type { LeadsApiLead, NormalizedClientRecord } from "@/lib/leadsSync/types";

const fullLead: LeadsApiLead = {
  id: 1745,
  name: "Example Client",
  email: "example.client@applywizard.ai",
  status: "In Progress",
  targetRoleName: "AI/ML Engineer",
  yearsExp: 0,
  location: "Connecticut",
  plan: "Standard",
  startDate: "2026-07-08",
  endDate: null,
  created_at: "2026-07-08T05:59:29.435251Z",
  number_of_applications: "20+",
  clientPreferences: { secret: "never stored" },
  assigned_associate: { id: 2026, name: "Example Associate", email: "Associate@applywizz.ai" },
};

// Exactly the clients columns the sync is allowed to write. Guards against raw
// payload fields (clientPreferences, tokens, anything new the API adds) ever
// leaking into an upsert.
const ALLOWED_RECORD_KEYS = [
  "external_client_id",
  "source",
  "client_name",
  "contact_email",
  "recipient_email",
  "source_status",
  "is_active",
  "is_recipient_mappable",
  "assigned_ca_external_id",
  "assigned_ca_name",
  "assigned_ca_email",
  "plan",
  "target_role",
  "years_experience",
  "location",
  "number_of_applications",
  "start_date",
  "end_date",
  "source_created_at",
].sort();

describe("normalizeLead", () => {
  it("maps a complete @applywizard.ai lead to a mappable active record", () => {
    const result = normalizeLead(fullLead);

    expect(result).toEqual({
      ok: true,
      emailDomainClass: "applywizard",
      record: {
        external_client_id: "1745",
        source: "leads_api",
        client_name: "Example Client",
        contact_email: "example.client@applywizard.ai",
        recipient_email: "example.client@applywizard.ai",
        source_status: "In Progress",
        is_active: true,
        is_recipient_mappable: true,
        assigned_ca_external_id: "2026",
        assigned_ca_name: "Example Associate",
        assigned_ca_email: "associate@applywizz.ai",
        plan: "Standard",
        target_role: "AI/ML Engineer",
        years_experience: 0,
        location: "Connecticut",
        number_of_applications: "20+",
        start_date: "2026-07-08",
        end_date: null,
        source_created_at: "2026-07-08T05:59:29.435Z",
      } satisfies NormalizedClientRecord,
    });
  });

  it("trims and preserves contact_email casing while lowercasing the recipient mapping key", () => {
    const result = normalizeLead({ ...fullLead, email: "  Client@ApplyWizard.AI  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.contact_email).toBe("Client@ApplyWizard.AI");
    expect(result.record.recipient_email).toBe("client@applywizard.ai");
    expect(result.record.is_recipient_mappable).toBe(true);
  });

  it("keeps a Gmail lead synchronized as contact-only, never inventing a mailbox", () => {
    const result = normalizeLead({ ...fullLead, email: "old.client@gmail.com" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailDomainClass).toBe("gmail");
    expect(result.record.contact_email).toBe("old.client@gmail.com");
    expect(result.record.recipient_email).toBeNull();
    expect(result.record.is_recipient_mappable).toBe(false);
    expect(result.record.is_active).toBe(true);
  });

  it("treats other external domains as contact-only", () => {
    const result = normalizeLead({ ...fullLead, email: "client@outlook.com" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailDomainClass).toBe("external");
    expect(result.record.recipient_email).toBeNull();
    expect(result.record.is_recipient_mappable).toBe(false);
  });

  it("nulls contact_email for missing and malformed emails", () => {
    const missing = normalizeLead({ ...fullLead, email: null });
    const invalid = normalizeLead({ ...fullLead, email: "not-an-email" });

    expect(missing.ok && missing.emailDomainClass).toBe("missing");
    expect(invalid.ok && invalid.emailDomainClass).toBe("invalid");
    if (missing.ok) expect(missing.record.contact_email).toBeNull();
    if (invalid.ok) {
      expect(invalid.record.contact_email).toBeNull();
      expect(invalid.record.is_recipient_mappable).toBe(false);
    }
  });

  it("handles a null or empty assigned_associate as null CA fields", () => {
    for (const associate of [null, undefined, {}]) {
      const result = normalizeLead({ ...fullLead, assigned_associate: associate as LeadsApiLead["assigned_associate"] });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.record.assigned_ca_external_id).toBeNull();
      expect(result.record.assigned_ca_name).toBeNull();
      expect(result.record.assigned_ca_email).toBeNull();
    }
  });

  it("rejects leads without a usable id or name", () => {
    expect(normalizeLead({ ...fullLead, id: null })).toEqual({ ok: false, reason: "missing_id" });
    expect(normalizeLead({ ...fullLead, id: "  " })).toEqual({ ok: false, reason: "missing_id" });
    expect(normalizeLead({ ...fullLead, name: "" })).toEqual({ ok: false, reason: "missing_name" });
    expect(normalizeLead({ ...fullLead, name: "   " })).toEqual({ ok: false, reason: "missing_name" });
  });

  it("degrades malformed optional fields to null instead of failing the record", () => {
    const result = normalizeLead({
      ...fullLead,
      yearsExp: "three",
      startDate: "07/08/2026",
      endDate: "soon",
      created_at: "not-a-date",
      number_of_applications: 20,
      plan: 7,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.years_experience).toBeNull();
    expect(result.record.start_date).toBeNull();
    expect(result.record.end_date).toBeNull();
    expect(result.record.source_created_at).toBeNull();
    expect(result.record.number_of_applications).toBeNull();
    expect(result.record.plan).toBeNull();
  });

  it("emits only whitelisted clients columns — clientPreferences and unknown fields never leak", () => {
    const result = normalizeLead({
      ...fullLead,
      clientPreferences: { resume: "sensitive" },
      ...( { authorization: "Basic abc", password: "nope" } as Partial<LeadsApiLead>),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.record).sort()).toEqual(ALLOWED_RECORD_KEYS);
    expect(JSON.stringify(result.record)).not.toContain("sensitive");
    expect(JSON.stringify(result.record)).not.toContain("Basic abc");
  });
});

describe("classifyEmailDomain", () => {
  it("classifies domains case-insensitively while preserving the trimmed email", () => {
    expect(classifyEmailDomain(" Client@ApplyWizard.AI ")).toEqual({
      emailDomainClass: "applywizard",
      contactEmail: "Client@ApplyWizard.AI",
    });
    expect(classifyEmailDomain("a@GMAIL.com").emailDomainClass).toBe("gmail");
    expect(classifyEmailDomain("a@b.co").emailDomainClass).toBe("external");
    expect(classifyEmailDomain(undefined).emailDomainClass).toBe("missing");
    expect(classifyEmailDomain("with space@x.com").emailDomainClass).toBe("invalid");
  });
});
