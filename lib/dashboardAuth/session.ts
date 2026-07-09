import "server-only";

import { hmacHex, verifyHmacHex } from "@/lib/dashboardAuth/config";

export function hashSessionToken(rawToken: string): string {
  return hmacHex(rawToken);
}

export function verifySessionToken(rawToken: string, storedHash: string): boolean {
  return verifyHmacHex(rawToken, storedHash);
}
