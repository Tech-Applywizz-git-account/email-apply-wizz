/**
 * Unit tests for GET /api/zoho/callback route.
 * Tests account selection, mailbox matching, and safe failure.
 * No live Zoho calls, no Supabase writes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
      upsert: mockUpsert,
    }),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const CSRF = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function stateCookie(mailbox: string, options: { recovery?: boolean } = {}): string {
  return `zoho_oauth_state=${encodeURIComponent(
    JSON.stringify({ csrf: CSRF, mailbox, ...(options.recovery ? { recovery: true } : {}) }),
  )}`;
}

function legacyCookie(): string {
  // Old plain-UUID format — backward compat
  return `zoho_oauth_state=${CSRF}`;
}

function makeFetchMock(accounts: unknown[]) {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes("/oauth/v2/token")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "acc",
            refresh_token: "ref",
            expires_in: 3600,
          }),
      });
    }
    // /accounts
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: accounts }),
    });
  });
}

function makeFetchMockNoRefreshToken(accounts: unknown[]) {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes("/oauth/v2/token")) {
      // Zoho's documented behavior on a repeat, already-granted authorization:
      // access_token only, refresh_token omitted.
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: "acc-new", expires_in: 3600 }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: accounts }) });
  });
}

function zohoAccount(primaryEmailAddress: string, overrides = {}) {
  return {
    type: "ZOHO_ACCOUNT",
    enabled: true,
    accountId: "acct-001",
    primaryEmailAddress,
    ...overrides,
  };
}

function makeCallbackRequest(cookie: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/zoho/callback?code=CODE&state=${CSRF}`,
    { headers: { Cookie: cookie } },
  );
}

function setEnvVars() {
  process.env.ZOHO_CLIENT_ID = "cid";
  process.env.ZOHO_CLIENT_SECRET = "csecret";
  process.env.ZOHO_REDIRECT_URI = "http://localhost:3000/api/zoho/callback";
  process.env.ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.test";
  process.env.ZOHO_MAIL_BASE_URL = "https://mail.zoho.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
}

function clearEnvVars() {
  for (const k of [
    "ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REDIRECT_URI",
    "ZOHO_ACCOUNTS_BASE_URL", "ZOHO_MAIL_BASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  ]) delete process.env[k];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/zoho/callback — mailbox targeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnvVars();
  });
  afterEach(clearEnvVars);

  it("selects exact tracker mailbox when it matches returned account", async () => {
    vi.stubGlobal("fetch", makeFetchMock([
      zohoAccount("tracker@applywizard.ai"),
    ]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(stateCookie("tracker@applywizard.ai")));

    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toContain("Zoho OAuth complete");

    // Upsert must be called with tracker email_address
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ email_address: "tracker@applywizard.ai" }),
      { onConflict: "email_address" },
    );

    vi.unstubAllGlobals();
  });

  it("fails safely when requested mailbox is not in returned accounts", async () => {
    vi.stubGlobal("fetch", makeFetchMock([
      zohoAccount("ramakrishna@applywizard.ai"),
    ]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(stateCookie("tracker@applywizard.ai")));

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Requested mailbox was not returned by Zoho");
    expect(mockUpsert).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("does not fall back to admin mailbox when tracker mailbox is requested", async () => {
    // Admin is first in the list, tracker is absent
    vi.stubGlobal("fetch", makeFetchMock([
      zohoAccount("ramakrishna@applywizard.ai"),
      zohoAccount("other@applywizard.ai"),
    ]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(stateCookie("tracker@applywizard.ai")));

    expect(res.status).toBe(400);
    // Admin must NOT have been upserted
    expect(mockUpsert).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("generic flow (no mailbox) takes first valid account — backward compat", async () => {
    vi.stubGlobal("fetch", makeFetchMock([
      zohoAccount("ramakrishna@applywizard.ai"),
    ]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(stateCookie("")));

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ email_address: "ramakrishna@applywizard.ai" }),
      { onConflict: "email_address" },
    );

    vi.unstubAllGlobals();
  });

  it("legacy plain-UUID cookie (no mailbox) still works", async () => {
    vi.stubGlobal("fetch", makeFetchMock([
      zohoAccount("ramakrishna@applywizard.ai"),
    ]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(legacyCookie()));

    expect(res.status).toBe(200);
    vi.unstubAllGlobals();
  });

  it("normalizes returned primaryEmailAddress case before comparing", async () => {
    vi.stubGlobal("fetch", makeFetchMock([
      zohoAccount("Tracker@ApplyWizard.AI"),   // Zoho returns mixed case
    ]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(stateCookie("tracker@applywizard.ai")));

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ email_address: "tracker@applywizard.ai" }),
      { onConflict: "email_address" },
    );
    vi.unstubAllGlobals();
  });

  it("invalid state returns 400 without calling upsert", async () => {
    const badCookie = `zoho_oauth_state=${encodeURIComponent(
      JSON.stringify({ csrf: "wrong-uuid", mailbox: "" }),
    )}`;
    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(badCookie));

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("requested mailbox is not present in any log — upsert payload has email_address only", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", makeFetchMock([
      zohoAccount("tracker@applywizard.ai"),
    ]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    await GET(makeCallbackRequest(stateCookie("tracker@applywizard.ai")));

    // No log line should contain the full mailbox address
    const allLogged = logSpy.mock.calls.flat().map(String).join(" ");
    expect(allLogged).not.toContain("tracker@applywizard.ai");

    logSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("normal mode preserves an existing refresh token and reports that honestly", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { refresh_token: "old-good-token" }, error: null });
    vi.stubGlobal("fetch", makeFetchMockNoRefreshToken([zohoAccount("tracker@applywizard.ai")]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(stateCookie("tracker@applywizard.ai")));

    expect(res.status).toBe(200);
    const body = await res.json() as {
      message: string;
      new_refresh_token_received: boolean;
      existing_refresh_token_preserved: boolean;
    };
    expect(body.message).toContain("Zoho OAuth complete");
    expect(body.new_refresh_token_received).toBe(false);
    expect(body.existing_refresh_token_preserved).toBe(true);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: "old-good-token" }),
      { onConflict: "email_address" },
    );

    // Never in a response body.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("old-good-token");

    vi.unstubAllGlobals();
  });
});

describe("GET /api/zoho/callback — recovery mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnvVars();
  });
  afterEach(clearEnvVars);

  it("stores a newly returned refresh token and reports recovery success", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { refresh_token: "old-dead-token" }, error: null });
    vi.stubGlobal("fetch", makeFetchMock([zohoAccount("tracker@applywizard.ai")]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(
      makeCallbackRequest(stateCookie("tracker@applywizard.ai", { recovery: true })),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as {
      message: string;
      new_refresh_token_received: boolean;
      connection_updated: boolean;
    };
    expect(body).toEqual({
      message: "Zoho OAuth recovery completed.",
      new_refresh_token_received: true,
      connection_updated: true,
    });

    // Recovery must never carry the old token forward.
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: "ref", email_address: "tracker@applywizard.ai" }),
      { onConflict: "email_address" },
    );
    const upsertPayload = mockUpsert.mock.calls[0][0] as { refresh_token: string };
    expect(upsertPayload.refresh_token).not.toBe("old-dead-token");

    vi.unstubAllGlobals();
  });

  it("rejects recovery and never writes anything when Zoho omits a new refresh token", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { refresh_token: "old-dead-token" }, error: null });
    vi.stubGlobal("fetch", makeFetchMockNoRefreshToken([zohoAccount("tracker@applywizard.ai")]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(
      makeCallbackRequest(stateCookie("tracker@applywizard.ai", { recovery: true })),
    );

    expect(res.status).not.toBe(200);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Zoho did not issue a new refresh token");
    expect(body.error).toContain("Recovery was not completed");

    // The old (possibly-dead) token must never be silently kept in recovery mode.
    expect(mockUpsert).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("recovery mode still enforces exact mailbox targeting — no fallback to another account", async () => {
    vi.stubGlobal("fetch", makeFetchMock([zohoAccount("ramakrishna@applywizard.ai")]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(
      makeCallbackRequest(stateCookie("tracker@applywizard.ai", { recovery: true })),
    );

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("recovery success response never contains token values", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    // Distinguishable, unmistakable-if-leaked values — unlike "acc"/"ref", these
    // cannot collide with legitimate field names such as new_refresh_token_received.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("/oauth/v2/token")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: "SECRET-ACCESS-TOKEN-VALUE",
                refresh_token: "SECRET-REFRESH-TOKEN-VALUE",
                expires_in: 3600,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [zohoAccount("tracker@applywizard.ai")] }),
        });
      }),
    );

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(
      makeCallbackRequest(stateCookie("tracker@applywizard.ai", { recovery: true })),
    );

    const raw = await res.text();
    expect(raw).not.toContain("SECRET-ACCESS-TOKEN-VALUE");
    expect(raw).not.toContain("SECRET-REFRESH-TOKEN-VALUE");

    vi.unstubAllGlobals();
  });

  it("legacy plain-UUID cookie (no recovery field) is treated as normal mode, not recovery", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { refresh_token: "old-good-token" }, error: null });
    vi.stubGlobal("fetch", makeFetchMockNoRefreshToken([zohoAccount("ramakrishna@applywizard.ai")]));

    const { GET } = await import("../../app/api/zoho/callback/route");
    const res = await GET(makeCallbackRequest(legacyCookie()));

    // Normal-mode preservation, not a recovery-mode hard failure.
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: "old-good-token" }),
      { onConflict: "email_address" },
    );

    vi.unstubAllGlobals();
  });
});
