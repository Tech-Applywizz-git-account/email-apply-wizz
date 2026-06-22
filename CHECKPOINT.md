# ApplyWizard Email Tracker — Phase 5A Checkpoint

This document serves as the final checkpoint for Phase 5A of the **ApplyWizard Email Tracker** project.

---

## 1. Current Phase Completed

### Phase 5A: Store Safe Email Metadata Only
- **Database Schema Migration:** Created table `public.zoho_email_metadata` to securely store mailbox messages without email bodies or classifications. Added an RLS check allowing access strictly via the `service_role` credential. Applied the migration successfully to the remote project using the Supabase CLI (`db push`).
- **Upsert Deduplication:** Implemented unique constraint on `(mailbox_email, message_id)`. Subsequent reads update the `last_seen_at` and `updated_at` timestamps instead of producing duplicate rows.
- **Sync endpoint:** Created `POST /api/zoho/emails/sync/test` to query the latest page of Zoho emails, evaluate existing DB entries, perform upsert, and return dynamic status counts (`fetched`, `inserted`, `updated`, `skipped`).
- **Security Check Compliance:** Excluded raw bodies, attachments, verification codes, access/refresh tokens, and credentials from all databases, responses, and console logs.

---

## 2. Commit History

Below are the recent commits on the current branch (`main`):

- **`cf4fc0d`** Phase 5A: implement zoho_email_metadata schema and POST /api/zoho/emails/sync/test route
- **`230175d`** docs: create Phase 4C final checkpoint
- **`acc7e87`** Phase 4C: implement GET /api/zoho/emails/test/[messageId] safe email detail route
- **`5e6a50e`** docs: create Phase 4B final checkpoint
- **`138e98a`** Phase 4B: implement GET /api/zoho/emails/test safe email fetching route

---

## 3. Environment Variables Required

The following environment variables are specified in `.env.example` and are required for full system operation:

```ini
# -- Zoho OAuth (Phase 2, 4A, 4B, 4C & 5A) --
ZOHO_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZOHO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
ZOHO_REDIRECT_URI=https://applywizard.ai/api/zoho/callback
ZOHO_ACCOUNTS_BASE_URL=https://accounts.zoho.in
ZOHO_MAIL_BASE_URL=https://mail.zoho.in/api
ZOHO_ADMIN_EMAIL=ramakrishn@applywizard.ai

# -- AI Classification (Phase 3) --
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE (Optional)

# -- Supabase (Phase 4A, 4B, 4C & 5A) --
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

---

## 4. Known Limitations

- **No Stored Email Body Content:** The database only stores metadata. Email bodies and HTML content are retrieved dynamically on-demand if requested by Phase 4C details endpoint and are not persisted.
- **No Automatic AI Classification Trigger:** Newly synced emails are stored in database as synced but do not trigger AI categorization yet.

---

## 5. Next Recommended Phase

### Phase 5B: AI Classification & Pipeline Sync
1. Modify the sync pipeline so that newly inserted or modified records (especially those with status changes or new message detections) are passed through the Phase 3 AI Email Classifier (`lib/classify/aiClassifier.ts`).
2. Add a `category`, `confidence`, `source_portal`, and `needs_human_review` column to the `zoho_email_metadata` table.
3. Persist classification outcomes to `zoho_email_metadata` columns during the sync flow.
