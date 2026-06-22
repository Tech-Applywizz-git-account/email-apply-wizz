/**
 * Deterministic regex extractor for structured email types.
 *
 * Handles three categories that are highly predictable in structure:
 *   - otp_verification   (Workday OTP, iCIMS code, login codes, etc.)
 *   - email_verification (verify email, activate account, confirm profile)
 *   - account_created    (welcome to portal, registration successful, profile created)
 *
 * Pipeline:
 *   1. Run subject through pattern matchers
 *   2. If matched → extract fields with regex, return result (reviewed_by: "regex_parser")
 *   3. If not matched → return null (caller falls back to AI)
 *
 * Confidence is always 1.0 for successful regex extractions.
 * needs_human_review is always false for these three categories.
 */

import type { ClassificationResult, EmailInput } from "./types";
import { detectPortal } from "./portalDetector";

// ── OTP detection ─────────────────────────────────────────────────────────────

const OTP_SUBJECT_PATTERNS: RegExp[] = [
  /\botp\b/i,
  /one[\s-]?time[\s-]?(pass(word|code)?|pin)/i,
  /verification\s+code/i,
  /\blogin\s+code\b/i,
  /\bsign[\s-]?in\s+code\b/i,
  /\baccess\s+code\b/i,
  /\bsecurity\s+code\b/i,
  /\bpasscode\b/i,
  /\bauth(entication)?\s+code\b/i,
];

// Matches 4–8 digit codes, avoiding matches that are part of longer numbers
const OTP_CODE_PATTERN = /\b(\d{4,8})\b/;

// Matches "expires in 10 minutes", "valid for 1 hour", etc.
const OTP_EXPIRY_PATTERN =
  /(?:expires?\s+in|valid\s+for)\s+(\d+)\s*(minute|min|hour|hr)/i;

// ── Email verification detection ──────────────────────────────────────────────

const EMAIL_VERIFY_SUBJECT_PATTERNS: RegExp[] = [
  /verify\s+(your\s+)?email/i,
  /confirm\s+(your\s+)?email/i,
  /activate\s+(your\s+)?(account|profile|email)/i,
  /please\s+(verify|confirm|activate)/i,
  /email\s+confirmation/i,
  /confirm\s+your\s+account/i,
];

// Matches the first URL containing verify/confirm/activate in the body
const VERIFY_LINK_PATTERN =
  /https?:\/\/[^\s"'<>]+(?:verif|confirm|activat)[^\s"'<>]*/i;

// ── Account created detection ─────────────────────────────────────────────────

const ACCOUNT_CREATED_SUBJECT_PATTERNS: RegExp[] = [
  /account\s+(has\s+been\s+)?created/i,
  /welcome\s+to\s+\S/i,
  /profile\s+(has\s+been\s+)?created/i,
  /registration\s+(was\s+)?successful/i,
  /successfully\s+registered/i,
  /account\s+set[\s-]?up/i,
  /your\s+(new\s+)?account\s+is\s+ready/i,
];

// ── Human review helper ───────────────────────────────────────────────────────

/**
 * Centralised human review decision.
 * otp_verification, email_verification, and account_created (regex) are
 * always machine-actionable — needs_human_review is always false.
 */
function alwaysMachineActionable(): false {
  return false;
}

// ── Expiry calculator ─────────────────────────────────────────────────────────

function calculateExpiresAt(text: string): string | null {
  const match = OTP_EXPIRY_PATTERN.exec(text);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const isHour = unit.startsWith("h");
  const ms = amount * (isHour ? 3_600_000 : 60_000);
  return new Date(Date.now() + ms).toISOString();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Attempts deterministic extraction for structured email types.
 * Returns a ClassificationResult if successful, or null if the email
 * should be passed to the AI classifier instead.
 */
export function tryRegexExtract(
  input: EmailInput
): ClassificationResult | null {
  const { subject, body } = input;
  const fullText = `${subject}\n${body}`;
  const sourcePortal = detectPortal(subject, body);

  // ── OTP verification ────────────────────────────────────────────────────────
  if (OTP_SUBJECT_PATTERNS.some((p) => p.test(subject))) {
    const codeMatch = OTP_CODE_PATTERN.exec(fullText);
    const expiresAt = calculateExpiresAt(fullText);

    return {
      category: "otp_verification",
      confidence: 1.0,
      company_name: null,
      job_title: null,
      candidate_email: null,
      action_required: null,
      deadline: null,
      verification_code: codeMatch ? codeMatch[1] : null,
      verification_link: null,
      expires_at: expiresAt,
      source_portal: sourcePortal,
      reason: "Regex detected OTP keyword pattern in subject line.",
      reviewed_by: "regex_parser",
      needs_human_review: alwaysMachineActionable(),
    };
  }

  // ── Email verification ──────────────────────────────────────────────────────
  if (EMAIL_VERIFY_SUBJECT_PATTERNS.some((p) => p.test(subject))) {
    const linkMatch = VERIFY_LINK_PATTERN.exec(fullText);

    return {
      category: "email_verification",
      confidence: 1.0,
      company_name: null,
      job_title: null,
      candidate_email: null,
      action_required: null,
      deadline: null,
      verification_code: null,
      verification_link: linkMatch ? linkMatch[0] : null,
      expires_at: null,
      source_portal: sourcePortal,
      reason: "Regex detected email verification pattern in subject line.",
      reviewed_by: "regex_parser",
      needs_human_review: alwaysMachineActionable(),
    };
  }

  // ── Account created ─────────────────────────────────────────────────────────
  if (ACCOUNT_CREATED_SUBJECT_PATTERNS.some((p) => p.test(subject))) {
    return {
      category: "account_created",
      confidence: 1.0,
      company_name: null,
      job_title: null,
      candidate_email: null,
      action_required: null,
      deadline: null,
      verification_code: null,
      verification_link: null,
      expires_at: null,
      source_portal: sourcePortal,
      reason: "Regex detected account creation confirmation pattern in subject line.",
      reviewed_by: "regex_parser",
      needs_human_review: alwaysMachineActionable(),
    };
  }

  // No regex match — hand off to AI classifier
  return null;
}
