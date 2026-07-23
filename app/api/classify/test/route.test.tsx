import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireApiRole = vi.fn();
const tryRegexExtract = vi.fn();
const classifyWithAI = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dashboardAuth/apiAuth", () => ({ requireApiRole }));
vi.mock("@/lib/classify/regexExtractor", () => ({ tryRegexExtract }));
vi.mock("@/lib/classify/aiClassifier", () => ({ classifyWithAI }));

function makeRequest(body: unknown = { subject: "hello", body: "world" }): NextRequest {
  return new NextRequest("https://email-apply-wizz.test/api/classify/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/classify/test", () => {
  it("returns 403 and never runs classification when the caller is not authorized", async () => {
    requireApiRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) as never });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(tryRegexExtract).not.toHaveBeenCalled();
    expect(classifyWithAI).not.toHaveBeenCalled();
  });

  it("classifies only when the caller is admin_ceo", async () => {
    requireApiRole.mockResolvedValue({ ok: true, session: { user: { role: "admin_ceo" } } as never });
    tryRegexExtract.mockReturnValue({ type: "otp", value: "123456" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(tryRegexExtract).toHaveBeenCalledTimes(1);
  });
});
