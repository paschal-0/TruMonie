# P0 Smoke Runner

Use this to validate critical core-banking flows quickly in a running environment.

Command:

```bash
npm run qa:smoke:p0
```

## What It Tests

- `HEALTH-001`
- `AUTH-001` (two fresh users)
- `AUTH-002`
- `AUTH-003`
- `AUTH-006`
- `WALLET-001`
- `WALLET-002`
- `PAY-003` (internal webhook funding)
- `PAY-001` (p2p transfer)
- `LEDGER-001` (direct ledger transfer)
- `PAY-002` (bank transfer via `internal` provider)
- `AJO-003`
- `AJO-004`
- `AJO-005`
- `AJO-010`
- Optional admin checks:
  - `PAY-005`
  - `RISK-001`
  - `RISK-002`

## Required Runtime Prerequisites

1. Backend API must be running and reachable.
2. System settlement/treasury account IDs must be configured and valid.
3. Redis and Postgres must be available to the API.
4. Providers for this run should support no-external mode:
   - `DEFAULT_PAYMENT_PROVIDER=internal` (recommended for smoke)
   - Other modules can stay stub/internal for pre-licensed verification.

## Environment Variables

Required:

- `QA_BASE_URL` (default: `http://localhost:3000`)

Optional tuning:

- `QA_CURRENCY` (default: `NGN`)
- `QA_PASSWORD` (default: `TruMonie#123`)
- `QA_FUNDING_AMOUNT_MINOR` (default: `500000`)
- `QA_TRANSFER_AMOUNT_MINOR` (default: `10000`)
- `QA_LEDGER_TRANSFER_AMOUNT_MINOR` (default: `5000`)
- `QA_AJO_CONTRIBUTION_AMOUNT_MINOR` (default: `1000`)

Optional admin checks:

- Provide one of:
  - `QA_ADMIN_TOKEN`
  - `QA_ADMIN_IDENTIFIER` + `QA_ADMIN_PASSWORD`

If admin credentials are not provided, admin checks are skipped and the run still completes.

## Exit Behavior

- Exit code `0`: all required checks passed.
- Exit code `1`: one or more required checks failed.
