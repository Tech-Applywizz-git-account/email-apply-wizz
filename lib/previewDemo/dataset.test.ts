import { describe, expect, it } from "vitest";

import {
  PREVIEW_DEMO_CHECKPOINT_MAILBOX,
  PREVIEW_DEMO_MARKER,
  buildPreviewDemoDataset,
  type PreviewDemoStatus,
} from "./dataset";
import { resolvePreviewDemoGuard } from "../../scripts/preview-demo/seed-preview-demo";

const NOW = new Date("2026-07-13T12:00:00.000Z");
const ALLOWED_STATUSES: PreviewDemoStatus[] = [
  "pending",
  "processing",
  "retry_scheduled",
  "classified",
  "review",
  "dead_letter",
  "historical_ingested",
];
const ALLOWED_PRIORITIES = new Set([null, "critical", "high", "normal", "low"]);
const ALLOWED_ROUTING = new Set(["pending", "routed", "unroutable", "unmatched", "internal"]);

describe("preview demo dataset", () => {
  const { emails, checkpoint, marker } = buildPreviewDemoDataset(NOW);

  it("produces roughly 20-30 marked synthetic rows plus one checkpoint", () => {
    expect(emails.length).toBeGreaterThanOrEqual(20);
    expect(emails.length).toBeLessThanOrEqual(30);
    expect(marker).toBe(PREVIEW_DEMO_MARKER);
    expect(checkpoint.last_seen_message_id).toBe(PREVIEW_DEMO_MARKER);
    expect(checkpoint.mailbox_email).toBe(PREVIEW_DEMO_CHECKPOINT_MAILBOX);
    expect(checkpoint.last_successful_sync_at).toBeTruthy();
  });

  it("marks every row and uses only synthetic identifiers", () => {
    for (const row of emails) {
      expect(row.folder_id).toBe(PREVIEW_DEMO_MARKER);
      expect(row.message_id.startsWith("preview-demo-")).toBe(true);
      expect(row.mailbox_email.endsWith("@example.test")).toBe(true);
      expect(row.sender.endsWith(".example.test")).toBe(true);
    }
  });

  it("contains no real-looking PII or reserved production domains", () => {
    const blob = JSON.stringify(emails).toLowerCase();
    for (const banned of ["applywizz", "applywizard", "@gmail", "@outlook", "zoho", "nkkfsrhfttixwjbglhgg"]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("respects enum/check constraints for status, priority, and routing", () => {
    for (const row of emails) {
      expect(ALLOWED_STATUSES).toContain(row.classification_status);
      expect(ALLOWED_PRIORITIES.has(row.priority as string | null)).toBe(true);
      expect(ALLOWED_ROUTING.has(row.routing_status)).toBe(true);
      expect(["incoming", "outgoing"]).toContain(row.email_direction);
    }
  });

  it("covers every dashboard queue/status and a deadline-tomorrow item", () => {
    const statuses = new Set(emails.map((row) => row.classification_status));
    for (const required of ["pending", "processing", "retry_scheduled", "classified", "review", "dead_letter"]) {
      expect(statuses.has(required as PreviewDemoStatus)).toBe(true);
    }
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(emails.some((row) => row.deadline === tomorrow)).toBe(true);
  });

  it("spreads received_at across today, yesterday, last 7/30 days, and older", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const ageDays = (iso: string) => (NOW.getTime() - new Date(iso).getTime()) / dayMs;
    const ages = emails.map((row) => ageDays(row.received_at));
    expect(ages.some((d) => d < 1)).toBe(true); // today
    expect(ages.some((d) => d >= 1 && d < 2)).toBe(true); // yesterday
    expect(ages.some((d) => d >= 2 && d < 7)).toBe(true); // last 7d
    expect(ages.some((d) => d >= 7 && d < 30)).toBe(true); // last 30d
    expect(ages.some((d) => d >= 30)).toBe(true); // older
  });

  it("sets classified_at only on classified rows and queue timestamps on their statuses", () => {
    for (const row of emails) {
      if (row.classification_status === "classified") {
        expect(row.classified_at).toBeTruthy();
      }
      if (row.classification_status === "retry_scheduled") expect(row.next_retry_at).toBeTruthy();
      if (row.classification_status === "processing") expect(row.claim_expires_at).toBeTruthy();
      if (row.classification_status === "dead_letter") expect(row.dead_lettered_at).toBeTruthy();
    }
  });
});

describe("preview demo guard", () => {
  const base = {
    SUPABASE_PROJECT_REF: "obirkjbzpykoehxacaaj",
    NEXT_PUBLIC_SUPABASE_URL: "https://obirkjbzpykoehxacaaj.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-key",
  } as NodeJS.ProcessEnv;

  it("passes for the Preview project", () => {
    expect(resolvePreviewDemoGuard(base)).toEqual({ ok: true });
  });

  it("refuses when the declared project ref is not Preview", () => {
    expect(resolvePreviewDemoGuard({ ...base, SUPABASE_PROJECT_REF: "" })).toEqual({
      ok: false,
      code: "SUPABASE_PROJECT_REF_NOT_PREVIEW",
    });
  });

  it("refuses when the Supabase URL points at Production", () => {
    expect(
      resolvePreviewDemoGuard({
        ...base,
        SUPABASE_PROJECT_REF: "obirkjbzpykoehxacaaj",
        NEXT_PUBLIC_SUPABASE_URL: "https://nkkfsrhfttixwjbglhgg.supabase.co",
      }),
    ).toEqual({ ok: false, code: "REFUSING_PRODUCTION" });
  });

  it("refuses when the service-role key is missing", () => {
    expect(resolvePreviewDemoGuard({ ...base, SUPABASE_SERVICE_ROLE_KEY: "" })).toEqual({
      ok: false,
      code: "MISSING_SERVICE_ROLE_KEY",
    });
  });
});
