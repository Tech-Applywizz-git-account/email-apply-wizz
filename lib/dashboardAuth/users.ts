import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { normalizeEmail } from "@/lib/dashboardAuth/email";

export type DashboardRole = "admin_ceo" | "manager_ops" | "ca";
export type DashboardUserStatus = "active" | "disabled";

export interface DashboardUser {
  id: string;
  email: string;
  role: DashboardRole;
  status: DashboardUserStatus;
  totpEnabled: boolean;
}

interface DashboardUserRow {
  id: string;
  email: string;
  role: DashboardRole;
  status: DashboardUserStatus;
  totp_enabled: boolean;
}

interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: DashboardUserRow | null; error: { message: string } | null }>;
      };
    };
  };
}

export async function getDashboardUserByEmail(email: string): Promise<DashboardUser | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  try {
    const supabase = createSupabaseServiceRoleClient() as unknown as SupabaseLike;
    const { data, error } = await supabase
      .from("dashboard_users")
      .select("id, email, role, status, totp_enabled")
      .eq("email_normalized", normalizedEmail)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      email: data.email,
      role: data.role,
      status: data.status,
      totpEnabled: data.totp_enabled,
    };
  } catch {
    return null;
  }
}
