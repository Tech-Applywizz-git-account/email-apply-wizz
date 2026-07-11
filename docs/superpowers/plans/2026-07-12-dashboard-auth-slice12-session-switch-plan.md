# Dashboard Auth Phase 1 Slice 12 Plan: Session Switch and Route Protection

Status: plan only. Do not implement without Fable review and explicit owner approval.

## Goal

Replace Basic Auth as the active dashboard gate with the reviewed app-owned dashboard session flow.

Slice 12 should make existing business dashboard routes require a valid `dashboard_session` backed by `dashboard_sessions` and an active `dashboard_users` row. Unauthenticated or invalid sessions should go to `/dashboard/login`. Authenticated users should land on `/overview`.

This slice must preserve the restored Email Tracker Dashboard at `/dashboard`, keep the Slice 10 auth APIs thin, and avoid any role/data-scope expansion beyond the Phase 1 broad-dashboard admin gate.

## Current-State Analysis

### Current Middleware

- `middleware.ts` currently enforces Basic Auth only.
- Protected paths are `/dashboard`, `/overview`, `/live-monitor`, `/clients`, `/operations`, and `/review-queue`.
- The matcher covers `/dashboard/:path*`, `/overview`, `/live-monitor/:path*`, `/clients/:path*`, `/operations/:path*`, and `/review-queue`.
- Basic Auth uses username `admin` and `DASHBOARD_SECRET`.
- Because `/dashboard/:path*` is matched, `/dashboard/login` is currently also behind Basic Auth.

### Current Dashboard Route

- `/dashboard` is restored to the pre-Slice-11 Email Tracker Dashboard from `fdd1caf`.
- It queries Supabase and renders recent Zoho email/classification data.
- It still contains a dashboard-secret configuration check inherited from the Basic Auth era. Slice 12 must decide whether that check is removed, replaced, or left harmless after route-level session protection.

### Current Login Route

- `/dashboard/login` is a server component that reads the `dashboard_session` cookie.
- It calls `getDashboardSessionByToken(rawToken)`.
- It redirects to `/overview` only when the helper returns a usable session.
- Missing, fake, expired, revoked, disabled-user, malformed, or failed DB lookup cases render the login flow.

### Current `/overview` Protection Status

- `/overview` is protected only by Basic Auth middleware today.
- It does not yet validate `dashboard_session`.
- It is the current authenticated landing page used by the login UI after successful setup/login.

### Current Session-Cookie Path

- Slice 10 auth routes set `dashboard_session` after successful TOTP setup or returning-user TOTP login.
- Cookie attributes are `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=43200`, and `Secure` in production.
- Route handlers do not return raw session tokens in JSON.
- `getDashboardSessionByToken` hashes the raw token, reads `dashboard_sessions`, reads `dashboard_users`, rejects revoked/expired sessions and disabled users, and best-effort updates `last_seen_at`.

### Current Logout and Revocation

- `revokeDashboardSession` and `revokeDashboardSessionsForUser` exist in `lib/dashboardAuth/sessionStore.ts`.
- No logout route or UI exists.
- No cookie-clearing flow exists.

### Existing Auth APIs

- Existing app routes are:
  - `POST /api/dashboard/auth/request-otp`
  - `POST /api/dashboard/auth/verify-otp`
  - `POST /api/dashboard/auth/complete-totp-setup`
  - `POST /api/dashboard/auth/verify-totp`
- These routes currently include route-level Basic Auth because `middleware.ts` does not protect `/api/**`.
- Before Basic Auth can be replaced, the login APIs must be reachable without Basic Auth while preserving strict JSON validation, generic failures, rate limits, and signed challenge requirements.

### Legacy Mechanism Being Replaced

- Basic Auth with `DASHBOARD_SECRET` is the current live authentication mechanism.
- Slice 12 should not remove rollback ability until the session-switch implementation is reviewed and verified.

## Exact Proposed Scope

### Likely Files to Change

- `middleware.ts`
- `lib/middleware/basicAuth.test.ts` or equivalent middleware tests
- `app/dashboard/login/page.tsx` and/or tests if route behavior needs adjustment
- `app/api/dashboard/auth/_lib/basicAuthGate.ts` and route tests if Basic Auth is removed from login APIs
- A new logout route, if approved:
  - `app/api/dashboard/auth/logout/route.ts`
  - `app/api/dashboard/auth/logout/route.test.ts`
- A server-side dashboard session guard if middleware cannot safely call the current session helper:
  - likely under `lib/dashboardAuth/` or an app route-group layout
- Existing Playwright auth tests
- `STATE.md` and `loop-run-log.md`

Do not edit implementation files until this plan is approved.

### Protected Routes

Require a valid dashboard session for:

- `/dashboard`
- `/overview`
- `/live-monitor` and `/live-monitor/*`
- `/clients` and `/clients/*`
- `/operations` and `/operations/*`
- `/review-queue`

Phase 1 broad-dashboard access should be admin-only:

- `admin_ceo`: allowed.
- `manager_ops`: login can succeed, but broad dashboards should show an access-denied/limited placeholder until Phase 2 scoping exists.
- `ca`: login can succeed, but broad dashboards should show an access-denied/limited placeholder until Phase 2 scoping exists.

If no access-denied route exists, Slice 12 should either add a minimal server-rendered `/dashboard/access-denied` page or defer non-admin login access to a generic safe landing page. This needs owner approval before implementation.

### Public Routes

Keep public:

- `/`
- `/dashboard/login`
- `POST /api/dashboard/auth/request-otp`
- `POST /api/dashboard/auth/verify-otp`
- `POST /api/dashboard/auth/complete-totp-setup`
- `POST /api/dashboard/auth/verify-totp`
- Static assets and framework internals such as `/_next/*`, images, fonts, and metadata files.

Do not make unrelated Zoho/test/cron APIs public or protected in this slice without inspecting their existing production use.

### Redirect Destinations

- Protected route with no valid session: redirect to `/dashboard/login`.
- `/dashboard/login` with a valid session: redirect to `/overview`.
- `/dashboard/login` with no/invalid session: render login UI.
- Avoid preserving arbitrary redirect query parameters unless open-redirect controls are designed and reviewed.
- If a return URL is added later, it must be restricted to same-origin relative paths from an allowlist.

### Invalid Session Behavior

For invalid, expired, revoked, disabled-user, malformed-token, missing-user, or DB-failure sessions:

- Fail closed.
- Do not allow protected route access.
- Redirect to `/dashboard/login` or render the login UI.
- Do not expose failure reason to browser.
- Do not log raw cookie/token/session hash/user id.

### Redirect Loop Prevention

- `/dashboard/login` must remain outside the protected-route redirect path.
- Auth API routes must remain outside dashboard session middleware.
- Protected pages must not redirect valid sessions back to login.
- Login page must not redirect invalid sessions to itself repeatedly; it should render login on validation failure.

### Business Dashboard Preservation

- `/dashboard` must continue rendering the restored Email Tracker Dashboard.
- Do not relocate, redesign, or simplify the business dashboard.
- Any Basic Auth-era `DASHBOARD_SECRET` check inside `/dashboard` should be addressed only if it blocks the session-switch goal, and the change must be minimal.

### Authenticated Landing Page

- Keep `/overview` as the authenticated landing page for Phase 1 because Slice 10/11 already use it and the operations layout treats it as the overview entry.
- `/dashboard/login` should redirect valid sessions to `/overview`.

### Cookie Lifecycle

- Continue using `dashboard_session`.
- Keep 12-hour session lifetime and `Max-Age=43200`.
- Keep `HttpOnly`, production `Secure`, `SameSite=Lax`, `Path=/`, and no Domain attribute.
- Add logout only if approved in Slice 12: revoke the current DB session and clear the cookie using matching cookie attributes.

### Logout Behavior

Recommended Slice 12 scope includes a minimal `POST /api/dashboard/auth/logout` because route protection should have a safe exit path.

Logout should:

- Read `dashboard_session` server-side.
- Call `revokeDashboardSession(rawToken)` when present.
- Clear `dashboard_session` regardless of revoke result.
- Return `{ "ok": true }` without exposing whether a token existed.
- Avoid logging the token or DB errors.

If adding logout makes the slice too large, split it into Slice 12A after the session switch but before production rollout.

### Middleware Runtime Compatibility

Critical blocker to resolve before implementation:

- `getDashboardSessionByToken` imports `server-only`, uses the service-role Supabase client, and performs database reads.
- Next middleware may run in a middleware/proxy runtime that is not compatible with `server-only`, Node-only clients, or service-role database access.
- Do not import `getDashboardSessionByToken` into middleware until this is verified.

Recommended approach:

1. Verify whether the current Next.js version/runtime allows Node-compatible middleware and Supabase service-role calls safely.
2. If not, keep middleware lightweight and move full session validation into server-side guards/layouts/pages that can call `getDashboardSessionByToken`.
3. Middleware may still handle path routing only if backed by server validation; it must not treat cookie presence as authentication.

### Middleware-Compatible Validation

Do not introduce a stateless signed-cookie shortcut in Slice 12 unless it also preserves:

- server-side revocation,
- user disabling,
- session expiry,
- token hashing,
- and DB failure fail-closed behavior.

If middleware cannot query the database, prefer a server guard over a weaker middleware validator.

### Production Environment Requirements

Before rollout:

- `DASHBOARD_SESSION_SECRET` must exist.
- `DASHBOARD_TOTP_ENCRYPTION_KEY` must exist.
- `DASHBOARD_LOGIN_CHALLENGE_SECRET` must exist.
- Microsoft OTP env vars must exist:
  - `MICROSOFT_TENANT_ID`
  - `MICROSOFT_CLIENT_ID`
  - `MICROSOFT_CLIENT_SECRET`
  - `MICROSOFT_OTP_FROM_EMAIL`
- `dashboard_users` must contain approved staff users and at least one `admin_ceo`.
- Secrets must be verified by presence only; never print values.

### User Seeding

Production seeding should be a separate explicit operator step unless a reviewed seed/admin bootstrap task is approved.

At minimum:

- Seed one Admin/CEO user from a reviewed source.
- Do not hardcode real emails in code.
- Confirm `status = active` and `role = admin_ceo`.
- Manager Ops and CA users may be allowed to login but must not access broad dashboards until Phase 2 scoping exists.

### Rollout Strategy

1. Keep current production unchanged until implementation is reviewed.
2. Create a backup branch/tag at the pre-switch point.
3. Verify required env var presence in Preview without printing values.
4. Apply any user seed in Preview/staging only after explicit approval.
5. Deploy Preview.
6. Smoke test:
   - unauthenticated protected route redirects to `/dashboard/login`;
   - login OTP and TOTP complete;
   - valid session reaches `/overview`;
   - invalid/fake session fails closed;
   - logout clears access if included;
   - `/dashboard` business UI remains intact.
7. Only after approval, deploy/promote production.
8. Keep rollback path to the last Basic Auth deployment.

### Rollback Strategy

- Revert the Slice 12 implementation commit or redeploy the last known Basic Auth production deployment.
- Do not delete auth tables or seeded users during rollback.
- Keep `DASHBOARD_SECRET` available until production session auth is confirmed stable.
- If logout route was added, rollback should restore previous route behavior without requiring schema changes.

## Security Analysis

### Fail-Open vs Fail-Closed

- Session validation must fail closed on missing token, malformed token, DB error, missing session, expired session, revoked session, disabled user, or missing user.
- Login APIs should preserve generic failure shapes and account-enumeration safety.

### Database Outage

- Protected routes should deny access or render login on DB failure.
- Do not allow access because validation cannot be completed.
- User-facing copy should remain generic.

### Cookie Replay and Token Hashing

- Raw session tokens live only in the HttpOnly cookie and route/server memory.
- DB stores `session_hash`, not raw tokens.
- Replay remains possible until expiry/revocation if an HttpOnly cookie is stolen; keep `Secure`, `SameSite=Lax`, short 12-hour lifetime, and revocation support.

### Secret Rotation

- `DASHBOARD_SESSION_SECRET` rotation invalidates existing session hashes unless a dual-secret migration is designed.
- `DASHBOARD_TOTP_ENCRYPTION_KEY` rotation requires a re-encryption or re-enrollment plan.
- `DASHBOARD_LOGIN_CHALLENGE_SECRET` rotation invalidates in-flight login challenges only.
- Do not rotate secrets in Slice 12.

### Session Expiry and Revocation

- Use `getDashboardSessionByToken` so expiry, revoked_at, and disabled-user checks stay centralized.
- Logout should call reviewed revocation helpers if included.

### User Disabling

- A disabled `dashboard_users` row must invalidate access on next validation.
- Do not rely only on session row existence.

### Middleware Bypass Risks

- Matcher must cover every business dashboard route and nested route.
- Server-side guards/layouts should protect any route that middleware cannot safely validate.
- Auth APIs and static assets should be intentionally excluded.

### Matcher Configuration

Recommended protected matcher set:

- `/dashboard`
- `/overview`
- `/live-monitor/:path*`
- `/clients/:path*`
- `/operations/:path*`
- `/review-queue`

Explicitly exclude:

- `/dashboard/login`
- `/api/dashboard/auth/:path*`
- `/_next/:path*`
- static files and metadata.

### Open Redirect Risk

- Do not add arbitrary `next` or `returnTo` behavior in Slice 12.
- If later needed, allow only same-origin relative paths from an allowlist.

### Sensitive Logging

Never log:

- raw session token,
- session hash,
- Basic Auth credentials,
- OTP,
- TOTP code,
- challenge,
- TOTP secret,
- Microsoft access token,
- DB error bodies containing sensitive data.

### Runtime Incompatibilities

- Verify middleware/proxy runtime before using Node crypto, Supabase service role, or `server-only` helpers.
- If incompatible, use a server component/layout guard for full validation.

## Test Plan

### Unit/Route Tests

- Middleware/proxy no-cookie behavior.
- Middleware/proxy fake-cookie behavior.
- Middleware/proxy matcher exclusions for login/auth APIs/static assets.
- Server guard validates:
  - no cookie,
  - fake cookie,
  - malformed cookie,
  - expired session,
  - revoked session,
  - disabled user,
  - missing user,
  - database failure,
  - valid session.
- `/dashboard/login` redirects valid sessions to `/overview`.
- Protected route redirects invalid sessions to `/dashboard/login`.
- Public routes remain accessible.
- No redirect loop between `/dashboard/login` and protected routes.
- Logout invalidates access if logout is included.

### Playwright/E2E

- Original `/dashboard` business UI remains intact after authentication.
- No cookie: `/overview` and `/dashboard` go to `/dashboard/login`.
- Fake cookie: protected routes do not render business dashboards.
- Valid session: `/overview` renders authenticated page.
- Login page with valid session redirects to `/overview`.
- Logout clears cookie and access if included.
- Auth APIs remain callable without Basic Auth after Basic Auth replacement.
- No Basic Auth prompt on protected routes after switch.
- Real database-backed valid-session E2E coverage using safe seeded test data or isolated Preview/Supabase test data.

### Regression Tests

- Existing Slice 10 auth API tests still pass.
- Existing Slice 11 frontend tests still pass.
- `npx vitest run`, `npm run lint`, and `npm run build` must pass.

## Deployment Prerequisites

- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_TOTP_ENCRYPTION_KEY`
- `DASHBOARD_LOGIN_CHALLENGE_SECRET`
- Microsoft Graph OTP env vars
- Production `dashboard_users` seeded with at least one active `admin_ceo`
- Schema verification for all four dashboard auth tables
- Safe operator/bootstrap process for users
- Secret presence verification without exposing values
- Backup branch or tag before switch
- Preview/staging verification before production
- Rollback checkpoint to the last Basic Auth deployment

## Explicit Out of Scope

Do not include unless repository evidence or owner approval makes it required:

- Leads API data scoping
- Manager/CA scoped dashboards
- New dashboard metrics
- Human Review changes
- Live Monitor changes
- worker/sync/backfill/release changes
- database migrations
- package installation
- secret rotation
- production env changes
- deployment or push
- UI redesign of `/dashboard`
- mobile app
- password login

## Execution Gates

1. Fable plan review.
2. Explicit owner approval before implementation.
3. Codex GPT-5.5 High implementation.
4. Full automated verification.
5. Fable independent code review.
6. Explicit approval before push.
7. Explicit approval before deploy.

## Open Owner Decisions

- Should Slice 12 include logout, or should logout be a separate Slice 12A?
- Should non-admin roles see a minimal access-denied page in Slice 12, or should only the first Admin/CEO be seeded before production switch?
- Should the Basic Auth route-level gate be removed from auth APIs in Slice 12, or kept behind a temporary operator-only rollout mode until production seed is verified?
- Should `/dashboard` remain a protected business dashboard route, or should `/overview` be the only authenticated landing page while `/dashboard` remains legacy?
