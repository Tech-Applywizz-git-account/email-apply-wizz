import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createSupabaseServiceRoleClient = vi.fn();
vi.mock("@/lib/supabase/serviceRole", () => ({ createSupabaseServiceRoleClient }));

function mockSupabaseReturning(rows: Array<{ ca_email: string }>) {
  createSupabaseServiceRoleClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  });
}

describe("getAllowedCaEmailsForManager", () => {
  it("returns the set of active CA emails mapped to this manager, lowercased", async () => {
    mockSupabaseReturning([{ ca_email: "a@applywizz.com" }, { ca_email: "B@applywizz.ai" }]);
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(getAllowedCaEmailsForManager("balaji@applywizz.ai")).resolves.toEqual(
      new Set(["a@applywizz.com", "b@applywizz.ai"]),
    );
  });

  it("normalizes a mixed-case manager email before querying, and normalizes returned ca_email casing", async () => {
    let capturedManagerEmail = "";
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => {
            if (column === "manager_email") {
              capturedManagerEmail = value;
            }
            return {
              eq: () =>
                Promise.resolve({
                  data: [{ ca_email: "A@ApplyWizz.Com" }, { ca_email: "  B@applywizz.AI  " }],
                  error: null,
                }),
            };
          },
        }),
      }),
    });
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(
      getAllowedCaEmailsForManager("  RAMAKRISHNAA.TEJAVATH@APPLYWIZZ.AI  "),
    ).resolves.toEqual(new Set(["a@applywizz.com", "b@applywizz.ai"]));
    expect(capturedManagerEmail).toBe("ramakrishnaa.tejavath@applywizz.ai");
  });

  it("returns an empty set (fail closed) when the manager has no mapped CAs", async () => {
    mockSupabaseReturning([]);
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(getAllowedCaEmailsForManager("nobody@applywizz.ai")).resolves.toEqual(new Set());
  });

  it("returns an empty set (fail closed) on a database error, never throws", async () => {
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: null, error: { message: "db down" } }),
          }),
        }),
      }),
    });
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(getAllowedCaEmailsForManager("balaji@applywizz.ai")).resolves.toEqual(new Set());
  });

  it("returns an empty set (fail closed) when creating the Supabase client throws, never throws", async () => {
    createSupabaseServiceRoleClient.mockImplementation(() => {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
    });
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(getAllowedCaEmailsForManager("balaji@applywizz.ai")).resolves.toEqual(new Set());
  });
});
