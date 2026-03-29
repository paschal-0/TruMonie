# Daily Reconciliation Checks

Run this at least once per day (or per release batch) to validate financial integrity.

Command:

```bash
npm run qa:reconcile
```

## Critical Checks (release blockers)

1. `unbalanced_journal_entries`
2. `journal_entries_without_lines`
3. `account_balance_mismatch`
4. `funding_transactions_missing_journal`

If any critical check has rows, the command exits with status `1`.

## Warning Checks

1. `duplicate_webhook_idempotency_keys`
2. `stale_pending_payouts_older_than_15m`

Warnings do not fail the command, but should be triaged.

## Informational Output

- `system_account_movements`: net movement summary for system-owned accounts in the selected window.

## Window Controls

Default window:

- Current UTC day: `00:00:00Z -> 24:00:00Z`

Override options:

- `QA_RECON_DATE=YYYY-MM-DD`
- or explicit:
  - `QA_RECON_FROM=2026-03-29T00:00:00.000Z`
  - `QA_RECON_TO=2026-03-30T00:00:00.000Z`

## Optional Report Output

Write JSON report to file:

```bash
QA_RECON_OUTPUT=./docs/qa/recon-report.json npm run qa:reconcile
```

## CI Automation

Nightly workflow is configured at:

- [.github/workflows/reconciliation-nightly.yml](C:/Users/LENOVO/Documents/TruMonie/.github/workflows/reconciliation-nightly.yml)

Schedule:

- `00:15 UTC` daily (`cron: 15 0 * * *`)

Manual run:

- Use `workflow_dispatch` and optionally set `recon_date` as `YYYY-MM-DD`.

Required GitHub Secrets:

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_SSL`

Artifact:

- Every run uploads a JSON reconciliation report artifact, even when checks fail.
