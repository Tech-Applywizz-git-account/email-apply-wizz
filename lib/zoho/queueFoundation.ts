const CLAIM_TTL_SECONDS = 10 * 60;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60] as const;

export type QueueStatus =
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "classified"
  | "review"
  | "dead_letter";

interface RpcClient {
  rpc: (
    fn: string,
    args: Record<string, string | number>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

interface UpdateClient {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: QueueStatus) => {
            gt: (column: string, value: string) => {
              select: (columns: string) => {
                maybeSingle: () => Promise<{
                  data: { id: string } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
}

export interface RetryDisposition {
  status: "retry_scheduled" | "dead_letter";
  nextRetryAt: string | null;
  deadLetteredAt: string | null;
}

export function getRetryDisposition(
  attemptCount: number,
  nowIso = new Date().toISOString(),
): RetryDisposition {
  if (attemptCount >= 5) {
    return {
      status: "dead_letter",
      nextRetryAt: null,
      deadLetteredAt: nowIso,
    };
  }

  const delayMinutes = RETRY_DELAYS_MINUTES[Math.max(0, attemptCount - 1)] ?? 60;
  const nextRetryAt = new Date(
    new Date(nowIso).getTime() + delayMinutes * 60 * 1000,
  ).toISOString();

  return {
    status: "retry_scheduled",
    nextRetryAt,
    deadLetteredAt: null,
  };
}

export async function claimEmailsForClassification(
  supabase: RpcClient,
  mailboxEmail: string,
  workerId: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc("claim_zoho_email_rows", {
    p_mailbox_email: mailboxEmail,
    p_worker_id: workerId,
    p_limit: limit,
    p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
  });

  if (error) {
    throw new Error(`Failed to claim queue rows: ${error.message}`);
  }

  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export async function updateClaimedEmail(
  supabase: UpdateClient,
  args: {
    id: string;
    workerId: string;
    nowIso: string;
    payload: Record<string, unknown>;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("zoho_email_metadata")
    .update(args.payload)
    .eq("id", args.id)
    .eq("claimed_by", args.workerId)
    .eq("classification_status", "processing")
    .gt("claim_expires_at", args.nowIso)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update claimed email: ${error.message}`);
  }

  return Boolean(data?.id);
}
