import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("DashboardAuthClient landing layout", () => {
  it("shows only the email step's heading, not a visible step-tabs strip", async () => {
    const { DashboardAuthClient } = await import("./dashboard-auth-client");
    const markup = renderToStaticMarkup(<DashboardAuthClient />);

    expect(markup).toContain('data-testid="dashboard-auth-email"');
    expect(markup).not.toContain("Authentication steps");
    expect(markup).not.toContain("dashboard-auth-steps");
  });

  it("does not show the setup progress indicator on the email step", async () => {
    const { DashboardAuthClient } = await import("./dashboard-auth-client");
    const markup = renderToStaticMarkup(<DashboardAuthClient />);

    expect(markup).not.toContain('aria-label="Setup progress"');
  });
});

describe("shouldShowSetupProgress", () => {
  // DashboardAuthClient is a stateful client component reached only via
  // clicks/form submits (email -> otp/login -> setup). This repo's vitest
  // environment is "node" with no @testing-library/react or jsdom installed,
  // so renderToStaticMarkup (a one-shot static render with no event system)
  // cannot drive it through those steps: there is no way to fire the
  // onSubmit handlers that call setStep from outside the component. The
  // core "progress indicator only for the first-time-setup path, not the
  // returning-user path" requirement is gated by a single pure predicate
  // (shouldShowSetupProgress), exported specifically so that requirement is
  // unit-testable for every step value without needing DOM simulation. This
  // directly guards against e.g. the `||` in its body being flipped to `&&`.
  it("is true for the first-time-setup steps (otp, setup)", async () => {
    const { shouldShowSetupProgress } = await import("./dashboard-auth-client");

    expect(shouldShowSetupProgress("otp")).toBe(true);
    expect(shouldShowSetupProgress("setup")).toBe(true);
  });

  it("is false for the email step and the returning-user login step", async () => {
    const { shouldShowSetupProgress } = await import("./dashboard-auth-client");

    expect(shouldShowSetupProgress("email")).toBe(false);
    expect(shouldShowSetupProgress("login")).toBe(false);
  });
});
