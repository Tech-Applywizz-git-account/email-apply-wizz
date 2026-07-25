import { IconClients, IconMail, IconRefresh, IconWarning } from "@/components/icons";
import { CooBadge, EmptyState, MetricCard, SectionBlock } from "@/components/coo";
import { requireOperationsAccess } from "@/lib/dashboardAuth/requireOperationsAccess";
import { getEmailArrivalMonitorData, getRecentEmailActivity, formatIstTime } from "@/lib/zoho/emailArrival";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmailArrivalMonitorPage() {
  const session = await requireOperationsAccess();

  // NOTE: this page intentionally has TWO separate data sources (temporary — do not
  // unify in Step 3):
  //   1. The mailbox-level daily summary below ("Email Arrival by Client Mailbox",
  //      plus the Total Emails Today / Latest Email Time / Active Mailboxes Today
  //      metrics) is the original, approved Live Monitor. It uses the Leads API
  //      (getEmailArrivalMonitorData) and is the primary manager-scoped surface,
  //      scoped to the signed-in manager's allowed CAs.
  //   2. The "Recent Email Activity" per-email table is a secondary, supplementary
  //      view that uses the Supabase `clients` relation (getRecentEmailActivity).
  //      It is also scoped to the signed-in manager's CAs, but that scoping is not
  //      a substitute for — and must not be described as satisfying — the
  //      mailbox-level Live Monitor scoping in section 1 above.
  const scope = { role: session.user.role, email: session.user.email };
  const result = await getEmailArrivalMonitorData(scope);
  const recent = await getRecentEmailActivity(scope);

  return (
    <main className="coo-page coo-live-monitor-page">
      <meta httpEquiv="refresh" content="20" />
      <header className="coo-page__header">
        <div>
          <span className="coo-page__eyebrow">Live Monitor</span>
          <h1 className="coo-page__title">Live Email Arrival Monitor</h1>
          <p className="coo-page__subtitle">
            Real-time view of emails arriving in tracker today (12:00 AM – 11:59 PM IST)
          </p>
        </div>
      </header>

      {!result.ok ? (
        <EmptyState
          title="Live monitor data unavailable."
          description="Please refresh again in a moment."
        />
      ) : (
        <>
          <div className="coo-metric-grid--live-monitor">
            <MetricCard
              label="Total Emails Today"
              value={result.data.totalEmailsToday}
              hint="Grouped across all tracker mailboxes"
              icon={<IconMail size={18} />}
            />
            <MetricCard
              label="Latest Email Time"
              value={formatIstTime(result.data.latestEmailAt)}
              hint="Latest arrival in IST"
              icon={<IconRefresh size={18} />}
            />
            <MetricCard
              label="Active Mailboxes Today"
              value={result.data.activeMailboxesToday}
              hint="Mailboxes that received at least one email"
              icon={<IconClients size={18} />}
            />
            <MetricCard
              label="Silent Mailboxes Today"
              value="Not tracked yet"
              hint="Phase 1 has no mailbox roster to compare against"
              icon={<IconWarning size={18} />}
            />
          </div>

          <SectionBlock title="Email Arrival by Client Mailbox">
            <div className="coo-table-card">
              {result.data.rows.length === 0 ? (
                <EmptyState
                  title="No emails received today."
                  description="No tracker emails have been received since 12:00 AM today."
                />
              ) : (
                <table className="coo-table">
                  <thead>
                    <tr>
                      <th>Client Mailbox</th>
                      <th>Client Name</th>
                      <th>Assigned CA</th>
                      <th>CA Email</th>
                      <th>Emails Today</th>
                      <th>Latest Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.rows.map((row) => (
                      <tr key={row.originalRecipient}>
                        <td>{row.originalRecipient}</td>
                        <td>{row.clientName}</td>
                        <td>{row.assignedCaName}</td>
                        <td>{row.assignedCaEmail}</td>
                        <td>{row.emailsToday}</td>
                        <td>{formatIstTime(row.latestEmailAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </SectionBlock>
        </>
      )}

      {/* Section 2: per-email activity sourced from the Supabase `clients` relation. */}
      <SectionBlock title="Recent Email Activity">
        <div className="coo-table-card">
          {!recent.ok ? (
            <EmptyState title="Recent activity unavailable." description="Please refresh again in a moment." />
          ) : recent.rows.length === 0 ? (
            <EmptyState title="No email activity found" description="No emails have been ingested yet." />
          ) : (
            <table className="coo-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Sender</th>
                  <th>Subject</th>
                  <th>Client</th>
                  <th>Client mailbox</th>
                  <th>Assigned CA</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatIstTime(row.receivedAt)}</td>
                    <td>{row.sender ?? "—"}</td>
                    <td>{row.subject ?? "—"}</td>
                    <td>{row.clientName ?? "—"}</td>
                    <td>{row.originalRecipient ?? "—"}</td>
                    <td>
                      {row.assignedCaName ? (
                        <div className="coo-cell-stack">
                          <span>{row.assignedCaName}</span>
                          {row.assignedCaEmail ? <span className="coo-cell-subtext">{row.assignedCaEmail}</span> : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{row.category ?? "—"}</td>
                    <td>{row.classificationStatus ? <CooBadge label={row.classificationStatus} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionBlock>
    </main>
  );
}
