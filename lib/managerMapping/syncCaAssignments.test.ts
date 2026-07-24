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

function makeSupabase(options?: {
  activeRows?: Array<{ ca_id: string }>;
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const upserted: Record<string, unknown>[][] = [];
  const activeRows = options?.activeRows ?? [];
  const selectError = options?.selectError ?? null;
  const updateError = options?.updateError ?? null;
  const updateCalls: Array<{ payload: { is_active: false }; ids: string[] }> = [];

  const supabase = {
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>[], _options: { onConflict: string }) => {
        if (table === "manager_ca_assignments") upserted.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
      select: (_columns: string) => ({
        eq: (_column: string, _value: boolean) => {
          return Promise.resolve({ data: activeRows, error: selectError });
        },
      }),
      update: (payload: { is_active: false }) => ({
        in: (_column: string, ids: string[]) => {
          updateCalls.push({ payload, ids });
          return Promise.resolve({ data: null, error: updateError });
        },
      }),
    }),
  };
  return { supabase, upserted, updateCalls };
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

    expect(report).toMatchObject({
      ok: true,
      fetched_count: 2,
      upserted_count: 1,
      skipped_count: 1,
      deactivated_count: 0,
    });
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
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
        update: () => ({
          in: () => Promise.resolve({ data: null, error: null }),
        }),
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
    const select = vi.fn();
    const update = vi.fn();
    const supabase = { from: () => ({ upsert, select, update }) };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: false, errorCode: "CA_CAPACITY_HTTP_ERROR", deactivated_count: 0 });
    expect(upsert).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("removal: deactivates a previously active CA missing from the latest valid pull", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    const { supabase, updateCalls } = makeSupabase({
      activeRows: [{ ca_id: "id-1" }, { ca_id: "id-2" }],
    });
    const { syncCaAssignments } = await import("./syncCaAssignments");

    const report = await syncCaAssignments(supabase as never);

    expect(report.deactivated_count).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({ is_active: false });
    expect(updateCalls[0].ids).toEqual(["id-2"]);
  });

  it("transfer: a CA moving teams gets its manager_name/manager_email overwritten on upsert", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    const { supabase, upserted } = makeSupabase();
    const { syncCaAssignments } = await import("./syncCaAssignments");

    await syncCaAssignments(supabase as never);

    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toEqual([
      expect.objectContaining({
        ca_id: "id-1",
        manager_name: expect.any(String),
        manager_email: "balaji@applywizz.ai",
      }),
    ]);
  });

  it("idempotent rerun: deactivated_count stays 0 across repeat runs when the pull matches current state", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    const { supabase } = makeSupabase({ activeRows: [{ ca_id: "id-1" }] });
    const { syncCaAssignments } = await import("./syncCaAssignments");

    const firstReport = await syncCaAssignments(supabase as never);
    const secondReport = await syncCaAssignments(supabase as never);

    expect(firstReport.deactivated_count).toBe(0);
    expect(firstReport.ok).toBe(true);
    expect(secondReport.deactivated_count).toBe(0);
    expect(secondReport.ok).toBe(true);
  });

  it("all-invalid/empty pull skips reconciliation entirely without calling select/update", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-2", name: "Unmapped CA", email: "unmapped@applywizz.com", team_name: "Nonexistent Team" },
    ]);
    const select = vi.fn();
    const update = vi.fn();
    const upsert = vi.fn();
    const supabase = { from: () => ({ upsert, select, update }) };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report.deactivated_count).toBe(0);
    expect(report.ok).toBe(true);
    expect(select).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("empty pull (zero rows) also skips reconciliation without calling select/update", async () => {
    fetchCaCapacity.mockResolvedValue([]);
    const select = vi.fn();
    const update = vi.fn();
    const upsert = vi.fn();
    const supabase = { from: () => ({ upsert, select, update }) };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report.deactivated_count).toBe(0);
    expect(report.ok).toBe(true);
    expect(select).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
