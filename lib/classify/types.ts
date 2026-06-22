/**
 * Shared TypeScript types for the ApplyWizard email classification pipeline.
 * All routes and utilities import from here — never redefine these elsewhere.
 */

export type EmailCategory =
  | "application_received"
  | "assessment"
  | "interview_invite"
  | "rejection"
  | "job_offer"
  | "recruiter_reply"
  | "follow_up_needed"
  | "otp_verification"
  | "email_verification"
  | "account_created"
  | "system_notification"
  | "spam_or_irrelevant"
  | "unknown";

export type SourcePortal =
  | "workday"
  | "greenhouse"
  | "lever"
  | "icims"
  | "taleo"
  | "smartrecruiters"
  | "ashby"
  | "linkedin"
  | "indeed"
  | "unknown";

export type ReviewedBy = "regex_parser" | "primary_ai" | "deepseek" | "human";

export interface EmailInput {
  subject: string;
  body: string;
}

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  company_name: string | null;
  job_title: string | null;
  candidate_email: string | null;
  action_required: string | null;
  deadline: string | null;
  verification_code: string | null;
  verification_link: string | null;
  expires_at: string | null;
  source_portal: SourcePortal;
  reason: string;
  reviewed_by: ReviewedBy;
  needs_human_review: boolean;
}
