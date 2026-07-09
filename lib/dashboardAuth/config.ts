import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export function getDashboardAuthSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV !== "test") {
    throw new Error("Dashboard auth secret is not configured.");
  }
  return secret || "dashboard-auth-test-secret";
}

export function hmacHex(value: string): string {
  return createHmac("sha256", getDashboardAuthSecret()).update(value).digest("hex");
}

export function verifyHmacHex(value: string, storedHash: string): boolean {
  const expected = Buffer.from(hmacHex(value), "hex");
  const actual = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
