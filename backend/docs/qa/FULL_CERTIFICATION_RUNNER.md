# Full Certification Runner

Use this to execute the production-readiness QA gates in one pass.

## Command

```bash
npm run qa:certify
```

## Phases Covered

1. `PHASE-A-P0`:
`npm run qa:smoke:p0`
2. `PHASE-B-DOMAIN`:
`npm run qa:smoke:domain`
3. `PHASE-C-NOTIFICATIONS`:
`npm run qa:smoke:notifications`
4. `PHASE-D-SECURITY`:
`npm run qa:smoke:security`
5. `PHASE-E-RELIABILITY`:
`npm run qa:smoke:reliability`
6. `PHASE-E-LOAD-BASELINE`:
`npm run qa:load:baseline`
7. `PHASE-F-RECONCILIATION`:
`npm run qa:reconcile`

## Prerequisites

1. API running and reachable at `QA_BASE_URL` (default `http://localhost:3000`).
2. Postgres and Redis reachable by the API.
3. Migrations applied.
4. System accounts provisioned:

```bash
npm run qa:bootstrap:system-accounts
```

The bootstrap command writes `.qa-system-accounts.env` and prints account IDs.

## Recommended Local Provider Overrides

For no-external local QA:

- `DEFAULT_PAYMENT_PROVIDER=internal`
- `DEFAULT_BILLS_PROVIDER=stub`
- `DEFAULT_KYC_PROVIDER=stub`
- `DEFAULT_FX_PROVIDER=stub`
- `DEFAULT_CARDS_PROVIDER=stub`
- `DEFAULT_OTP_PROVIDER=internal`
- `DEFAULT_NOTIFICATION_PROVIDER=internal`

## Failure Behavior

- Default: stops at first failed phase.
- To continue and collect all failures in one run:

```bash
QA_CONTINUE_ON_FAIL=true npm run qa:certify
```
