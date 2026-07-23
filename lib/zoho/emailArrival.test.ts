import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type MockRow = Record<string, unknown>;

function makeSupabase(rows: MockRow[]) {
  const calls: Array<{ table: string; columns: string; filters: Array<{ type: string; column: string; value: unknown }> }> = [];

  const makeQuery = (columns: string) => {
    const state = {
      filters: [] as Array<{ type: string; column: string; value: unknown }>,
    };

    const query: Record<string, unknown> = {
      gte(column: string, value: unknown) {
        state.filters.push({ type: "gte", column, value });
        return query;
      },
      lte(column: string, value: unknown) {
        state.filters.push({ type: "lte", column, value });
        return query;
      },
      then(resolve: (value: { data: MockRow[] | null; error: null }) => void) {
        calls.push({ table: "zoho_email_metadata", columns, filters: [...state.filters] });
        const filtered = rows.filter((row) =>
          state.filters.every((filter) => {
            if (filter.type === "gte") return String(row[filter.column] ?? "") >= String(filter.value ?? "");
            if (filter.type === "lte") return String(row[filter.column] ?? "") <= String(filter.value ?? "");
            return true;
          }),
        );
        resolve({ data: filtered, error: null });
      },
    };

    return query;
  };

  return {
    calls,
    client: {
      from(table: string) {
        return {
          select(columns: string) {
            calls.push({ table, columns, filters: [] });
            return makeQuery(columns);
          },
        };
      },
    },
  };
}

let mockSupabase: ReturnType<typeof makeSupabase>;

vi.mock("@/lib/supabase/serviceRole", () => ({
  createSupabaseServiceRoleClient: () => mockSupabase.client,
}));

const getLeadByEmailMock = vi.fn(async (email: string) => ({
  clientName: `Client ${email}`,
  assignedCaName: `CA ${email}`,
  assignedCaEmail: `ca-${email}`,
}));

vi.mock("@/lib/leadsApi/getLeadByEmail", () => ({
  getLeadByEmail: getLeadByEmailMock,
}));

describe("getEmailArrivalMonitorData", () => {
  beforeEach(() => {
    getLeadByEmailMock.mockClear();
    mockSupabase = makeSupabase([
      { original_recipient: "b@example.test", received_at: "2026-07-09T11:00:00.000Z" },
      { original_recipient: "a@example.test", received_at: "2026-07-09T10:00:00.000Z" },
      { original_recipient: "a@example.test", received_at: "2026-07-09T09:00:00.000Z" },
      { original_recipient: null, received_at: "2026-07-09T08:00:00.000Z" },
      { original_recipient: "a@example.test", received_at: "2026-07-08T18:29:59.999Z" },
    ]);
  });

  it("groups arrivals by mailbox within the IST day and sorts by latest email", async () => {
    const { getEmailArrivalMonitorData, getIstDayBounds } = await import("./emailArrival");
    const result = await getEmailArrivalMonitorData(new Date("2026-07-09T06:30:00.000Z"));

    expect(getIstDayBounds(new Date("2026-07-09T06:30:00.000Z"))).toEqual({
      startUtc: "2026-07-08T18:30:00.000Z",
      endUtc: "2026-07-09T18:29:59.999Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(mockSupabase.calls[0]?.table).toBe("zoho_email_metadata");
      expect(mockSupabase.calls[0]?.columns).toBe("original_recipient, received_at");
      expect(result.data.totalEmailsToday).toBe(3);
      expect(result.data.activeMailboxesToday).toBe(2);
      expect(result.data.latestEmailAt).toBe("2026-07-09T11:00:00.000Z");
      expect(result.data.rows).toEqual([
        {
          originalRecipient: "b@example.test",
          clientName: "Client b@example.test",
          assignedCaName: "CA b@example.test",
          assignedCaEmail: "ca-b@example.test",
          emailsToday: 1,
          latestEmailAt: "2026-07-09T11:00:00.000Z",
        },
        {
          originalRecipient: "a@example.test",
          clientName: "Client a@example.test",
          assignedCaName: "CA a@example.test",
          assignedCaEmail: "ca-a@example.test",
          emailsToday: 2,
          latestEmailAt: "2026-07-09T10:00:00.000Z",
        },
      ]);
      expect(getLeadByEmailMock).toHaveBeenCalledTimes(2);
      expect(getLeadByEmailMock).toHaveBeenCalledWith("b@example.test");
      expect(getLeadByEmailMock).toHaveBeenCalledWith("a@example.test");
    }
  });

  it("returns an empty result when there are no rows today", async () => {
    mockSupabase = makeSupabase([]);

    const { getEmailArrivalMonitorData } = await import("./emailArrival");
    const result = await getEmailArrivalMonitorData(new Date("2026-07-09T06:30:00.000Z"));

    expect(result).toEqual({
      ok: true,
      data: {
        rows: [],
        totalEmailsToday: 0,
        latestEmailAt: null,
        activeMailboxesToday: 0,
      },
    });
    expect(getLeadByEmailMock).not.toHaveBeenCalled();
  });
});

// ── Recent Email Activity (per-email view, Supabase clients relation) ────────────
function makeActivitySupabase(rows: MockRow[] | "error") {
  const capture: { columns: string; order: { column: string; ascending: boolean } | null; limit: number | null } = {
    columns: "",
    order: null,
    limit: null,
  };
  const client = {
    from() {
      return {
        select(columns: string) {
          capture.columns = columns;
          return {
            order(column: string, options: { ascending: boolean }) {
              capture.order = { column, ascending: options.ascending };
              return {
                limit(count: number) {
                  capture.limit = count;
                  return Promise.resolve(
                    rows === "error"
                      ? { data: null, error: { message: "boom" } }
                      : { data: rows, error: null },
                  );
                },
              };
            },
          };
        },
      };
    },
  };
  return { capture, client };
}

describe("getRecentEmailActivity", () => {
  it("selects the clients relation and safe columns only (no message body), newest first", async () => {
    const activity = makeActivitySupabase([]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity();

    expect(result).toEqual({ ok: true, rows: [] });
    expect(activity.capture.columns).toContain("clients(client_name, assigned_ca_name, assigned_ca_email)");
    expect(activity.capture.columns).not.toMatch(/body|content/i);
    expect(activity.capture.order).toEqual({ column: "received_at", ascending: false });
    expect(activity.capture.limit).toBeGreaterThan(0);
  });

  it("transforms a mapped email into client name and CA fields", async () => {
    const activity = makeActivitySupabase([
      {
        id: "e1",
        sender: "recruiter@northstar.example.test",
        subject: "Synthetic interview invitation",
        original_recipient: "preview-test-client@applywizard.ai",
        received_at: "2026-07-13T10:00:00.000Z",
        classification_status: "classified",
        category: "interview_invite",
        client_id: "c1",
        clients: { client_name: "Preview Test Client", assigned_ca_name: "Preview Test CA", assigned_ca_email: "preview.ca@example.test" },
      },
    ]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows[0]).toEqual({
        id: "e1",
        sender: "recruiter@northstar.example.test",
        subject: "Synthetic interview invitation",
        originalRecipient: "preview-test-client@applywizard.ai",
        receivedAt: "2026-07-13T10:00:00.000Z",
        classificationStatus: "classified",
        category: "interview_invite",
        clientId: "c1",
        clientName: "Preview Test Client",
        assignedCaName: "Preview Test CA",
        assignedCaEmail: "preview.ca@example.test",
      });
    }
  });

  it("keeps an unmapped email visible with null client/CA and handles null sender/subject", async () => {
    const activity = makeActivitySupabase([
      {
        id: "e2",
        sender: null,
        subject: null,
        original_recipient: "unmapped@applywizard.ai",
        received_at: "2026-07-13T09:00:00.000Z",
        classification_status: "review",
        category: null,
        client_id: null,
        clients: null,
      },
    ]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: "e2",
        sender: null,
        subject: null,
        originalRecipient: "unmapped@applywizard.ai",
        clientId: null,
        clientName: null,
        assignedCaName: null,
        assignedCaEmail: null,
      });
    }
  });

  it("returns the safe { ok: false } result when the query errors", async () => {
    const activity = makeActivitySupabase("error");
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    await expect(getRecentEmailActivity()).resolves.toEqual({ ok: false });
  });
});
