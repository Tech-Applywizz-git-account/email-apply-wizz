import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type RouteRecord = {
  path: string;
  body: Record<string, unknown> | null;
};

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function loadDashboardSecret(): string {
  const fromEnv = process.env.DASHBOARD_SECRET?.trim();
  if (fromEnv) return fromEnv;

  for (const candidate of [".env.local", ".env.production.local", ".env"]) {
    const filePath = path.join(process.cwd(), candidate);
    if (!fs.existsSync(filePath)) continue;

    const match = fs
      .readFileSync(filePath, "utf8")
      .match(/^DASHBOARD_SECRET=(.*)$/m);
    if (!match) continue;

    const raw = match[1]?.trim() ?? "";
    return raw.replace(/^["']|["']$/g, "");
  }

  return "test-dashboard-secret";
}

const DASHBOARD_SECRET = loadDashboardSecret();

test.use({
  httpCredentials: {
    username: "admin",
    password: DASHBOARD_SECRET,
  },
});

async function installAuthMocks(page: Page, responses: {
  requestOtp?: unknown;
  verifyOtp?: unknown;
  completeTotpSetup?: unknown;
  verifyTotp?: unknown;
}, records: RouteRecord[]) {
  await page.route("**/api/dashboard/auth/request-otp", async (route) => {
    records.push({ path: "request-otp", body: route.request().postDataJSON() as Record<string, unknown> });
    await route.fulfill(jsonResponse(responses.requestOtp ?? { ok: true, otpId: "otp-1" }));
  });

  await page.route("**/api/dashboard/auth/verify-otp", async (route) => {
    records.push({ path: "verify-otp", body: route.request().postDataJSON() as Record<string, unknown> });
    await route.fulfill(jsonResponse(responses.verifyOtp ?? {
      ok: true,
      stage: "totp_setup_required",
      challenge: "challenge-1",
      totpSecret: "SECRET-123",
      provisioningUri: "otpauth://totp/ApplyWizz:user@applywizz.ai?secret=SECRET-123",
    }));
  });

  await page.route("**/api/dashboard/auth/complete-totp-setup", async (route) => {
    records.push({ path: "complete-totp-setup", body: route.request().postDataJSON() as Record<string, unknown> });
    const response = responses.completeTotpSetup ?? { ok: true };
    await route.fulfill(jsonResponse(response, response && typeof response === "object" && "ok" in response && (response as { ok: boolean }).ok === false ? 400 : 200));
  });

  await page.route("**/api/dashboard/auth/verify-totp", async (route) => {
    records.push({ path: "verify-totp", body: route.request().postDataJSON() as Record<string, unknown> });
    const response = responses.verifyTotp ?? { ok: true };
    await route.fulfill(jsonResponse(response, response && typeof response === "object" && "ok" in response && (response as { ok: boolean }).ok === false ? 400 : 200));
  });
}

test.describe("Dashboard auth frontend", () => {
  test("renders the email screen and completes the setup flow", async ({ page }) => {
    const records: RouteRecord[] = [];
    await installAuthMocks(page, {}, records);

    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("dashboard-auth-email")).toBeVisible();
    await expect(page.getByTestId("dashboard-auth-shell")).toHaveAttribute("data-step", "email");

    await page.getByTestId("dashboard-auth-email").fill("  staff@applywizz.ai  ");
    await page.getByRole("button", { name: "Send OTP" }).click();

    await expect(page.getByTestId("dashboard-auth-shell")).toHaveAttribute("data-step", "otp");
    await expect(page.getByRole("heading", { name: "Verify the email code" })).toBeVisible();
    await expect(page.getByTestId("dashboard-auth-otp")).toBeVisible();

    await page.getByTestId("dashboard-auth-otp").fill("123456");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByTestId("dashboard-auth-shell")).toHaveAttribute("data-step", "setup");
    await expect(page.getByRole("heading", { name: "Set up your authenticator" })).toBeVisible();
    await expect(page.getByTestId("dashboard-auth-provisioning-uri")).toContainText("otpauth://totp/");
    await expect(page.getByTestId("dashboard-auth-totp-secret")).toContainText("SECRET-123");
    await expect(page.getByTestId("dashboard-auth-setup-code")).toBeVisible();

    await page.getByTestId("dashboard-auth-setup-code").fill("654321");
    await page.getByRole("button", { name: "Complete setup" }).click();

    await page.waitForURL("**/overview");
    await expect(page).toHaveURL(/\/overview$/);

    expect(records).toEqual([
      { path: "request-otp", body: { email: "staff@applywizz.ai" } },
      { path: "verify-otp", body: { otpId: "otp-1", rawOtp: "123456" } },
      { path: "complete-totp-setup", body: { challenge: "challenge-1", code: "654321" } },
    ]);

    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    expect(storage.local).not.toContain("dashboard_session");
    expect(storage.session).not.toContain("dashboard_session");
  });

  test("renders the returning-user flow and redirects after TOTP login", async ({ page }) => {
    const records: RouteRecord[] = [];
    await installAuthMocks(
      page,
      {
        verifyOtp: {
          ok: true,
          stage: "totp_required",
          challenge: "challenge-2",
        },
      },
      records,
    );

    await page.goto("/dashboard");
    await page.getByTestId("dashboard-auth-email").fill("staff@applywizz.ai");
    await page.getByRole("button", { name: "Send OTP" }).click();
    await page.getByTestId("dashboard-auth-otp").fill("123456");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByTestId("dashboard-auth-shell")).toHaveAttribute("data-step", "login");
    await expect(page.getByRole("heading", { name: "Enter your authenticator code" })).toBeVisible();
    await expect(page.getByTestId("dashboard-auth-login-code")).toBeVisible();

    await page.getByTestId("dashboard-auth-login-code").fill("654321");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/overview");
    await expect(page).toHaveURL(/\/overview$/);

    expect(records).toEqual([
      { path: "request-otp", body: { email: "staff@applywizz.ai" } },
      { path: "verify-otp", body: { otpId: "otp-1", rawOtp: "123456" } },
      { path: "verify-totp", body: { challenge: "challenge-2", code: "654321" } },
    ]);
  });

  test("shows a generic error when OTP request fails", async ({ page }) => {
    const records: RouteRecord[] = [];
    await installAuthMocks(page, { requestOtp: { ok: false } }, records);

    await page.goto("/dashboard");
    await page.getByTestId("dashboard-auth-email").fill("staff@applywizz.ai");
    await page.getByRole("button", { name: "Send OTP" }).click();

    await expect(page.getByTestId("dashboard-auth-error")).toContainText("Sign-in failed. Try again.");
    await expect(page.getByTestId("dashboard-auth-shell")).toHaveAttribute("data-step", "email");
    await expect(records).toEqual([{ path: "request-otp", body: { email: "staff@applywizz.ai" } }]);
  });

  test("shows a generic error when OTP verification fails", async ({ page }) => {
    const records: RouteRecord[] = [];
    await installAuthMocks(page, { verifyOtp: { ok: false } }, records);

    await page.goto("/dashboard");
    await page.getByTestId("dashboard-auth-email").fill("staff@applywizz.ai");
    await page.getByRole("button", { name: "Send OTP" }).click();
    await page.getByTestId("dashboard-auth-otp").fill("123456");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByTestId("dashboard-auth-error")).toContainText("Sign-in failed. Try again.");
    await expect(page.getByTestId("dashboard-auth-shell")).toHaveAttribute("data-step", "otp");
  });

  test("redirects to the dashboard overview when a dashboard session cookie already exists", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "dashboard_session",
        value: "existing-session",
        url: "http://localhost:3000",
      },
    ]);

    await page.goto("/dashboard");
    await page.waitForURL("**/overview");
    await expect(page).toHaveURL(/\/overview$/);
  });
});
