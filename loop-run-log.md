# Loop Run Log — ApplyWizz Email Tracker

Append one entry per run. Prune entries older than 30 days.

## Format

```json
{
  "run_id": "2026-07-11T08:15:00+05:30",
  "pattern": "daily-triage",
  "duration_s": 45,
  "items_found": 1,
  "actions_taken": 0,
  "escalations": 0,
  "tokens_estimate": 15000,
  "outcome": "report-only | fix-proposed | escalated | no-op",
  "stop_reason": "human gate | none"
}
```

## Recent Runs

<!-- Loop appends below this line -->

{"run_id":"2026-07-11T08:00:00Z","pattern":"daily-triage","duration_s":180,"items_found":1,"actions_taken":0,"escalations":0,"tokens_estimate":20000,"outcome":"report-only","stop_reason":"human gate: report-only setup completed; no auth code changed"}
