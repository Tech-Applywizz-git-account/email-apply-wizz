import { NextResponse } from "next/server";

/**
 * GET /api/zoho/login
 *
 * Redirects the browser to Zoho's OAuth authorization page.
 * The user logs in to Zoho there and approves access.
 * Zoho then redirects back to /api/zoho/callback with a one-time code.
 *
 * Required environment variables:
 *   ZOHO_CLIENT_ID
 *   ZOHO_REDIRECT_URI
 *   ZOHO_ACCOUNTS_BASE_URL
 */
export function GET(): NextResponse {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;
  const accountsBaseUrl = process.env.ZOHO_ACCOUNTS_BASE_URL;

  // Guard: all three env vars must be present before redirecting.
  if (!clientId || !redirectUri || !accountsBaseUrl) {
    console.error(
      "[Zoho OAuth] Missing environment variables: " +
        "ZOHO_CLIENT_ID, ZOHO_REDIRECT_URI, or ZOHO_ACCOUNTS_BASE_URL."
    );
    return NextResponse.json(
      {
        error:
          "Zoho OAuth is not configured. " +
          "Check that ZOHO_CLIENT_ID, ZOHO_REDIRECT_URI, and " +
          "ZOHO_ACCOUNTS_BASE_URL are set in your environment.",
      },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();

  // Build Zoho's authorization URL.
  // access_type=offline requests a refresh token so the app can
  // read emails without the user re-logging in every hour.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "ZohoMail.messages.READ,ZohoMail.accounts.READ",
    access_type: "offline",
    state,
  });

  const authUrl = `${accountsBaseUrl}/oauth/v2/auth?${params.toString()}`;
  const response = NextResponse.redirect(authUrl);

  response.cookies.set("zoho_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/zoho/callback",
    maxAge: 600,
  });

  return response;
}
