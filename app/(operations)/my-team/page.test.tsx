import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireOperationsAccess = vi.fn();
const createSupabaseServiceRoleClient = vi.fn();

vi.mock("@/lib/dashboardAuth/requireOperationsAccess", () => ({ requireOperationsAccess }));
vi.mock("@/lib/supabase/serviceRole", () => ({ createSupabaseServiceRoleClient }));

function session(role: "admin_ceo" | "manager_ops", email: string) {
  return { user: { id: "u1", email, role, status: "active", totpEnabled: true } };
}

describe("MyTeamPage", () => {
  it("queries manager_ca_assignments scoped to the logged-in manager's email", async () => {
    requireOperationsAccess.mockResolvedValue(session("manager_ops", "balaji@applywizz.ai"));
    let capturedEmail = "";
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: (_col: string, value: string) => {
            capturedEmail = value;
            return Promise.resolve({ data: [], error: null });
          },
        }),
      }),
    });

    const { default: MyTeamPage } = await import("./page");
    await MyTeamPage();

    expect(capturedEmail).toBe("balaji@applywizz.ai");
  });

  it("queries all CAs (no manager filter) for admin_ceo", async () => {
    requireOperationsAccess.mockResolvedValue(session("admin_ceo", "ramakrishna@applywizz.ai"));
    let eqCalled = false;
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        eq: () => {
          eqCalled = true;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    });

    const { default: MyTeamPage } = await import("./page");
    await MyTeamPage();

    expect(eqCalled).toBe(false);
  });
});
