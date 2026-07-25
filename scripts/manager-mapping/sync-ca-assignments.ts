// sync:manager-mapping — manual CA capacity API → manager_ca_assignments sync runner.
//
//   npm run sync:manager-mapping
//
// Output is aggregate-only: counts and a deterministic error code. Never
// prints credentials, raw API responses, or CA/manager email addresses.

import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { syncCaAssignments } from "@/lib/managerMapping/syncCaAssignments";

async function main(): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const report = await syncCaAssignments(supabase as never);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch(() => {
  // Never print the raw error — it could embed request/config details.
  console.error("[sync:manager-mapping] SYNC_UNEXPECTED_ERROR");
  process.exitCode = 1;
});
