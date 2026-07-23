import { describe, expect, it, vi } from "vitest";

const requireDashboardSession = vi.fn();

vi.mock("@/lib/dashboardAuth/requireDashboardSession", () => ({
  requireDashboardSession,
}));

describe("AccessPendingPage", () => {
  it("requires a dashboard session before rendering", async () => {
    requireDashboardSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      revokedAt: null,
      user: { id: "user-1", email: "ca@applywizz.ai", role: "ca", status: "active", totpEnabled: true },
    });

    const { default: AccessPendingPage } = await import("./page");
    const element = await AccessPendingPage();

    expect(requireDashboardSession).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(element)).toContain("Your ApplyWizz account is active");
  });
});
