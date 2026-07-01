export interface RecoverQueueResult {
  recovered: number;
  note: string;
}

export async function recoverQueue(): Promise<RecoverQueueResult> {
  return {
    recovered: 0,
    note: "Expired claims are reclaimed by classifyQueue during atomic queue claims.",
  };
}
