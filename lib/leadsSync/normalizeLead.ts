// normalizeLead — pure normalization of one raw Leads API lead into the exact
// clients upsert shape (Live Monitor V1, Phase S1). No network, no DB, no logging.
//
// Rules (approved design):
// - `id` and non-empty `name` are required; anything else degrades to null.
// - The API email always maps to contact_email (when it parses as an email).
// - Only an @applywizard.ai email maps to recipient_email — a Gmail/external
//   client stays synchronized but unmappable. Mailbox addresses are NEVER invented.
// - assigned_associate may be null/{} — CA columns become null.
// - clientPreferences is never read into the output.

import type {
  EmailDomainClass,
  LeadsApiLead,
  NormalizeLeadResult,
} from "@/lib/leadsSync/types";

const RECIPIENT_DOMAIN = "@applywizard.ai";
// ponytail: simple shape check, not RFC 5322 — mirrors extractRecipient's approach.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Accepts the API's integer ids and numeric strings; anything else is invalid. */
function asExternalId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asTrimmedString(value);
}

export function classifyEmailDomain(value: unknown): {
  emailDomainClass: EmailDomainClass;
  contactEmail: string | null;
} {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return { emailDomainClass: "missing", contactEmail: null };
  if (!EMAIL_RE.test(trimmed)) return { emailDomainClass: "invalid", contactEmail: null };

  const lower = trimmed.toLowerCase();
  if (lower.endsWith(RECIPIENT_DOMAIN)) return { emailDomainClass: "applywizard", contactEmail: trimmed };
  if (lower.endsWith("@gmail.com")) return { emailDomainClass: "gmail", contactEmail: trimmed };
  return { emailDomainClass: "external", contactEmail: trimmed };
}

function asIsoDate(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed && ISO_DATE_RE.test(trimmed) ? trimmed : null;
}

function asIsoTimestamp(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function asNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function normalizeLead(lead: LeadsApiLead): NormalizeLeadResult {
  const externalClientId = asExternalId(lead.id);
  if (!externalClientId) return { ok: false, reason: "missing_id" };

  const clientName = asTrimmedString(lead.name);
  if (!clientName) return { ok: false, reason: "missing_name" };

  const { emailDomainClass, contactEmail } = classifyEmailDomain(lead.email);
  const isMappable = emailDomainClass === "applywizard";

  const associate = lead.assigned_associate ?? null;
  const associateEmail = asTrimmedString(associate?.email);

  return {
    ok: true,
    emailDomainClass,
    record: {
      external_client_id: externalClientId,
      source: "leads_api",
      client_name: clientName,
      contact_email: contactEmail,
      // Mapping key is the normalized (lowercased, trimmed) form; contact_email
      // keeps the API's casing. Matches recipient_email_normalized's lower(trim()).
      recipient_email: isMappable && contactEmail ? contactEmail.toLowerCase() : null,
      source_status: asTrimmedString(lead.status),
      is_active: true,
      is_recipient_mappable: isMappable,
      assigned_ca_external_id: asExternalId(associate?.id),
      assigned_ca_name: asTrimmedString(associate?.name),
      assigned_ca_email: associateEmail ? associateEmail.toLowerCase() : null,
      plan: asTrimmedString(lead.plan),
      target_role: asTrimmedString(lead.targetRoleName),
      years_experience: asNonNegativeInteger(lead.yearsExp),
      location: asTrimmedString(lead.location),
      number_of_applications: asTrimmedString(lead.number_of_applications),
      start_date: asIsoDate(lead.startDate),
      end_date: asIsoDate(lead.endDate),
      source_created_at: asIsoTimestamp(lead.created_at),
    },
  };
}
