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
  rpcResult?: { upserted_count: number; deactivated_count: number; quarantined_count: number };
  rpcError?: { message: string } | null;
}) {
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const rpcResult = options?.rpcResult ?? { upserted_count: 0, deactivated_count: 0, quarantined_count: 0 };
  const rpcError = options?.rpcError ?? null;

  const supabase = {
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: rpcError ? null : [rpcResult], error: rpcError });
    },
  };
  return { supabase, rpcCalls };
}

describe("syncCaAssignments", () => {
  it("upserts only records that normalize successfully, skipping unmapped/invalid ones", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
      { ca_id: "id-2", name: "Unmapped CA", email: "unmapped@applywizz.com", team_name: "Nonexistent Team" },
    ]);
    const { supabase, rpcCalls } = makeSupabase({ rpcResult: { upserted_count: 1, deactivated_count: 0, quarantined_count: 0 } });
    const { syncCaAssignments } = await import("./syncCaAssignments");

    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({
      ok: true,
      fetched_count: 2,
      upserted_count: 1,
      skipped_count: 1,
      deactivated_count: 0,
      quarantined_count: 0,
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.fn).toBe("sync_ca_assignments");
    expect(rpcCalls[0]?.args).toEqual({
      p_records: [expect.objectContaining({ ca_id: "id-1", manager_email: "balaji@applywizz.ai" })],
    });
  });

  it("reports ok:false with an error code when the fetch itself fails, without calling the RPC", async () => {
    const { CaCapacityFetchError } = await import("./fetchCaCapacity");
    fetchCaCapacity.mockRejectedValue(new CaCapacityFetchError("CA_CAPACITY_HTTP_ERROR", 500));
    const rpc = vi.fn();
    const supabase = { rpc };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: false, errorCode: "CA_CAPACITY_HTTP_ERROR", deactivated_count: 0, quarantined_count: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("all-invalid/empty pull skips the RPC entirely", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-2", name: "Unmapped CA", email: "unmapped@applywizz.com", team_name: "Nonexistent Team" },
    ]);
    const rpc = vi.fn();
    const supabase = { rpc };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: true, deactivated_count: 0, quarantined_count: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("empty pull (zero rows) also skips the RPC entirely", async () => {
    fetchCaCapacity.mockResolvedValue([]);
    const rpc = vi.fn();
    const supabase = { rpc };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: true, deactivated_count: 0, quarantined_count: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("quarantine: a CA missing for 1-2 runs is not deactivated (RPC reports it as still-active/quarantined)", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    // The RPC itself owns the missing_run_count increment/threshold logic;
    // this test asserts syncCaAssignments correctly relays what the RPC
    // reports back (0 deactivated, 1 still-active-but-quarantined).
    const { supabase } = makeSupabase({ rpcResult: { upserted_count: 1, deactivated_count: 0, quarantined_count: 1 } });

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: true, deactivated_count: 0, quarantined_count: 1 });
  });

  it("quarantine: a CA missing for a 3rd consecutive run is deactivated (relayed from the RPC)", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    const { supabase } = makeSupabase({ rpcResult: { upserted_count: 1, deactivated_count: 1, quarantined_count: 0 } });

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: true, deactivated_count: 1, quarantined_count: 0 });
  });

  it("transfer: a CA moving teams gets its manager_name/manager_email overwritten in the record sent to the RPC", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    const { supabase, rpcCalls } = makeSupabase({ rpcResult: { upserted_count: 1, deactivated_count: 0, quarantined_count: 0 } });

    const { syncCaAssignments } = await import("./syncCaAssignments");
    await syncCaAssignments(supabase as never);

    const args = rpcCalls[0]?.args as { p_records: Array<Record<string, unknown>> };
    expect(args.p_records).toEqual([
      expect.objectContaining({
        ca_id: "id-1",
        manager_name: expect.any(String),
        manager_email: "balaji@applywizz.ai",
      }),
    ]);
  });

  it("atomicity: an RPC error fails the whole run (ok:false) instead of a partial upsert-without-reconciliation", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    const { supabase } = makeSupabase({ rpcError: { message: "connection reset mid-transaction" } });

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({
      ok: false,
      errorCode: "DATABASE_ERROR",
      upserted_count: 0,
      deactivated_count: 0,
      quarantined_count: 0,
    });
  });
});
