import "server-only";

import type { CaCapacityApiRecord } from "@/lib/managerMapping/types";

const DEFAULT_CA_CAPACITY_API_URL = "https://applywizz-ca-management.vercel.app/api/dashboard/capacity";
const DEFAULT_TIMEOUT_MS = 15_000;

export type CaCapacityFetchErrorCode =
  | "CA_CAPACITY_NETWORK_ERROR"
  | "CA_CAPACITY_TIMEOUT"
  | "CA_CAPACITY_HTTP_ERROR"
  | "CA_CAPACITY_INVALID_JSON"
  | "CA_CAPACITY_INVALID_RESPONSE";

export class CaCapacityFetchError extends Error {
  readonly code: CaCapacityFetchErrorCode;
  readonly httpStatus: number | null;

  constructor(code: CaCapacityFetchErrorCode, httpStatus: number | null = null) {
    // The message IS the code — deterministic and safe to log anywhere.
    super(code);
    this.name = "CaCapacityFetchError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface FetchCaCapacityOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchCaCapacity(options: FetchCaCapacityOptions = {}): Promise<CaCapacityApiRecord[]> {
  const env = options.env ?? process.env;
  const url = env.CA_CAPACITY_API_URL?.trim() || DEFAULT_CA_CAPACITY_API_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch {
    // Never surface the underlying error — it can embed the request URL.
    throw new CaCapacityFetchError("CA_CAPACITY_NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new CaCapacityFetchError("CA_CAPACITY_HTTP_ERROR", response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CaCapacityFetchError("CA_CAPACITY_INVALID_JSON", response.status);
  }

  if (!Array.isArray(payload)) {
    throw new CaCapacityFetchError("CA_CAPACITY_INVALID_RESPONSE", response.status);
  }

  return payload as CaCapacityApiRecord[];
}
