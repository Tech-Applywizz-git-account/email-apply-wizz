import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/zoho/emailArrival", () => ({
  formatIstTime: (value: string | null) => value ?? "Not available yet",
  getEmailArrivalMonitorData: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      rows: [
        {
          originalRecipient: "a@example.test",
          emailsToday: 2,
          latestEmailAt: "2026-07-09T10:00:00.000Z",
        },
      ],
      totalEmailsToday: 2,
      latestEmailAt: "2026-07-09T10:00:00.000Z",
      activeMailboxesToday: 1,
    },
  }),
}));

describe("EmailArrivalMonitorPage", () => {
  it("renders a refresh meta tag in the page markup", async () => {
    const { default: EmailArrivalMonitorPage } = await import("./page");
    const markup = renderToStaticMarkup(await EmailArrivalMonitorPage());

    expect(markup).toContain('http-equiv="refresh"');
    expect(markup).toContain('content="20"');
  });
});
