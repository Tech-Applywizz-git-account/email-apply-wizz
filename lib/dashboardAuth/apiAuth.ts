import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getDashboardSessionByToken, type DashboardSession } from "@/lib/dashboardAuth/sessionStore";
import { DASHBOARD_SESSION_COOKIE_NAME } from "@/lib/dashboardAuth/sessionCookie";
import type { DashboardRole } from "@/lib/dashboardAuth/users";

export type RequireApiRoleResult =
  | { ok: true; session: DashboardSession }
  | { ok: false; response: NextResponse };

function forbidden(): NextResponse {
  return NextResponse.json({ ok: false }, { status: 403 });
}

/**
 * Route-handler authorization guard: requires a valid dashboard session
 * whose role is in allowedRoles. Unlike requireDashboardSession()/
 * requireOperationsAccess() (which redirect, for Server Components), this
 * returns a JSON 403 response for Route Handlers to return directly.
 */
export async function requireApiRole(
  request: NextRequest,
  allowedRoles: readonly DashboardRole[],
): Promise<RequireApiRoleResult> {
  const rawToken = request.cookies.get(DASHBOARD_SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return { ok: false, response: forbidden() };

  try {
    const result = await getDashboardSessionByToken(rawToken);
    if (!result.ok) return { ok: false, response: forbidden() };
    if (!allowedRoles.includes(result.session.user.role)) return { ok: false, response: forbidden() };
    return { ok: true, session: result.session };
  } catch {
    return { ok: false, response: forbidden() };
  }
}
