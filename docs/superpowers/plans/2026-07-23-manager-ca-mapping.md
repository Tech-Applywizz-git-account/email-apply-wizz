# Manager-to-CA Mapping (Foundation + My Team + Live Monitor Scoping) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CA-to-manager mapping pipeline (sync from the public CA capacity API, normalize, store), add a manager-facing "My Team" page, and server-side scope Live Monitor's "Recent Email Activity" panel so each manager sees only their own CAs' emails. Explicitly **not** in this slice: `/clients`, `/overview`, `/operations`, `/review-queue` — those pages have no CA-email association in their current queries and are deferred to a separate Phase 2.

**Architecture:** Mirror the existing `lib/leadsSync/*` pattern (typed fetch errors, pure normalize functions, lock-guarded idempotent upsert sync) for a new `lib/managerMapping/*` module. The CA capacity API (`https://applywizz-ca-management.vercel.app/api/dashboard/capacity`) is public and unauthenticated, returns a flat JSON array — simpler than the Leads API, no pagination, no credentials. Store the mapping in a new `manager_ca_assignments` table, upserted keyed on `ca_id`. Add `getAllowedCaEmailsForManager(managerEmail)` as the single server-side scoping helper, consumed by both the new My Team page and the modified `getRecentEmailActivity()`.

**Tech Stack:** Next.js App Router, Supabase service-role client, Vitest.

## Global Constraints

- Managers: `ramakrishnaa.tejavath@applywizz.ai` (team "Ramakrishnaa Tejavath Team"), `balaji@applywizz.ai` (team "Balaji Team", API sometimes returns "Balaji  Team" with a double space).
- Team-name matching is normalized: trim, collapse repeated whitespace to one space, lowercase — before comparison. Unknown/unmapped team names return an explicit unmapped result; never guess a manager.
- CA email normalization: trim + lowercase only. Never rewrite `@applywizz.com` to `@applywizz.ai` or vice versa — store the real Router API email as returned. Authentication-domain support is a separate decision, out of scope here.
- `manager_id` is not needed; `manager_email` is the stable identifier throughout.
- Sync is idempotent: upsert keyed on `ca_id`, never duplicates rows across runs.
- `admin_ceo` sees all managers/CAs/clients, unfiltered.
- `manager_ops` sees only their mapped CAs (via `manager_ca_assignments.manager_email`), both on the new My Team page and in Live Monitor's Recent Email Activity panel.
- `ca` role access is not broadened by this work — no change to CA's existing `/access-pending` restriction.
- Filtering must be server-side. Never rely on hidden navigation, client-side filtering, React state, or local storage. A manager must not be able to change a URL or request body to see another manager's team.
- Unknown/unmapped manager email (a `manager_ops` session with no rows in `manager_ca_assignments`) must fail closed to an empty result — never fall through to showing all data.
- Do **not** modify `/clients`, `/overview`, `/operations`, `/review-queue`, or their underlying `cooWorkspace.ts` query functions in this slice — those pages read from `zoho_email_metadata` with no reliable CA-email join today; retrofitting them is a separate, larger Phase 2 task.
- Do not deploy, do not push until all tasks pass. Work on a new branch (`feature/manager-ca-mapping`), not `main`, in the repo at `~/Desktop/email-apply-wizz-production-repo` (the Production-connected repository).

---

## Current Behavior, Corrected

- No manager/CA mapping table or code exists anywhere in this repo today (confirmed via repo-wide search).
- `lib/zoho/emailArrival.ts`'s `getRecentEmailActivity()` takes no parameters and returns all `zoho_email_metadata` rows (joined to `clients` for `assigned_ca_email`/`assigned_ca_name`) unfiltered by role — this is the one function in this slice that needs a scoping parameter.
- `canAccessBroadDashboards(role)` (in `lib/dashboardAuth/roles.ts`) already returns `true` for both `admin_ceo` and `manager_ops`, `false` for `ca` — already suitable as-is, no change needed.
- `app/(operations)/live-monitor/email-arrival/page.tsx` already calls `requireOperationsAccess()` and has the session (with `user.email`/`user.role`) available; it currently discards that session after the guard call.
- The `clients` table (from the existing Leads Sync feature) already has `assigned_ca_email` — the join point this slice's CA-email filtering relies on for Live Monitor. No schema change needed there.
- `scripts/leads-sync/sync-clients.ts` + `"sync:clients"` npm script is the existing convention for a manually/cron-triggered sync CLI; this plan adds an equivalent `"sync:manager-mapping"` script, not an HTTP route (no API trigger was requested for this slice).

## File Structure

- Create: `lib/managerMapping/resolveManagerFromTeamName.ts` + test — pure team-name → manager resolver.
- Create: `lib/managerMapping/fetchCaCapacity.ts` + test — fetch the public CA capacity API.
- Create: `lib/managerMapping/types.ts` — shared types (raw API record, normalized assignment, results).
- Create: `lib/managerMapping/normalizeCaRecord.ts` + test — combine raw record + resolver into a `NormalizedCaAssignment`.
- Create: `supabase/migrations/202607231200_create_manager_ca_assignments.sql` — new table.
- Create: `lib/managerMapping/syncCaAssignments.ts` + test — lock-guarded idempotent upsert sync (mirrors `syncClients.ts`).
- Create: `scripts/manager-mapping/sync-ca-assignments.ts` — CLI entry point (mirrors `scripts/leads-sync/sync-clients.ts`).
- Modify: `package.json` — add `"sync:manager-mapping"` script.
- Create: `lib/managerMapping/getAllowedCaEmails.ts` + test — `getAllowedCaEmailsForManager(managerEmail)`.
- Modify: `lib/zoho/emailArrival.ts` — `getRecentEmailActivity()` accepts a scope parameter, filters by allowed CA emails for `manager_ops`.
- Modify: `app/(operations)/live-monitor/email-arrival/page.tsx` — pass the session's role/email into `getRecentEmailActivity()`.
- Modify: `lib/zoho/emailArrival.test.ts` — scoping tests.
- Create: `app/(operations)/my-team/page.tsx` + test — manager-facing CA capacity list.
- Modify: `components/operations/operations-shell-client.tsx` — add a "My Team" nav link for `admin_ceo`/`manager_ops`.
- Modify: `lib/dashboardAuth/routeGuardCoverage.test.ts` — add `/my-team` to the guarded/broad-operations inventories.

---

### Task 1: Team-to-Manager Resolver

**Files:**
- Create: `lib/managerMapping/resolveManagerFromTeamName.ts`
- Create: `lib/managerMapping/resolveManagerFromTeamName.test.ts`

**Interfaces:**
- Produces:

```typescript
export interface ResolvedManager {
  managerName: string;
  managerEmail: string;
}

export type ResolveManagerResult = { ok: true; manager: ResolvedManager } | { ok: false };

export function resolveManagerFromTeamName(teamName: string): ResolveManagerResult;
```

- [ ] **Step 1: Write the failing tests**

Create `lib/managerMapping/resolveManagerFromTeamName.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("resolveManagerFromTeamName", () => {
  it("maps 'Ramakrishnaa Tejavath Team' to Ramakrishnaa", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Ramakrishnaa Tejavath Team")).toEqual({
      ok: true,
      manager: { managerName: "Ramakrishnaa Tejavath", managerEmail: "ramakrishnaa.tejavath@applywizz.ai" },
    });
  });

  it("maps 'Balaji Team' to Balaji", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Balaji Team")).toEqual({
      ok: true,
      manager: { managerName: "Balaji", managerEmail: "balaji@applywizz.ai" },
    });
  });

  it("maps 'Balaji  Team' (double space, as the Router API sometimes returns) to Balaji", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Balaji  Team")).toEqual({
      ok: true,
      manager: { managerName: "Balaji", managerEmail: "balaji@applywizz.ai" },
    });
  });

  it("is case-insensitive and trims surrounding whitespace", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("  BALAJI TEAM  ")).toEqual({
      ok: true,
      manager: { managerName: "Balaji", managerEmail: "balaji@applywizz.ai" },
    });
    expect(resolveManagerFromTeamName("ramakrishnaa tejavath team")).toEqual({
      ok: true,
      manager: { managerName: "Ramakrishnaa Tejavath", managerEmail: "ramakrishnaa.tejavath@applywizz.ai" },
    });
  });

  it("returns ok:false for an unknown team name without guessing a manager", async () => {
    const { resolveManagerFromTeamName } = await import("./resolveManagerFromTeamName");
    expect(resolveManagerFromTeamName("Some Other Team")).toEqual({ ok: false });
    expect(resolveManagerFromTeamName("")).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run lib/managerMapping/resolveManagerFromTeamName.test.ts`
Expected: FAIL with `Cannot find module './resolveManagerFromTeamName'`.

- [ ] **Step 3: Implement the resolver**

Create `lib/managerMapping/resolveManagerFromTeamName.ts`:

```typescript
export interface ResolvedManager {
  managerName: string;
  managerEmail: string;
}

export type ResolveManagerResult = { ok: true; manager: ResolvedManager } | { ok: false };

const TEAM_MANAGER_MAP: Readonly<Record<string, ResolvedManager>> = {
  "ramakrishnaa tejavath team": {
    managerName: "Ramakrishnaa Tejavath",
    managerEmail: "ramakrishnaa.tejavath@applywizz.ai",
  },
  "balaji team": {
    managerName: "Balaji",
    managerEmail: "balaji@applywizz.ai",
  },
};

function normalizeTeamName(teamName: string): string {
  return teamName.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveManagerFromTeamName(teamName: string): ResolveManagerResult {
  const manager = TEAM_MANAGER_MAP[normalizeTeamName(teamName)];
  return manager ? { ok: true, manager } : { ok: false };
}
```

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run lib/managerMapping/resolveManagerFromTeamName.test.ts`
Expected: PASS.

- [ ] **Step 5: Run regression checks**

```bash
npx vitest run
npm run lint
npm run build
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/managerMapping/resolveManagerFromTeamName.ts lib/managerMapping/resolveManagerFromTeamName.test.ts
git commit -m "feat: add team-name to manager resolver"
```

---

### Task 2: CA Capacity API Fetcher

**Files:**
- Create: `lib/managerMapping/types.ts`
- Create: `lib/managerMapping/fetchCaCapacity.ts`
- Create: `lib/managerMapping/fetchCaCapacity.test.ts`

**Interfaces:**
- Produces:

```typescript
export interface CaCapacityApiRecord {
  ca_id?: unknown;
  name?: unknown;
  email?: unknown;
  designation?: unknown;
  system_name?: unknown;
  team_name?: unknown;
}

export type CaCapacityFetchErrorCode =
  | "CA_CAPACITY_NETWORK_ERROR"
  | "CA_CAPACITY_TIMEOUT"
  | "CA_CAPACITY_HTTP_ERROR"
  | "CA_CAPACITY_INVALID_JSON"
  | "CA_CAPACITY_INVALID_RESPONSE";

export class CaCapacityFetchError extends Error {
  readonly code: CaCapacityFetchErrorCode;
  readonly httpStatus: number | null;
}

export async function fetchCaCapacity(options?: FetchCaCapacityOptions): Promise<CaCapacityApiRecord[]>;
```

The API (`https://applywizz-ca-management.vercel.app/api/dashboard/capacity`) is public — confirmed via a live `curl` during planning: no auth headers required, returns a flat JSON array (not a paginated envelope). Base URL is configurable via `CA_CAPACITY_API_URL` env var (optional — defaults to the real URL in code, since no credential is required this does not need to be a hard-required secret like `LEADS_API_BASE_URL`).

- [ ] **Step 1: Write the failing tests**

Create `lib/managerMapping/types.ts`:

```typescript
// Manager-to-CA mapping types (foundation + Live Monitor scoping).
// Pure types only — no fetch, no Supabase, no credentials.

/** Raw CA record as received from the CA capacity API. Every field is untrusted. */
export interface CaCapacityApiRecord {
  ca_id?: unknown;
  name?: unknown;
  email?: unknown;
  designation?: unknown;
  min_capacity?: unknown;
  max_capacity?: unknown;
  system_name?: unknown;
  team_name?: unknown;
  weighted_active_load?: unknown;
  pending_assignments?: unknown;
  effective_load?: unknown;
  available_capacity?: unknown;
  deficit_to_min?: unknown;
  utilization_percentage?: unknown;
  productivity_average?: unknown;
}

/** Exactly the columns a manager_ca_assignments upsert is allowed to write. */
export interface NormalizedCaAssignment {
  ca_id: string;
  ca_name: string;
  ca_email: string;
  team_name: string;
  manager_name: string;
  manager_email: string;
  system_name: string | null;
  designation: string | null;
  is_active: true;
}

export type NormalizeCaFailureReason = "missing_ca_id" | "missing_email" | "missing_name" | "unmapped_team";

export type NormalizeCaResult =
  | { ok: true; record: NormalizedCaAssignment }
  | { ok: false; reason: NormalizeCaFailureReason };
```

Create `lib/managerMapping/fetchCaCapacity.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
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
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run lib/managerMapping/fetchCaCapacity.test.ts`
Expected: FAIL with `Cannot find module './fetchCaCapacity'`.

- [ ] **Step 3: Implement the fetcher**

Create `lib/managerMapping/fetchCaCapacity.ts`:

```typescript
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
```

Note: the `CA_CAPACITY_TIMEOUT` code is reserved for future distinguishing of abort-due-to-timeout vs. other network errors (the current minimal implementation classifies both as `CA_CAPACITY_NETWORK_ERROR`, matching the ladder's "smallest thing that works" — do not add timeout-specific detection unless a test requires it).

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run lib/managerMapping/fetchCaCapacity.test.ts`
Expected: PASS.

- [ ] **Step 5: Run regression checks**

```bash
npx vitest run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add lib/managerMapping/types.ts lib/managerMapping/fetchCaCapacity.ts lib/managerMapping/fetchCaCapacity.test.ts
git commit -m "feat: add CA capacity API fetcher"
```

---

### Task 3: Normalize CA Records

**Files:**
- Create: `lib/managerMapping/normalizeCaRecord.ts`
- Create: `lib/managerMapping/normalizeCaRecord.test.ts`

**Interfaces:**
- Consumes: `resolveManagerFromTeamName(teamName)` (Task 1), `CaCapacityApiRecord`, `NormalizedCaAssignment`, `NormalizeCaResult` (Task 2's `types.ts`).
- Produces:

```typescript
export function normalizeCaRecord(raw: CaCapacityApiRecord): NormalizeCaResult;
```

- [ ] **Step 1: Write the failing tests**

Create `lib/managerMapping/normalizeCaRecord.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("normalizeCaRecord", () => {
  it("builds a normalized record for a mapped team, lowercasing the CA email", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    const result = normalizeCaRecord({
      ca_id: "0441e046-058c-4162-b50f-b6203e89b6de",
      name: "Sai Prasanna",
      email: "SaiPrasanna@ApplyWizz.com",
      designation: "Junior CA",
      system_name: "R03",
      team_name: "Ramakrishnaa Tejavath Team",
    });

    expect(result).toEqual({
      ok: true,
      record: {
        ca_id: "0441e046-058c-4162-b50f-b6203e89b6de",
        ca_name: "Sai Prasanna",
        ca_email: "saiprasanna@applywizz.com",
        team_name: "Ramakrishnaa Tejavath Team",
        manager_name: "Ramakrishnaa Tejavath",
        manager_email: "ramakrishnaa.tejavath@applywizz.ai",
        system_name: "R03",
        designation: "Junior CA",
        is_active: true,
      },
    });
  });

  it("does not rewrite the CA email domain (keeps .com as-is)", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    const result = normalizeCaRecord({
      ca_id: "id-1",
      name: "Test",
      email: "test@applywizz.com",
      team_name: "Balaji Team",
    });
    expect(result).toMatchObject({ ok: true, record: { ca_email: "test@applywizz.com" } });
  });

  it("handles a null system_name", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    const result = normalizeCaRecord({
      ca_id: "id-2",
      name: "Test",
      email: "test@applywizz.ai",
      team_name: "Balaji  Team",
      system_name: null,
    });
    expect(result).toMatchObject({ ok: true, record: { system_name: null } });
  });

  it("returns ok:false with reason unmapped_team for an unknown team", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    expect(
      normalizeCaRecord({ ca_id: "id-3", name: "Test", email: "test@applywizz.ai", team_name: "Some Other Team" }),
    ).toEqual({ ok: false, reason: "unmapped_team" });
  });

  it("returns ok:false with reason missing_ca_id, missing_email, or missing_name", async () => {
    const { normalizeCaRecord } = await import("./normalizeCaRecord");
    expect(normalizeCaRecord({ name: "Test", email: "t@applywizz.ai", team_name: "Balaji Team" })).toEqual({
      ok: false,
      reason: "missing_ca_id",
    });
    expect(normalizeCaRecord({ ca_id: "id-4", email: "t@applywizz.ai", team_name: "Balaji Team" })).toEqual({
      ok: false,
      reason: "missing_name",
    });
    expect(normalizeCaRecord({ ca_id: "id-5", name: "Test", team_name: "Balaji Team" })).toEqual({
      ok: false,
      reason: "missing_email",
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run lib/managerMapping/normalizeCaRecord.test.ts`
Expected: FAIL with `Cannot find module './normalizeCaRecord'`.

- [ ] **Step 3: Implement**

Create `lib/managerMapping/normalizeCaRecord.ts`:

```typescript
import { resolveManagerFromTeamName } from "@/lib/managerMapping/resolveManagerFromTeamName";
import type { CaCapacityApiRecord, NormalizeCaResult } from "@/lib/managerMapping/types";

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeCaRecord(raw: CaCapacityApiRecord): NormalizeCaResult {
  const caId = toTrimmedString(raw.ca_id);
  if (!caId) return { ok: false, reason: "missing_ca_id" };

  const caName = toTrimmedString(raw.name);
  if (!caName) return { ok: false, reason: "missing_name" };

  const rawEmail = toTrimmedString(raw.email);
  if (!rawEmail) return { ok: false, reason: "missing_email" };

  const teamName = toTrimmedString(raw.team_name) ?? "";
  const managerResult = resolveManagerFromTeamName(teamName);
  if (!managerResult.ok) return { ok: false, reason: "unmapped_team" };

  return {
    ok: true,
    record: {
      ca_id: caId,
      ca_name: caName,
      ca_email: rawEmail.toLowerCase(),
      team_name: teamName,
      manager_name: managerResult.manager.managerName,
      manager_email: managerResult.manager.managerEmail,
      system_name: toTrimmedString(raw.system_name),
      designation: toTrimmedString(raw.designation),
      is_active: true,
    },
  };
}
```

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run lib/managerMapping/normalizeCaRecord.test.ts`
Expected: PASS.

- [ ] **Step 5: Run regression checks**

```bash
npx vitest run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add lib/managerMapping/normalizeCaRecord.ts lib/managerMapping/normalizeCaRecord.test.ts
git commit -m "feat: normalize CA capacity records into manager assignments"
```

---

### Task 4: Schema and Idempotent Sync

**Files:**
- Create: `supabase/migrations/202607231200_create_manager_ca_assignments.sql`
- Create: `lib/managerMapping/syncCaAssignments.ts`
- Create: `lib/managerMapping/syncCaAssignments.test.ts`
- Create: `scripts/manager-mapping/sync-ca-assignments.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `fetchCaCapacity()` (Task 2), `normalizeCaRecord(raw)` (Task 3).
- Produces:

```typescript
export interface CaSyncReport {
  ok: boolean;
  fetched_count: number;
  upserted_count: number;
  skipped_count: number;
  errorCode?: string;
}

export async function syncCaAssignments(supabase: SyncSupabase): Promise<CaSyncReport>;
```

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202607231200_create_manager_ca_assignments.sql`:

```sql
create table if not exists manager_ca_assignments (
  ca_id text primary key,
  ca_name text not null,
  ca_email text not null,
  team_name text not null,
  manager_name text not null,
  manager_email text not null,
  system_name text,
  designation text,
  is_active boolean not null default true,
  last_synced_at timestamptz not null default now()
);

create index if not exists manager_ca_assignments_manager_email_idx
  on manager_ca_assignments (manager_email);
```

- [ ] **Step 2: Write the failing test**

Create `lib/managerMapping/syncCaAssignments.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

const fetchCaCapacity = vi.fn();

vi.mock("@/lib/managerMapping/fetchCaCapacity", () => ({ fetchCaCapacity }));

function makeSupabase() {
  const upserted: Record<string, unknown>[][] = [];
  const supabase = {
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>[], _options: { onConflict: string }) => {
        if (table === "manager_ca_assignments") upserted.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
  return { supabase, upserted };
}

describe("syncCaAssignments", () => {
  it("upserts only records that normalize successfully, skipping unmapped/invalid ones", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
      { ca_id: "id-2", name: "Unmapped CA", email: "unmapped@applywizz.com", team_name: "Nonexistent Team" },
    ]);
    const { supabase, upserted } = makeSupabase();
    const { syncCaAssignments } = await import("./syncCaAssignments");

    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: true, fetched_count: 2, upserted_count: 1, skipped_count: 1 });
    expect(upserted).toHaveLength(1);
    expect(upserted[0]).toEqual([
      expect.objectContaining({ ca_id: "id-1", manager_email: "balaji@applywizz.ai" }),
    ]);
  });

  it("is idempotent: upserts with onConflict on ca_id so repeat runs never duplicate", async () => {
    fetchCaCapacity.mockResolvedValue([
      { ca_id: "id-1", name: "Valid CA", email: "valid@applywizz.com", team_name: "Balaji Team" },
    ]);
    let capturedOnConflict = "";
    const supabase = {
      from: () => ({
        upsert: (_payload: unknown, options: { onConflict: string }) => {
          capturedOnConflict = options.onConflict;
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
    const { syncCaAssignments } = await import("./syncCaAssignments");
    await syncCaAssignments(supabase as never);
    expect(capturedOnConflict).toBe("ca_id");
  });

  it("reports ok:false with an error code when the fetch itself fails, without touching the database", async () => {
    const { CaCapacityFetchError } = await import("./fetchCaCapacity");
    fetchCaCapacity.mockRejectedValue(new CaCapacityFetchError("CA_CAPACITY_HTTP_ERROR", 500));
    const upsert = vi.fn();
    const supabase = { from: () => ({ upsert }) };

    const { syncCaAssignments } = await import("./syncCaAssignments");
    const report = await syncCaAssignments(supabase as never);

    expect(report).toMatchObject({ ok: false, errorCode: "CA_CAPACITY_HTTP_ERROR" });
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the failing test**

Run: `npx vitest run lib/managerMapping/syncCaAssignments.test.ts`
Expected: FAIL with `Cannot find module './syncCaAssignments'`.

- [ ] **Step 4: Implement**

Create `lib/managerMapping/syncCaAssignments.ts`:

```typescript
import "server-only";

import { fetchCaCapacity, CaCapacityFetchError } from "@/lib/managerMapping/fetchCaCapacity";
import { normalizeCaRecord } from "@/lib/managerMapping/normalizeCaRecord";
import type { NormalizedCaAssignment } from "@/lib/managerMapping/types";

export interface SyncQueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface SyncSupabase {
  from(table: "manager_ca_assignments"): {
    upsert(payload: NormalizedCaAssignment[], options: { onConflict: string }): Promise<SyncQueryResult>;
  };
}

export interface CaSyncReport {
  ok: boolean;
  fetched_count: number;
  upserted_count: number;
  skipped_count: number;
  errorCode?: string;
}

/**
 * Fetches the CA capacity API, normalizes each record (dropping unmapped
 * teams and malformed rows), and upserts the rest keyed on ca_id — safe to
 * run repeatedly without duplicating rows. Never deactivates or deletes
 * CAs missing from a given run (mirrors the existing Leads Sync policy).
 */
export async function syncCaAssignments(supabase: SyncSupabase): Promise<CaSyncReport> {
  let rawRecords;
  try {
    rawRecords = await fetchCaCapacity();
  } catch (error) {
    const code = error instanceof CaCapacityFetchError ? error.code : "CA_CAPACITY_UNKNOWN_ERROR";
    return { ok: false, fetched_count: 0, upserted_count: 0, skipped_count: 0, errorCode: code };
  }

  const records: NormalizedCaAssignment[] = [];
  let skipped = 0;
  for (const raw of rawRecords) {
    const result = normalizeCaRecord(raw);
    if (result.ok) records.push(result.record);
    else skipped += 1;
  }

  if (records.length > 0) {
    const { error } = await supabase.from("manager_ca_assignments").upsert(records, { onConflict: "ca_id" });
    if (error) {
      return {
        ok: false,
        fetched_count: rawRecords.length,
        upserted_count: 0,
        skipped_count: skipped,
        errorCode: "DATABASE_ERROR",
      };
    }
  }

  return {
    ok: true,
    fetched_count: rawRecords.length,
    upserted_count: records.length,
    skipped_count: skipped,
  };
}
```

Create `scripts/manager-mapping/sync-ca-assignments.ts`, mirroring `scripts/leads-sync/sync-clients.ts`'s structure (read that file first for the exact CLI/env-loading convention used in this repo, then follow it):

```typescript
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { syncCaAssignments } from "@/lib/managerMapping/syncCaAssignments";

async function main() {
  const supabase = createSupabaseServiceRoleClient();
  const report = await syncCaAssignments(supabase as never);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main();
```

In `package.json`, add alongside the existing `"sync:clients"` entry:

```json
"sync:manager-mapping": "tsx scripts/manager-mapping/sync-ca-assignments.ts"
```

- [ ] **Step 5: Run focused verification**

```bash
npx vitest run lib/managerMapping
```

Expected: PASS.

- [ ] **Step 6: Run regression checks**

```bash
npx vitest run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607231200_create_manager_ca_assignments.sql lib/managerMapping/syncCaAssignments.ts lib/managerMapping/syncCaAssignments.test.ts scripts/manager-mapping/sync-ca-assignments.ts package.json
git commit -m "feat: sync CA capacity records into manager_ca_assignments"
```

---

### Task 5: Manager Scoping Helper

**Files:**
- Create: `lib/managerMapping/getAllowedCaEmails.ts`
- Create: `lib/managerMapping/getAllowedCaEmails.test.ts`

**Interfaces:**
- Produces:

```typescript
export async function getAllowedCaEmailsForManager(managerEmail: string): Promise<Set<string>>;
```

Returns an empty `Set` (never `null`, never throws) when the manager has no mapped CAs — the caller always fail-closes on an empty set, never falls through to "show everything."

- [ ] **Step 1: Write the failing tests**

Create `lib/managerMapping/getAllowedCaEmails.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createSupabaseServiceRoleClient = vi.fn();
vi.mock("@/lib/supabase/serviceRole", () => ({ createSupabaseServiceRoleClient }));

function mockSupabaseReturning(rows: Array<{ ca_email: string }>) {
  createSupabaseServiceRoleClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  });
}

describe("getAllowedCaEmailsForManager", () => {
  it("returns the set of active CA emails mapped to this manager, lowercased", async () => {
    mockSupabaseReturning([{ ca_email: "a@applywizz.com" }, { ca_email: "B@applywizz.ai" }]);
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(getAllowedCaEmailsForManager("balaji@applywizz.ai")).resolves.toEqual(
      new Set(["a@applywizz.com", "b@applywizz.ai"]),
    );
  });

  it("returns an empty set (fail closed) when the manager has no mapped CAs", async () => {
    mockSupabaseReturning([]);
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(getAllowedCaEmailsForManager("nobody@applywizz.ai")).resolves.toEqual(new Set());
  });

  it("returns an empty set (fail closed) on a database error, never throws", async () => {
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: null, error: { message: "db down" } }),
          }),
        }),
      }),
    });
    const { getAllowedCaEmailsForManager } = await import("./getAllowedCaEmails");
    await expect(getAllowedCaEmailsForManager("balaji@applywizz.ai")).resolves.toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run lib/managerMapping/getAllowedCaEmails.test.ts`
Expected: FAIL with `Cannot find module './getAllowedCaEmails'`.

- [ ] **Step 3: Implement**

Create `lib/managerMapping/getAllowedCaEmails.ts`:

```typescript
import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

interface AllowedCaSupabase {
  from(table: "manager_ca_assignments"): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: boolean): Promise<{ data: Array<{ ca_email: string }> | null; error: { message: string } | null }>;
      };
    };
  };
}

/**
 * Returns the set of active CA emails mapped to this manager. Always
 * returns a Set — empty on no rows, error, or any uncertainty — callers
 * must treat an empty set as "show nothing", never as "show everything".
 */
export async function getAllowedCaEmailsForManager(managerEmail: string): Promise<Set<string>> {
  try {
    const supabase = createSupabaseServiceRoleClient() as unknown as AllowedCaSupabase;
    const { data, error } = await supabase
      .from("manager_ca_assignments")
      .select("ca_email")
      .eq("manager_email", managerEmail)
      .eq("is_active", true);

    if (error || !data) return new Set();
    return new Set(data.map((row) => row.ca_email.toLowerCase()));
  } catch {
    return new Set();
  }
}
```

- [ ] **Step 4: Run focused verification**

```bash
npx vitest run lib/managerMapping/getAllowedCaEmails.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run regression checks**

```bash
npx vitest run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add lib/managerMapping/getAllowedCaEmails.ts lib/managerMapping/getAllowedCaEmails.test.ts
git commit -m "feat: add manager CA-email scoping helper"
```

---

### Task 6: Scope Live Monitor's Recent Email Activity

**Files:**
- Modify: `lib/zoho/emailArrival.ts`
- Modify: `lib/zoho/emailArrival.test.ts`
- Modify: `app/(operations)/live-monitor/email-arrival/page.tsx`

**Interfaces:**
- Consumes: `getAllowedCaEmailsForManager(managerEmail)` (Task 5).
- Modifies: `getRecentEmailActivity()` gains a required `scope` parameter:

```typescript
export interface RecentActivityScope {
  role: "admin_ceo" | "manager_ops" | "ca";
  email: string;
}

export async function getRecentEmailActivity(scope: RecentActivityScope): Promise<GetRecentEmailActivityResult>;
```

- [ ] **Step 1: Write the failing tests**

Read `lib/zoho/emailArrival.test.ts` in full first to see the exact existing mock shape for `getRecentEmailActivity`'s Supabase query (the embedded `clients(...)` relation). Add these tests to its `describe("getRecentEmailActivity", ...)` block (or the equivalent section):

```typescript
it("admin_ceo sees all rows regardless of assigned CA", async () => {
  // Seed rows for two different assigned_ca_email values in the existing mock data setup.
  const { getRecentEmailActivity } = await import("./emailArrival");
  const result = await getRecentEmailActivity({ role: "admin_ceo", email: "ramakrishna@applywizz.ai" });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.rows.length).toBeGreaterThan(1);
});

it("manager_ops sees only rows whose assigned_ca_email is mapped to them", async () => {
  vi.doMock("@/lib/managerMapping/getAllowedCaEmails", () => ({
    getAllowedCaEmailsForManager: vi.fn().mockResolvedValue(new Set(["assigned-to-balaji@applywizz.com"])),
  }));
  const { getRecentEmailActivity } = await import("./emailArrival");
  const result = await getRecentEmailActivity({ role: "manager_ops", email: "balaji@applywizz.ai" });
  expect(result.ok).toBe(true);
  if (result.ok) {
    for (const row of result.rows) {
      expect(row.assignedCaEmail).toBe("assigned-to-balaji@applywizz.com");
    }
  }
});

it("manager_ops with no mapped CAs sees zero rows (fails closed, not everything)", async () => {
  vi.doMock("@/lib/managerMapping/getAllowedCaEmails", () => ({
    getAllowedCaEmailsForManager: vi.fn().mockResolvedValue(new Set()),
  }));
  const { getRecentEmailActivity } = await import("./emailArrival");
  const result = await getRecentEmailActivity({ role: "manager_ops", email: "unmapped-manager@applywizz.ai" });
  expect(result).toEqual({ ok: true, rows: [] });
});
```

Adapt these to the file's actual existing mock/seed conventions (variable names for the seeded rows, how `assigned_ca_email` values are set on the mocked `clients` relation) — read the current test file before writing, do not guess at names that don't exist there.

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run lib/zoho/emailArrival.test.ts`
Expected: FAIL — `getRecentEmailActivity()` does not yet accept a `scope` parameter, and does not filter.

- [ ] **Step 3: Implement**

In `lib/zoho/emailArrival.ts`, add the scope type and filtering logic:

```typescript
import { getAllowedCaEmailsForManager } from "@/lib/managerMapping/getAllowedCaEmails";

export interface RecentActivityScope {
  role: "admin_ceo" | "manager_ops" | "ca";
  email: string;
}
```

Change the function signature and add post-query filtering:

```typescript
export async function getRecentEmailActivity(scope: RecentActivityScope): Promise<GetRecentEmailActivityResult> {
  try {
    const supabase = createSupabaseServiceRoleClient() as unknown as RecentActivitySupabase;

    const { data, error } = await supabase
      .from("zoho_email_metadata")
      .select(
        "id, sender, subject, original_recipient, received_at, classification_status, category, client_id, clients(client_name, assigned_ca_name, assigned_ca_email)",
      )
      .order("received_at", { ascending: false })
      .limit(RECENT_ACTIVITY_LIMIT);

    if (error || !data) return { ok: false };

    let allowedCaEmails: Set<string> | null = null;
    if (scope.role === "manager_ops") {
      allowedCaEmails = await getAllowedCaEmailsForManager(scope.email);
    }

    const rows: LiveMonitorEmailRow[] = data
      .map((row) => {
        const relation = Array.isArray(row.clients) ? (row.clients[0] ?? null) : row.clients;
        return {
          id: String(row.id),
          sender: row.sender ?? null,
          subject: row.subject ?? null,
          originalRecipient: row.original_recipient ?? null,
          receivedAt: row.received_at ?? null,
          classificationStatus: row.classification_status ?? null,
          category: row.category ?? null,
          clientId: row.client_id ?? null,
          clientName: relation?.client_name ?? null,
          assignedCaName: relation?.assigned_ca_name ?? null,
          assignedCaEmail: relation?.assigned_ca_email ?? null,
        };
      })
      .filter((row) => {
        if (!allowedCaEmails) return true; // admin_ceo: unfiltered
        const caEmail = row.assignedCaEmail?.toLowerCase();
        return !!caEmail && allowedCaEmails.has(caEmail);
      });

    return { ok: true, rows };
  } catch {
    return { ok: false };
  }
}
```

`scope.role === "ca"` is included in the type for completeness but this function is never actually called for a `ca` session in practice (Live Monitor is behind `requireOperationsAccess()`, which already redirects `ca` away) — treat it the same as `manager_ops` would with no mappings (falls through to the `allowedCaEmails` branch only when explicitly `"manager_ops"`; a `"ca"` scope value, if it ever reached here, would take the `!allowedCaEmails` unfiltered branch since `allowedCaEmails` stays `null` — **this is a gap, fix it**: change the condition to explicitly allow-list only `admin_ceo` as unfiltered, treating every other role (including any unexpected value) as scoped-with-a-lookup:

```typescript
let allowedCaEmails: Set<string> | null = null;
if (scope.role !== "admin_ceo") {
  allowedCaEmails = await getAllowedCaEmailsForManager(scope.email);
}
```

This way `admin_ceo` is the only explicit unfiltered case, and anything else (including a `ca` scope that should never occur, or a future role) safely fails closed through the same manager-lookup-then-filter path, which naturally yields zero rows for an email with no `manager_ca_assignments` rows.

- [ ] **Step 4: Update the page to pass the scope**

In `app/(operations)/live-monitor/email-arrival/page.tsx`, capture the session already returned by `requireOperationsAccess()` and pass it through:

```typescript
const session = await requireOperationsAccess();
const result = await getEmailArrivalMonitorData();
const recent = await getRecentEmailActivity({ role: session.user.role, email: session.user.email });
```

(Check the exact current variable name the page assigns `requireOperationsAccess()`'s return value to — it may already be discarded; capture it if so.)

- [ ] **Step 5: Run focused verification**

```bash
npx vitest run lib/zoho/emailArrival.test.ts
npx vitest run app/\(operations\)/live-monitor
```

Expected: PASS.

- [ ] **Step 6: Run regression checks**

```bash
npx vitest run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add lib/zoho/emailArrival.ts lib/zoho/emailArrival.test.ts "app/(operations)/live-monitor/email-arrival/page.tsx"
git commit -m "feat: scope Live Monitor recent email activity by manager's CAs"
```

---

### Task 7: My Team Page

**Files:**
- Create: `app/(operations)/my-team/page.tsx`
- Create: `app/(operations)/my-team/page.test.tsx`
- Modify: `components/operations/operations-shell-client.tsx`
- Modify: `components/operations/operations-shell-client.test.tsx`
- Modify: `lib/dashboardAuth/routeGuardCoverage.test.ts`

**Interfaces:**
- Consumes: `requireOperationsAccess()` (existing), `getAllowedCaEmailsForManager` is not reused here directly — this page queries `manager_ca_assignments` directly for the full CA capacity row set (name, email, system_name, designation, and the capacity metrics only if stored — this plan's schema does not store the live load/capacity numbers, only identity/mapping fields, so the page shows what the schema has: CA name, email, system name, designation, team name; it does not show live "active load"/"utilization" since those aren't persisted columns per the approved schema).

- [ ] **Step 1: Write the failing test**

Create `app/(operations)/my-team/page.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireOperationsAccess = vi.fn();
const createSupabaseServiceRoleClient = vi.fn();

vi.mock("@/lib/dashboardAuth/requireOperationsAccess", () => ({ requireOperationsAccess }));
vi.mock("@/lib/supabase/serviceRole", () => ({ createSupabaseServiceRoleClient }));

function session(role: "admin_ceo" | "manager_ops", email: string) {
  return { user: { id: "u1", email, role, status: "active", totpEnabled: true } };
}

describe("MyTeamPage", () => {
  it("queries manager_ca_assignments scoped to the logged-in manager's email", async () => {
    requireOperationsAccess.mockResolvedValue(session("manager_ops", "balaji@applywizz.ai"));
    let capturedEmail = "";
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: (_col: string, value: string) => {
            capturedEmail = value;
            return Promise.resolve({ data: [], error: null });
          },
        }),
      }),
    });

    const { default: MyTeamPage } = await import("./page");
    await MyTeamPage();

    expect(capturedEmail).toBe("balaji@applywizz.ai");
  });

  it("queries all CAs (no manager filter) for admin_ceo", async () => {
    requireOperationsAccess.mockResolvedValue(session("admin_ceo", "ramakrishna@applywizz.ai"));
    let eqCalled = false;
    createSupabaseServiceRoleClient.mockReturnValue({
      from: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        eq: () => {
          eqCalled = true;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    });

    const { default: MyTeamPage } = await import("./page");
    await MyTeamPage();

    expect(eqCalled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run app/\(operations\)/my-team/page.test.tsx`
Expected: FAIL — `app/(operations)/my-team/page.tsx` does not exist.

- [ ] **Step 3: Implement the page**

Create `app/(operations)/my-team/page.tsx`:

```tsx
import { requireOperationsAccess } from "@/lib/dashboardAuth/requireOperationsAccess";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CaAssignmentRow {
  ca_name: string;
  ca_email: string;
  system_name: string | null;
  designation: string | null;
  team_name: string;
}

interface MyTeamSupabase {
  from(table: "manager_ca_assignments"): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: CaAssignmentRow[] | null; error: { message: string } | null }>;
    } & Promise<{ data: CaAssignmentRow[] | null; error: { message: string } | null }>;
  };
}

export default async function MyTeamPage() {
  const session = await requireOperationsAccess();
  const supabase = createSupabaseServiceRoleClient() as unknown as MyTeamSupabase;

  const query = supabase.from("manager_ca_assignments").select("ca_name, ca_email, system_name, designation, team_name");
  const { data, error } =
    session.user.role === "admin_ceo" ? await query : await query.eq("manager_email", session.user.email);

  const rows = error || !data ? [] : data;

  return (
    <main className="coo-page">
      <header className="coo-page__header">
        <div>
          <span className="coo-page__eyebrow">My Team</span>
          <h1 className="coo-page__title">Career Advisors</h1>
        </div>
      </header>
      <section>
        <table>
          <thead>
            <tr>
              <th>CA Name</th>
              <th>CA Email</th>
              <th>System Name</th>
              <th>Designation</th>
              {session.user.role === "admin_ceo" ? <th>Team</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ca_email}>
                <td>{row.ca_name}</td>
                <td>{row.ca_email}</td>
                <td>{row.system_name ?? "—"}</td>
                <td>{row.designation ?? "—"}</td>
                {session.user.role === "admin_ceo" ? <td>{row.team_name}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add navigation and route-guard coverage**

In `components/operations/operations-shell-client.tsx`, add a "My Team" `NavLink` to all three nav surfaces (sidebar, drawer, bottom-nav) inside the existing `canSeeBroadNav(userRole)` branch (admin_ceo/manager_ops only — same branch the existing five links already live in), pointing to `/my-team`.

In `lib/dashboardAuth/routeGuardCoverage.test.ts`, add `["my team", "app/(operations)/my-team/page.tsx"]` to `guardedPages` and `broadOperationsPages`.

- [ ] **Step 5: Run focused verification**

```bash
npx vitest run app/\(operations\)/my-team
npx vitest run components/operations
npx vitest run lib/dashboardAuth/routeGuardCoverage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full regression**

```bash
npx vitest run
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all tests pass, lint passes, build passes, diff-check passes, clean working tree after commit.

- [ ] **Step 7: Commit**

```bash
git add "app/(operations)/my-team" components/operations/operations-shell-client.tsx components/operations/operations-shell-client.test.tsx lib/dashboardAuth/routeGuardCoverage.test.ts
git commit -m "feat: add My Team page for manager and admin CA visibility"
```

---

## Self-Review

**Corrected assumptions:**
- The CA capacity API is public/unauthenticated (confirmed via a live test call during planning) — no new secret needed, unlike the Leads API.
- `canAccessBroadDashboards` already permits both `admin_ceo` and `manager_ops` — no change needed there.
- `/clients`, `/overview`, `/operations`, `/review-queue` are explicitly excluded from this slice per the approved scope decision — documented as a Phase 2 follow-up, not implemented here.

**Spec coverage:**
- Team-name normalization and mapping (including the double-space "Balaji  Team" case) → Task 1.
- `manager_ca_assignments` schema and idempotent sync → Task 4.
- CA email normalization without domain rewriting → Task 3.
- Server-side manager filtering (never client-only) → Tasks 5, 6.
- Admin sees everything, CA access not broadened → Tasks 6, 7 (role checks throughout).
- Fail-closed on unmapped team or unmapped manager → Tasks 3 (unmapped_team), 5 (empty Set), 6 (filter yields zero rows).
- Manager UI ("My Team") → Task 7.
- Live Monitor scoping → Task 6.

**Scope check:** This plan explicitly does not modify `cooWorkspace.ts`, `/clients`, `/overview`, `/operations`, or `/review-queue`. It does not add an HTTP trigger route for the sync (CLI-only, matching the existing Leads Sync convention) — a route can be added later if operational needs require it. It does not implement CA-level (as opposed to manager-level) data scoping. It does not deploy or push.

**Placeholder scan:** No TBD/TODO markers; every step shows complete code.

**Type consistency:** `resolveManagerFromTeamName` (Task 1) → consumed by `normalizeCaRecord` (Task 3) with the same `ResolvedManager` shape. `NormalizedCaAssignment` (Task 2's types.ts) → produced by Task 3, consumed by Task 4's upsert. `getAllowedCaEmailsForManager` (Task 5) → consumed by Task 6's `getRecentEmailActivity`. `RecentActivityScope` (Task 6) is a new, narrowly-scoped type local to that task.

**IMPORTANT — reporting constraint for the final report:** After this plan is implemented, the final report must NOT claim managers are scoped across the whole Operations Console. State explicitly that only **My Team** and **Live Monitor's Recent Email Activity panel** are manager-scoped in this slice, and that `/clients`, `/overview`, `/operations`, and `/review-queue` remain unscoped by role, pending a separate Phase 2 task.
