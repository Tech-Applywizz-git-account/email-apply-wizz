# ApplyWizard Email Tracker — Phase 3 Checkpoint

This document serves as the final checkpoint for Phase 3 of the **ApplyWizard Email Tracker** project.

---

## 1. Current Phase Completed

### Phase 3: AI Email Classification (Mock Test Pipeline)
- **Shared Types:** Established `lib/classify/types.ts` as the single source of truth for 13 categories, 10 portals, and 14 schema fields.
- **Source Portal Detection:** Created `lib/classify/portalDetector.ts` to identify the applicant tracking system (ATS) or platform (Workday, Greenhouse, Lever, etc.) from subject/body text.
- **Regex-First Extractor:** Implemented `lib/classify/regexExtractor.ts` to handle deterministic machine-actionable emails (`otp_verification`, `email_verification`, and `account_created`) without calling the AI API, ensuring 100% confidence, $0 cost, and zero hallucination risk on the happy path.
- **AI Classifier:** Implemented `lib/classify/aiClassifier.ts` utilizing `gpt-4o-mini` with low temperature (0.1), explicit formatting instructions, fallback to DeepSeek (if key configured), and automated human-review rules.
- **Test Route:** Created `POST /api/classify/test` to validate mock email payloads against the full pipeline.
- **Testing Results:** Completed initial verification of all regex extraction paths and verified graceful error handling (502 Bad Gateway) when the API key is missing.

---

## 2. Commit History

Below are the recent commits on the current branch (`main`):

- **`2c097e2`** docs: add Phase 3 testing results documentation
- **`1311a9d`** Phase 3: implement POST /api/classify/test with regex + GPT-4o-mini pipeline
- **`e635fb1`** Phase 3 plan: confirm categories, AI model, and DeepSeek placeholder
- **`e061706`** Phase 2: implement Zoho OAuth login and callback routes
- **`395ad7e`** Phase 2 plan: confirm Zoho India config and security rules

---

## 3. Environment Variables Required

The following environment variables are specified in `.env.example` and are required for full system operation:

```ini
# -- Zoho OAuth (Phase 2) --
ZOHO_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZOHO_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
ZOHO_REDIRECT_URI=https://applywizard.ai/api/zoho/callback
ZOHO_ACCOUNTS_BASE_URL=https://accounts.zoho.in
ZOHO_MAIL_BASE_URL=https://mail.zoho.in/api
ZOHO_ADMIN_EMAIL=ramakrishn@applywizard.ai

# -- AI Classification (Phase 3) --
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE (Optional)

# -- Supabase (Phase 4) --
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

---

## 4. Known Limitations

- **AI API Key Dependency:** The 10 AI-based classification categories require a valid `OPENAI_API_KEY` in `.env.local`. When the key is missing or invalid, the `/api/classify/test` route returns a `502 Bad Gateway` error response.
- **Mock Testing Only:** The classification pipeline currently only runs against manually provided mock request bodies on `POST /api/classify/test`. It is not yet connected to the Zoho Mail API or database storage.

---

## 5. Next Recommended Phase

### Phase 4: Zoho Mail Integration & Supabase Storage
1. Set up the Supabase database schema for storing OAuth tokens, candidate accounts, and email classification logs.
2. Connect Zoho Mail API to periodically read/receive real incoming emails.
3. Pass retrieved emails through the Phase 3 classification pipeline.
4. Save structured results in Supabase.
