"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperationsAccess } from "@/lib/dashboardAuth/requireOperationsAccess";
import { submitReviewDecision, type ReviewDecision } from "@/lib/zoho/reviewCorrection";

export async function reviewAction(id: string, formData: FormData) {
  await requireOperationsAccess();

  const decision = formData.get("decision") as ReviewDecision;
  const newCategory = formData.get("category")?.toString();
  const correctionReason = formData.get("correction_reason")?.toString();

  if (decision === "change_category" && !newCategory) {
    redirect(`/operations/interviews/${id}?review=missing_category`);
  }

  const result = await submitReviewDecision({
    id,
    decision,
    newCategory: newCategory || undefined,
    correctionReason: correctionReason || undefined,
    reviewedBy: "admin",
  });

  if (!result.ok) {
    const review =
      result.code === "INVALID_CATEGORY"
        ? "invalid_category"
        : result.code === "ROW_NOT_FOUND"
          ? "row_not_found"
          : "save_failed";

    redirect(`/operations/interviews/${id}?review=${review}`);
  }

  revalidatePath(`/operations/interviews/${id}`);
  redirect(`/operations/interviews/${id}?review=saved`);
}
