import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getDashboardSessionByToken = vi.fn();
const cookieGet = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/dashboardAuth/sessionStore", () => ({ getDashboardSessionByToken }));
vi.mock("@/components/dashboard-auth/dashboard-auth-client", () => ({
  DashboardAuthClient: ({ initialError }: { initialError?: string } = {}) =>
    `DashboardAuthClient:${initialError ?? ""}`,
}));

function searchParamsOf(
  params: Record<string, string | string[] | undefined>,
): Promise<Record<string, string | string[] | undefined>> {
  return Promise.resolve(params);
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

describe("Home (root page)", () => {
  it("renders the login landing page when there is no session cookie", async () => {
    cookieGet.mockReturnValue(undefined);
    const { default: Home } = await import("./page");
    const element = await Home({ searchParams: searchParamsOf({}) });
    expect(renderToStaticMarkup(element)).toContain("DashboardAuthClient");
  });

  it("redirects an admin session to the live monitor", async () => {
    cookieGet.mockReturnValue({ value: "raw-token" });
    getDashboardSessionByToken.mockResolvedValue(session("admin_ceo"));
    const { default: Home } = await import("./page");
    await expect(Home({ searchParams: searchParamsOf({}) })).rejects.toThrow(
      "REDIRECT:/live-monitor/email-arrival",
    );
  });

  it("redirects a ca session to access-pending", async () => {
    cookieGet.mockReturnValue({ value: "raw-token" });
    getDashboardSessionByToken.mockResolvedValue(session("ca"));
    const { default: Home } = await import("./page");
    await expect(Home({ searchParams: searchParamsOf({}) })).rejects.toThrow("REDIRECT:/access-pending");
  });

  it("renders the landing page for an invalid or expired session instead of throwing", async () => {
    cookieGet.mockReturnValue({ value: "raw-token" });
    getDashboardSessionByToken.mockResolvedValue({ ok: false });
    const { default: Home } = await import("./page");
    const element = await Home({ searchParams: searchParamsOf({}) });
    expect(renderToStaticMarkup(element)).toContain("DashboardAuthClient");
  });

  it("passes an expired-session message into DashboardAuthClient when redirected with ?expired=1", async () => {
    cookieGet.mockReturnValue(undefined);
    const { default: Home } = await import("./page");
    const element = await Home({ searchParams: searchParamsOf({ expired: "1" }) });
    expect(renderToStaticMarkup(element)).toContain(
      "DashboardAuthClient:Your session has expired. Please sign in again.",
    );
  });

  it("does not show the expired-session message for any other value of the expired param", async () => {
    cookieGet.mockReturnValue(undefined);
    const { default: Home } = await import("./page");
    const element = await Home({ searchParams: searchParamsOf({ expired: "true" }) });
    expect(renderToStaticMarkup(element)).toContain("DashboardAuthClient:");
    expect(renderToStaticMarkup(element)).not.toContain("Your session has expired");
  });
});
