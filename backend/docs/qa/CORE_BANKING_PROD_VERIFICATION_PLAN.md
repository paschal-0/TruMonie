# Core Banking Production Verification Plan

## 1) Goal
Validate that all core banking capabilities (including Ajo) are correct, resilient, and auditable in a production-like environment before go-live.

Base API prefix: `/api`

## 2) Scope
- In scope: health, auth, users, wallets, ledger transfers, payments, remittance, bills, cards, savings, FX, KYC, risk controls, Ajo.
- Out of scope for this runbook: frontend visual QA, infra cost optimization, legal/compliance wording.

## 3) Environments
Use 3 environments:
1. `local-dev` for rapid fixes.
2. `staging` (production-like) for final sign-off.
3. `pre-prod` (optional) for rehearsal cutover.

Required staging components:
- Postgres + Redis managed instances.
- All migrations applied.
- `LICENSED_INFRA_*` sandbox endpoints configured.
- `DEFAULT_*_PROVIDER=licensed` for payments/bills/kyc/fx/cards/otp/notifications.
- `SYSTEM_TREASURY_*`, `SYSTEM_FEES_*`, and `SYSTEM_SETTLEMENT_*` account IDs configured.

## 4) Test Data Setup
Create these test actors:
1. `admin_user` (role `ADMIN`).
2. `user_a` (active, tier0 then upgraded to tier2 during tests).
3. `user_b` (active recipient).
4. `user_frozen` (status `DISABLED`).

Seed requirements:
- Wallets for NGN and USD for `user_a` and `user_b`.
- Treasury and settlement accounts for NGN/USD.
- Bills catalog in licensed sandbox.
- Card and KYC sandbox responses.

## 5) Execution Order
### Phase A: Platform Smoke
1. `GET /api/health` returns `ok`.
2. Auth bootstrap: register/login/refresh/me/otp send+verify.
3. Wallet listing and statement retrieval.

### Phase B: Module Functional E2E
Execute all endpoint cases from [`ENDPOINT_TEST_MATRIX.csv`](./ENDPOINT_TEST_MATRIX.csv) in priority order: `P0 -> P1 -> P2`.

### Phase C: Cross-Feature Journeys
1. Onboarding to first funded wallet.
2. Internal transfer chain (`wallet -> p2p -> statement verification`).
3. External payout + remittance inbound.
4. Bills purchase and beneficiary reuse.
5. Savings deposit/withdraw with lock checks.
6. FX quote/convert and statement reflection.
7. Card create/block/unblock with provider callbacks.
8. KYC verify then confirm higher limits allow larger transfer.
9. Ajo full lifecycle (details in Section 6).

### Phase D: Financial Controls
1. Journal balance check: every entry has equal debit/credit totals.
2. Idempotency checks for webhook funding and transfers.
3. Settlement reconciliation against licensed provider reports.
4. Penalty, fee, and treasury postings reconcile to expected balances.

### Phase E: Reliability and Security
1. Load tests for top flows (`auth/login`, `payments/p2p`, `wallets/statement`, `ajo/run-cycle`).
2. Retry/timeout behavior for licensed providers.
3. RBAC checks (`risk freeze/unfreeze`, `payments/internal/fund`).
4. Audit log verification for admin actions and device registration.

## 6) Ajo End-to-End Certification
Must pass all before go-live:
1. Create group (`POST /api/ajo/groups`) with valid currency and member target.
2. Join flow (`POST /api/ajo/groups/:id/join`) until capacity reached.
3. Over-capacity join attempt fails with `Group is full`.
4. Run cycle as creator (`POST /api/ajo/groups/:id/run-cycle`) posts contributions and payout.
5. Non-creator run cycle attempt fails with forbidden.
6. Member reorder/remove/replace paths succeed with valid payloads.
7. Invalid reorder payload fails (`Member list mismatch` / `Invalid member id`).
8. Failed contribution path records penalties and partial cycle behavior.
9. Settle penalties endpoint updates pending penalties.
10. Group schedule updates change next payout timing.
11. Group details and list reflect current membership and positions.
12. Ledger + payout + contribution records reconcile for each cycle.

## 7) Exit Criteria (Go/No-Go)
Release candidate is go-live ready only when:
1. 100% pass for all `P0` and `P1` endpoint tests.
2. 0 unresolved critical/high defects.
3. Financial reconciliation differences = 0 for tested windows.
4. All role/permission negative tests pass.
5. Load and soak tests meet SLOs.
6. Incident runbooks are tested by on-call.

## 8) Defect Triage Rules
1. `Severity 1`: money loss, wrong balances, unauthorized access -> block release.
2. `Severity 2`: failed critical journey with workaround -> block unless explicitly accepted.
3. `Severity 3`: non-critical functional issue -> may defer with owner/date.
4. `Severity 4`: cosmetic/logging gaps -> backlog.

## 9) Recommended Automation Stack
1. API E2E: Postman/Newman or k6 + JS assertions.
2. Integration tests: Jest + Supertest + real Postgres/Redis test containers.
3. Reconciliation scripts: SQL checks + provider export diff.
4. CI gates: `lint`, `build`, unit tests, integration tests, E2E smoke suite.

## 10) Immediate Next Actions
1. Import and execute [`ENDPOINT_TEST_MATRIX.csv`](./ENDPOINT_TEST_MATRIX.csv) as your QA master sheet.
2. Run automated P0 smoke: `npm run qa:smoke:p0` (see [`P0_SMOKE_RUNNER.md`](./P0_SMOKE_RUNNER.md)).
3. Schedule Ajo certification run with seeded users and real settlement accounts in staging.
4. Run reconciliation script after each test batch and sign off daily.
