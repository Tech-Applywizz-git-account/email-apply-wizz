import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const requireOperationsAccess = vi.fn();
const submitReviewDecision = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/dashboardAuth/requireOperationsAccess", () => ({ requireOperationsAccess }));
vi.mock("@/lib/zoho/reviewCorrection", () => ({ submitReviewDecision }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

function form(decision: string, category?: string): FormData {
  const data = new FormData();
  data.set("decision", decision);
  if (category) data.set("category", category);
  return data;
}

describe("reviewAction", () => {
  beforeEach(() => {
    requireOperationsAccess.mockReset();
    submitReviewDecision.mockReset();
    revalidatePath.mockReset();
    redirect.mockClear();
    submitReviewDecision.mockResolvedValue({ ok: true });
  });

  it("denies unauthenticated requests before mutation", async () => {
    requireOperationsAccess.mockRejectedValue(new Error("REDIRECT:/?expired=1"));
    const { reviewAction } = await import("./review-actions");

    await expect(reviewAction("email-1", form("confirm"))).rejects.toThrow("REDIRECT:/?expired=1");

    expect(submitReviewDecision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("denies CA requests before mutation", async () => {
    requireOperationsAccess.mockRejectedValue(new Error("REDIRECT:/access-pending"));
    const { reviewAction } = await import("./review-actions");

    await expect(reviewAction("email-1", form("confirm"))).rejects.toThrow("REDIRECT:/access-pending");

    expect(submitReviewDecision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("allows manager requests to submit the review", async () => {
    requireOperationsAccess.mockResolvedValue({ user: { role: "manager_ops" } });
    const { reviewAction } = await import("./review-actions");

    await expect(reviewAction("email-1", form("confirm"))).rejects.toThrow("REDIRECT:/operations/interviews/email-1?review=saved");

    expect(submitReviewDecision).toHaveBeenCalledWith({
      id: "email-1",
      decision: "confirm",
      newCategory: undefined,
      correctionReason: undefined,
      reviewedBy: "admin",
    });
  });

  it("allows admin requests to submit the review", async () => {
    requireOperationsAccess.mockResolvedValue({ user: { role: "admin_ceo" } });
    const { reviewAction } = await import("./review-actions");

    await expect(reviewAction("email-1", form("change_category", "assessment"))).rejects.toThrow(
      "REDIRECT:/operations/interviews/email-1?review=saved",
    );

    expect(submitReviewDecision).toHaveBeenCalledWith({
      id: "email-1",
      decision: "change_category",
      newCategory: "assessment",
      correctionReason: undefined,
      reviewedBy: "admin",
    });
  });
});
