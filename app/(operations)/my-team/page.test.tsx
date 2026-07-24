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
    let isActiveCalled = false;
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          eq: (col: string, _value: string | boolean) => {
            if (col === "is_active") {
              isActiveCalled = true;
            }
            // Return an object that is awaitable AND has an eq method
            const result = Promise.resolve({ data: [], error: null });
            (result as unknown as { eq: (col: string, val: string | boolean) => Promise<unknown> }).eq = (
              col: string,
              val: string | boolean
            ) => {
              if (col === "manager_email") {
                capturedEmail = val as string;
              }
              return Promise.resolve({ data: [], error: null });
            };
            return result as unknown as { eq: (col: string, val: string | boolean) => Promise<unknown> } &
              Promise<{ data: unknown[]; error: null }>;
          },
        }),
      }),
    });

    const { default: MyTeamPage } = await import("./page");
    await MyTeamPage();

    expect(isActiveCalled).toBe(true);
    expect(capturedEmail).toBe("balaji@applywizz.ai");
  });

  it("queries all CAs (no manager filter) for admin_ceo", async () => {
    requireOperationsAccess.mockResolvedValue(session("admin_ceo", "ramakrishna@applywizz.ai"));
    let isActiveCalled = false;
    let managerEmailCalled = false;
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          eq: (col: string, _value: string | boolean) => {
            if (col === "is_active") {
              isActiveCalled = true;
            }
            if (col === "manager_email") {
              managerEmailCalled = true;
            }
            return Promise.resolve({ data: [], error: null });
          },
        }),
      }),
    });

    const { default: MyTeamPage } = await import("./page");
    await MyTeamPage();

    expect(isActiveCalled).toBe(true);
    expect(managerEmailCalled).toBe(false);
  });
});
