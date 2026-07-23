import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const getDashboardSessionByToken = vi.fn();

vi.mock("@/lib/dashboardAuth/sessionStore", () => ({ getDashboardSessionByToken }));

function requestWithCookie(value?: string): NextRequest {
  const req = new NextRequest("https://email-apply-wizz.test/api/whatever");
  if (value) req.cookies.set("dashboard_session", value);
  return req;
}

function session(role: "admin_ceo" | "manager_ops" | "ca") {
  return {
    ok: true as const,
    session: {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      revokedAt: null,
      user: { id: "user-1", email: "user@applywizz.ai", role, status: "active" as const, totpEnabled: true },
    },
  };
}

describe("requireApiRole", () => {
  it("returns ok:true and the session for an allowed role", async () => {
    getDashboardSessionByToken.mockResolvedValue(session("admin_ceo"));
    const { requireApiRole } = await import("./apiAuth");
    const result = await requireApiRole(requestWithCookie("raw-token"), ["admin_ceo"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.user.role).toBe("admin_ceo");
  });

  it("returns a 403 response for a role not in the allowlist", async () => {
    getDashboardSessionByToken.mockResolvedValue(session("ca"));
    const { requireApiRole } = await import("./apiAuth");
    const result = await requireApiRole(requestWithCookie("raw-token"), ["admin_ceo"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns a 403 response when there is no session cookie", async () => {
    const { requireApiRole } = await import("./apiAuth");
    const result = await requireApiRole(requestWithCookie(undefined), ["admin_ceo"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns a 403 response when the session lookup fails", async () => {
    getDashboardSessionByToken.mockResolvedValue({ ok: false });
    const { requireApiRole } = await import("./apiAuth");
    const result = await requireApiRole(requestWithCookie("raw-token"), ["admin_ceo"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("fails closed when the session lookup throws", async () => {
    getDashboardSessionByToken.mockRejectedValue(new Error("db unavailable"));
    const { requireApiRole } = await import("./apiAuth");
    const result = await requireApiRole(requestWithCookie("raw-token"), ["admin_ceo"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("does not log the raw session token", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getDashboardSessionByToken.mockResolvedValue(session("admin_ceo"));
    const { requireApiRole } = await import("./apiAuth");
    await requireApiRole(requestWithCookie("super-secret-raw-token"), ["admin_ceo"]);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("super-secret-raw-token");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("super-secret-raw-token");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
