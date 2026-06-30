import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  claimEmailsForClassification,
  getRetryDisposition,
  updateClaimedEmail,
} from "@/lib/zoho/queueFoundation";

describe("queueFoundation", () => {
  it("uses the approved retry schedule and dead-letters on the fifth failure", () => {
    expect(getRetryDisposition(1, "2026-06-30T04:00:00.000Z")).toEqual({
      status: "retry_scheduled",
      nextRetryAt: "2026-06-30T04:01:00.000Z",
      deadLetteredAt: null,
    });
    expect(getRetryDisposition(2, "2026-06-30T04:00:00.000Z")).toEqual({
      status: "retry_scheduled",
      nextRetryAt: "2026-06-30T04:05:00.000Z",
      deadLetteredAt: null,
    });
    expect(getRetryDisposition(3, "2026-06-30T04:00:00.000Z")).toEqual({
      status: "retry_scheduled",
      nextRetryAt: "2026-06-30T04:15:00.000Z",
      deadLetteredAt: null,
    });
    expect(getRetryDisposition(4, "2026-06-30T04:00:00.000Z")).toEqual({
      status: "retry_scheduled",
      nextRetryAt: "2026-06-30T05:00:00.000Z",
      deadLetteredAt: null,
    });
    expect(getRetryDisposition(5, "2026-06-30T04:00:00.000Z")).toEqual({
      status: "dead_letter",
      nextRetryAt: null,
      deadLetteredAt: "2026-06-30T04:00:00.000Z",
    });
  });

  it("claims rows through the database function with mailbox, worker id, limit, and ttl", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "email-1" }], error: null });
    const rows = await claimEmailsForClassification(
      { rpc } as unknown as { rpc: typeof rpc },
      "tracker@applywizard.ai",
      "worker-a",
      25,
    );

    expect(rows).toEqual([{ id: "email-1" }]);
    expect(rpc).toHaveBeenCalledWith("claim_zoho_email_rows", {
      p_mailbox_email: "tracker@applywizard.ai",
      p_worker_id: "worker-a",
      p_limit: 25,
      p_claim_ttl_seconds: 600,
    });
  });

  it("supports two workers claiming independently through the atomic database function", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: "email-1" }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "email-2" }], error: null });

    const first = await claimEmailsForClassification(
      { rpc } as unknown as { rpc: typeof rpc },
      "tracker@applywizard.ai",
      "worker-a",
      1,
    );
    const second = await claimEmailsForClassification(
      { rpc } as unknown as { rpc: typeof rpc },
      "tracker@applywizard.ai",
      "worker-b",
      1,
    );

    expect(first).toEqual([{ id: "email-1" }]);
    expect(second).toEqual([{ id: "email-2" }]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_worker_id: "worker-b" });
  });

  it("prevents stale workers from overwriting results after the claim lease expires", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const gt = vi.fn(() => ({ select: () => ({ maybeSingle }) }));
    const eqStatus = vi.fn(() => ({ gt }));
    const eqWorker = vi.fn(() => ({ eq: eqStatus }));
    const eqId = vi.fn(() => ({ eq: eqWorker }));
    const update = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ update }));

    const updated = await updateClaimedEmail(
      { from } as unknown as { from: typeof from },
      {
        id: "email-1",
        workerId: "worker-a",
        nowIso: "2026-06-30T04:00:00.000Z",
        payload: { classification_status: "classified" },
      },
    );

    expect(updated).toBe(false);
    expect(gt).toHaveBeenCalledWith("claim_expires_at", "2026-06-30T04:00:00.000Z");
  });

  it("migration enforces skip-locked claims so concurrent workers cannot grab the same row", () => {
    const migration = readFileSync(
      resolve(__dirname, "../../supabase/migrations/202606300001_queue_foundation.sql"),
      "utf8",
    );

    expect(migration).toContain("for update skip locked");
  });

  it("migration reclaims expired claims and only selects pending or retry-scheduled rows", () => {
    const migration = readFileSync(
      resolve(__dirname, "../../supabase/migrations/202606300001_queue_foundation.sql"),
      "utf8",
    );

    expect(migration).toContain("claim_expires_at is null or claim_expires_at <= p_now");
    expect(migration).toContain("classification_status in ('pending', 'retry_scheduled')");
  });
});
