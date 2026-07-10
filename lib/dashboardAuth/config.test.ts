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

  it("reads the dashboard TOTP encryption key from env", async () => {
    vi.stubEnv("DASHBOARD_TOTP_ENCRYPTION_KEY", "totp-key");
    const { getDashboardTotpEncryptionKey } = await import("./config");

    expect(getDashboardTotpEncryptionKey()).toBe("totp-key");
  });

  it("uses a test fallback for the dashboard TOTP encryption key when missing in tests", async () => {
    vi.stubEnv("DASHBOARD_TOTP_ENCRYPTION_KEY", "");
    const { getDashboardTotpEncryptionKey } = await import("./config");

    expect(getDashboardTotpEncryptionKey()).toBe("dashboard-totp-test-secret");
  });
});
