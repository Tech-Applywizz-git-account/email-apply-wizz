/**
 * Source portal detector.
 *
 * Identifies which ATS or job platform sent the email by scanning the
 * subject + body for known domain and brand patterns.
 * Returns "unknown" when no pattern matches.
 */

import type { SourcePortal } from "./types";

interface PortalRule {
  portal: SourcePortal;
  patterns: RegExp[];
}

const PORTAL_RULES: PortalRule[] = [
  {
    portal: "workday",
    patterns: [
      /workday\.com/i,
      /myworkdayjobs\.com/i,
      /\bworkday\b/i,
    ],
  },
  {
    portal: "greenhouse",
    patterns: [/greenhouse\.io/i, /\bgreenhouse\b/i],
  },
  {
    portal: "lever",
    patterns: [/lever\.co/i, /\blever\b/i],
  },
  {
    portal: "icims",
    patterns: [/icims\.com/i, /\bicims\b/i],
  },
  {
    portal: "taleo",
    patterns: [/taleo\.net/i, /\btaleo\b/i],
  },
  {
    portal: "smartrecruiters",
    patterns: [/smartrecruiters\.com/i, /\bsmartrecruiters\b/i],
  },
  {
    portal: "ashby",
    patterns: [/ashbyhq\.com/i, /ashby\.io/i, /\bashby\b/i],
  },
  {
    portal: "linkedin",
    patterns: [/linkedin\.com/i, /\blinkedin\b/i],
  },
  {
    portal: "indeed",
    patterns: [/indeed\.com/i, /\bindeed\b/i],
  },
];

/**
 * Scans subject + body text for known portal patterns.
 * Returns the first match found, or "unknown".
 */
export function detectPortal(subject: string, body: string): SourcePortal {
  const text = `${subject} ${body}`;
  for (const { portal, patterns } of PORTAL_RULES) {
    if (patterns.some((p) => p.test(text))) {
      return portal;
    }
  }
  return "unknown";
}
