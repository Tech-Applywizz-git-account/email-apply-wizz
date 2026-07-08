import { notFound } from "next/navigation";

import { getInterviewById } from "@/lib/zoho/operationsTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: string | null): string {
  if (!value) return "Not available yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInterviewById(id);

  if (!result.ok) {
    notFound();
  }

  const row = result.row;

  return (
    <main className="coo-page coo-interview-detail-page">
      <header className="coo-page__header">
        <div>
          <span className="coo-page__eyebrow">Email Metadata Details</span>
          <h1 className="coo-page__title">{row.company_name ?? "Not available yet"}</h1>
          <p className="coo-page__subtitle">{row.job_title ?? "Not available yet"}</p>
        </div>
      </header>

      <dl className="coo-detail-list">
        <dt>Client mailbox</dt>
        <dd>{row.original_recipient ?? "Not available yet"}</dd>

        <dt>Company</dt>
        <dd>{row.company_name ?? "Not available yet"}</dd>

        <dt>Role</dt>
        <dd>{row.job_title ?? "Not available yet"}</dd>

        <dt>Received</dt>
        <dd>{formatDate(row.received_at)}</dd>

        <dt>Category</dt>
        <dd>{row.category ?? "Not available yet"}</dd>

        <dt>Confidence</dt>
        <dd>{row.confidence !== null ? `${Math.round(row.confidence * 100)}%` : "Not available yet"}</dd>

        <dt>Priority</dt>
        <dd>{row.priority ?? "Not available yet"}</dd>

        <dt>Deadline</dt>
        <dd>{row.deadline ?? "Not available yet"}</dd>

        <dt>Action required</dt>
        <dd>{row.action_required ?? "Not available yet"}</dd>

        <dt>Reason</dt>
        <dd>{row.reason ?? "Not available yet"}</dd>

        <dt>Status</dt>
        <dd>{row.classification_status ?? "Not available yet"}</dd>
      </dl>
    </main>
  );
}
