import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dashboardAuth/requireDashboardSession", () => ({
  requireDashboardSession: vi.fn().mockResolvedValue({
    id: "session-1",
    userId: "user-1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null,
    user: {
      id: "user-1",
      email: "admin@applywizz.ai",
      role: "admin_ceo",
      status: "active",
      totpEnabled: true,
    },
  }),
}));
vi.mock("@/lib/zoho/emailArrival", () => ({
  formatIstTime: (value: string | null) => value ?? "Not available yet",
  getEmailArrivalMonitorData: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      rows: [
        {
          originalRecipient: "a@example.test",
          clientName: "Client A",
          assignedCaName: "CA A",
          assignedCaEmail: "ca-a@example.test",
          emailsToday: 2,
          latestEmailAt: "2026-07-09T10:00:00.000Z",
        },
      ],
      totalEmailsToday: 2,
      latestEmailAt: "2026-07-09T10:00:00.000Z",
      activeMailboxesToday: 1,
    },
  }),
  getRecentEmailActivity: vi.fn().mockResolvedValue({
    ok: true,
    rows: [
      {
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
      },
      {
        id: "e2",
        sender: null,
        subject: null,
        originalRecipient: "unmapped@applywizard.ai",
        receivedAt: "2026-07-13T09:00:00.000Z",
        classificationStatus: "review",
        category: null,
        clientId: null,
        clientName: null,
        assignedCaName: null,
        assignedCaEmail: null,
      },
    ],
  }),
}));

describe("EmailArrivalMonitorPage", () => {
  it("renders a refresh meta tag in the page markup", async () => {
    const { default: EmailArrivalMonitorPage } = await import("./page");
    const markup = renderToStaticMarkup(await EmailArrivalMonitorPage());

    expect(markup).toContain('http-equiv="refresh"');
    expect(markup).toContain('content="20"');
  });

  it("renders client and assigned CA columns", async () => {
    const { default: EmailArrivalMonitorPage } = await import("./page");
    const markup = renderToStaticMarkup(await EmailArrivalMonitorPage());

    expect(markup).toContain("Client Name");
    expect(markup).toContain("Assigned CA");
    expect(markup).toContain("CA Email");
    expect(markup).toContain("Client A");
    expect(markup).toContain("CA A");
    expect(markup).toContain("ca-a@example.test");
  });

  it("renders the Recent Email Activity per-email section with all required columns", async () => {
    const { default: EmailArrivalMonitorPage } = await import("./page");
    const markup = renderToStaticMarkup(await EmailArrivalMonitorPage());

    expect(markup).toContain("Recent Email Activity");
    for (const heading of ["Received", "Sender", "Subject", "Client", "Client mailbox", "Assigned CA", "Category", "Status"]) {
      expect(markup).toContain(heading);
    }
  });

  it("shows client, CA name/email, category and status for a mapped email", async () => {
    const { default: EmailArrivalMonitorPage } = await import("./page");
    const markup = renderToStaticMarkup(await EmailArrivalMonitorPage());

    expect(markup).toContain("Preview Test Client"); // client name
    expect(markup).toContain("preview-test-client@applywizard.ai"); // client mailbox = original recipient
    expect(markup).toContain("Preview Test CA"); // CA name
    expect(markup).toContain("preview.ca@example.test"); // CA email
    expect(markup).toContain("interview_invite"); // category
    expect(markup).toContain("classified"); // status
  });

  it("keeps an unmapped email visible with em-dash client/CA and its original recipient", async () => {
    const { default: EmailArrivalMonitorPage } = await import("./page");
    const markup = renderToStaticMarkup(await EmailArrivalMonitorPage());

    expect(markup).toContain("unmapped@applywizard.ai"); // still shows client mailbox
    expect(markup).toContain("—"); // em-dash for missing client/CA/sender/subject
    expect(markup).toContain("review"); // status still shown
  });

  it("does not query or render any message body/content", async () => {
    const { default: EmailArrivalMonitorPage } = await import("./page");
    const markup = renderToStaticMarkup(await EmailArrivalMonitorPage());

    expect(markup).not.toMatch(/bodyText|message_body|email_body/i);
  });
});
