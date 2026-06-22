import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tryRegexExtract } from "@/lib/classify/regexExtractor";
import { classifyWithAI } from "@/lib/classify/aiClassifier";

interface ZohoAPIResponse<T> {
  status: {
    code: number;
    description: string;
  };
  data?: T;
}

interface ZohoDetailsData {
  messageId: string;
  sender: string;
  fromAddress?: string;
  subject: string;
  receivedTime: string | number;
  toAddress?: string;
  ccAddress?: string;
  hasAttachment?: string | number;
  size?: string | number;
  folderId?: string;
}

interface ZohoContentData {
  messageId: string;
  content: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidISODate(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

export async function POST() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const accountsBaseUrl = process.env.ZOHO_ACCOUNTS_BASE_URL;
  const mailBaseUrl = process.env.ZOHO_MAIL_BASE_URL;

  if (!clientId || !clientSecret || !accountsBaseUrl || !mailBaseUrl) {
    console.error("[Zoho Mail Classify] Missing required Zoho API configuration env vars.");
    return NextResponse.json(
      { error: "Zoho API configuration is incomplete on the server." },
      { status: 500 },
    );
  }

  const supabase = createSupabaseServerClient();

  // Find the latest active Zoho connection
  const { data: connection, error: connError } = await supabase
    .from("zoho_connections")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connError) {
    console.error("[Zoho Mail Classify] Failed to query zoho_connections:", connError.message);
    return NextResponse.json(
      { error: "Failed to retrieve connection from database." },
      { status: 500 },
    );
  }

  if (!connection) {
    return NextResponse.json(
      { error: "No active Zoho connection found. Please log in first." },
      { status: 404 },
    );
  }

  let accessToken = connection.access_token;
  const expiresAt = new Date(connection.access_token_expires_at).getTime();
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minute buffer

  if (expiresAt < now + bufferTime) {
    console.log(`[Zoho Mail Classify] Access token expired or near expiry. Refreshing...`);

    try {
      const tokenResponse = await fetch(`${accountsBaseUrl}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: connection.refresh_token,
        }).toString(),
      });

      const parsed: unknown = await tokenResponse.json();

      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Invalid response format from Zoho token endpoint.");
      }

      const tokenData = parsed as Record<string, unknown>;

      if (!tokenResponse.ok || tokenData.error) {
        console.error(
          "[Zoho Mail Classify] Token refresh failed:",
          tokenData.error || tokenResponse.status,
        );
        return NextResponse.json(
          { error: "Failed to refresh Zoho access token." },
          { status: 400 },
        );
      }

      const newAccessToken =
        typeof tokenData.access_token === "string" && tokenData.access_token
          ? tokenData.access_token
          : null;
      const expiresIn = Number(tokenData.expires_in);

      console.log("[Zoho Mail Classify] refresh access_token_received:", Boolean(newAccessToken));

      if (!newAccessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        return NextResponse.json(
          { error: "Zoho returned incomplete data during token refresh." },
          { status: 400 },
        );
      }

      accessToken = newAccessToken;
      const refreshTime = new Date();
      const newExpiresAt = new Date(refreshTime.getTime() + expiresIn * 1000);

      // Save refreshed token details back to zoho_connections
      const { error: updateError } = await supabase
        .from("zoho_connections")
        .update({
          access_token: newAccessToken,
          access_token_expires_at: newExpiresAt.toISOString(),
          last_refresh_at: refreshTime.toISOString(),
          updated_at: refreshTime.toISOString(),
        })
        .eq("zoho_account_id", connection.zoho_account_id);

      if (updateError) {
        console.error(
          "[Zoho Mail Classify] Failed to update refreshed token in database:",
          updateError.message,
        );
        return NextResponse.json(
          { error: "Failed to persist refreshed access token." },
          { status: 500 },
        );
      }

      console.log("[Zoho Mail Classify] Token successfully refreshed and persisted.");
    } catch (error) {
      console.error(
        "[Zoho Mail Classify] Error during token refresh request:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return NextResponse.json(
        { error: "Failed to connect to Zoho for token refresh." },
        { status: 502 },
      );
    }
  }

  // Query up to 5 pending records from zoho_email_metadata
  const { data: pendingEmails, error: pendingError } = await supabase
    .from("zoho_email_metadata")
    .select("*")
    .eq("mailbox_email", connection.email_address)
    .eq("classification_status", "pending")
    .order("received_at", { ascending: false })
    .limit(5);

  if (pendingError) {
    console.error("[Zoho Mail Classify] Failed to query pending emails:", pendingError.message);
    return NextResponse.json(
      { error: "Failed to retrieve pending emails from database." },
      { status: 500 },
    );
  }

  const checkedCount = pendingEmails?.length || 0;
  let classifiedCount = 0;
  let failedCount = 0;
  const skippedCount = 0;

  const zohoAccountId = connection.zoho_account_id;

  for (const emailRecord of pendingEmails || []) {
    const messageId = emailRecord.message_id;
    const folderId = emailRecord.folder_id;

    try {
      const detailsUrl = `${mailBaseUrl}/accounts/${zohoAccountId}/folders/${folderId}/messages/${messageId}/details`;
      const contentUrl = `${mailBaseUrl}/accounts/${zohoAccountId}/folders/${folderId}/messages/${messageId}/content`;

      const [detailsRes, contentRes] = await Promise.all([
        fetch(detailsUrl, {
          headers: {
            Accept: "application/json",
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
        }),
        fetch(contentUrl, {
          headers: {
            Accept: "application/json",
            Authorization: `Zoho-oauthtoken ${accessToken}`,
          },
        }),
      ]);

      if (!detailsRes.ok || !contentRes.ok) {
        console.error(
          `[Zoho Mail Classify] Failed to fetch email from Zoho. Details: ${detailsRes.status}, Content: ${contentRes.status}`,
        );
        // Mark as failed in database
        await supabase
          .from("zoho_email_metadata")
          .update({
            classification_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", emailRecord.id);

        failedCount++;
        continue;
      }

      const [detailsPayload, contentPayload] = (await Promise.all([
        detailsRes.json(),
        contentRes.json(),
      ])) as [ZohoAPIResponse<ZohoDetailsData>, ZohoAPIResponse<ZohoContentData>];

      if (detailsPayload.status?.code !== 200 || contentPayload.status?.code !== 200) {
        console.error(
          "[Zoho Mail Classify] Zoho API returned non-success code:",
          detailsPayload.status,
          contentPayload.status,
        );
        await supabase
          .from("zoho_email_metadata")
          .update({
            classification_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", emailRecord.id);

        failedCount++;
        continue;
      }

      const details = detailsPayload.data;
      const contentData = contentPayload.data;

      if (!details || !contentData) {
        throw new Error("Zoho API response missing expected data fields.");
      }

      const subject = details.subject || "(No Subject)";
      const bodyHtml = contentData.content || "";
      const bodyText = stripHtml(bodyHtml);

      // Run regex/deterministic checks first
      let classification = tryRegexExtract({ subject, body: bodyText });

      if (classification) {
        console.log(`[Zoho Mail Classify] Regex classified message ${messageId} as ${classification.category}`);
      } else {
        // Fall back to AI classification
        console.log(`[Zoho Mail Classify] Falling back to AI for message ${messageId}`);
        classification = await classifyWithAI({ subject, body: bodyText });
      }

      // Save classification results back to zoho_email_metadata
      const parsedDeadline = isValidISODate(classification.deadline)
        ? classification.deadline
        : null;

      const { error: updateError } = await supabase
        .from("zoho_email_metadata")
        .update({
          category: classification.category,
          confidence: classification.confidence,
          source_portal: classification.source_portal,
          needs_human_review: classification.needs_human_review,
          action_required: classification.action_required,
          deadline: parsedDeadline,
          classified_at: new Date().toISOString(),
          classification_status: "classified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", emailRecord.id);

      if (updateError) {
        console.error(
          `[Zoho Mail Classify] Failed to save classification results for message ${messageId}:`,
          updateError.message,
        );
        await supabase
          .from("zoho_email_metadata")
          .update({
            classification_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", emailRecord.id);

        failedCount++;
      } else {
        classifiedCount++;
      }
    } catch (error) {
      console.error(
        `[Zoho Mail Classify] Error during classification of message ${messageId}:`,
        error instanceof Error ? error.message : "Unknown error",
      );
      await supabase
        .from("zoho_email_metadata")
        .update({
          classification_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", emailRecord.id);

      failedCount++;
    }
  }

  return NextResponse.json({
    message: "Classification complete",
    checked: checkedCount,
    classified: classifiedCount,
    failed: failedCount,
    skipped: skippedCount,
  });
}
