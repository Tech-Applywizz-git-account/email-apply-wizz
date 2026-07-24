import "server-only";

import { getLeadByEmail } from "@/lib/leadsApi/getLeadByEmail";
import { getAllowedCaEmailsForManager } from "@/lib/managerMapping/getAllowedCaEmails";
import { normalizeEmail } from "@/lib/managerMapping/normalizeEmail";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const IST_TIME_ZONE = "Asia/Kolkata";

export interface EmailArrivalRow {
  original_recipient: string | null;
  received_at: string | null;
}

export interface EmailArrivalMailboxSummary {
  originalRecipient: string;
  clientName: string;
  assignedCaName: string;
  assignedCaEmail: string;
  emailsToday: number;
  latestEmailAt: string;
}

export interface EmailArrivalMonitorData {
  rows: EmailArrivalMailboxSummary[];
  totalEmailsToday: number;
  latestEmailAt: string | null;
  activeMailboxesToday: number;
}

// ── Recent Email Activity (secondary, supplementary per-message table) ──────────
// This is a SEPARATE data source from the mailbox-level summary built by
// getEmailArrivalMonitorData below: the mailbox summary is the original, approved
// Live Monitor ("Email Arrival by Client Mailbox" — Total Emails Today / Latest
// Email Time / Active Mailboxes Today) and derives client/CA per mailbox from the
// Leads API (getLeadByEmail); it is the primary manager-scoped Live Monitor surface.
// This per-email view instead derives client/CA from the Supabase `clients` relation
// (FK zoho_email_metadata.client_id → clients.id). It was scoped by manager in an
// earlier task, but that scoping only covers this supplementary table — it must not
// be described as having completed Live Monitor manager scoping on its own. The two
// data sources are deliberately not unified in Step 3.

export interface LiveMonitorEmailRow {
  id: string;
  sender: string | null;
  subject: string | null;
  originalRecipient: string | null;
  receivedAt: string | null;
  classificationStatus: string | null;
  category: string | null;
  clientId: string | null;
  clientName: string | null;
  assignedCaName: string | null;
  assignedCaEmail: string | null;
}

export type GetRecentEmailActivityResult = { ok: true; rows: LiveMonitorEmailRow[] } | { ok: false };

export interface RecentActivityScope {
  role: "admin_ceo" | "manager_ops" | "ca";
  email: string;
}

const RECENT_ACTIVITY_LIMIT = 50;

// Non-admin scopes filter by assigned CA in-app (see `allowedCaEmails` below),
// which happens AFTER the Supabase row limit is applied. Fetching only
// RECENT_ACTIVITY_LIMIT rows globally would silently hide a manager's team
// activity whenever it doesn't fall in the global top-50 most-recent emails.
// Widening the query window to this ceiling before filtering — then slicing
// back down to RECENT_ACTIVITY_LIMIT after — is a bounded heuristic: still
// imperfect if a team has zero activity in the last 500 global emails, but
// far better than 50.
const SCOPED_FETCH_LIMIT = 500;

// Narrow local types: this repo has no generated Supabase types, and the embedded
// `clients` relation is not in any global type, so we type only the columns we read.
interface RecentEmailClientRelation {
  client_name: string | null;
  assigned_ca_name: string | null;
  assigned_ca_email: string | null;
}

interface RecentEmailQueryRow {
  id: string;
  sender: string | null;
  subject: string | null;
  original_recipient: string | null;
  received_at: string | null;
  classification_status: string | null;
  category: string | null;
  client_id: string | null;
  clients: RecentEmailClientRelation | RecentEmailClientRelation[] | null;
}

interface RecentActivitySupabase {
  from(table: string): {
    select(columns: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): Promise<{ data: RecentEmailQueryRow[] | null; error: { message: string } | null }>;
      };
    };
  };
}

export async function getRecentEmailActivity(scope: RecentActivityScope): Promise<GetRecentEmailActivityResult> {
  try {
    const supabase = createSupabaseServiceRoleClient() as unknown as RecentActivitySupabase;

    // Read-only. Left-joins the `clients` relation so unmapped rows (client is null)
    // remain visible. Never selects message body/content.
    // Non-admin roles fetch a wider window (SCOPED_FETCH_LIMIT) so the CA filter
    // below has enough rows to work with; admin_ceo keeps the tight limit since
    // it is never filtered.
    const fetchLimit = scope.role === "admin_ceo" ? RECENT_ACTIVITY_LIMIT : SCOPED_FETCH_LIMIT;
    const { data, error } = await supabase
      .from("zoho_email_metadata")
      .select(
        "id, sender, subject, original_recipient, received_at, classification_status, category, client_id, clients(client_name, assigned_ca_name, assigned_ca_email)",
      )
      .order("received_at", { ascending: false })
      .limit(fetchLimit);

    if (error || !data) return { ok: false };

    // admin_ceo is the ONLY unfiltered role. Every other role (including any
    // unexpected value that shouldn't reach here in practice, since `ca` is
    // already blocked by requireOperationsAccess()) is scoped through the
    // manager lookup, which safely yields an empty set — and therefore zero
    // rows below — for any email with no manager_ca_assignments rows.
    let allowedCaEmails: Set<string> | null = null;
    if (scope.role !== "admin_ceo") {
      allowedCaEmails = await getAllowedCaEmailsForManager(normalizeEmail(scope.email));
    }

    const rows: LiveMonitorEmailRow[] = data
      .map((row) => {
        const relation = Array.isArray(row.clients) ? (row.clients[0] ?? null) : row.clients;
        return {
          id: String(row.id),
          sender: row.sender ?? null,
          subject: row.subject ?? null,
          originalRecipient: row.original_recipient ?? null,
          receivedAt: row.received_at ?? null,
          classificationStatus: row.classification_status ?? null,
          category: row.category ?? null,
          clientId: row.client_id ?? null,
          clientName: relation?.client_name ?? null,
          assignedCaName: relation?.assigned_ca_name ?? null,
          assignedCaEmail: relation?.assigned_ca_email ?? null,
        };
      })
      .filter((row) => {
        if (!allowedCaEmails) return true; // admin_ceo: unfiltered
        const caEmail = row.assignedCaEmail ? normalizeEmail(row.assignedCaEmail) : null;
        return !!caEmail && allowedCaEmails.has(caEmail);
      })
      // For scoped (non-admin) roles the filter above runs on the wider
      // SCOPED_FETCH_LIMIT window fetched above, so re-apply the same
      // RECENT_ACTIVITY_LIMIT cap here that admin_ceo gets from the query itself.
      .slice(0, RECENT_ACTIVITY_LIMIT);

    return { ok: true, rows };
  } catch {
    return { ok: false };
  }
}

export type GetEmailArrivalMonitorResult = { ok: true; data: EmailArrivalMonitorData } | { ok: false };

interface SupabaseQuery {
  gte(column: string, value: string): SupabaseQuery;
  lte(column: string, value: string): SupabaseQuery;
  then(resolve: (value: { data: EmailArrivalRow[] | null; error: { message: string } | null }) => void): Promise<void>;
}

interface SupabaseLike {
  from(table: string): {
    select(columns: string): SupabaseQuery;
  };
}

export function getIstDayBounds(now = new Date()): { startUtc: string; endUtc: string } {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const startUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS);
  const endUtc = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 23, 59, 59, 999) - IST_OFFSET_MS);

  return {
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
  };
}

export function formatIstTime(value: string | null): string {
  if (!value) return "Not available yet";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

// The original, approved Live Monitor: mailbox-level daily summary (Total Emails
// Today / Latest Email Time / Active Mailboxes Today, and the "Email Arrival by
// Client Mailbox" table). This is the primary manager-scoped Live Monitor surface —
// scope follows the same fail-closed convention as getRecentEmailActivity above:
// admin_ceo is unfiltered, every other role is restricted to mailboxes whose
// assignedCaEmail resolves (via getAllowedCaEmailsForManager) to one of the
// signed-in manager's own CAs.
export async function getEmailArrivalMonitorData(
  scope: RecentActivityScope,
  now = new Date(),
): Promise<GetEmailArrivalMonitorResult> {
  try {
    const supabase = createSupabaseServiceRoleClient() as unknown as SupabaseLike;
    const { startUtc, endUtc } = getIstDayBounds(now);

    const { data, error } = await supabase
      .from("zoho_email_metadata")
      .select("original_recipient, received_at")
      .gte("received_at", startUtc)
      .lte("received_at", endUtc);

    if (error || !data) return { ok: false };

    const byMailbox = new Map<string, { emailsToday: number; latestEmailAt: string }>();
    for (const row of data) {
      const recipient = row.original_recipient?.trim();
      const receivedAt = row.received_at;
      if (!recipient || !receivedAt) continue;

      const existing = byMailbox.get(recipient);
      if (!existing) {
        byMailbox.set(recipient, { emailsToday: 1, latestEmailAt: receivedAt });
        continue;
      }

      existing.emailsToday += 1;
      if (receivedAt > existing.latestEmailAt) {
        existing.latestEmailAt = receivedAt;
      }
    }

    const rows = Array.from(byMailbox.entries())
      .map(([originalRecipient, value]) => ({
        originalRecipient,
        emailsToday: value.emailsToday,
        latestEmailAt: value.latestEmailAt,
      }))
      .sort((left, right) => right.latestEmailAt.localeCompare(left.latestEmailAt));

    const rowsWithLeads = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        ...(await getLeadByEmail(row.originalRecipient)),
      })),
    );

    // admin_ceo is the ONLY unfiltered role, same fail-closed convention as
    // getRecentEmailActivity: any other role value (including unexpected ones)
    // is scoped through the manager lookup, which safely yields an empty set
    // (and therefore zero rows) for any email with no manager_ca_assignments
    // rows. The "-" fallback sentinel (no Leads API match) never appears in a
    // manager's allowed-CA set, so it naturally never passes this filter.
    let allowedCaEmails: Set<string> | null = null;
    if (scope.role !== "admin_ceo") {
      allowedCaEmails = await getAllowedCaEmailsForManager(normalizeEmail(scope.email));
    }

    const scopedRows = allowedCaEmails
      ? rowsWithLeads.filter((row) => {
          const caEmail = row.assignedCaEmail ? normalizeEmail(row.assignedCaEmail) : null;
          return !!caEmail && allowedCaEmails.has(caEmail);
        })
      : rowsWithLeads;

    // Totals are recomputed from the (possibly filtered) scopedRows, never from
    // the original unfiltered rowsWithLeads, so a manager's aggregates reflect
    // only their own team's mailboxes.
    const totalEmailsToday = scopedRows.reduce((sum, row) => sum + row.emailsToday, 0);

    return {
      ok: true,
      data: {
        rows: scopedRows,
        totalEmailsToday,
        latestEmailAt: scopedRows[0]?.latestEmailAt ?? null,
        activeMailboxesToday: scopedRows.length,
      },
    };
  } catch {
    return { ok: false };
  }
}
