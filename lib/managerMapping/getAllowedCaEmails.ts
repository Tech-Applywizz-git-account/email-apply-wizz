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
