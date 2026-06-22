# ApplyWizard Email Tracker — Phase 5B.1 Checkpoint

This document serves as the final checkpoint for Phase 5B.1 of the **ApplyWizard Email Tracker** project.

---

## 1. Current Phase Completed

### Phase 5B.1: Retry Failed Classifications
- **Failed Status Retryable:** Modified the database query in `POST /api/zoho/emails/classify/test` to retrieve records with `classification_status` in `['pending', 'failed']` instead of strictly `pending`. This enables failed rows to be safely retried.
- **Graceful Error Handling:** If a record fails to classify again (e.g. due to OpenAI key or network failures), it safely remains in `failed` status and can be retried in subsequent sync executions.
- **Batched Execution:** Processes a small batch of up to 5 pending or failed records per invocation, skipping already `classified` rows.
- **Security Check Compliance:** Email body text, HTML content, attachments, and secrets are discarded immediately post-classification and are never stored or logged.

---

## 2. Commit History

Below are the recent commits on the current branch (`main`):

- **`0d1c445`** Phase 5B.1: enable retry for failed classifications by querying both pending and failed status values
- **`00ab960`** Phase 5B: implement metadata classification migration and POST /api/zoho/emails/classify/test route
- **`f81de73`** docs: create Phase 5A final checkpoint
- **`cf4fc0d`** Phase 5A: implement zoho_email_metadata schema and POST /api/zoho/emails/sync/test route
- **`230175d`** docs: create Phase 4C final checkpoint

---

## 3. Environment Variables Required

The following environment variables are specified in `.env.example` and are required for full system operation:

```ini
# -- Zoho OAuth (Phase 2, 4A, 4B, 4C, 5A, 5B & 5B.1) --
ZOHO_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZOHO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
ZOHO_REDIRECT_URI=https://applywizard.ai/api/zoho/callback
ZOHO_ACCOUNTS_BASE_URL=https://accounts.zoho.in
ZOHO_MAIL_BASE_URL=https://mail.zoho.in/api
ZOHO_ADMIN_EMAIL=ramakrishn@applywizard.ai

# -- AI Classification (Phase 3, 5B & 5B.1) --
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE (Optional)

# -- Supabase (Phase 4A, 4B, 4C, 5A, 5B & 5B.1) --
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

---

## 4. Known Limitations

- **No Email Body Persistence:** Email bodies and HTML content are discarded immediately after categorization and are never stored in the database.
- **Manual Scheduler Triggering:** Both email metadata syncing and email classification must be triggered manually via their respective test POST endpoints.

---

## 5. Next Recommended Phase

### Phase 6: Scheduler & Sync Orchestration
1. Automate the synchronization and classification flows into a single unified background daemon or scheduler cron job.
2. Build webhook or event-based syncing when Zoho Mail receives new incoming emails.
