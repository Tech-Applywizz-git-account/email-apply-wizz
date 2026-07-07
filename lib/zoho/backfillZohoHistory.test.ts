import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runZohoHistoryBackfill, type BackfillDeps } from "./backfillZohoHistory";

const connection = {
  id: "conn-1",
  zoho_account_id: "acct-1",
  email_address: "tracker@applywizard.ai",
  access_token: "tok",
  access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  refresh_token: "ref",
};

function opts(overrides: Parameters<typeof runZohoHistoryBackfill>[0]) {
  return {
    mailbox: "tracker@applywizard.ai",
    mailBaseUrl: "https://mail.zoho.test",
    ...overrides,
  };
}

function messages(ids: string[]) {
  return ids.map((id, index) => ({
    messageId: id,
    sender: "sender@example.com",
    subject: `Email ${id}`,
    receivedTime: Date.parse("2026-06-30T04:00:00.000Z") - index * 1000,
    folderName: "Inbox",
    folderId: "folder-1",
    hasAttachment: "0",
  }));
}

function makeSupabase(existing: string[] = []) {
  const checkpointUpsert = vi.fn().mockResolvedValue({ error: null });
  const metadataUpsert = vi.fn().mockResolvedValue({ error: null });
  const calls = { checkpointUpsert, metadataUpsert };

  return {
    calls,
    client: {
      from: (table: string) => {
        if (table === "zoho_connections") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: connection, error: null }),
                }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }

        if (table === "zoho_backfill_checkpoints") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            upsert: checkpointUpsert,
          };
        }

        if (table === "zoho_sync_checkpoints") {
          throw new Error("live checkpoint table must not be touched");
        }

        return {
          select: () => ({
            eq: () => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({
                  data: ids
                    .filter((id) => existing.includes(id))
                    .map((message_id) => ({ message_id })),
                  error: null,
                }),
            }),
          }),
          upsert: metadataUpsert,
        };
      },
    },
  };
}

function deps(fetchImpl: BackfillDeps["fetchImpl"], existing: string[] = []): BackfillDeps {
  const supabase = makeSupabase(existing);
  return {
    supabase: supabase.client,
    fetchImpl,
    sleep: vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-07-01T00:00:00.000Z"),
    log: vi.fn(),
    shouldStop: () => false,
  };
}

describe("runZohoHistoryBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to dry-run and paginates newest toward older offsets", async () => {
    const urls: string[] = [];
    const d = deps(vi.fn().mockImplementation((url: string) => {
      urls.push(url);
      const page = urls.length === 1 ? messages(["m3", "m2"]) : messages(["m1"]);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ status: { code: 200 }, data: page }),
      });
    }));

    const result = await runZohoHistoryBackfill(
      opts({ pageSize: 2, maxPages: 2, dryRun: true, startOffset: 0 }),
      d,
    );

    expect(urls[0]).toContain("limit=2&start=0");
    expect(urls[1]).toContain("limit=2&start=2");
    expect(result.fetched).toBe(3);
    expect(result.dryRun).toBe(true);
  });

  it("resumes from the separate backfill checkpoint", async () => {
    const supabase = makeSupabase();
    supabase.client.from = ((original) => (table: string) => {
      if (table === "zoho_backfill_checkpoints") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { mailbox_email: connection.email_address, next_start: 40 },
                  error: null,
                }),
            }),
          }),
          upsert: supabase.calls.checkpointUpsert,
        };
      }
      return original(table);
    })(supabase.client.from);

    const urls: string[] = [];
    await runZohoHistoryBackfill(
      opts({ pageSize: 10, maxPages: 1, dryRun: true, startOffset: 0 }),
      {
        ...deps((url: string) => {
          urls.push(url);
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: () => Promise.resolve({ status: { code: 200 }, data: [] }),
          });
        }),
        supabase: supabase.client,
      },
    );

    expect(urls[0]).toContain("start=40");
  });

  it("does not write metadata or checkpoints during dry-run", async () => {
    const supabase = makeSupabase();
    const result = await runZohoHistoryBackfill(
      opts({ pageSize: 2, maxPages: 1, dryRun: true, startOffset: 0 }),
      {
        ...deps(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: () => Promise.resolve({ status: { code: 200 }, data: messages(["m1"]) }),
          }),
        ),
        supabase: supabase.client,
      },
    );

    expect(result.wouldInsert).toBe(1);
    expect(supabase.calls.metadataUpsert).not.toHaveBeenCalled();
    expect(supabase.calls.checkpointUpsert).not.toHaveBeenCalled();
  });

  it("counts duplicates without inserting new identities", async () => {
    const d = deps(
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve({ status: { code: 200 }, data: messages(["m2", "m1"]) }),
        }),
      ["m1"],
    );

    const result = await runZohoHistoryBackfill(
      opts({ pageSize: 2, maxPages: 1, dryRun: false, confirmProductionBackfill: true, startOffset: 0 }),
      d,
    );

    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(1);
  });

  it("waits and retries the same page on rate limits", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => "2" },
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ status: { code: 200 }, data: [] }),
      });
    const d = deps(fetchImpl);

    await runZohoHistoryBackfill(
      opts({ pageSize: 10, maxPages: 1, dryRun: true, startOffset: 0 }),
      d,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(d.sleep).toHaveBeenCalledWith(2000);
  });

  it("saves checkpoint after a real page before honoring interruption", async () => {
    let stop = false;
    const supabase = makeSupabase();
    const d = deps(() => {
      stop = true;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ status: { code: 200 }, data: messages(["m1"]) }),
      });
    });

    const result = await runZohoHistoryBackfill(
      opts({ pageSize: 1, maxPages: 2, dryRun: false, confirmProductionBackfill: true, startOffset: 0 }),
      { ...d, supabase: supabase.client, shouldStop: () => stop },
    );

    expect(result.stopped).toBe(true);
    expect(supabase.calls.checkpointUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ next_start: 1 })]),
      expect.anything(),
    );
  });

  it("refuses real ingestion without the production confirmation flag", async () => {
    await expect(
      runZohoHistoryBackfill(
        opts({ pageSize: 1, maxPages: 1, dryRun: false, startOffset: 0 }),
        deps(() => Promise.reject(new Error("should not fetch"))),
      ),
    ).rejects.toThrow("--confirm-production-backfill");
  });
});
