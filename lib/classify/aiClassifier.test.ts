/**
 * Safety tests for aiClassifier.ts.
 * Verifies the AI classification path cannot leak raw email content,
 * full sender/recipient addresses, or tokens into logs or thrown errors.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Top-level mock — vi.hoisted ensures mockCreate is available in the factory ─

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  // Use a regular function (not arrow) so `new OpenAI()` works as a constructor
  default: vi.fn(function (this: Record<string, unknown>) {
    this.chat = { completions: { create: mockCreate } };
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function validAIJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    category: "rejection",
    confidence: 0.95,
    company_name: "Acme Corp",
    job_title: "Engineer",
    candidate_email: "bob@example.com",
    action_required: null,
    deadline: null,
    verification_code: null,
    verification_link: null,
    expires_at: null,
    source_portal: "workday",
    reason: "Standard rejection email",
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("aiClassifier — log safety", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OPENAI_API_KEY = "sk-test-placeholder";
    vi.clearAllMocks();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    delete process.env.OPENAI_API_KEY;
  });

  it("throws a safe generic message when OpenAI returns invalid JSON — no body in error", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "NOT VALID JSON {{{{" } }],
    });

    const { classifyWithAI } = await import("./aiClassifier");

    const sensitiveBody = "My password is hunter2 and SSN 123-45-6789";
    const sensitiveSubject = "Interview for alice@secret.com";

    await expect(
      classifyWithAI({ subject: sensitiveSubject, body: sensitiveBody }),
    ).rejects.toThrow("AI returned invalid JSON");

    const allLogged = [...logSpy.mock.calls.flat(), ...errorSpy.mock.calls.flat()]
      .map((v) => String(v))
      .join(" ");

    expect(allLogged).not.toContain(sensitiveBody);
    expect(allLogged).not.toContain("hunter2");
    expect(allLogged).not.toContain("alice@secret.com");
    expect(allLogged).not.toContain("123-45-6789");
  });

  it("success log contains only category and confidence — no body or full email addresses", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: validAIJson() } }],
    });

    const { classifyWithAI } = await import("./aiClassifier");

    const sensitiveBody = "Dear bob@example.com, we regret secret-token-xyz";

    const result = await classifyWithAI({
      subject: "Application Update",
      body: sensitiveBody,
    });

    const allLogged = logSpy.mock.calls.flat().map((v) => String(v)).join(" ");

    expect(allLogged).not.toContain(sensitiveBody);
    expect(allLogged).not.toContain("bob@example.com");
    expect(allLogged).not.toContain("secret-token-xyz");

    // Safe fields: category and confidence appear in the success log
    expect(allLogged).toContain("rejection");
    expect(allLogged).toContain("0.95");

    // candidate_email is returned to caller only — never stored to DB
    expect(result.candidate_email).toBe("bob@example.com");
  });

  it("source code: only one console.log in classifyWithAI — logs category + confidence, not content", () => {
    // ponytail: structural guard — if a developer adds a log that includes body/email,
    // this test forces them to think about what they're logging.
    const src = readFileSync(resolve(__dirname, "aiClassifier.ts"), "utf8");

    // Count console.log/error occurrences in the source
    const logMatches = src.match(/console\.(log|error)\(/g) ?? [];
    expect(logMatches).toHaveLength(1);

    // The single log block must reference category and confidence
    expect(src).toContain("category");
    expect(src).toContain("confidence.toFixed");

    // The log must not pass raw content fields to console
    // (body, subject, input, rawContent, parsed object are not logged)
    const logBlockMatch = src.match(/console\.log\([^;]+;/s);
    if (logBlockMatch) {
      const logBlock = logBlockMatch[0];
      expect(logBlock).not.toMatch(/\binput\b|\brawContent\b|\bbody\b|\bsubject\b|\bsender\b|\bparsed\b/);
    }
  });
});
