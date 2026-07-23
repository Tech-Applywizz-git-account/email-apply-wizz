import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireApiRole = vi.fn();
const syncTrackerMailbox = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dashboardAuth/apiAuth", () => ({ requireApiRole }));
vi.mock("@/lib/worker-core/syncTrackerMailbox", () => ({ syncTrackerMailbox }));

function makeRequest(): NextRequest {
  return new NextRequest("https://email-apply-wizz.test/api/zoho/emails/sync/test", { method: "POST" });
}

describe("POST /api/zoho/emails/sync/test", () => {
  it("returns 403 and never syncs when the caller is not authorized", async () => {
    requireApiRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) as never });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(syncTrackerMailbox).not.toHaveBeenCalled();
  });

  it("syncs only when the caller is admin_ceo", async () => {
    requireApiRole.mockResolvedValue({ ok: true, session: { user: { role: "admin_ceo" } } as never });
    syncTrackerMailbox.mockResolvedValue({ synced: 3 });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(syncTrackerMailbox).toHaveBeenCalledTimes(1);
  });
});
