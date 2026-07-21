/**
 * Unit tests for GET /api/zoho/login route.
 * Tests the login route handler directly — no live OAuth, no Supabase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ── Dashboard session mock (recovery mode admin gate) ──────────────────────────

const mockGetDashboardSessionByToken = vi.fn();

vi.mock("@/lib/dashboardAuth/sessionStore", () => ({
  getDashboardSessionByToken: (token: string) => mockGetDashboardSessionByToken(token),
}));

function adminSession() {
  return {
    ok: true,
    session: {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      revokedAt: null,
      user: { id: "user-1", email: "ceo@applywizard.ai", role: "admin_ceo", status: "active", totpEnabled: true },
    },
  };
}

function nonAdminSession() {
  return {
    ok: true,
    session: {
      id: "session-2",
      userId: "user-2",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      revokedAt: null,
      user: { id: "user-2", email: "ops@applywizard.ai", role: "manager_ops", status: "active", totpEnabled: true },
    },
  };
}

function makeRequest(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, cookie ? { headers: { Cookie: cookie } } : undefined);
}

function setRequiredEnvVars() {
  process.env.ZOHO_CLIENT_ID = "test-client-id";
  process.env.ZOHO_REDIRECT_URI = "http://localhost:3000/api/zoho/callback";
  process.env.ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.test";
}

function clearEnvVars() {
  delete process.env.ZOHO_CLIENT_ID;
  delete process.env.ZOHO_REDIRECT_URI;
  delete process.env.ZOHO_ACCOUNTS_BASE_URL;
}

describe("GET /api/zoho/login", () => {
  beforeEach(() => {
    setRequiredEnvVars();
    mockGetDashboardSessionByToken.mockReset();
  });
  afterEach(clearEnvVars);

  it("redirects to Zoho with opaque UUID state — not JSON in the URL", async () => {
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest("http://localhost:3000/api/zoho/login");
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("accounts.zoho.test");

    // state param must be a UUID — not a JSON string
    const stateParam = new URL(location).searchParams.get("state") ?? "";
    expect(stateParam).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(stateParam).not.toContain("{");
    expect(stateParam).not.toContain("mailbox");
  });

  it("stores requested mailbox in cookie — not in the Zoho redirect URL", async () => {
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest(
      "http://localhost:3000/api/zoho/login?mailbox=tracker@applywizard.ai",
    );
    const res = await GET(req);

    expect(res.status).toBe(307);

    // Mailbox must NOT be in the Zoho redirect URL
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("tracker");

    // Mailbox IS in the state cookie
    const cookieHeader = res.headers.get("set-cookie") ?? "";
    expect(cookieHeader).toContain("zoho_oauth_state");
    expect(cookieHeader).toContain("tracker%40applywizard.ai");
  });

  it("normalizes mailbox to lowercase", async () => {
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest(
      "http://localhost:3000/api/zoho/login?mailbox=TRACKER@APPLYWIZARD.AI",
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const cookieHeader = res.headers.get("set-cookie") ?? "";
    expect(cookieHeader).toContain("tracker%40applywizard.ai");
    expect(cookieHeader).not.toContain("TRACKER");
  });

  it("rejects invalid mailbox parameter — non-applywizard.ai domain", async () => {
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest(
      "http://localhost:3000/api/zoho/login?mailbox=hacker@gmail.com",
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Invalid mailbox parameter");
  });

  it("rejects malformed mailbox parameter", async () => {
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest(
      "http://localhost:3000/api/zoho/login?mailbox=notanemail",
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("no mailbox parameter proceeds without restriction (backward compat)", async () => {
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest("http://localhost:3000/api/zoho/login");
    const res = await GET(req);

    expect(res.status).toBe(307);
    // Cookie should still set, with empty mailbox
    const cookieHeader = res.headers.get("set-cookie") ?? "";
    expect(cookieHeader).toContain("zoho_oauth_state");
  });

  it("returns 500 when env vars are missing", async () => {
    clearEnvVars();
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest("http://localhost:3000/api/zoho/login");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("normal mode (no recovery flag) never includes prompt=consent", async () => {
    const { GET } = await import("../../app/api/zoho/login/route");
    const req = makeRequest(
      "http://localhost:3000/api/zoho/login?mailbox=tracker@applywizard.ai",
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(new URL(location).searchParams.get("prompt")).toBeNull();
    expect(mockGetDashboardSessionByToken).not.toHaveBeenCalled();
  });

  describe("recovery mode", () => {
    const RECOVERY_URL =
      "http://localhost:3000/api/zoho/login?mailbox=tracker@applywizard.ai&recovery=true";

    it("rejects an unauthenticated recovery request — no session cookie at all", async () => {
      const { GET } = await import("../../app/api/zoho/login/route");
      const res = await GET(makeRequest(RECOVERY_URL));

      expect(res.status).toBe(401);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/admin/i);
      expect(mockGetDashboardSessionByToken).not.toHaveBeenCalled();
      // Never redirected to Zoho, never issued an OAuth state cookie.
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("set-cookie") ?? "").not.toContain("zoho_oauth_state");
    });

    it("rejects recovery when the session cookie does not resolve to a valid session", async () => {
      mockGetDashboardSessionByToken.mockResolvedValue({ ok: false });
      const { GET } = await import("../../app/api/zoho/login/route");
      const res = await GET(makeRequest(RECOVERY_URL, "dashboard_session=bogus-token"));

      expect(res.status).toBe(401);
      expect(mockGetDashboardSessionByToken).toHaveBeenCalledWith("bogus-token");
    });

    it("rejects recovery for an authenticated non-admin role", async () => {
      mockGetDashboardSessionByToken.mockResolvedValue(nonAdminSession());
      const { GET } = await import("../../app/api/zoho/login/route");
      const res = await GET(makeRequest(RECOVERY_URL, "dashboard_session=ops-token"));

      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toMatch(/admin/i);
    });

    it("rejects recovery without a mailbox — must target one intended connection", async () => {
      mockGetDashboardSessionByToken.mockResolvedValue(adminSession());
      const { GET } = await import("../../app/api/zoho/login/route");
      const res = await GET(
        makeRequest("http://localhost:3000/api/zoho/login?recovery=true", "dashboard_session=admin-token"),
      );

      expect(res.status).toBe(400);
    });

    it("admin session with recovery=true includes prompt=consent alongside access_type=offline", async () => {
      mockGetDashboardSessionByToken.mockResolvedValue(adminSession());
      const { GET } = await import("../../app/api/zoho/login/route");
      const res = await GET(makeRequest(RECOVERY_URL, "dashboard_session=admin-token"));

      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      const params = new URL(location).searchParams;
      expect(params.get("prompt")).toBe("consent");
      expect(params.get("access_type")).toBe("offline");
    });

    it("carries the recovery flag in the signed state cookie, never in the Zoho redirect URL", async () => {
      mockGetDashboardSessionByToken.mockResolvedValue(adminSession());
      const { GET } = await import("../../app/api/zoho/login/route");
      const res = await GET(makeRequest(RECOVERY_URL, "dashboard_session=admin-token"));

      const location = res.headers.get("location") ?? "";
      expect(location).not.toContain("recovery");

      const cookieHeader = res.headers.get("set-cookie") ?? "";
      const cookieValue = decodeURIComponent(cookieHeader.split(";")[0].split("=").slice(1).join("="));
      const parsed = JSON.parse(cookieValue) as { csrf: string; mailbox: string; recovery?: boolean };
      expect(parsed.recovery).toBe(true);
      expect(parsed.mailbox).toBe("tracker@applywizard.ai");
    });
  });
});
