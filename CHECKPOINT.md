# ApplyWizard Email Tracker — Phase 4C Checkpoint

This document serves as the final checkpoint for Phase 4C of the **ApplyWizard Email Tracker** project.

---

## 1. Current Phase Completed

### Phase 4C: Inspect One Email’s Safe Content Only
- **Safe Detail Route:** Implemented `GET /api/zoho/emails/test/[messageId]?folderId=[folderId]` to retrieve details and body content of a specific email using the folder ID and message ID.
- **Payload Mapping:** Merges Zoho's `/details` and `/content` endpoints to return a sanitised response: `messageId`, `from`, `to`, `cc`, `subject`, `receivedAt`, `folder`, `bodyText` (stripped of HTML tags), `bodyHtml` (raw message content HTML), `hasAttachments`, and `attachmentCount`.
- **Recipient Parsing:** Extracts clean recipient addresses from raw address metadata headers using a custom parser.
- **Listing Update:** Modified `/api/zoho/emails/test` (Phase 4B listing route) to return `folderId` as safe metadata for each message item, enabling simple query parameter lookup for the detail route.
- **End-to-End Verification:** Verified single email retrieval and checked all output fields for correct structure and safety compliance.

---

## 2. Commit History

Below are the recent commits on the current branch (`main`):

- **`acc7e87`** Phase 4C: implement GET /api/zoho/emails/test/[messageId] safe email detail route
- **`5e6a50e`** docs: create Phase 4B final checkpoint
- **`138e98a`** Phase 4B: implement GET /api/zoho/emails/test safe email fetching route
- **`d5eb2c0`** docs: update Phase 4A final checkpoint
- **`b619b05`** Phase 4A: secure Zoho connection token storage in Supabase and OAuth state validation

---

## 3. Environment Variables Required

The following environment variables are specified in `.env.example` and are required for full system operation:

```ini
# -- Zoho OAuth (Phase 2, 4A, 4B & 4C) --
ZOHO_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZOHO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
ZOHO_REDIRECT_URI=https://applywizard.ai/api/zoho/callback
ZOHO_ACCOUNTS_BASE_URL=https://accounts.zoho.in
ZOHO_MAIL_BASE_URL=https://mail.zoho.in/api
ZOHO_ADMIN_EMAIL=ramakrishn@applywizard.ai

# -- AI Classification (Phase 3) --
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE (Optional)

# -- Supabase (Phase 4A, 4B & 4C) --
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

---

## 4. Known Limitations

- **No Email Database Storage:** Individual email metadata and bodies are fetched dynamically on-demand through the test routes and are not saved in a persistent database table.
- **No Background Sync/Cron Jobs:** The system does not run background sync processes or check webhook updates to automatically retrieve and process emails.

---

## 5. Next Recommended Phase

### Phase 4D: AI Classification of Live Zoho Emails
1. Extend the dynamic inspection handler (or create a pipeline route) to pass fetched Zoho email contents into the Phase 3 classification engine (`lib/classify/aiClassifier.ts`).
2. Run live emails through deterministic regex parsing first, and fall back to GPT-4o-mini classification.
3. Validate classification response outputs and verify they return correct category and field extractions.
