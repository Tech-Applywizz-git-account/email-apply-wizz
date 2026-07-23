import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("resolveRootRedirect", () => {
  it("sends admin_ceo to the live monitor", async () => {
    const { resolveRootRedirect } = await import("./rootRedirect");
    expect(resolveRootRedirect("admin_ceo")).toBe("/live-monitor/email-arrival");
  });

  it("sends manager_ops to the live monitor", async () => {
    const { resolveRootRedirect } = await import("./rootRedirect");
    expect(resolveRootRedirect("manager_ops")).toBe("/live-monitor/email-arrival");
  });

  it("sends ca to the access-pending holding page", async () => {
    const { resolveRootRedirect } = await import("./rootRedirect");
    expect(resolveRootRedirect("ca")).toBe("/access-pending");
  });
});
