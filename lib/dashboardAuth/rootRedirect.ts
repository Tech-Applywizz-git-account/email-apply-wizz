import "server-only";

import type { DashboardRole } from "@/lib/dashboardAuth/users";

export function resolveRootRedirect(role: DashboardRole): string {
  if (role === "ca") return "/access-pending";
  return "/live-monitor/email-arrival";
}
