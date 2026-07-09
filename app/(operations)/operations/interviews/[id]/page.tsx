import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { getInterviewById } from "@/lib/zoho/operationsTable";
import { getSafeEmailPreview } from "@/lib/zoho/emailPreview";
import { submitReviewDecision, type ReviewDecision } from "@/lib/zoho/reviewCorrection";

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

async function reviewAction(id: string, formData: FormData) {
  "use server";

  const decision = formData.get("decision") as ReviewDecision;
  const newCategory = formData.get("category")?.toString();
  const correctionReason = formData.get("correction_reason")?.toString();

  await submitReviewDecision({
    id,
    decision,
    newCategory: newCategory || undefined,
    correctionReason: correctionReason || undefined,
    reviewedBy: "admin",
  });

  revalidatePath(`/operations/interviews/${id}`);
}

export default async function InterviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInterviewById(id);

  if (!result.ok) {
    notFound();
  }

  const row = result.row;
  const previewResult = await getSafeEmailPreview(id);

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

        <dt>Human category</dt>
        <dd>{row.human_category ?? "Not reviewed yet"}</dd>

        <dt>Reviewed by</dt>
        <dd>{row.reviewed_by ?? "Not reviewed yet"}</dd>
      </dl>

      <section className="coo-preview-section">
        <h2>Safe Email Preview</h2>
        <p className="coo-preview-text">
          {previewResult.ok ? previewResult.preview : "Preview unavailable."}
        </p>
      </section>

      <section className="coo-review-actions">
        <form action={reviewAction.bind(null, id)}>
          <input type="hidden" name="decision" value="confirm" />
          <button type="submit" className="coo-action-button">Yes, this is Interview</button>
        </form>

        <form action={reviewAction.bind(null, id)}>
          <input type="hidden" name="decision" value="change_category" />
          <label>
            <span>Change category to</span>
            <select name="category" defaultValue="">
              <option value="" disabled>Select category</option>
              <option value="application_received">Application Received</option>
              <option value="interview_invite">Interview Invite</option>
              <option value="assessment">Assessment</option>
              <option value="job_offer">Job Offer</option>
              <option value="rejection">Rejection</option>
              <option value="recruiter_reply">Recruiter Reply</option>
              <option value="follow_up_needed">Follow-up Needed</option>
              <option value="email_verification">Email Verification</option>
              <option value="otp_verification">OTP Verification</option>
              <option value="account_created">Account Created</option>
              <option value="system_notification">System Notification</option>
              <option value="spam_or_irrelevant">Spam / Irrelevant</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            <span>Reason (optional)</span>
            <input type="text" name="correction_reason" />
          </label>
          <button type="submit" className="coo-action-button">No, change category</button>
        </form>

        <form action={reviewAction.bind(null, id)}>
          <input type="hidden" name="decision" value="send_to_review" />
          <button type="submit" className="coo-action-button">Send to Review</button>
        </form>
      </section>
    </main>
  );
}
