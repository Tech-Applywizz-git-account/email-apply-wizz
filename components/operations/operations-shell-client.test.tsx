import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// This repo has no @testing-library/react / jsdom (vitest.config.ts uses
// environment: "node"), so this suite renders with renderToStaticMarkup and
// asserts on the resulting HTML string, matching the established pattern in
// components/dashboard-auth/authenticator-setup.test.tsx.
vi.mock("next/navigation", () => ({ usePathname: () => "/overview" }));

// next/font/google's exports are only made callable by Next's build pipeline
// (webpack/SWC font loader); under vitest they are not functions and calling
// them throws (see the identical note in
// components/dashboard-auth/dashboard-auth-client.tsx). Mocking the module
// lets this suite import the unmodified client component without crashing.
vi.mock("next/font/google", () => {
  const loader = () => ({
    variable: "font-mock",
    style: { fontFamily: "sans-serif" },
  });
  return { Noto_Sans: loader, Inter: loader, Space_Grotesk: loader };
});

describe("OperationsShellClient", () => {
  it("renders the real signed-in employee name and role label", async () => {
    const { OperationsShellClient } = await import("./operations-shell-client");
    const markup = renderToStaticMarkup(
      <OperationsShellClient userName="Ramakrishna Chanda" userRole="admin_ceo">
        <div>content</div>
      </OperationsShellClient>,
    );

    expect(markup).toContain("Ramakrishna Chanda");
    expect(markup).toContain(">Admin<");
  });

  it("labels a manager_ops session as Manager and a ca session as CA", async () => {
    const { OperationsShellClient } = await import("./operations-shell-client");

    const managerMarkup = renderToStaticMarkup(
      <OperationsShellClient userName="Balaji" userRole="manager_ops">
        <div>content</div>
      </OperationsShellClient>,
    );
    expect(managerMarkup).toContain("Balaji");
    expect(managerMarkup).toContain(">Manager<");

    const caMarkup = renderToStaticMarkup(
      <OperationsShellClient userName="Navya" userRole="ca">
        <div>content</div>
      </OperationsShellClient>,
    );
    expect(caMarkup).toContain("Navya");
    expect(caMarkup).toContain(">CA<");
  });

  it("still renders the sign-out controls and nav links unchanged", async () => {
    const { OperationsShellClient } = await import("./operations-shell-client");
    const markup = renderToStaticMarkup(
      <OperationsShellClient userName="Ramakrishna Chanda" userRole="admin_ceo">
        <div>content</div>
      </OperationsShellClient>,
    );

    // The mobile drawer (and its own logout button) only renders once
    // mobileMenuOpen becomes true via useState, so it is absent from the
    // initial static markup; the desktop sidebar and bottom-nav logout
    // controls render unconditionally and are checked here instead.
    expect(markup).toContain('data-testid="dashboard-logout-button"');
    expect(markup).toContain('data-testid="dashboard-bottom-logout-button"');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Live Monitor");
    expect(markup).toContain("Review Queue");
  });

  it("renders full operations navigation for admin_ceo and manager_ops but not for ca", async () => {
    const { OperationsShellClient } = await import("./operations-shell-client");
    const { renderToStaticMarkup } = await import("react-dom/server");

    const admin = renderToStaticMarkup(
      <OperationsShellClient userName="Ramakrishna" userRole="admin_ceo">
        <div>content</div>
      </OperationsShellClient>,
    );
    expect(admin).toContain("Live Monitor");
    expect(admin).toContain("Review Queue");
    // The mobile-bottom-nav surface uses its own shorter label ("Review", not
    // "Review Queue") for this link, so it needs a check tied to its own
    // markup (the nav-text span it alone uses) to prove that surface itself
    // renders the broad-ops link, rather than relying on "Review Queue"
    // matching only because sidebar-nav/drawer-nav happen to render too.
    expect(admin).toContain('<span class="nav-text">Review</span>');

    const ca = renderToStaticMarkup(
      <OperationsShellClient userName="Navya" userRole="ca">
        <div>content</div>
      </OperationsShellClient>,
    );
    expect(ca).not.toContain("Live Monitor");
    expect(ca).not.toContain("Review Queue");
    expect(ca).not.toContain("Clients");
    // Unambiguous, bottom-nav-specific negative check: the "Review Queue"
    // assertion above is only ever satisfied by sidebar-nav/drawer-nav
    // markup, because mobile-bottom-nav renders that link as plain "Review".
    // A regression that ungated mobile-bottom-nav's broad links while
    // leaving "Clients" text unchanged there would still pass every
    // assertion above; this one only passes if bottom-nav's own review link
    // is actually hidden for ca.
    expect(ca).not.toContain('<span class="nav-text">Review</span>');

    // Positive coverage: for a ca session, "Access Pending" should appear
    // exactly 3 times in the static markup. mobileMenuOpen starts false, so
    // drawer-nav never renders in a static (non-interactive) render and
    // contributes 0. sidebar-nav's NavLink renders the label twice (once as
    // the Link's aria-label attribute, once as the visible nav-label span),
    // contributing 2. mobile-bottom-nav renders it once as a nav-text span,
    // contributing 1. Total: 2 + 0 + 1 = 3. If a future change ungated one
    // of these surfaces for ca (rendering broad-ops links instead of
    // Access Pending there), this count would drop below 3.
    expect(ca.split("Access Pending").length - 1).toBe(3);
  });
});
