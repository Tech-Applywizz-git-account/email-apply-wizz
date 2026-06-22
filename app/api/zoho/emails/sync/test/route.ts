import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ZohoEmailItem {
  messageId: string;
  sender: string;
  fromAddress?: string;
  subject: string;
  receivedTime: string | number;
  folderName?: string;
  folderId?: string;
  hasAttachment?: string | number;
}

interface ZohoAPIResponse<T> {
  status: {
    code: number;
    description: string;
  };
  data?: T;
}

export async function POST() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const accountsBaseUrl = process.env.ZOHO_ACCOUNTS_BASE_URL;
  const mailBaseUrl = process.env.ZOHO_MAIL_BASE_URL;

  if (!clientId || !clientSecret || !accountsBaseUrl || !mailBaseUrl) {
    console.error("[Zoho Mail Sync] Missing required Zoho API configuration env vars.");
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
    console.error("[Zoho Mail Sync] Failed to query zoho_connections:", connError.message);
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
    console.log(`[Zoho Mail Sync] Access token expired or near expiry. Refreshing...`);

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
          "[Zoho Mail Sync] Token refresh failed:",
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

      console.log("[Zoho Mail Sync] refresh access_token_received:", Boolean(newAccessToken));

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
          "[Zoho Mail Sync] Failed to update refreshed token in database:",
          updateError.message,
        );
        return NextResponse.json(
          { error: "Failed to persist refreshed access token." },
          { status: 500 },
        );
      }

      console.log("[Zoho Mail Sync] Token successfully refreshed and persisted.");
    } catch (error) {
      console.error(
        "[Zoho Mail Sync] Error during token refresh request:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return NextResponse.json(
        { error: "Failed to connect to Zoho for token refresh." },
        { status: 502 },
      );
    }
  }

  // Fetch one page of emails from Zoho Mail API
  const zohoAccountId = connection.zoho_account_id;
  try {
    const emailsUrl = `${mailBaseUrl}/accounts/${zohoAccountId}/messages/view?limit=10`;
    console.log(`[Zoho Mail Sync] Fetching latest emails from: ${emailsUrl.replace(zohoAccountId, "ANONYMIZED_ID")}`);

    const emailResponse = await fetch(emailsUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });

    const parsedPayload = (await emailResponse.json()) as ZohoAPIResponse<ZohoEmailItem[]>;

    if (!emailResponse.ok || parsedPayload.status?.code !== 200) {
      console.error(
        "[Zoho Mail Sync] Zoho messages request failed status:",
        emailResponse.status,
        parsedPayload.status,
      );
      return NextResponse.json(
        { error: "Failed to retrieve emails from Zoho." },
        { status: 502 },
      );
    }

    const messages = Array.isArray(parsedPayload.data) ? parsedPayload.data : [];

    if (messages.length === 0) {
      return NextResponse.json({
        message: "Sync complete",
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
      });
    }

    // Read existing metadata records to determine inserted/updated counts
    const messageIds = messages.map((item) => item.messageId);
    const { data: existingRecords, error: existingError } = await supabase
      .from("zoho_email_metadata")
      .select("message_id")
      .eq("mailbox_email", connection.email_address)
      .in("message_id", messageIds);

    if (existingError) {
      console.error(
        "[Zoho Mail Sync] Failed to query existing metadata:",
        existingError.message,
      );
      return NextResponse.json(
        { error: "Failed to query database for existing emails." },
        { status: 500 },
      );
    }

    const existingMsgIds = new Set(existingRecords?.map((r) => r.message_id) || []);

    let insertedCount = 0;
    let updatedCount = 0;
    const skippedCount = 0;

    const upsertPayload = [];

    const nowTime = new Date().toISOString();

    for (const item of messages) {
      const receivedTime = Number(item.receivedTime);
      const receivedAt = Number.isFinite(receivedTime)
        ? new Date(receivedTime).toISOString()
        : nowTime;
      const hasAttachments =
        item.hasAttachment === "1" ||
        item.hasAttachment === 1 ||
        Boolean(Number(item.hasAttachment));

      const isExisting = existingMsgIds.has(item.messageId);
      if (isExisting) {
        updatedCount++;
      } else {
        insertedCount++;
      }

      upsertPayload.push({
        zoho_connection_id: connection.id,
        mailbox_email: connection.email_address,
        message_id: item.messageId,
        sender: item.sender || item.fromAddress || "unknown",
        subject: item.subject || "(No Subject)",
        received_at: receivedAt,
        folder_id: item.folderId || "unknown",
        folder_name: item.folderName || "Inbox",
        has_attachments: hasAttachments,
        attachment_count: hasAttachments ? 1 : 0,
        sync_status: "synced",
        last_seen_at: nowTime,
        updated_at: nowTime,
      });
    }

    // Upsert safe metadata into zoho_email_metadata
    const { error: upsertError } = await supabase
      .from("zoho_email_metadata")
      .upsert(upsertPayload, {
        onConflict: "mailbox_email,message_id",
      });

    if (upsertError) {
      console.error("[Zoho Mail Sync] Failed to upsert email metadata:", upsertError.message);
      return NextResponse.json(
        { error: "Failed to persist email metadata to database." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Sync complete",
      fetched: messages.length,
      inserted: insertedCount,
      updated: updatedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error(
      "[Zoho Mail Sync] Error retrieving/syncing messages:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Failed to sync Zoho messages due to a server error." },
      { status: 502 },
    );
  }
}
