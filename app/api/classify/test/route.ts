/**
 * POST /api/classify/test
 *
 * Development and testing route for the ApplyWizard email classification pipeline.
 * Accepts a mock email payload and returns a structured classification result.
 *
 * Pipeline:
 *   1. Validate request body ({ subject, body })
 *   2. Run regex extractor (fast, deterministic — covers otp, email_verify, account_created)
 *   3. If regex matched → return immediately (no AI cost)
 *   4. If not → run GPT-4o-mini classification
 *   5. Return structured JSON result
 *
 * This route does NOT:
 *   - Read real emails from Zoho
 *   - Store results in Supabase
 *   - Poll or trigger background jobs
 *   - Connect to DeepSeek (Phase 3 scope)
 *
 * Required environment variable for AI classification:
 *   OPENAI_API_KEY
 */

import { type NextRequest, NextResponse } from "next/server";
import { tryRegexExtract } from "@/lib/classify/regexExtractor";
import { classifyWithAI } from "@/lib/classify/aiClassifier";
import type { EmailInput } from "@/lib/classify/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Parse and validate request body ──────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (
    typeof rawBody !== "object" ||
    rawBody === null ||
    typeof (rawBody as Record<string, unknown>).subject !== "string" ||
    typeof (rawBody as Record<string, unknown>).body !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          'Request body must include { "subject": string, "body": string }.',
      },
      { status: 400 }
    );
  }

  const input: EmailInput = {
    // Cap input lengths to prevent abuse
    subject: ((rawBody as Record<string, unknown>).subject as string)
      .trim()
      .slice(0, 500),
    body: ((rawBody as Record<string, unknown>).body as string)
      .trim()
      .slice(0, 5000),
  };

  if (!input.subject) {
    return NextResponse.json(
      { error: "subject must not be empty." },
      { status: 400 }
    );
  }

  // ── 2. Regex extraction (deterministic, no AI cost) ─────────────────────────
  const regexResult = tryRegexExtract(input);
  if (regexResult !== null) {
    return NextResponse.json(regexResult, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // ── 3. AI classification fallback ────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured. " +
          "Add it to .env.local and restart the dev server. " +
          "Regex extraction did not match this email type.",
      },
      { status: 500 }
    );
  }

  try {
    const aiResult = await classifyWithAI(input);
    return NextResponse.json(aiResult, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    // Log the error message only — never log email content
    console.error(
      "[Classify] AI classification failed:",
      err instanceof Error ? err.message : "Unknown error"
    );
    return NextResponse.json(
      {
        error:
          "AI classification failed. " +
          "Check OPENAI_API_KEY is valid and try again.",
      },
      { status: 502 }
    );
  }
}
