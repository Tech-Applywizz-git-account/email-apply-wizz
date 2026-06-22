# ApplyWizard Email Tracker — Phase 4B Checkpoint

This document serves as the final checkpoint for Phase 4B of the **ApplyWizard Email Tracker** project.

---

## 1. Current Phase Completed

### Phase 4B: Read One Page of Zoho Emails Only
- **Safe Fetching Route:** Implemented `GET /api/zoho/emails/test` to retrieve one page (latest 10 emails) from the active Zoho connection.
- **Automatic Token Refresh:** Checks the token expiration (with a 5-minute safety buffer) and refreshes it automatically from Zoho's OAuth endpoint if expired, saving the refreshed access token and updated expiry times back to the database.
- **Safe JSON Schema:** Maps Zoho messages to a sanitised schema returning only safe metadata (`messageId`, `from`, `subject`, `receivedAt`, `folder`). Secrets and access/refresh tokens are never logged or returned.
- **Robust Endpoint Parsing:** Uses `/messages/view` to list emails from Zoho's Mail API conforming to the specified region/endpoint specification.
- **End-to-End Verification:** Verified the complete pipeline including clean token fetch and automatic refresh logic after database token expiry tests.

---

## 2. Commit History

Below are the recent commits on the current branch (`main`):

- **`138e98a`** Phase 4B: implement GET /api/zoho/emails/test safe email fetching route
- **`b619b05`** Phase 4A: secure Zoho connection token storage in Supabase and OAuth state validation
- **`e7dc366`** docs: create Phase 3 final checkpoint
- **`2c097e2`** docs: add Phase 3 testing results documentation
- **`1311a9d`** Phase 3: implement POST /api/classify/test with regex + GPT-4o-mini pipeline

---

## 3. Environment Variables Required

The following environment variables are specified in `.env.example` and are required for full system operation:

```ini
# -- Zoho OAuth (Phase 2, 4A, & 4B) --
ZOHO_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZOHO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
ZOHO_REDIRECT_URI=https://applywizard.ai/api/zoho/callback
ZOHO_ACCOUNTS_BASE_URL=https://accounts.zoho.in
ZOHO_MAIL_BASE_URL=https://mail.zoho.in/api
ZOHO_ADMIN_EMAIL=ramakrishn@applywizard.ai

# -- AI Classification (Phase 3) --
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE (Optional)

# -- Supabase (Phase 4A & 4B) --
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

---

## 4. Known Limitations

- **No Persistent Message Syncing:** Emails are fetched dynamically on-demand through the test route and are not yet stored in a persistent database table.
- **No Background Scheduler:** There is currently no cron job or background scheduler fetching and processing emails in the background.

---

## 5. Next Recommended Phase

### Phase 4C: Persistent Sync & Deduplication
1. Create an `emails` table in Supabase to persist email metadata and classification outcomes.
2. Implement a background job (or manual sync endpoint) to fetch emails, identify new ones (deduplication based on `messageId`), and store them in the database.
3. Pass new emails through the Phase 3 AI Email Classification pipeline before database insertion.
