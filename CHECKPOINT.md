# ApplyWizard Email Tracker — Phase 4A Checkpoint

This document serves as the final checkpoint for Phase 4A of the **ApplyWizard Email Tracker** project.

---

## 1. Current Phase Completed

### Phase 4A: Secure Zoho Connection Storage (Supabase Setup & OAuth State Validation)
- **Supabase CLI Initialized:** Supabase configuration (`supabase/config.toml`) and initial database migrations (`supabase/migrations/202606230001_create_zoho_connections.sql`) have been configured.
- **Database Schema:** Defined the `zoho_connections` table to securely house candidate account metadata, access/refresh tokens, and sync status under standard RLS rules (accessible only by the `service_role` key).
- **OAuth State Protection:** Implemented cookie-based OAuth `state` generation and matching (`app/api/zoho/login/route.ts` and `app/api/zoho/callback/route.ts`) to prevent CSRF attacks.
- **Supabase Client Utility:** Added the server-only Supabase client initialization helper in `lib/supabase/server.ts`.
- **Token Upsertion:** Updated the Zoho callback route to exchange codes for access/refresh tokens, retrieve the primary Zoho email/account metadata, and upsert the connection securely into Supabase.
- **Verification Scripts:** Added the script `scripts/check-phase4a.mjs` to automate state verification tests.

---

## 2. Commit History

Below are the recent commits on the current branch (`main`):

- **`b619b05`** Phase 4A: secure Zoho connection token storage in Supabase and OAuth state validation
- **`e7dc366`** docs: create Phase 3 final checkpoint
- **`2c097e2`** docs: add Phase 3 testing results documentation
- **`1311a9d`** Phase 3: implement POST /api/classify/test with regex + GPT-4o-mini pipeline
- **`e635fb1`** Phase 3 plan: confirm categories, AI model, and DeepSeek placeholder

---

## 3. Environment Variables Required

The following environment variables are specified in `.env.example` and are required for full system operation:

```ini
# -- Zoho OAuth (Phase 2 & 4A) --
ZOHO_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZOHO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
ZOHO_REDIRECT_URI=https://applywizard.ai/api/zoho/callback
ZOHO_ACCOUNTS_BASE_URL=https://accounts.zoho.in
ZOHO_MAIL_BASE_URL=https://mail.zoho.in/api
ZOHO_ADMIN_EMAIL=ramakrishn@applywizard.ai

# -- AI Classification (Phase 3) --
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE (Optional)

# -- Supabase (Phase 4A) --
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

---

## 4. Known Limitations

- **Supabase Link & Auth Pending:** The CLI linking has not been completed because the local Supabase URL is still a placeholder and the CLI is not yet authenticated with the remote project.
- **To resolve this, run:**
  ```bash
  npx supabase login
  npx supabase link --project-ref YOUR_PROJECT_REF
  npx supabase db push
  npx supabase migration list
  ```
- **No Email Retrieval:** The connection metadata is successfully stored in the database, but fetching/syncing real emails from Zoho Mail is deferred to Phase 4B.

---

## 5. Next Recommended Phase

### Phase 4B: Zoho Mail Reading & Syncing
1. Implement a scheduler or polling job to fetch emails from Zoho Mail using stored access tokens.
2. Build auto-refresh token mechanics when Zoho calls return token expiry errors.
3. Classify fetched emails using the Phase 3 pipeline.
4. Persist email metadata and classification results to a new `emails` table in Supabase.
