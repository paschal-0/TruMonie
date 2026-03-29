# Notifications Smoke Runner

Runs a notification-focused E2E smoke using Ajo flows that trigger notifications:

- `AJO_JOIN` trigger via group join
- `AJO_PAYOUT` trigger via cycle run

Command:

```bash
npm run qa:smoke:notifications
```

## What It Verifies

1. API health is reachable.
2. Two users can be created and funded.
3. Ajo group create + join works (`AJO_JOIN` trigger path).
4. Ajo run-cycle works (`AJO_PAYOUT` trigger path).

If notification provider dispatch fails, these flows fail and the script exits non-zero.

## Environment

- `QA_BASE_URL` (default: `http://localhost:3000`)
- `QA_PASSWORD` (default: `Notify#12345`)
- `QA_CURRENCY` (default: `NGN`)

For local smoke, use internal/stub providers. For licensed validation, point your app to licensed sandbox credentials and re-run.

## Exit Codes

- `0`: all checks passed
- `1`: one or more checks failed
