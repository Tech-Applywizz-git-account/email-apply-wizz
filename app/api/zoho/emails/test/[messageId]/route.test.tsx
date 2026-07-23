import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireApiRole = vi.fn();
const createSupabaseServerClient = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dashboardAuth/apiAuth", () => ({ requireApiRole }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

function makeRequest(): NextRequest {
  return new NextRequest(
    "https://email-apply-wizz.test/api/zoho/emails/test/msg-1?folderId=folder-1",
    { method: "GET" },
  );
}

function makeParams() {
  return { params: Promise.resolve({ messageId: "msg-1" }) };
}

describe("GET /api/zoho/emails/test/[messageId]", () => {
  it("returns 403 and never queries Supabase or Zoho when the caller is not authorized", async () => {
    requireApiRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) as never });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("proceeds to query Supabase when the caller is admin_ceo", async () => {
    requireApiRole.mockResolvedValue({ ok: true, session: { user: { role: "admin_ceo" } } as never });
    const previousEnv = { ...process.env };
    process.env.ZOHO_CLIENT_ID = "client-id";
    process.env.ZOHO_CLIENT_SECRET = "client-secret";
    process.env.ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.test";
    process.env.ZOHO_MAIL_BASE_URL = "https://mail.zoho.test";
    process.env.ZOHO_SYNC_MAILBOX = "tracker@applywizz.ai";

    createSupabaseServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams());
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);

    process.env = previousEnv;
  });
});
