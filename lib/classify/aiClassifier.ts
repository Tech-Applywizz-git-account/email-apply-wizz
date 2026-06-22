/**
 * GPT-4o-mini AI classifier for job-application emails.
 *
 * Used for all emails that the regex extractor cannot handle deterministically.
 * Sends subject + body to OpenAI and parses the structured JSON response.
 *
 * Safe logging rule: never log raw token values or email content.
 * Only log boolean success/failure and category result.
 */

import OpenAI from "openai";
import type {
  ClassificationResult,
  EmailCategory,
  EmailInput,
  SourcePortal,
} from "./types";
import { detectPortal } from "./portalDetector";

// ── Category and portal lists (keep in sync with types.ts) ───────────────────

const CATEGORIES: EmailCategory[] = [
  "application_received",
  "assessment",
  "interview_invite",
  "rejection",
  "job_offer",
  "recruiter_reply",
  "follow_up_needed",
  "otp_verification",
  "email_verification",
  "account_created",
  "system_notification",
  "spam_or_irrelevant",
  "unknown",
];

const SOURCE_PORTALS: SourcePortal[] = [
  "workday",
  "greenhouse",
  "lever",
  "icims",
  "taleo",
  "smartrecruiters",
  "ashby",
  "linkedin",
  "indeed",
  "unknown",
];

// ── Human review decision ─────────────────────────────────────────────────────

const ALWAYS_HUMAN_REVIEW: EmailCategory[] = [
  "interview_invite",
  "assessment",
  "job_offer",
  "follow_up_needed",
  "recruiter_reply",
  "unknown",
];

const NEVER_HUMAN_REVIEW: EmailCategory[] = [
  "otp_verification",
  "email_verification",
  "account_created",
];

function resolveHumanReview(
  category: EmailCategory,
  confidence: number
): boolean {
  if (NEVER_HUMAN_REVIEW.includes(category)) return false;
  if (ALWAYS_HUMAN_REVIEW.includes(category)) return true;
  if (confidence < 0.6) return true;
  return false;
}

// ── AI prompt ─────────────────────────────────────────────────────────────────

function buildPrompt(subject: string, body: string): string {
  return `You are an AI email classifier for ApplyWizard, a job-application tracking system.

Classify the following email into exactly one category and extract structured data.
Return ONLY valid JSON — no markdown, no code fences, no extra text.

Email subject: ${subject}
Email body: ${body}

Valid categories (pick exactly one):
${CATEGORIES.join(", ")}

Valid source_portal values (pick exactly one):
${SOURCE_PORTALS.join(", ")}

Return this exact JSON structure with no extra fields:
{
  "category": "<one of the valid categories>",
  "confidence": <float 0.0 to 1.0>,
  "company_name": "<employer/recruiter/portal name or null>",
  "job_title": "<role title or null>",
  "candidate_email": "<candidate email address or null>",
  "action_required": "<one sentence describing required action or null>",
  "deadline": "<YYYY-MM-DD date string or null>",
  "verification_code": "<OTP code string or null — only for otp_verification>",
  "verification_link": "<full URL or null — only for email_verification>",
  "expires_at": "<ISO 8601 datetime string or null>",
  "source_portal": "<one of the valid portals>",
  "reason": "<one sentence, max 200 characters, no raw emails/phones/private data>"
}

Rules:
- Never guess. Return null for any field not clearly present in the email.
- deadline must be YYYY-MM-DD or null. Never use natural language like "next Friday".
- verification_code and verification_link must be null unless category is otp_verification or email_verification.
- reason must not expose raw email addresses, phone numbers, or private data.`;
}

// ── Safe response parser ──────────────────────────────────────────────────────

function parseAIResponse(raw: string): Record<string, unknown> {
  // Strip any accidental markdown code fences the model may add
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned) as Record<string, unknown>;
}

function getString(
  obj: Record<string, unknown>,
  key: string
): string | null {
  const val = obj[key];
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
}

function getNumber(obj: Record<string, unknown>, key: string): number {
  const val = obj[key];
  return typeof val === "number" ? Math.min(1, Math.max(0, val)) : 0;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Classifies an email using GPT-4o-mini.
 * Throws if OPENAI_API_KEY is not set or if the AI returns invalid JSON.
 */
export async function classifyWithAI(
  input: EmailInput
): Promise<ClassificationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. " +
        "Add it to .env.local and restart the dev server."
    );
  }

  const client = new OpenAI({ apiKey });
  const sourcePortalFallback = detectPortal(input.subject, input.body);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: buildPrompt(input.subject, input.body),
      },
    ],
    temperature: 0.1, // Low temperature for deterministic classification
    max_tokens: 600,
  });

  const rawContent = response.choices[0]?.message?.content?.trim() ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = parseAIResponse(rawContent);
  } catch {
    throw new Error("AI returned invalid JSON. Cannot parse classification result.");
  }

  const category = (getString(parsed, "category") ?? "unknown") as EmailCategory;
  const confidence = getNumber(parsed, "confidence");

  // Safe log — category and success only, never email content
  console.log(
    "[Classify] AI classification complete:",
    category,
    "| confidence:",
    confidence.toFixed(2)
  );

  return {
    category,
    confidence,
    company_name: getString(parsed, "company_name"),
    job_title: getString(parsed, "job_title"),
    candidate_email: getString(parsed, "candidate_email"),
    action_required: getString(parsed, "action_required"),
    deadline: getString(parsed, "deadline"),
    verification_code: getString(parsed, "verification_code"),
    verification_link: getString(parsed, "verification_link"),
    expires_at: getString(parsed, "expires_at"),
    source_portal:
      ((getString(parsed, "source_portal") ??
        sourcePortalFallback) as SourcePortal),
    reason: getString(parsed, "reason") ?? "No reason provided.",
    reviewed_by: "primary_ai",
    needs_human_review: resolveHumanReview(category, confidence),
  };
}
