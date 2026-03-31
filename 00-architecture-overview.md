# Nigerian Financial Platform - Architecture Overview

> **Regulatory Epoch:** 2024-2026 (CBN, NIBSS, NIMC, SEC directives)
> **Target Availability:** >= 99.95% uptime

---

## 1. High-Level System Architecture

```text
CLIENT LAYER
- Mobile (iOS/Android)
- Web App (React)
- USSD Gateway
- POS Terminals (Android)

API GATEWAY / BFF
- Rate limiting
- JWT validation
- Request routing
- API versioning
- Device fingerprint checks

DOMAIN SERVICES
- Identity: auth-service, kyc-service, device management, liveness
- Transactions: wallet-service, transfer-service, billpay-service, merchant-service, settlement-service, agent-service
- Platform: notification-service, audit-service, reporting-service, admin-service, analytics, fraud-service

DATA AND INTEGRATION LAYER
- PostgreSQL (ledger, accounts, idempotency records)
- Redis (cache, sessions, rate limiting)
- Kafka (event bus, outbox consumers, fraud signals)
- Object storage (KYC documents, liveness artifacts)
- External integrations: NIBSS NIP, NIBSS BVN, NIMC NIN, Interswitch, Remita, NQR, card schemes, PAPSS
```

---

## 2. Design Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **Microservices-first** | Each domain is a separately deployable unit with bounded contexts and clear ownership. |
| 2 | **Event-driven** | Kafka powers real-time balance propagation, fraud signals, notifications, and audit fan-out. |
| 3 | **Security by default** | mTLS between services, encryption at rest, short-lived JWTs, field-level encryption for regulated PII, and privileged access controls. |
| 4 | **Regulatory compliance as code** | Tier limits, agent caps, retention policies, and reporting rules are encoded in versioned rule sets and control mappings. |
| 5 | **Cloud-native** | Containerised workloads with health checks, circuit breakers, autoscaling, and controlled rollouts. |
| 6 | **Idempotency everywhere** | Every write endpoint accepts a client-generated idempotency key and persists it durably with the business write. |
| 7 | **Immutable ledger** | The ledger is append-only and double-entry; corrections are reversing entries, never in-place mutations. |

---

## 3. Technology Stack (Reference)

| Layer | Recommended Technologies |
|-------|--------------------------|
| API Gateway | Kong (baseline), with Envoy as sidecar/service mesh proxy where required |
| Backend Services | Node.js (NestJS) baseline; Go only for latency-sensitive rails or protocol adapters |
| Core Banking Engine | Custom double-entry ledger as system of record; external core-banking platforms only if adopted as the single ledger authority |
| RDBMS | PostgreSQL 16+ (primary ledger store, WAL archiving, logical replication) |
| Cache / Sessions | Redis 7+ (cluster mode, non-authoritative for money state) |
| Event Streaming | Apache Kafka / AWS MSK |
| Object Storage | S3-compatible object storage (KYC docs, liveness frames) |
| Search / Analytics | OpenSearch |
| Observability | Prometheus + Grafana, OpenTelemetry, ELK |
| CI/CD | GitHub Actions -> Kubernetes |
| Infrastructure | Terraform, Kubernetes |

**Baseline decision:** This reference assumes Kubernetes-hosted services, PostgreSQL as the authoritative ledger datastore, Redis as cache only, Kafka for domain events, and NestJS for most internal services. Alternative products mentioned in downstream documents are substitutions, not parallel production baselines.

---

## 4. Cross-Cutting Concerns

### 4.1 Idempotency

Every mutating API endpoint **must** accept an `X-Idempotency-Key` header. The server records the key and request hash in PostgreSQL in the same transaction boundary as the business write, keyed by `(client_id, idempotency_key)`. Redis may cache resolved responses for performance, but it is not the source of truth for duplicate prevention. Duplicate requests with the same payload return the original response; duplicate keys with a mismatched payload are rejected with HTTP `409`.

### 4.2 Rate Limiting

| Context | Limit |
|---------|-------|
| Unauthenticated endpoints (login, OTP) | 5 req/min per IP, plus per-phone/per-BVN velocity checks and device fingerprint throttles |
| Authenticated endpoints | 60 req/min per user, with lower thresholds for transfer creation, beneficiary changes, and PIN reset flows |
| Bulk / admin APIs | 10 req/min per service account and mandatory allowlisting/MFA for privileged operators |

### 4.3 Circuit Breakers

External integrations (NIBSS, NIMC, aggregators) **must** be wrapped in circuit breakers with per-integration timeout and retry policies owned by the integration adapter:

```text
States: CLOSED -> OPEN (after configured failure threshold within rolling time window) -> HALF_OPEN (after cool-down)
```

Rules:

- Name enquiry and validation calls may retry once on idempotent transport failure.
- Funds movement calls must not be retried blindly after an uncertain upstream commit; they must move to reconciliation/TSQ handling.
- Fallback behaviour must be defined per rail as either `fail closed`, `queue async`, or `switch provider`.

### 4.4 Data Retention

| Data Class | Retention Period |
|------------|-----------------|
| Transaction records & metadata | 5 years post-relationship (subject to applicable CBN and AML/CFT requirements) |
| KYC documents | 5 years post-relationship |
| Audit / compliance logs | 5 years minimum |
| Session / OTP data | 24 hours |

### 4.5 Encryption Standards

| Scope | Standard |
|-------|----------|
| Data at rest | AES-256-GCM |
| Data in transit | TLS 1.3 (mTLS between services) |
| PII fields (BVN, NIN) | Field-level encryption (AES-256) with envelope keys managed in KMS/HSM and rotation every 90 days |
| PIN storage | bcrypt (cost >= 12) or Argon2id |
| Secrets and service credentials | Centralised secrets manager, automatic rotation, no plaintext secrets in source control or CI logs |
| Signing / key custody | HSM-backed custody for payment signing keys, certificate lifecycle management, dual control for key operations |

### 4.6 Compliance Traceability

Regulatory controls must be traceable to explicit source documents. Each compliance-sensitive rule in code or configuration must map to:

- regulation/source identifier,
- control owner,
- implementation point (service, rule set, or batch job),
- evidence/report output,
- review date and effective date.

This architecture assumes a separate control matrix maintained with the compliance team and referenced by downstream design documents.

---

## 5. Service Catalogue

| Service | Domain | Key Responsibilities |
|---------|--------|----------------------|
| `auth-service` | Identity | Login, MFA, JWT issuance, device binding |
| `kyc-service` | Identity | BVN/NIN validation, liveness, tier management |
| `wallet-service` | Transaction | Wallet lifecycle, account views, balance projection from ledger, NUBAN orchestration |
| `transfer-service` | Transaction | Name enquiry, NIP credits, TSQ, saved beneficiaries |
| `billpay-service` | Transaction | Validation-execution for airtime, electricity, TV |
| `merchant-service` | Transaction | Merchant onboarding, NQR, POS management |
| `settlement-service` | Transaction | T+0 / T+1 settlement batches |
| `agent-service` | Transaction | Agent onboarding, wallet, limits, exclusivity |
| `fraud-service` | Platform | AI/ML monitoring, velocity checks, alert generation |
| `audit-service` | Platform | Immutable event log, compliance event storage |
| `notification-service` | Platform | SMS, push, email, in-app |
| `admin-service` | Platform | RBAC, maker-checker, configuration |
| `reporting-service` | Platform | Regulatory reporting, SLSG integration, analytics |
| `core-banking-engine` | Core | Sole writer to the double-entry ledger, GL, posting rules, reversals, profit-sharing engine |

---

## 6. Deployment Topology

```text
Primary region: Lagos
- Multi-AZ Kubernetes worker pools
- PostgreSQL primary with read replicas
- Redis cluster
- Kafka cluster

DR region: Abuja
- Warm Kubernetes cluster
- Standby PostgreSQL replica
- Replicated Kafka and object storage metadata where supported

Targets
- RPO < 5 min
- RTO < 30 min
```

Operational requirements for this topology:

- PostgreSQL primary election remains single-writer at all times; DR promotion is controlled runbook or orchestrated failover, never active-active ledger writes.
- Kafka topics carrying financial events must use replication and acknowledged writes that tolerate single-node loss in the primary region.
- Ledger posting, idempotency records, and outbox events must fail atomically within the primary write path.
- Abuja DR accepts traffic only after promotion checks confirm database consistency, replay completion, and integration endpoint health.
- Failover target: preserve `RPO < 5 min` and `RTO < 30 min` for customer-facing services; reconciliation jobs must run immediately after promotion for in-flight transfers.

---

## 7. Document Map

| Document | Contents |
|----------|----------|
| [`01-onboarding-kyc.md`](./01-onboarding-kyc.md) | Registration, device binding, MFA, BVN/NIN, liveness, KYC tiers |
| [`02-wallet-account-management.md`](./02-wallet-account-management.md) | Wallet auto-creation, real-time balance, virtual accounts, funding |
| [`03-transfers-payments.md`](./03-transfers-payments.md) | Name enquiry, NIP, saved beneficiaries, receipts, TSQ |
| [`04-bill-payments-vas.md`](./04-bill-payments-vas.md) | Airtime/data, electricity, TV, NQR payments |
| [`05-merchant-pos.md`](./05-merchant-pos.md) | Merchant onboarding, POS, PTSA, geo-fencing, settlement |
| [`06-security-compliance.md`](./06-security-compliance.md) | MFA, AI fraud, audit trails, explainable alerts |
| [`07-core-banking.md`](./07-core-banking.md) | Ledger, GL, Mudarabah/Musharakah, regulatory reporting |
| [`08-agency-banking.md`](./08-agency-banking.md) | Agent onboarding, exclusivity (2026), wallets, limits |
| [`09-platform-administration.md`](./09-platform-administration.md) | RBAC, maker-checker, dashboards, SLSG, analytics |
| [`10-data-models.md`](./10-data-models.md) | Shared entity definitions and enumerations |
