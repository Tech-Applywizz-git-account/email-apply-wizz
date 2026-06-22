import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/zoho/callback
 *
 * Zoho redirects here after the user approves access on Zoho's login page.
 * This route exchanges the one-time authorization code for an access token
 * and a refresh token — entirely server-side so secrets stay on the server.
 *
 * Security rule: full token values are NEVER logged or returned to the browser.
 * Only boolean receipt status and expires_in are logged.
 *
 * Required environment variables:
 *   ZOHO_CLIENT_ID
 *   ZOHO_CLIENT_SECRET
 *   ZOHO_REDIRECT_URI
 *   ZOHO_ACCOUNTS_BASE_URL
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Zoho sends an error param if the user denied access or something went wrong.
  const zohoError = searchParams.get("error");
  if (zohoError) {
    console.error("[Zoho OAuth] Zoho returned an error:", zohoError);
    return NextResponse.json(
      { error: `Zoho returned an error: ${zohoError}` },
      { status: 400 }
    );
  }

  // The authorization code is required to proceed.
  if (!code) {
    console.error("[Zoho OAuth] No authorization code received from Zoho.");
    return NextResponse.json(
      { error: "Missing authorization code. Please try the login flow again." },
      { status: 400 }
    );
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const accountsBaseUrl = process.env.ZOHO_ACCOUNTS_BASE_URL;

  // Guard: all four env vars must be present to exchange the code.
  if (!clientId || !clientSecret || !redirectUri || !accountsBaseUrl) {
    console.error(
      "[Zoho OAuth] Missing environment variables for token exchange."
    );
    return NextResponse.json(
      {
        error:
          "Zoho OAuth is not fully configured on the server. " +
          "Check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REDIRECT_URI, " +
          "and ZOHO_ACCOUNTS_BASE_URL.",
      },
      { status: 500 }
    );
  }

  // Exchange the one-time code for access + refresh tokens.
  // This POST goes from our server to Zoho — never through the browser.
  const tokenUrl = `${accountsBaseUrl}/oauth/v2/token`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  let tokenData: Record<string, unknown>;

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    tokenData = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    // Network or parse error — do not expose details to the browser.
    console.error("[Zoho OAuth] Token exchange network error:", err);
    return NextResponse.json(
      { error: "Failed to reach Zoho for token exchange. Try again later." },
      { status: 502 }
    );
  }

  // ── Safe logging rule ──────────────────────────────────────────────────────
  // Never log access_token or refresh_token values.
  // Only log boolean receipt status and expires_in.
  console.log(
    "[Zoho OAuth] access_token_received:",
    Boolean(tokenData.access_token)
  );
  console.log(
    "[Zoho OAuth] refresh_token_received:",
    Boolean(tokenData.refresh_token)
  );
  console.log(
    "[Zoho OAuth] expires_in:",
    tokenData.expires_in ?? "not provided"
  );
  // ──────────────────────────────────────────────────────────────────────────

  // If Zoho did not return an access token the exchange failed.
  if (!tokenData.access_token) {
    console.error(
      "[Zoho OAuth] Token exchange failed. Zoho did not return an access_token."
    );
    return NextResponse.json(
      {
        error:
          "Token exchange failed. " +
          "Check that your Client ID, Client Secret, and Redirect URI " +
          "exactly match what is registered in the Zoho API Console.",
      },
      { status: 400 }
    );
  }

  // Tokens received. Storage comes in Phase 4 (Supabase).
  return NextResponse.json(
    { message: "Zoho OAuth complete. Tokens received safely." },
    { headers: { "Cache-Control": "no-store" } }
  );
}
