import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const loginResponse = await fetch(`${baseUrl}/api/zoho/login`, {
  redirect: "manual",
});

assert.equal(loginResponse.status, 307, "Zoho login should redirect");

const location = loginResponse.headers.get("location");
const setCookie = loginResponse.headers.get("set-cookie");
assert.ok(location, "Zoho login should include a redirect location");
assert.ok(setCookie, "Zoho login should set an OAuth state cookie");

const state = new URL(location).searchParams.get("state");
const cookieState = /zoho_oauth_state=([^;]+)/.exec(setCookie)?.[1];
assert.ok(state, "Zoho authorization URL should include state");
assert.equal(cookieState, state, "OAuth state cookie and URL should match");
assert.match(setCookie, /HttpOnly/i);
assert.match(setCookie, /SameSite=lax/i);

const callbackResponse = await fetch(
  `${baseUrl}/api/zoho/callback?code=test-code&state=wrong-state`,
  { headers: { Cookie: `zoho_oauth_state=${cookieState}` } },
);
const callbackBody = await callbackResponse.json();

assert.equal(callbackResponse.status, 400);
assert.equal(
  callbackBody.error,
  "Invalid OAuth state. Please start the login flow again.",
);

console.log("Phase 4A OAuth state check passed.");
