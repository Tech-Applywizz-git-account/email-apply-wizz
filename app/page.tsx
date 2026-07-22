import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardAuthClient } from "@/components/dashboard-auth/dashboard-auth-client";
import { getDashboardSessionByToken } from "@/lib/dashboardAuth/sessionStore";
import { DASHBOARD_SESSION_COOKIE_NAME } from "@/lib/dashboardAuth/sessionCookie";
import { resolveRootRedirect } from "@/lib/dashboardAuth/rootRedirect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get(DASHBOARD_SESSION_COOKIE_NAME)?.value;

  if (rawSessionToken) {
    let sessionResult: Awaited<ReturnType<typeof getDashboardSessionByToken>> | null = null;
    try {
      sessionResult = await getDashboardSessionByToken(rawSessionToken);
    } catch {
      // Fail closed: render the login landing page.
    }

    if (sessionResult?.ok) {
      redirect(resolveRootRedirect(sessionResult.session.user.role));
    }
  }

  return <DashboardAuthClient />;
}
