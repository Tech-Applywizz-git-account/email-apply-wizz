# ApplyWizard Email Tracker — Phase 5B Checkpoint

This document serves as the final checkpoint for Phase 5B of the **ApplyWizard Email Tracker** project.

---

## 1. Current Phase Completed

### Phase 5B: Classify Newly Synced Emails Only
- **Schema Migration:** Added `category`, `confidence`, `source_portal`, `needs_human_review`, `action_required`, `deadline`, `classified_at`, and `classification_status` columns to `public.zoho_email_metadata`. Applied the migration successfully to the remote project using the Supabase CLI (`db push`).
- **Batch Processing Test Endpoint:** Implemented `POST /api/zoho/emails/classify/test` which retrieves up to 5 pending records at a time, fetches their bodies on demand, runs them through the classifier pipeline, and persists only the classification fields while discarding raw email bodies.
- **Classification Pipeline Integration:** Reused the Phase 3 classification utilities (`tryRegexExtract`, `classifyWithAI`, and portal detector), querying Zoho Mail's `/details` and `/content` endpoints for the target message context.
- **Verification:** Verified the pending batch skip behavior:
  - First Sync Classification Run: processed 5 pending records.
  - Second Sync Classification Run: processed remaining 5 pending records.
  - Third Sync Classification Run: verified zero pending records remain, returning `checked: 0`.

---

## 2. Commit History

Below are the recent commits on the current branch (`main`):

- **`00ab960`** Phase 5B: implement metadata classification migration and POST /api/zoho/emails/classify/test route
- **`f81de73`** docs: create Phase 5A final checkpoint
- **`cf4fc0d`** Phase 5A: implement zoho_email_metadata schema and POST /api/zoho/emails/sync/test route
- **`230175d`** docs: create Phase 4C final checkpoint
- **`acc7e87`** Phase 4C: implement GET /api/zoho/emails/test/[messageId] safe email detail route

---

## 3. Environment Variables Required

The following environment variables are specified in `.env.example` and are required for full system operation:

```ini
# -- Zoho OAuth (Phase 2, 4A, 4B, 4C, 5A & 5B) --
ZOHO_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZOHO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
ZOHO_REDIRECT_URI=https://applywizard.ai/api/zoho/callback
ZOHO_ACCOUNTS_BASE_URL=https://accounts.zoho.in
ZOHO_MAIL_BASE_URL=https://mail.zoho.in/api
ZOHO_ADMIN_EMAIL=ramakrishn@applywizard.ai

# -- AI Classification (Phase 3 & 5B) --
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE (Optional)

# -- Supabase (Phase 4A, 4B, 4C, 5A & 5B) --
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

---

## 4. Known Limitations

- **No Persistent Body Storage:** Email body text and HTML are never saved in Supabase; they are discarded immediately after categorization.
- **Manual Sync/Classify Operations:** Triggering of email synchronization and classification relies on test POST routes. Automatic sync schedules (cron/background sync/webhooks) are not yet integrated.

---

## 5. Next Recommended Phase

### Phase 6: Sync & Classification Orchestration (Scheduler / Sync Daemon)
1. Orchestrate the sync and classification routes into a single automatic workflow.
2. Build a cron handler or scheduler to trigger the sync-then-classify pipeline periodically.
3. Handle rate limits and refresh token failures gracefully during background operations.
