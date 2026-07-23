import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireApiRole = vi.fn();
const syncTrackerMailbox = vi.fn();
const classifyQueue = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dashboardAuth/apiAuth", () => ({ requireApiRole }));
vi.mock("@/lib/worker-core/syncTrackerMailbox", () => ({ syncTrackerMailbox }));
vi.mock("@/lib/worker-core/classifyQueue", () => ({ classifyQueue }));

function makeRequest(): NextRequest {
  return new NextRequest("https://email-apply-wizz.test/api/zoho/workflow/test", { method: "POST" });
}

describe("POST /api/zoho/workflow/test", () => {
  it("returns 403 and never runs sync or classify when the caller is not authorized", async () => {
    requireApiRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) as never });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(syncTrackerMailbox).not.toHaveBeenCalled();
    expect(classifyQueue).not.toHaveBeenCalled();
  });

  it("runs sync and classify only when the caller is admin_ceo", async () => {
    requireApiRole.mockResolvedValue({ ok: true, session: { user: { role: "admin_ceo" } } as never });
    syncTrackerMailbox.mockResolvedValue({ synced: 1 });
    classifyQueue.mockResolvedValue({ classified: 1 });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(syncTrackerMailbox).toHaveBeenCalledTimes(1);
    expect(classifyQueue).toHaveBeenCalledTimes(1);
  });
});
