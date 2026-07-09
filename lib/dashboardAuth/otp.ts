import "server-only";

import { hmacHex, verifyHmacHex } from "@/lib/dashboardAuth/config";

export function hashOtp(rawOtp: string): string {
  return hmacHex(rawOtp);
}

export function verifyOtp(rawOtp: string, storedHash: string): boolean {
  return verifyHmacHex(rawOtp, storedHash);
}
