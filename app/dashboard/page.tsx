import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardAuthClient } from "@/components/dashboard-auth/dashboard-auth-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("dashboard_session")) {
    redirect("/overview");
  }

  return <DashboardAuthClient />;
}
