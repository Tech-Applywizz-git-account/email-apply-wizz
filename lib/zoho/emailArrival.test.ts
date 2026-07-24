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

const getAllowedCaEmailsForManagerMock = vi.fn(async () => new Set<string>());

vi.mock("@/lib/managerMapping/getAllowedCaEmails", () => ({
  getAllowedCaEmailsForManager: (managerEmail: string) => getAllowedCaEmailsForManagerMock(managerEmail),
}));

describe("getEmailArrivalMonitorData", () => {
  const adminScope = { role: "admin_ceo" as const, email: "admin@applywizz.ai" };

  beforeEach(() => {
    getLeadByEmailMock.mockClear();
    getAllowedCaEmailsForManagerMock.mockClear();
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set());
    mockSupabase = makeSupabase([
      { original_recipient: "b@example.test", received_at: "2026-07-09T11:00:00.000Z" },
      { original_recipient: "a@example.test", received_at: "2026-07-09T10:00:00.000Z" },
      { original_recipient: "a@example.test", received_at: "2026-07-09T09:00:00.000Z" },
      { original_recipient: null, received_at: "2026-07-09T08:00:00.000Z" },
      { original_recipient: "a@example.test", received_at: "2026-07-08T18:29:59.999Z" },
    ]);
  });

  it("groups arrivals by mailbox within the IST day and sorts by latest email (admin_ceo, unfiltered)", async () => {
    const { getEmailArrivalMonitorData, getIstDayBounds } = await import("./emailArrival");
    const result = await getEmailArrivalMonitorData(adminScope, new Date("2026-07-09T06:30:00.000Z"));

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
      expect(getAllowedCaEmailsForManagerMock).not.toHaveBeenCalled();
    }
  });

  it("returns an empty result when there are no rows today", async () => {
    mockSupabase = makeSupabase([]);

    const { getEmailArrivalMonitorData } = await import("./emailArrival");
    const result = await getEmailArrivalMonitorData(adminScope, new Date("2026-07-09T06:30:00.000Z"));

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

  it("a manager_ops scope sees only mailboxes whose assignedCaEmail is in their allowed set, with totals recomputed from the filtered subset", async () => {
    // Unfiltered (admin) totals from the shared beforeEach fixture: 3 emails,
    // 2 active mailboxes, latest = b@example.test at 11:00. Allowing only the
    // CA mapped to a@example.test (assignedCaEmail = "ca-a@example.test", per
    // getLeadByEmailMock) must drop b@example.test and recompute totals from
    // a@example.test alone: 2 emails, 1 mailbox, latest = 10:00 — all three
    // aggregates differ from the unfiltered admin values.
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set(["ca-a@example.test"]));

    const { getEmailArrivalMonitorData } = await import("./emailArrival");
    const result = await getEmailArrivalMonitorData(
      { role: "manager_ops", email: "manager@applywizz.ai" },
      new Date("2026-07-09T06:30:00.000Z"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows).toEqual([
        {
          originalRecipient: "a@example.test",
          clientName: "Client a@example.test",
          assignedCaName: "CA a@example.test",
          assignedCaEmail: "ca-a@example.test",
          emailsToday: 2,
          latestEmailAt: "2026-07-09T10:00:00.000Z",
        },
      ]);
      expect(result.data.totalEmailsToday).toBe(2);
      expect(result.data.activeMailboxesToday).toBe(1);
      expect(result.data.latestEmailAt).toBe("2026-07-09T10:00:00.000Z");
    }
    expect(getAllowedCaEmailsForManagerMock).toHaveBeenCalledWith("manager@applywizz.ai");
  });

  it("excludes a mailbox with the '-' fallback sentinel (no Leads API match) for a manager_ops scope but keeps it for admin_ceo", async () => {
    mockSupabase = makeSupabase([{ original_recipient: "unmatched@example.test", received_at: "2026-07-09T10:00:00.000Z" }]);
    getLeadByEmailMock.mockImplementationOnce(async () => ({
      clientName: "Unmatched",
      assignedCaName: "Not mapped",
      assignedCaEmail: "-",
    }));

    const { getEmailArrivalMonitorData } = await import("./emailArrival");
    const adminResult = await getEmailArrivalMonitorData(adminScope, new Date("2026-07-09T06:30:00.000Z"));

    expect(adminResult.ok).toBe(true);
    if (adminResult.ok) {
      expect(adminResult.data.rows).toHaveLength(1);
      expect(adminResult.data.rows[0]?.assignedCaEmail).toBe("-");
      expect(adminResult.data.totalEmailsToday).toBe(1);
    }

    // Fresh fixture + fresh fallback response for the manager_ops call.
    mockSupabase = makeSupabase([{ original_recipient: "unmatched@example.test", received_at: "2026-07-09T10:00:00.000Z" }]);
    getLeadByEmailMock.mockImplementationOnce(async () => ({
      clientName: "Unmatched",
      assignedCaName: "Not mapped",
      assignedCaEmail: "-",
    }));
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set(["some-other-ca@example.test"]));

    const managerResult = await getEmailArrivalMonitorData(
      { role: "manager_ops", email: "manager@applywizz.ai" },
      new Date("2026-07-09T06:30:00.000Z"),
    );

    expect(managerResult).toEqual({
      ok: true,
      data: { rows: [], totalEmailsToday: 0, latestEmailAt: null, activeMailboxesToday: 0 },
    });
  });

  it("yields zero mailbox rows and zero aggregate totals (not a crash) for a manager scope with no allowed CAs", async () => {
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set());

    const { getEmailArrivalMonitorData } = await import("./emailArrival");
    const result = await getEmailArrivalMonitorData(
      { role: "manager_ops", email: "unmapped-manager@applywizz.ai" },
      new Date("2026-07-09T06:30:00.000Z"),
    );

    expect(result).toEqual({
      ok: true,
      data: { rows: [], totalEmailsToday: 0, latestEmailAt: null, activeMailboxesToday: 0 },
    });
    expect(getAllowedCaEmailsForManagerMock).toHaveBeenCalledWith("unmapped-manager@applywizz.ai");
  });

  it("treats an unexpected role value (e.g. ca) as scoped and fails closed, not unfiltered", async () => {
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set());

    const { getEmailArrivalMonitorData } = await import("./emailArrival");
    const result = await getEmailArrivalMonitorData(
      { role: "ca", email: "some-ca@applywizz.ai" },
      new Date("2026-07-09T06:30:00.000Z"),
    );

    expect(result).toEqual({
      ok: true,
      data: { rows: [], totalEmailsToday: 0, latestEmailAt: null, activeMailboxesToday: 0 },
    });
    expect(getAllowedCaEmailsForManagerMock).toHaveBeenCalledWith("some-ca@applywizz.ai");
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
                      // Mirrors real Supabase: the DB truncates to `count` rows
                      // (already ordered newest-first by the caller) before the
                      // in-app CA filter ever runs.
                      : { data: rows.slice(0, count), error: null },
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
  const adminScope = { role: "admin_ceo" as const, email: "ramakrishna@applywizz.ai" };

  beforeEach(() => {
    getAllowedCaEmailsForManagerMock.mockClear();
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set());
  });

  it("selects the clients relation and safe columns only (no message body), newest first", async () => {
    const activity = makeActivitySupabase([]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity(adminScope);

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
    const result = await getRecentEmailActivity(adminScope);

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
    const result = await getRecentEmailActivity(adminScope);

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
    await expect(getRecentEmailActivity(adminScope)).resolves.toEqual({ ok: false });
  });

  it("admin_ceo sees all rows regardless of assigned CA", async () => {
    const activity = makeActivitySupabase([
      {
        id: "e1",
        sender: "recruiter@northstar.example.test",
        subject: "Interview invite",
        original_recipient: "client-one@applywizard.ai",
        received_at: "2026-07-13T10:00:00.000Z",
        classification_status: "classified",
        category: "interview_invite",
        client_id: "c1",
        clients: { client_name: "Client One", assigned_ca_name: "CA One", assigned_ca_email: "ca-one@applywizz.com" },
      },
      {
        id: "e2",
        sender: "recruiter@southstar.example.test",
        subject: "Application received",
        original_recipient: "client-two@applywizard.ai",
        received_at: "2026-07-13T09:00:00.000Z",
        classification_status: "classified",
        category: "application_confirmation",
        client_id: "c2",
        clients: { client_name: "Client Two", assigned_ca_name: "CA Two", assigned_ca_email: "ca-two@applywizz.com" },
      },
    ]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity(adminScope);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows.length).toBeGreaterThan(1);
    expect(getAllowedCaEmailsForManagerMock).not.toHaveBeenCalled();
  });

  it("manager_ops sees only rows whose assigned_ca_email is mapped to them", async () => {
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set(["assigned-to-balaji@applywizz.com"]));
    const activity = makeActivitySupabase([
      {
        id: "e1",
        sender: "recruiter@northstar.example.test",
        subject: "Interview invite",
        original_recipient: "client-one@applywizard.ai",
        received_at: "2026-07-13T10:00:00.000Z",
        classification_status: "classified",
        category: "interview_invite",
        client_id: "c1",
        clients: { client_name: "Client One", assigned_ca_name: "Balaji", assigned_ca_email: "assigned-to-balaji@applywizz.com" },
      },
      {
        id: "e2",
        sender: "recruiter@southstar.example.test",
        subject: "Application received",
        original_recipient: "client-two@applywizard.ai",
        received_at: "2026-07-13T09:00:00.000Z",
        classification_status: "classified",
        category: "application_confirmation",
        client_id: "c2",
        clients: { client_name: "Client Two", assigned_ca_name: "Someone Else", assigned_ca_email: "someone-else@applywizz.com" },
      },
    ]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity({ role: "manager_ops", email: "balaji@applywizz.ai" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      for (const row of result.rows) {
        expect(row.assignedCaEmail).toBe("assigned-to-balaji@applywizz.com");
      }
    }
    expect(getAllowedCaEmailsForManagerMock).toHaveBeenCalledWith("balaji@applywizz.ai");
  });

  it("normalizes a mixed-case scope.email and mixed-case assigned_ca_email so casing mismatches still match", async () => {
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set(["assigned-to-balaji@applywizz.com"]));
    const activity = makeActivitySupabase([
      {
        id: "e1",
        sender: "recruiter@northstar.example.test",
        subject: "Interview invite",
        original_recipient: "client-one@applywizard.ai",
        received_at: "2026-07-13T10:00:00.000Z",
        classification_status: "classified",
        category: "interview_invite",
        client_id: "c1",
        clients: { client_name: "Client One", assigned_ca_name: "Balaji", assigned_ca_email: "Assigned-To-Balaji@ApplyWizz.COM" },
      },
      {
        id: "e2",
        sender: "recruiter@southstar.example.test",
        subject: "Application received",
        original_recipient: "client-two@applywizard.ai",
        received_at: "2026-07-13T09:00:00.000Z",
        classification_status: "classified",
        category: "application_confirmation",
        client_id: "c2",
        clients: { client_name: "Client Two", assigned_ca_name: "Someone Else", assigned_ca_email: "someone-else@applywizz.com" },
      },
    ]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity({ role: "manager_ops", email: "  BALAJI@APPLYWIZZ.AI  " });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.id).toBe("e1");
    }
    expect(getAllowedCaEmailsForManagerMock).toHaveBeenCalledWith("balaji@applywizz.ai");
  });

  it("manager_ops with no mapped CAs sees zero rows (fails closed, not everything)", async () => {
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set());
    const activity = makeActivitySupabase([
      {
        id: "e1",
        sender: "recruiter@northstar.example.test",
        subject: "Interview invite",
        original_recipient: "client-one@applywizard.ai",
        received_at: "2026-07-13T10:00:00.000Z",
        classification_status: "classified",
        category: "interview_invite",
        client_id: "c1",
        clients: { client_name: "Client One", assigned_ca_name: "CA One", assigned_ca_email: "ca-one@applywizz.com" },
      },
    ]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity({ role: "manager_ops", email: "unmapped-manager@applywizz.ai" });

    expect(result).toEqual({ ok: true, rows: [] });
  });

  it("manager_ops sees their team's recent rows even when 55+ unrelated rows are more recent (scoped fetch window, not global top-50)", async () => {
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set(["assigned-to-balaji@applywizz.com"]));

    // 58 unrelated (other-team) rows, newest-first, followed by the manager's
    // 2 team rows further back in time. A naive global limit(50) would truncate
    // the query before the manager's own rows are ever fetched.
    const unrelatedRows: MockRow[] = Array.from({ length: 58 }, (_, index) => ({
      id: `unrelated-${index}`,
      sender: "recruiter@example.test",
      subject: "Unrelated",
      original_recipient: `unrelated-${index}@applywizard.ai`,
      received_at: `2026-07-20T${String(23 - Math.floor(index / 4)).padStart(2, "0")}:${String(59 - (index % 4) * 10).padStart(2, "0")}:00.000Z`,
      classification_status: "classified",
      category: "other",
      client_id: `other-${index}`,
      clients: { client_name: `Other ${index}`, assigned_ca_name: "Someone Else", assigned_ca_email: "someone-else@applywizz.com" },
    }));

    const managerTeamRows: MockRow[] = [
      {
        id: "team-1",
        sender: "recruiter@northstar.example.test",
        subject: "Interview invite",
        original_recipient: "client-one@applywizard.ai",
        received_at: "2026-07-19T08:00:00.000Z",
        classification_status: "classified",
        category: "interview_invite",
        client_id: "c1",
        clients: { client_name: "Client One", assigned_ca_name: "Balaji", assigned_ca_email: "assigned-to-balaji@applywizz.com" },
      },
      {
        id: "team-2",
        sender: "recruiter@southstar.example.test",
        subject: "Application received",
        original_recipient: "client-two@applywizard.ai",
        received_at: "2026-07-19T07:00:00.000Z",
        classification_status: "classified",
        category: "application_confirmation",
        client_id: "c2",
        clients: { client_name: "Client Two", assigned_ca_name: "Balaji", assigned_ca_email: "assigned-to-balaji@applywizz.com" },
      },
    ];

    const activity = makeActivitySupabase([...unrelatedRows, ...managerTeamRows]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity({ role: "manager_ops", email: "balaji@applywizz.ai" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(2);
      expect(result.rows.map((row) => row.id).sort()).toEqual(["team-1", "team-2"]);
      for (const row of result.rows) {
        expect(row.assignedCaEmail).toBe("assigned-to-balaji@applywizz.com");
      }
    }
    // The scoped fetch window must be larger than the global 50-row limit for
    // the manager's team rows (positions 59-60) to ever reach the CA filter.
    expect(activity.capture.limit).toBeGreaterThan(60);
  });

  it("treats an unexpected role value (e.g. ca) as scoped and fails closed, not unfiltered", async () => {
    getAllowedCaEmailsForManagerMock.mockResolvedValue(new Set());
    const activity = makeActivitySupabase([
      {
        id: "e1",
        sender: "recruiter@northstar.example.test",
        subject: "Interview invite",
        original_recipient: "client-one@applywizard.ai",
        received_at: "2026-07-13T10:00:00.000Z",
        classification_status: "classified",
        category: "interview_invite",
        client_id: "c1",
        clients: { client_name: "Client One", assigned_ca_name: "CA One", assigned_ca_email: "ca-one@applywizz.com" },
      },
    ]);
    mockSupabase = activity as unknown as typeof mockSupabase;

    const { getRecentEmailActivity } = await import("./emailArrival");
    const result = await getRecentEmailActivity({ role: "ca", email: "some-ca@applywizz.ai" });

    expect(result).toEqual({ ok: true, rows: [] });
    expect(getAllowedCaEmailsForManagerMock).toHaveBeenCalledWith("some-ca@applywizz.ai");
  });
});
