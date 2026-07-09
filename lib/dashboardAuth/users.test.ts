import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type DashboardUserRow = {
  id: string;
  email: string;
  role: "admin_ceo" | "manager_ops" | "ca";
  status: "active" | "disabled";
  totp_enabled: boolean;
};

let mockResult: { data: DashboardUserRow | null; error: { message: string } | null };
const calls: Array<{ table: string; columns: string; column: string; value: string }> = [];

vi.mock("@/lib/supabase/serviceRole", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            calls.push({ table, columns, column, value });
            return mockResult;
          },
        }),
      }),
    }),
  }),
}));

describe("getDashboardUserByEmail", () => {
  beforeEach(() => {
    calls.length = 0;
    mockResult = { data: null, error: null };
  });

  it("returns an active dashboard user by normalized email", async () => {
    mockResult = {
      data: {
        id: "user-1",
        email: "Admin@applywizz.ai",
        role: "admin_ceo",
        status: "active",
        totp_enabled: true,
      },
      error: null,
    };

    const { getDashboardUserByEmail } = await import("./users");

    await expect(getDashboardUserByEmail("  ADMIN@ApplyWizz.AI ")).resolves.toEqual({
      id: "user-1",
      email: "Admin@applywizz.ai",
      role: "admin_ceo",
      status: "active",
      totpEnabled: true,
    });
    expect(calls).toEqual([
      {
        table: "dashboard_users",
        columns: "id, email, role, status, totp_enabled",
        column: "email_normalized",
        value: "admin@applywizz.ai",
      },
    ]);
  });

  it("returns a disabled dashboard user", async () => {
    mockResult = {
      data: {
        id: "user-2",
        email: "ca@applywizz.ai",
        role: "ca",
        status: "disabled",
        totp_enabled: false,
      },
      error: null,
    };

    const { getDashboardUserByEmail } = await import("./users");

    await expect(getDashboardUserByEmail("ca@applywizz.ai")).resolves.toEqual({
      id: "user-2",
      email: "ca@applywizz.ai",
      role: "ca",
      status: "disabled",
      totpEnabled: false,
    });
  });

  it("returns null when the user is not found", async () => {
    const { getDashboardUserByEmail } = await import("./users");

    await expect(getDashboardUserByEmail("missing@applywizz.ai")).resolves.toBeNull();
  });

  it("returns null on query errors", async () => {
    mockResult = { data: null, error: { message: "database unavailable" } };
    const { getDashboardUserByEmail } = await import("./users");

    await expect(getDashboardUserByEmail("admin@applywizz.ai")).resolves.toBeNull();
  });
});
