import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  PREVIEW_E2E_SOFT_NAV_LINK,
  runPreviewDashboardAuthE2EWithDeps,
  validatePreviewE2eEnvironment,
} from "../../scripts/dashboard-auth/previewE2eHarness";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DASHBOARD_AUTH_E2E_TARGET: "preview",
    DASHBOARD_AUTH_SEED_TARGET: "preview",
    DASHBOARD_PREVIEW_URL: "https://applywizard-email-tracker-git-worker-preflight-preview.vercel.app",
    DASHBOARD_TEST_ADMIN_EMAIL: "dashboard-auth-test@applywizz.ai",
    DASHBOARD_PREVIEW_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    DASHBOARD_PRODUCTION_SUPABASE_PROJECT_REF: "zyxwvutsrqponmlkjihg",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    DASHBOARD_SECRET: "basic-auth-secret",
    ...overrides,
  };
}

function makeHarnessDeps(options: { linkThrows?: boolean; cleanupOk?: boolean; revokeOk?: boolean } = {}) {
  const events: string[] = [];
  const locator = (name: string) => ({
    fill: vi.fn(async () => events.push(`fill:${name}`)),
    click: vi.fn(async () => {
      events.push(`click:${name}`);
      if (options.linkThrows && name === PREVIEW_E2E_SOFT_NAV_LINK) throw new Error("navigation failed");
    }),
    isVisible: vi.fn(async () => false),
    textContent: vi.fn(async () => "JBSWY3DPEHPK3PXP"),
    waitFor: vi.fn(async () => events.push(`wait:${name}`)),
  });
  const page = {
    goto: vi.fn(async (url: string) => events.push(`goto:${new URL(url).pathname}`)),
    getByTestId: vi.fn((testId: string) => locator(testId)),
    getByRole: vi.fn((_role: string, opts: { name: string }) => locator(opts.name)),
    getByText: vi.fn((text: string) => ({ first: () => locator(text) })),
    waitForURL: vi.fn(async (url: string) => events.push(`waitForURL:${new URL(url).pathname}`)),
    evaluate: vi.fn(async () => {
      events.push("logout");
      return true;
    }),
  };
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => events.push("context-close")),
  };
  const browser = {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => events.push("browser-close")),
  };
  const launchBrowser = vi.fn(async () => browser);
  const createSupabase = vi.fn(() => ({}) as never);
  const promptForOtp = vi.fn(async () => "123456");
  const fetchMock = vi.fn(async () => ({ status: 401 }) as Response);
  const revokeSessionsForEmail = vi.fn(async () => {
    events.push("revoke");
    return { ok: options.revokeOk ?? true };
  });
  const disableAdmin = vi.fn(async () => {
    events.push("cleanup");
    return { ok: options.cleanupOk ?? true };
  });

  return {
    browser,
    context,
    createSupabase,
    disableAdmin,
    events,
    fetchMock,
    launchBrowser,
    page,
    promptForOtp,
    revokeSessionsForEmail,
  };
}

describe("preview E2E harness guards", () => {
  it("refuses production URL", () => {
    expect(
      validatePreviewE2eEnvironment(
        env({
          DASHBOARD_PREVIEW_URL: "https://email-apply-wizz.vercel.app",
        }),
      ),
    ).toEqual({ ok: false, code: "PRODUCTION_URL" });
  });

  it("refuses missing Preview URL", () => {
    expect(validatePreviewE2eEnvironment(env({ DASHBOARD_PREVIEW_URL: "" }))).toEqual({
      ok: false,
      code: "MISSING_PREVIEW_URL",
    });
  });

  it("refuses mismatched Supabase project", () => {
    expect(
      validatePreviewE2eEnvironment(
        env({
          NEXT_PUBLIC_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
        }),
      ),
    ).toEqual({ ok: false, code: "PROJECT_REF_MISMATCH" });
  });

  it("requires the cleanup seed target flag", () => {
    expect(validatePreviewE2eEnvironment(env({ DASHBOARD_AUTH_SEED_TARGET: "" }))).toEqual({
      ok: false,
      code: "INVALID_SEED_TARGET",
    });
  });

  it("requires a production project reference", () => {
    expect(validatePreviewE2eEnvironment(env({ DASHBOARD_PRODUCTION_SUPABASE_PROJECT_REF: "" }))).toEqual({
      ok: false,
      code: "MISSING_PRODUCTION_PROJECT_REF",
    });
  });

  it("rejects equal Preview and production project refs", () => {
    expect(
      validatePreviewE2eEnvironment(
        env({
          DASHBOARD_PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
        }),
      ),
    ).toEqual({ ok: false, code: "PRODUCTION_PROJECT_REF" });
  });

  it("refuses malformed Supabase URL", () => {
    expect(validatePreviewE2eEnvironment(env({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }))).toEqual({
      ok: false,
      code: "MALFORMED_SUPABASE_URL",
    });
  });

  it("refuses missing Preview project reference", () => {
    expect(validatePreviewE2eEnvironment(env({ DASHBOARD_PREVIEW_SUPABASE_PROJECT_REF: "" }))).toEqual({
      ok: false,
      code: "MISSING_PROJECT_REF",
    });
  });

  it("refuses deceptive production-like hostnames", () => {
    expect(
      validatePreviewE2eEnvironment(
        env({
          DASHBOARD_PREVIEW_URL: "https://email-apply-wizz.vercel.app.evil.example",
        }),
      ),
    ).toEqual({ ok: false, code: "PRODUCTION_URL" });
  });

  it("requires the Preview target flag", () => {
    expect(validatePreviewE2eEnvironment(env({ DASHBOARD_AUTH_E2E_TARGET: "production" }))).toEqual({
      ok: false,
      code: "INVALID_TARGET",
    });
  });

  it("does not run without required safety configuration", () => {
    expect(validatePreviewE2eEnvironment(env({ DASHBOARD_TEST_ADMIN_EMAIL: "" }))).toEqual({
      ok: false,
      code: "MISSING_EMAIL",
    });
    expect(validatePreviewE2eEnvironment(env({ DASHBOARD_SECRET: "" }))).toEqual({
      ok: false,
      code: "MISSING_BASIC_AUTH_SECRET",
    });
    expect(validatePreviewE2eEnvironment(env({ SUPABASE_SERVICE_ROLE_KEY: "" }))).toEqual({
      ok: false,
      code: "MISSING_SERVICE_ROLE_KEY",
    });
  });

  it("accepts an explicitly configured Preview target", () => {
    expect(validatePreviewE2eEnvironment(env())).toEqual({
      ok: true,
      config: {
        previewUrl: "https://applywizard-email-tracker-git-worker-preflight-preview.vercel.app",
        normalizedEmail: "dashboard-auth-test@applywizz.ai",
        projectRef: "abcdefghijklmnopqrst",
        productionProjectRef: "zyxwvutsrqponmlkjihg",
        basicAuthSecret: "basic-auth-secret",
      },
    });
  });

  it("does not launch a browser when validation fails", async () => {
    const launchBrowser = vi.fn();

    await expect(
      runPreviewDashboardAuthE2EWithDeps(env({ DASHBOARD_AUTH_E2E_TARGET: "" }), { launchBrowser }),
    ).resolves.toEqual({ ok: false, code: "INVALID_TARGET" });
    expect(launchBrowser).not.toHaveBeenCalled();
  });

  it("checks Basic Auth before browser launch", async () => {
    const deps = makeHarnessDeps();
    deps.fetchMock.mockResolvedValueOnce({ status: 200 } as Response);

    await expect(
      runPreviewDashboardAuthE2EWithDeps(env(), {
        fetch: deps.fetchMock,
        launchBrowser: deps.launchBrowser,
      }),
    ).resolves.toEqual({ ok: false, code: "BASIC_AUTH_GATE_NOT_CONFIRMED" });
    expect(deps.launchBrowser).not.toHaveBeenCalled();
  });
});

describe("preview E2E harness flow", () => {
  it("uses an existing navigation link after revoking sessions", async () => {
    const deps = makeHarnessDeps();

    await expect(
      runPreviewDashboardAuthE2EWithDeps(env(), {
        createSupabase: deps.createSupabase,
        disableAdmin: deps.disableAdmin,
        fetch: deps.fetchMock,
        launchBrowser: deps.launchBrowser,
        promptForOtp: deps.promptForOtp,
        revokeSessionsForEmail: deps.revokeSessionsForEmail,
      }),
    ).resolves.toEqual({ ok: true });

    const revokeIndex = deps.events.indexOf("revoke");
    const clickIndex = deps.events.indexOf(`click:${PREVIEW_E2E_SOFT_NAV_LINK}`);
    expect(PREVIEW_E2E_SOFT_NAV_LINK).toBe("Clients");
    expect(revokeIndex).toBeGreaterThan(-1);
    expect(clickIndex).toBeGreaterThan(revokeIndex);
  });

  it("runs cleanup after a soft-navigation assertion failure", async () => {
    const deps = makeHarnessDeps({ linkThrows: true });

    await expect(
      runPreviewDashboardAuthE2EWithDeps(env(), {
        createSupabase: deps.createSupabase,
        disableAdmin: deps.disableAdmin,
        fetch: deps.fetchMock,
        launchBrowser: deps.launchBrowser,
        promptForOtp: deps.promptForOtp,
        revokeSessionsForEmail: deps.revokeSessionsForEmail,
      }),
    ).rejects.toThrow("navigation failed");
    expect(deps.disableAdmin).toHaveBeenCalled();
  });

  it("fails the run when mandatory cleanup fails", async () => {
    const deps = makeHarnessDeps({ cleanupOk: false });

    await expect(
      runPreviewDashboardAuthE2EWithDeps(env(), {
        createSupabase: deps.createSupabase,
        disableAdmin: deps.disableAdmin,
        fetch: deps.fetchMock,
        launchBrowser: deps.launchBrowser,
        promptForOtp: deps.promptForOtp,
        revokeSessionsForEmail: deps.revokeSessionsForEmail,
      }),
    ).resolves.toEqual({ ok: false, code: "CLEANUP_FAILED" });
  });

  it("does not import the reviewed server-only session store", () => {
    const source = readFileSync("scripts/dashboard-auth/previewE2eHarness.ts", "utf8");

    expect(source).not.toContain("sessionStore");
    expect(source).not.toContain("getDashboardSessionByToken");
  });
});
