import { type NextRequest, NextResponse } from "next/server";
import { syncTrackerMailbox } from "@/lib/worker-core/syncTrackerMailbox";
import { requireApiRole } from "@/lib/dashboardAuth/apiAuth";

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(request, ["admin_ceo"]);
  if (!auth.ok) return auth.response;

  try {
    const result = await syncTrackerMailbox();
    return NextResponse.json({ message: "Sync complete", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Zoho Mail Sync] Error:", message);
    const status =
      message.includes("No active Zoho connection") ? 404
      : message.includes("configuration is incomplete") ? 500
      : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
