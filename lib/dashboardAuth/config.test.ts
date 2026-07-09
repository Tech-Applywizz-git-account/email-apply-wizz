import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("dashboard auth config", () => {
  it("reads the dashboard session secret from env", async () => {
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "test-secret");
    const { getDashboardAuthSecret } = await import("./config");

    expect(getDashboardAuthSecret()).toBe("test-secret");
  });

  it("uses a test fallback when the secret is missing in tests", async () => {
    vi.stubEnv("DASHBOARD_SESSION_SECRET", "");
    const { getDashboardAuthSecret } = await import("./config");

    expect(getDashboardAuthSecret()).toBe("dashboard-auth-test-secret");
  });
});
