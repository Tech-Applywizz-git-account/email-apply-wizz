import { describe, expect, it, vi } from "vitest";

// "server-only" is not an installed package; existing tests for server-only
// modules in this repo (e.g. lib/dashboardAuth/otpStore.test.ts) stub it the
// same way so the import resolves under vitest.
vi.mock("server-only", () => ({}));

const fetchCaCapacity = vi.fn();

// Preserve the real CaCapacityFetchError export (needed by both this test's
// error-path assertion and syncCaAssignments.ts's `instanceof` check) while
// stubbing only fetchCaCapacity itself.
vi.mock("@/lib/managerMapping/fetchCaCapacity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetchCaCapacity")>();
  return { ...actual, fetchCaCapacity };
});

function makeSupabase() {
  const upserted: Record<string, unknown>[][] = [];
  const supabase = {
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>[], _options: { onConflict: string }) => {
        if (table === "manager_ca_assignments") upserted.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
  return { supabase, upserted };
}

describe("syncCaAssignments", () => {
  it("upserts only records that normalize successfully, skipping unmapped/invalid ones", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
      { ca_id: "id-2", name: "Unmapped CA", email: "unmapped@applywizz.com", team_name: "Nonexistent Team" },
    ]);
    const { supabase, upserted } = makeSupabase();
    const { syncCaAssignments } = await import("./syncCaAssignments");

    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: true, fetched_count: 2, upserted_count: 1, skipped_count: 1 });
    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toEqual([
      expect.objectContaining({ ca_id: "id-1", manager_email: "balaji@applywizz.ai" }),
    ]);
  });

  it("is idempotent: upserts with onConflict on ca_id so repeat runs never duplicate", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    let capturedOnConflict = "";
    const supabase = {
      from: () => ({
        upsert: (_payload: unknown, options: { onConflict: string }) => {
          capturedOnConflict = options.onConflict;
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
    const { syncCaAssignments } = await import("./syncCaAssignments");
    await syncCaAssignments(supabase as never);
    expect(capturedOnConflict).toBe("ca_id");
  });

  it("reports ok:false with an error code when the fetch itself fails, without touching the database", async () => {
    const { CaCapacityFetchError } = await import("./fetchCaCapacity");
    fetchCaCapacity.mockRejectedValue(new CaCapacityFetchError("CA_CAPACITY_HTTP_ERROR", 500));
    const upsert = vi.fn();
    const supabase = { from: () => ({ upsert }) };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: false, errorCode: "CA_CAPACITY_HTTP_ERROR" });
    expect(upsert).not.toHaveBeenCalled();
  });
});
