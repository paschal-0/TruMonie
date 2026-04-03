# Module 06 Security & Compliance Execution Plan

This plan tracks implementation against `06-security-compliance.md` in strict delivery order.

## P0 - Immediate Controls (Ship First)

### P0.1 Security Error Registry (`SEC_*`, `FRD_*`)
- Status: `DONE`
- Delivered:
  - Added canonical security/fraud codes and exception type.
  - File: `backend/src/security/security.errors.ts`

### P0.2 PIN Hardening Policy
- Status: `DONE`
- Delivered:
  - Argon2id parameters pinned to spec profile.
  - Configurable PIN length (`4` or `6` digits).
  - Max wrong attempts (`5`) with escalating lockouts (`30m`, `60m`, `24h`).
  - PIN history enforcement (no reuse of last 3).
  - PIN expiry visibility (`requiresRotation` in pin status).
  - DB schema added for PIN history/lock state metadata.
- Files:
  - `backend/src/users/users.service.ts`
  - `backend/src/users/entities/user.entity.ts`
  - `backend/src/users/users.controller.ts`
  - `backend/src/users/dto/set-transaction-pin.dto.ts`
  - `backend/src/users/dto/create-user.dto.ts`
  - `backend/src/migrations/1700000021000-security-hardening.ts`

### P0.3 Transfer MFA Matrix Enforcement
- Status: `DONE`
- Delivered:
  - `< ₦50,000`: PIN only.
  - `>= ₦50,000`: PIN + OTP.
  - `>= ₦500,000`: PIN + OTP + biometric ticket.
  - Rule enforcement on both `payments` and `transfers-v2` endpoints.
- Files:
  - `backend/src/auth/step-up-auth.service.ts`
  - `backend/src/payments/transfers.controller.ts`
  - `backend/src/payments/transfers-v2.controller.ts`
  - Transfer DTOs updated with `otp` and `biometric_ticket` fields.

### P0.4 Biometric Challenge/Ticket Server Flow
- Status: `DONE`
- Delivered:
  - `POST /auth/biometric/challenge` (60s challenge).
  - `POST /auth/biometric/verify` (returns short-lived ticket).
  - Ticket consumed server-side for high-value transfer authorization.
  - `device/transfer` now enforces OTP + biometric ticket.
- Files:
  - `backend/src/auth/biometric-challenge.service.ts`
  - `backend/src/auth/auth.controller.ts`
  - `backend/src/auth/dto/create-biometric-challenge.dto.ts`
  - `backend/src/auth/dto/verify-biometric-challenge.dto.ts`
  - `backend/src/auth/dto/transfer-device.dto.ts`
  - `backend/src/auth/auth.module.ts`

### P0.5 Frontend Step-Up UX for Transfers
- Status: `DONE`
- Delivered:
  - Wallet auth modal now supports:
    - transfer OTP send/input for high-value transfers,
    - biometric authorization path for very high-value transfers,
    - 4/6 digit PIN input.
  - Frontend wired to new biometric challenge/verify endpoints.
- Files:
  - `frontend/src/screens/WalletScreen.tsx`
  - `frontend/src/hooks/useAuthActions.ts`
  - `frontend/src/hooks/useTransfers.ts`

---

## P1 - Fraud Response + Explainability

### P1.1 Fraud Reports API (`/api/v1/fraud/reports`)
- Status: `DONE`
- Scope:
  - Receive APP fraud reports.
  - Deduplicate reports per transaction.
  - Emit response containing:
    - `beneficiary_bank_notified`,
    - `notification_sent_at`,
    - `resolution_deadline`.

### P1.2 Fraud Case Timeline Automation (30m / 48h / 72h)
- Status: `DONE`
- Scope:
  - Job orchestration for:
    - beneficiary bank notification SLA (30 min),
    - investigation SLA (48h),
    - NFIU escalation SLA (72h).

### P1.3 Explainable Alerts Payload
- Status: `DONE`
- Scope:
  - Persist risk decision object:
    - `risk_score`, `decision`, `reasons[]`, `feature_importances`, `model_version`.

---

## P2 - Advanced Fraud Engine + Compliance Persistence

### P2.1 Fraud Engine Pipeline
- Status: `DONE`
- Scope:
  - Rule engine + optional ML scorer + graph/ring heuristics.
  - Event-driven ingestion from transaction events.

### P2.2 Compliance Events Store
- Status: `DONE`
- Scope:
  - Create `compliance_events` table and services.
  - Track suspicious events and resolution lifecycle.

### P2.3 Immutable Audit Upgrade
- Status: `DONE`
- Scope:
  - Expand `audit_logs` schema to include actor/resource/before/after/ip/user-agent/correlation_id.
  - Add append-only protections and retention strategy (5-year policy).

### P2.4 Fraud/Compliance Smoke Certification Runner
- Status: `DONE`
- Scope:
  - Added dedicated QA runner to exercise fraud/compliance critical paths with auto fallback for legacy/v2 transfer APIs.
  - Covers:
    - health + auth setup,
    - transfer risk flow baseline/suspicious attempts,
    - fraud report + duplicate protection (v2-capable environments),
    - admin fraud/compliance listing + compliance resolution (when endpoints are available),
    - audit append-only trigger validation (when DB credentials are available).
- Files:
  - `backend/scripts/qa/fraud-compliance-smoke.mjs`
  - `backend/package.json` (`qa:smoke:fraud-compliance`)

---

## Next Operational Runbook

1. Run `npm run qa:smoke:fraud-compliance` against staging/production-like environments.
2. Ensure zero hard failures and review all skipped checks (legacy endpoint or environment-cap limitations).
3. For full fraud/compliance certification, deploy latest backend revision with v2 transfer/fraud endpoints enabled and re-run.
