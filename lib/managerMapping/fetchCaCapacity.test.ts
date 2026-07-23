import { describe, expect, it, vi } from "vitest";

// "server-only" is not an installed package; existing tests for server-only
// modules in this repo (e.g. lib/dashboardAuth/otpStore.test.ts) stub it the
// same way so the import resolves under vitest.
vi.mock("server-only", () => ({}));

import { CaCapacityFetchError, fetchCaCapacity } from "./fetchCaCapacity";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchCaCapacity", () => {
  it("returns the parsed array on a 200 JSON array response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([{ ca_id: "a1", name: "Test CA", email: "test@applywizz.com", team_name: "Balaji Team" }]),
    );

    await expect(fetchCaCapacity({ fetchImpl })).resolves.toEqual([
      { ca_id: "a1", name: "Test CA", email: "test@applywizz.com", team_name: "Balaji Team" },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("applywizz-ca-management.vercel.app/api/dashboard/capacity");
    expect(init.method).toBe("GET");
  });

  it("throws CA_CAPACITY_HTTP_ERROR on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "server error" }, 500));
    await expect(fetchCaCapacity({ fetchImpl })).rejects.toMatchObject({ code: "CA_CAPACITY_HTTP_ERROR", httpStatus: 500 });
  });

  it("throws CA_CAPACITY_INVALID_RESPONSE when the body is not an array", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ not: "an array" }));
    await expect(fetchCaCapacity({ fetchImpl })).rejects.toMatchObject({ code: "CA_CAPACITY_INVALID_RESPONSE" });
  });

  it("throws CA_CAPACITY_INVALID_JSON when the body cannot be parsed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    await expect(fetchCaCapacity({ fetchImpl })).rejects.toMatchObject({ code: "CA_CAPACITY_INVALID_JSON" });
  });

  it("throws CA_CAPACITY_NETWORK_ERROR when the request throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(fetchCaCapacity({ fetchImpl })).rejects.toMatchObject({ code: "CA_CAPACITY_NETWORK_ERROR" });
  });

  it("uses the CA_CAPACITY_API_URL env override when set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    await fetchCaCapacity({ fetchImpl, env: { CA_CAPACITY_API_URL: "https://example.test/capacity" } as NodeJS.ProcessEnv });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe("https://example.test/capacity");
  });

  it("never logs response bodies or URLs in a thrown error's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "sensitive detail" }, 500));
    try {
      await fetchCaCapacity({ fetchImpl });
      throw new Error("expected fetchCaCapacity to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CaCapacityFetchError);
      expect((err as Error).message).toBe("CA_CAPACITY_HTTP_ERROR");
    }
  });
});
