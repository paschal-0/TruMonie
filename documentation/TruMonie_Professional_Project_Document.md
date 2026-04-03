# TruMonie Professional Product Document

**Product:** TruMonie Core Banking Platform  
**Document Type:** Product Specification + Technical Architecture + Production Readiness Brief  
**Version:** 1.2 (Comprehensive)  
**Date:** March 29, 2026  
**Audience:** Technical Teams (Engineers, Architects)  

---

## Table of Contents

1. [0. Technology Stack at a Glance](#0-technology-stack-at-a-glance-executive-view)
2. [1. Executive Summary](#1-executive-summary)
3. [2. Problem Statement](#2-problem-statement)
4. [3. Product Vision](#3-product-vision)
5. [4. Target Users](#4-target-users)
6. [5. Product Scope and Capability Map](#5-product-scope-and-capability-map)
7. [6. Core Differentiators](#6-core-differentiators)
8. [7. Detailed Technical Stack](#7-detailed-technical-stack)
9. [8. Architecture Overview](#8-architecture-overview)
10. [9. Security, Risk, and Control Framework](#9-security-risk-and-control-framework)
11. [10. QA, Testing, and Certification](#10-qa-testing-and-certification)
12. [11. Deployment and Operations Requirements](#11-deployment-and-operations-requirements)
13. [12. API Reference](#12-api-reference)
14. [13. Database Schema and Entity Relationships](#13-database-schema-and-entity-relationships)
15. [14. Performance & Scalability](#14-performance--scalability)
16. [15. Compliance and Regulatory Dependencies](#15-compliance-and-regulatory-dependencies)
17. [16. KPI Framework](#16-kpi-framework)
18. [17. Current Constraints and Risks](#17-current-constraints-and-risks)

---

## 0. Technology Stack at a Glance (Executive View)

| Layer | Stack | Version | Role in Product | Why It Matters |
|-------|-------|---------|-----------------|----------------|
| **Core Backend** | TypeScript, NestJS | 5.2.2, 10.0.0 | Modular banking services and APIs | Enables clean domain separation, type safety, maintainability, and controlled scaling. NestJS provides declarative module architecture and dependency injection for complex banking workflows. |
| **Financial Core** | Double-entry ledger service (journal entries + lines) | Proprietary | All monetary movement posting | Prevents silent balance drift through atomic transaction posting. Enforces accounting invariants (debit = credit) at database transaction level. Supports complete audit trail for regulatory compliance. |
| **Data Layer** | PostgreSQL, TypeORM | 8.11.3, 0.3.20 | Transactional data storage and schema control | PostgreSQL provides strong ACID guarantees with row-level locking. TypeORM migrations enable auditable schema versioning and rollback capability. Large integer (bigint) support for monetary values in minor units prevents floating-point errors. |
| **Cache + Messaging** | Redis, BullMQ | 5.3.2, 5.9.1 | Caching, risk counters, async jobs | Redis in-memory store eliminates database round-trips for OTP codes, session tokens, velocity counters. BullMQ job queue decouples Ajo cycle execution and reminders from request-response path, ensuring operational stability during high concurrency. |
| **Auth & Security** | JWT, Passport-JWT, argon2, class-validator | 10.2.0, 4.0.1, 0.41.1, 0.14.0 | Identity, token auth, password security, input validation | JWT access/refresh token model with JTI-based revocation enables stateless scaling. argon2 memory-hard hashing resists GPU-accelerated attacks. DTO validation pipeline catches injection attacks before reaching domain logic. |
| **Mobile App** | React Native, Expo | 0.81.5, ~54.0.30 | Cross-platform customer experience | Single codebase deployable to iOS/Android. Expo managed service reduces DevOps overhead for OTA updates and simulator provisioning. expo-secure-store encrypts credentials using OS-level vaults. |
| **Client State/API** | TanStack React Query, fetch | 5.59.0, native | API state management and caching | Automatic cache invalidation and refetch patterns reduce duplicate API calls. Query deduplication handles race conditions in rapid user actions. Built-in retry logic with exponential backoff improves resilience. |
| **QA & Reliability** | Jest, Node.js automation scripts | 29.7.0, custom mjs | Functional, security, reliability, and financial checks | Jest provides unit/integration test framework. Custom QA runners (p0-smoke, reconciliation) automate release gates before production. Nightly reconciliation checks catch ledger imbalances in CI/CD pipeline. |
| **CI Automation** | GitHub Actions | Standard | Scheduled financial control execution | Nightly reconciliation workflow runs autonomously. Detects ledger drift before it compounds. Enables proactive remediation and reduces MTTR for financial anomalies. |

---

## 1. Executive Summary

TruMonie is a **ledger-first, modular core-banking platform** designed for emerging-market digital finance and community savings workflows (Ajo/Esusu groups). It combines a double-entry transaction engine with pluggable provider adapters, enabling teams to operate in internal/sandbox mode immediately and transition to licensed provider rails later via configuration (not platform rewrites).

### Core Value Propositions

**1. Bank-Grade Financial Integrity**
- All monetary movements routed through a double-entry ledger with atomic posting.
- Debit-credit balance constraints enforced at transaction commit time.
- Idempotency keys prevent duplicate posting on network retries.
- Complete audit trail for every transaction, enabling forensic analysis and regulatory evidence.

**2. Community Finance as First-Class Domain**
- Ajo/Esusu group savings built into core architecture, not bolted on.
- Cycle-based payouts with member sequencing controlled by business logic.
- Escrow accounts segregate group funds from platform treasury.
- Penalty and reminder orchestration via background job queue ensures operational predictability.

**3. Provider-Agnostic Abstraction Layer**
- Providers (Paystack, Flutterwave, licensed rails) swappable via configuration.
- Internal/stub providers for sandbox development and testing.
- Adapter pattern isolates provider-specific logic, allowing migration without domain code changes.
- Reduces vendor lock-in risk and shortens time to licensed go-live.

**4. Operational Confidence Through Measurable Controls**
- QA automation covering P0 critical paths, security, reliability, and financial reconciliation.
- Release gates enforce automated testing before production promotion.
- Nightly reconciliation checks detect ledger imbalances, enabling proactive remediation.
- Role-based authorization and audit logging provide evidence trail for regulatory reviews.

### Platform Reach

- **Retail Customers:** Wallet-first everyday banking (P2P transfers, bill payments, FX).
- **Community Members:** Transparent, predictable group savings without intermediary trust burden.
- **Operations Teams:** Controlled admin interventions with audit trails; self-service reconciliation dashboards.
- **Licensed Partners:** Reusable, extensible backend for fintech operators in regulated environments.

---

## 2. Problem Statement

Fintech platforms often fail during scale for predictable reasons:

### Problem 1: Transaction Integrity Without a Ledger Model
Many systems store balances directly on user accounts, leading to:
- Silent balance drift when concurrent requests race or retry logic misfires.
- No audit trail to explain how balances changed.
- Difficulty detecting fraud or operational errors until customers complain.
- Reconciliation requiring manual external record matching (expensive, error-prone).

**TruMonie's Answer:**
- All balance changes post through journal entries that are immutable once committed.
- Accounts are derived views over journal lines, ensuring consistency.
- Every post includes reference, timestamp, and metadata for forensic analysis.

### Problem 2: Provider Over-Coupling
Platforms tightly integrated with one payment or KYC provider:
- Cannot easily switch providers due to business logic dependencies.
- Migration requires platform rewrite, delaying response to market conditions.
- No fallback if provider has outage or business changes terms.

**TruMonie's Answer:**
- Providers behind service interfaces with pluggable implementations.
- Internal, stub, and licensed variants available for each provider.
- Provider selection via environment configuration; no code changes needed.

### Problem 3: Weak Community Finance Model
Group savings (Ajo/Esusu) treated as bolt-on feature, leading to:
- Weekly or monthly reconciliation to catch errors.
- Manual coordination of payouts and penalties.
- High operational overhead for group coordinators.

**TruMonie's Answer:**
- Community finance modeled as first-class domain with core entities.
- Cycle runs orchestrated via background job queue with deterministic member sequencing.
- Penalties calculated and settled automatically; coordinators notified via async notifications.

### Problem 4: Insufficient Internal Controls for Production
Many teams lack:
- Repeatable certification approaches to validate platform behavior.
- Automated detection of financial anomalies.
- Audit evidence for regulatory reviews.

**TruMonie's Answer:**
- QA runners for P0 functionality, security, reliability, and load testing.
- Nightly reconciliation checks encoded in CI/CD pipeline.
- Audit logging of all privileged actions (admin funding, risk freezes, role changes).
- Release gates prevent production promotion without passing required test suites.

---

## 3. Product Vision

Deliver a bank-grade digital financial core that:

1. **Supports High-Frequency Retail Transactions** without balance drift or audit gaps.
2. **Enables Community Savings at Scale** with predictable, transparent cycles and minimal operational overhead.
3. **Facilitates Rapid Licensed Transition** from sandbox simulations to approved provider rails through configuration.
4. **Provides Operational Confidence** through measurable controls, automated certification, and forensic auditability.
5. **Reduces Market-to-Deployment Time** by bundling domain models (auth, ledger, Ajo, payments, etc.) with extensible provider adapters.

---

## 4. Target Users

| User Persona | Use Cases | Needs |
|--------------|-----------|-------|
| **Retail Customers** | P2P transfers, bill payments, FX conversions, savings deposits | Simple, fast, trustworthy transactions with clear history |
| **Ajo Coordinators** | Create groups, invite members, manage schedules, settle penalties | Transparent payout scheduling; minimal manual reconciliation |
| **Ajo Members** | Contribute to cycles, receive payouts, manage savings | Predictable sequence, clear payout dates, penalty transparency |
| **Operations/Admin Teams** | Monitor transactions, resolve disputes, fund accounts, adjust risk thresholds | Audit trails, quick intervention levers, reconciliation dashboards |
| **Licensed Partners/Banks** | Operate as regulated fintech | Reusable backend architecture, proof of security controls, certification artifacts |
| **Founders/Product Teams** | Scale operations, reduce go-live risk | Modular design, QA automation, documented architecture |

---

## 5. Product Scope and Capability Map

### 5.1 Implemented Core Scope

**Authentication & Identity**
- Registration with email/phone verification.
- Login with OTP (SMS/email channels).
- JWT access/refresh token lifecycle with configurable expiry.
- Token revocation via JTI tracking.
- Multi-device session management with device registration.

**User Management**
- User profile retrieval with role-based visibility.
- Ownership-restricted access to own profile.
- Device registration for risk assessment.

**Ledger & Accounting**
- Account creation (user wallets, system treasury, fees, settlement, escrow).
- Multi-currency support (NGN, USD, others).
- Journal entry posting with reference-based idempotency.
- Statement retrieval with filtering and pagination.
- Balance querying with real-time calculation over journal lines.

**P2P Transfers**
- Direct wallet-to-wallet transfers with optional fees.
- Idempotent posting via request reference.
- Transaction history with full audit trail.

**Bill Payments**
- Bill catalog retrieval per provider.
- Beneficiary management (add/list/delete).
- Bill purchase with wallet debit and treasury credit.
- Status tracking (pending, paid, failed).

**Savings Vaults**
- Vault creation (separate from main wallet).
- Deposit/withdraw with journal posting.
- Interest rate configuration (future enhancement).

**FX & Conversion**
- Real-time rate retrieval and quoting.
- Spot conversion with base and quote wallet posting.
- Multi-quote support for competitive rates.

**Remittance**
- Inbound remittance receipt and wallet credit.
- Outbound remittance initiation and tracking.
- Provider-specific settlement mapping.

**Cards**
- Card lifecycle (create, list, block, unblock).
- PIN/CVV management (encrypted).
- Spend tracking via journal lines.
- 3D Secure integration (planned).

**KYC & Verification**
- KYC vendor integration (stub and licensed providers).
- Verification status tracking (unverified, pending, verified, rejected).
- Document upload and provider submission.
- Risk-based KYC levels (simplified, standard, enhanced).

**Risk & Compliance**
- Velocity checks (transaction count and value per time window).
- Device registration and context analysis.
- User freezing/unfreezing for suspicious activity.
- Audit logging of all privileged actions.
- Risk event alerting and escalation workflows.

**Notifications**
- Event-driven notification templates.
- Multi-channel delivery (SMS, email, in-app).
- Notification history tracking.
- Retry logic for failed deliveries.

**Ajo/Esusu Community Savings**
- Group creation with member target and contribution amount.
- Member joining and invitation workflows.
- Contribution tracking per cycle.
- Cycle execution with automatic payout sequencing.
- Penalty settlement for defaults.
- Activity history and group ledger.
- Cycle reminder notifications (24 hours before payout).

### 5.2 Licensed-Cutover Scope

Platform design enables activation of licensed providers:

**Payments:** Internal → Paystack/Flutterwave → Licensed settlement rails  
**Bills:** Stub → Licensed vendor integration  
**KYC:** Stub → Licensed vendor (SDK integration)  
**FX:** Stub → Licensed rate vendor  
**Cards:** Stub → Licensed issuer API  
**OTP:** Internal Redis → Licensed provider (Twilio, AWS SNS)  
**Notifications:** Internal templates → Licensed delivery platform  

**Cutover Requirements:**
- Production API credentials and endpoint contracts.
- Settlement account mappings and reconciliation procedures.
- Compliance approvals and audit attestations.
- Rate capping and fraud thresholds tuned to licensed SLA.
- Monitoring and alerting reconfigured for licensed provider uptime.

---

## 6. Core Differentiators

### 6.1 Ajo/Esusu Domain Built Into Core

Unlike generic fintech platforms that treat group savings as an afterthought, TruMonie models Ajo as a first-class domain:

**Structural Features:**
- **SavingsGroup Entity:** Defines group cadence (weekly, daily), contribution amounts, member target, payout sequence.
- **GroupMember Entity:** Tracks membership status, contribution history, payout position in queue.
- **GroupContribution Entity:** Immutable record of each contribution (when posted, amount, status).
- **GroupPayout Entity:** Tracks each scheduled payout (planned date, recipient, amount, status).
- **Escrow Account:** Segregated ledger account ensuring group funds are operationally separate from platform treasury.

**Operational Excellence:**
- **Deterministic Sequencing:** Member payout order calculated at cycle start; no manual coordination needed.
- **Automatic Cycle Runs:** BullMQ jobs execute cycles at scheduled `nextPayoutDate`; human error eliminated.
- **Penalty Orchestration:** Members who miss contributions automatically flagged; penalties calculated per group rules.
- **Activity Audit Trail:** Every group event (joined, contributed, paid out, penalized) logged in `GroupActivity` table for transparency.
- **Reminder Notifications:** 24-hour pre-payout reminders sent via job queue; reduces payment failures.

**Business Value:**
- Coordinators operate groups via API, not spreadsheets.
- Members see predictable payout dates and contribution status in real time.
- Disputes resolved via immutable audit history, not arguing about record-keeping.
- Operational costs for group administration drop as manual touchpoints vanish.

---

### 6.2 Ledger-First Financial Integrity

**Double-Entry Accounting Pattern**
Every monetary event is modeled as a balanced journal entry with paired debit/credit lines:

```
Example: User A transfers 10,000 NGN to User B
├─ Line 1: DEBIT User A's NGN wallet account by 10,000
├─ Line 2: CREDIT User B's NGN wallet account by 10,000
└─ System Invariant: Sum of all debits = Sum of all credits (enforced at DB commit)
```

**Key Design Points:**

1. **Immutability:** Once posted (status = POSTED), journal entries and lines are never modified. Corrections made via reversal entries.
   
2. **Reference-Based Idempotency:** Each entry has a `reference` (e.g., "TRF-1704067200000") and optional `idempotencyKey`. Duplicate submissions with same key are de-duplicated at database level (unique constraint prevents re-posting).

3. **Balance Enforcement:** Account balances are never stored directly; they are queried by summing journal lines scoped to that account. This ensures balance = real accounting position.

4. **Atomic Transactions:** Entire entry (all lines) posted in single database transaction. If any line fails validation, entire transaction rolls back; no orphaned entries.

5. **Amount Precision:** All monetary values stored as `bigint` (minor units: kobo, cent, satoshi). Prevents floating-point rounding errors that compound over millions of transactions.

**Reconciliation Simplicity:**
- Balance mismatch triggers reconciliation runner script.
- Script compares account balance (sum of lines) vs. expected (per business logic).
- Discrepancy logs indicate exact journal entries causing drift.
- Auditors can trace every unit of money through entry chain.

**Audit Trail:**
- Each line includes memo, description, timestamps.
- Query audit view: "Show me all credit activity on account ID X in last 30 days."
- Export for regulatory reviews (CBN, FINTRAC) requires no external reconciliation.

---

### 6.3 Infrastructure Agility

**Provider Abstraction Pattern**

```typescript
// Payments domain example
export interface IPaymentProvider {
  initiate(params: InitiatePaymentParams): Promise<PaymentResult>;
  query(reference: string): Promise<PaymentStatus>;
  supports(p: PaymentType): boolean;
}

// Concrete implementations
class InternalPaymentProvider implements IPaymentProvider { ... }
class PaystackProvider implements IPaymentProvider { ... }
class LicensedProviderAdapter implements IPaymentProvider { ... }

// Dependency injection; provider selected at runtime
const provider = PAYMENT_PROVIDERS.find(p => p.supports(paymentType));
```

**Benefits:**

1. **Sandbox Development:** Use `InternalPaymentProvider` for development; no external credentials needed.
2. **Testing:** Unit tests mock provider interface; integration tests use internal provider.
3. **Graduated Migration:** Start with internal, add Paystack for staging, swap to licensed provider in production (configuration only).
4. **A/B Testing:** Route payments to different providers based on tier or region; compare latency/success rates.
5. **Fallback:** If Paystack is down, automatically fail over to alternative provider (with business approval).

**Current Provider Implementations:**
- **Payments:** Internal, Paystack, Flutterwave, Licensed (placeholder for regulated rails)
- **Bills:** Stub (returns mock data), Licensed
- **KYC:** Stub, Licensed (Vendor SDK integration)
- **FX:** Stub, Licensed (third-party rate vendor)
- **Cards:** Stub, Licensed (card issuer API)
- **OTP:** Internal (Redis-backed), Licensed (Twilio/AWS SNS)
- **Notifications:** Internal (template-based), Licensed (SendGrid/Firebase)

---

### 6.4 Operational Governance

**Role-Based Access Control (RBAC)**

Endpoints protected by role guards:

```typescript
// Example: Admin-only endpoint for internal funding
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Post('payments/internal/fund')
async internalFund(...) { ... }
```

**Implemented Roles:**
- `USER` (default): Access to own profile, transfers, statements.
- `ADMIN`: Can fund accounts, adjust risk thresholds, run manual cycles.
- Future: `COMPLIANCE_OFFICER`, `RISK_MANAGER`, `FINANCE_OPERATIONS`.

**Audit Event Logging**

Every privileged action logged in `AuditLog` table:

```typescript
export class AuditLog extends BaseEntity {
  userId: string;           // Actor ID
  action: string;           // FUND, FREEZE, UNFREEZE, etc.
  resourceType: string;     // "User", "Account", "Group"
  resourceId: string;       // ID of affected resource
  changes: Record<...>;     // Before/after state
  ipAddress: string;        // Source IP
  userAgent: string;        // Device/browser info
  createdAt: Date;          // Timestamp
}
```

**Risk Framework**

Velocity checks prevent abuse:
- Track transaction count and aggregate value per user in sliding window (e.g., last 1 hour).
- Reject if exceeds thresholds (e.g., max 20 transactions or 500,000 NGN per hour).
- Device context: Flag if transaction from new device or unusual location.
- Escalation: High-risk transactions queued for human review; user frozen pending approval.

**Reconciliation Controls**

Nightly scheduled reconciliation runner:
1. Calculates expected balance per account (sum of all lines).
2. Compares to stored balance (if cached).
3. Detects discrepancies; logs incidents.
4. Sends alert to operations team.
5. Blocks transactions for affected account until resolved.

---

## 7. Detailed Technical Stack

### 7.1 Backend Runtime and Architecture

**TypeScript + NestJS 10**

TypeScript compilation to CommonJS, targeting ES2021:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Rationale:**
- `strict: true` forces explicit type annotations and null checking.
- `experimentalDecorators` enables NestJS dependency injection via `@Injectable()`, `@Controller()`, `@Module()`.
- `emitDecoratorMetadata` allows reflection-driven validation and guards to inspect method parameters.

**NestJS Module Architecture**

16 domain modules organized by business capability:

| Module | Responsibility | Key Services | Entities |
|--------|-----------------|--------------|----------|
| **AuthModule** | JWT lifecycle, OTP flows, token refresh | AuthService, OtpService, RefreshTokenService | RefreshToken |
| **UsersModule** | User creation, profile management | UsersService | User |
| **LedgerModule** | Double-entry posting, account management | LedgerService, AccountsService | Account, JournalEntry, JournalLine |
| **PaymentsModule** | Fund transfers, webhooks, bank resolves | PaymentsService | FundingTransaction, Payout, WebhookEvent |
| **BillsModule** | Bill catalog, beneficiary, purchase | BillsService | BillPayment, BillBeneficiary |
| **AjoModule** | Group lifecycle, cycles, payouts, reminders | AjoService | SavingsGroup, GroupMember, GroupContribution, GroupPayout, GroupActivity |
| **SavingsModule** | Savings vault CRUD, deposits/withdrawals | SavingsService | SavingsVault, SavingsTransaction |
| **CardsModule** | Card issuance, lifecycle, PIN management | CardsService | Card |
| **FxModule** | Rate quotes, conversion posting | FxService | (no persistent entities; uses Ledger) |
| **RemittanceModule** | Inbound/outbound remittance flows | RemittanceService | (integrates with Ledger and Payments) |
| **KycModule** | KYC verification orchestration | KycService | UserKycData |
| **RiskModule** | Velocity checks, device registration, freezes | RiskService | UserDevice, AuditLog |
| **NotificationsModule** | Template-based notifications | NotificationsService | (event-driven; no persistent state) |
| **HealthModule** | Service health checks | HealthService | (no entities) |
| **DatabaseModule** | TypeORM data source setup | (configuration) | (all entities) |
| **RedisModule** | @Global() Redis connection provider | (singleton) | (no entities) |

**Global Middleware & Filters**

Bootstrap in `main.ts`:
```typescript
app.setGlobalPrefix('api');                // All routes prefixed /api
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,                        // Strip unknown properties
    forbidUnknownValues: true,              // Reject unknown properties
    transform: true                         // Auto-transform DTO properties
  })
);
app.useGlobalFilters(new ApiExceptionFilter());  // Standardized error responses
```

**ApiExceptionFilter Behavior:**

```typescript
// Input: throw new BadRequestException('Email already exists');
// Output:
{
  "success": false,
  "error": {
    "statusCode": 400,
    "code": "VALIDATION_ERROR",
    "message": "Email already exists",
    "details": null,
    "path": "/api/auth/register",
    "timestamp": "2026-03-29T10:30:00Z"
  }
}
```

---

### 7.2 Financial Core and Accounting Model

**Entity: Account**
```typescript
@Entity({ name: 'accounts' })
export class Account extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;                           // User (if wallet) or null (if system)

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;                              // NGN, USD, ...

  @Column({ type: 'enum', enum: AccountType })
  type!: AccountType;                               // USER_WALLET, SYSTEM, FEE_COLLECTION, ...

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status!: AccountStatus;                           // ACTIVE, CLOSED, FROZEN

  @Column({ type: 'varchar', length: 128, nullable: true })
  label!: string | null;                            // Human-readable label

  @Column({ type: 'bigint', default: '0' })
  balanceMinor!: string;                            // Stored as string to preserve precision
}
```

**Field Design Rationale:**
- `userId` is nullable to support system accounts (treasury, fees, settlement).
- `balanceMinor` stored as bigint string to avoid JavaScript number precision loss.
- Status enum allows operational flags (FROZEN during disputes).

**Entity: JournalEntry**
```typescript
@Entity({ name: 'journal_entries' })
export class JournalEntry extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  reference!: string;                               // e.g., "TRF-1704067200000"

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;                   // Deduplication key

  @Column({ type: 'enum', enum: JournalStatus, default: JournalStatus.POSTED })
  status!: JournalStatus;                           // POSTED (immutable)

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;                      // e.g., "P2P transfer from Alice to Bob"

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;       // Extensible context (provider, traceID, etc.)

  @OneToMany(() => JournalLine, (line) => line.journalEntry, { cascade: ['insert'] })
  lines!: JournalLine[];                            // Paired debit/credit lines
}
```

**Entity: JournalLine**
```typescript
@Entity({ name: 'journal_lines' })
export class JournalLine extends BaseEntity {
  @Column({ type: 'uuid' })
  journalEntryId!: string;                          // Foreign key to entry

  @Column({ type: 'uuid' })
  accountId!: string;                               // Account being affected

  @Column({ type: 'enum', enum: EntryDirection })
  direction!: EntryDirection;                       // DEBIT or CREDIT

  @Column({ type: 'bigint' })
  amountMinor!: string;                             // Amount in minor units

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;                              // Currency of line

  @Column({ type: 'varchar', length: 255, nullable: true })
  memo!: string | null;                             // Audit memo (e.g., "Source: API transfer")
}
```

**Ledger Service Core Operations**

```typescript
async transfer(params: TransferParams) {
  const reference = `TRF-${Date.now()}`;
  const lines: LedgerLineInput[] = [
    {
      accountId: params.sourceAccountId,
      direction: EntryDirection.DEBIT,
      amountMinor: params.amountMinor,
      currency: params.currency
    },
    {
      accountId: params.destinationAccountId,
      direction: EntryDirection.CREDIT,
      amountMinor: params.amountMinor,
      currency: params.currency
    }
  ];

  // Optional fee
  if (params.feeAccountId && params.feeAmountMinor) {
    lines.push({
      accountId: params.sourceAccountId,
      direction: EntryDirection.DEBIT,
      amountMinor: params.feeAmountMinor,
      currency: params.currency
    });
    lines.push({
      accountId: params.feeAccountId,
      direction: EntryDirection.CREDIT,
      amountMinor: params.feeAmountMinor,
      currency: params.currency
    });
  }

  return this.postEntry({
    reference,
    idempotencyKey: params.idempotencyKey,
    description: params.description ?? 'Transfer',
    enforceNonNegative: true,
    lines
  });
}

async postEntry(params: PostEntryParams) {
  this.validateBalanced(params.lines);  // Debit total = Credit total

  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Check idempotency
    const existing = await checkIdempotency(params.idempotencyKey);
    if (existing) return existing;

    // Post entry and update account balances
    const entry = await insertEntry(params);
    for (const line of params.lines) {
      await updateBalance(line.accountId, line);
    }

    await queryRunner.commitTransaction();
    return entry;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

**Amount Utility Functions**

To prevent floating-point errors, amounts are manipulated as strings:

```typescript
function addMinor(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

function subtractMinor(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString();
}

function ensureNonNegative(amount: string): void {
  if (BigInt(amount) < 0n) {
    throw new Error('Amount cannot be negative');
  }
}
```

---

### 7.3 Data Platform

**PostgreSQL 8.11.3 Configuration**

Production requirements:
- **Replication:** Built-in streaming replication for HA.
- **SSL:** Enforced for client connections.
- **Connection Pooling:** PgBouncer or RDS Proxy for connection management.
- **Backups:** Daily automated snapshots with point-in-time recovery.
- **Indexes:** Strategically created on high-cardinality columns (`userId`, `currency`, `status`).

**TypeORM 0.3.20 Configuration**

```typescript
// typeorm.config.ts
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  ssl: process.env.POSTGRES_SSL ? { rejectUnauthorized: false } : false,
  entities: [
    User, Account, JournalEntry, JournalLine, RefreshToken, UserKycData,
    FundingTransaction, Payout, WebhookEvent,
    BillPayment, BillBeneficiary,
    SavingsGroup, GroupMember, GroupContribution, GroupPayout, GroupActivity,
    SavingsVault, SavingsTransaction,
    Card,
    UserDevice, AuditLog
  ],
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
  synchronize: false,                          // Migrations governance
  logging: process.env.NODE_ENV !== 'production'
};
```

**Migration-Driven Schema Evolution**

All schema changes via TypeORM migrations:

```bash
# Generate migration after entity changes
npx typeorm migration:generate src/migrations/AddPenaltyColumns -d typeorm.config.ts

# Run pending migrations
npm run typeorm:migration:run

# Inspect pending migrations
npm run typeorm:migration:show
```

**Key Indexes for Query Performance**

```typescript
// Account lookup by user + currency (common in statements)
@Index(['userId', 'currency'])

// Journal line queries by account + time range
@Index(['accountId', 'createdAt'])

// Group membership lookups
@Index(['groupId', 'memberId'])

// Risk checks: recent transactions
@Index(['userId', 'createdAt'])
```

---

### 7.4 Async Processing and Real-Time Operations

**Redis 5.3.2 Configuration**

Single Redis instance (cluster for HA):
```typescript
// redis.module.ts
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async () => {
        const redis = new Redis({
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          reconnectOnError: true
        });
        await redis.connect();
        return redis;
      }
    }
  ],
  exports: [REDIS_CLIENT]
})
export class RedisModule {}
```

**Use Cases:**

1. **OTP Storage (5-minute TTL)**
   ```typescript
   // Store OTP
   await redis.setex(`otp:${destination}:${purpose}`, 300, code);
   
   // Verify OTP
   const storedCode = await redis.get(`otp:${destination}:${purpose}`);
   ```

2. **Session Token Cache**
   ```typescript
   // Cache JWT refresh token metadata
   await redis.setex(`token:${jti}`, 7 * 24 * 60 * 60, JSON.stringify({
     userId, email, roles
   }));
   ```

3. **Velocity Counters**
   ```typescript
   // Track transaction count per user per hour
   const key = `velocity:${userId}:txn:${hourKey}`;
   const count = await redis.incr(key);
   if (count === 1) await redis.expire(key, 3600);
   if (count > MAX_TXN_PER_HOUR) throw new RateLimitError();
   ```

**BullMQ 5.9.1 Job Queue**

Two independent job queues for Ajo background operations:

```typescript
// ajo.queue.ts
export const ajoQueues = {
  cycle: new Queue('ajo-cycle', {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    }
  }),
  reminder: new Queue('ajo-reminder', {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: true,
      attempts: 1
    }
  })
};
```

**Queue Workers**

```typescript
// When cycle is created/updated
await ajoQueues.cycle.add('run-cycle', { groupId }, {
  delay: msUntilNextPayoutDate,
  jobId: `cycle-${groupId}`
});

// Worker processes job at scheduled time
ajoQueues.cycle.process('run-cycle', async (job) => {
  const { groupId } = job.data;
  await ajoService.executeGroupCycle(groupId);
});

// Reminder job
const reminderDelay = msUntilNextPayoutDate - (24 * 60 * 60 * 1000);
await ajoQueues.reminder.add('send-reminder', { groupId }, {
  delay: reminderDelay,
  jobId: `reminder-${groupId}`
});
```

**Benefits:**
- **Non-Blocking:** Cycle execution doesn't delay API response.
- **Deterministic:** Job runs exactly once at scheduled time (unless explicitly retried).
- **Resilient:** Job retries on transient failures (network, coordinator unavailable).
- **Observable:** Job history and logs available for debugging.

---

### 7.5 Security and Identity Stack

**JWT Access/Refresh Model**

Access tokens issued with short expiry (15 min, configurable); refresh tokens with longer expiry (7 days):

```typescript
// Create tokens on successful login
const payload = {
  sub: user.id,                 // Subject: User ID
  email: user.email,
  phoneNumber: user.phoneNumber,
  roles: user.roles
};

const accessToken = this.jwtService.sign(payload, {
  secret: configService.get('jwt.secret'),
  expiresIn: configService.get('jwt.expiresIn', '15m')
});

const jti = generateUUID();    // Unique token ID for revocation
const refreshToken = this.jwtService.sign(
  { ...payload, jti },
  {
    secret: configService.get('jwt.refreshSecret'),
    expiresIn: configService.get('jwt.expiresIn', '7d')
  }
);

// Store JTI for revocation checking
await refreshTokenService.store(user.id, jti);
```

**JWT Strategy (Passport)**

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: extractBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret')
    });
  }

  async validate(payload: any) {
    // Called on every protected route; payload is decoded JWT
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;  // Injected as @CurrentUser() parameter
  }
}
```

**Password Hashing with argon2**

```typescript
// On user creation
const hashedPassword = await argon2.hash(password, {
  type: argon2id,
  memoryCost: 65536,          // 64 MB
  timeCost: 3,                // 3 iterations
  parallelism: 4              // 4 threads
});

// On login verification
const valid = await argon2.verify(user.passwordHash, password);
```

**argon2 Selection Rationale:**
- Memory-hard hashing resists GPU-accelerated brute-force attacks.
- Parallelism adds attacker cost without slowing legitimate verification.
- Industry standard (similar to bcrypt but more resistant to future hardware optimization).

**Input Validation via DTO + class-validator**

```typescript
export class LoginDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsMobilePhone()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  // At least one of email or phoneNumber required
  @ValidateIf(() => !this.email && !this.phoneNumber)
  @IsNotEmpty()
  error: string[] = ['Either email or phoneNumber required'];
}

// In controller:
@Post('login')
async login(@Body() dto: LoginDto) {
  // DTO validation happens automatically via global ValidationPipe
  // If invalid, ValidationPipe throws BadRequestException with field errors
  return this.authService.login(dto);
}
```

**Device Registration for Risk Assessment**

```typescript
@Entity({ name: 'user_devices' })
export class UserDevice extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  deviceId!: string;                  // Mobile device unique ID

  @Column({ type: 'varchar', length: 255 })
  deviceName!: string;               // Device name (iOS, Android)

  @Column({ type: 'varchar', length: 50, nullable: true })
  osVersion!: string | null;

  @Column({ type: 'timestamp with time zone' })
  lastSeenAt!: Date;

  @Column({ type: 'varchar', length: 45, nullable: true })
  lastIpAddress!: string | null;     // IPv4 or IPv6

  @Column({ type: 'boolean', default: false })
  isTrusted!: boolean;               // User explicitly trusted this device
}
```

**Audit Logging of Privileged Actions**

```typescript
@Entity({ name: 'audit_logs' })
export class AuditLog extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;                   // Who performed the action

  @Column({ type: 'varchar', length: 50 })
  action!: string;                   // FUND, FREEZE, UNFREEZE, etc.

  @Column({ type: 'varchar', length: 50 })
  resourceType!: string;             // "User", "Account", "Group"

  @Column({ type: 'uuid' })
  resourceId!: string;               // ID of affected resource

  @Column({ type: 'jsonb' })
  changes!: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };

  @Column({ type: 'inet', nullable: true })
  ipAddress!: string | null;         // Source IP (PostgreSQL inet type)

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;         // Browser/device info
}
```

---

### 7.6 Frontend Stack (Mobile)

**React Native 0.81.5 + Expo ~54.0.30**

Cross-platform app sharing 95%+ codebase between iOS and Android:

```typescript
// App.tsx - Root component
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthProvider';
import AppNavigator from './navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

**Navigation Architecture**

```typescript
// AppNavigator.tsx - Root navigation with auth flow
export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) return <SplashScreen />;

  return isAuthenticated ? (
    <AppStack />    // Tab-based navigation post-login
  ) : (
    <AuthStack />   // Stack navigation for login/register
  );
}

// AuthStack: Login → Register → OTP Verification
const AuthStack = () => (
  <Stack.Navigator screenOptions={screenOptions}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="OTP" component={OtpVerificationScreen} />
  </Stack.Navigator>
);

// AppStack: Tabs with nested stacks
const AppStack = () => (
  <Tabs.Navigator>
    <Tabs.Screen name="Wallets" component={WalletsStack} />
    <Tabs.Screen name="Transactions" component={TransactionsStack} />
    <Tabs.Screen name="Ajo" component={AjoStack} />
    <Tabs.Screen name="More" component={MoreStack} />
  </Tabs.Navigator>
);
```

**TanStack React Query Integration**

Automatic server state caching and synchronization:

```typescript
// useWallets hook - automatic cache management
export const useWallets = (token: string) => {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: () => apiClient.getWallets(token),
    staleTime: 5 * 60 * 1000,              // 5 min before refetch
    gcTime: 10 * 60 * 1000,                // 10 min before cache cleanup
    refetchOnWindowFocus: true,            // Refetch on app foreground
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });
};

// useAuthMutations hook - handle async login/register
export const useAuthMutations = () => {
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (dto: LoginDto) => apiClient.login(dto),
    onSuccess: (data) => {
      // Invalidate user queries on successful login
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  return { loginMutation };
};
```

**API Client Implementation**

```typescript
// api/client.ts
export const apiClient = {
  async apiGet<T>(path: string, token?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${BASE_URL}${path}`, { headers });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API Error');
    }
    return response.json();
  },

  async apiPost<T>(path: string, body: any, token?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API Error');
    }
    return response.json();
  }
};
```

**Secure Credential Storage**

```typescript
// auth/useAuth.ts - Secure token persistence
import * as SecureStore from 'expo-secure-store';

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);

  const persistTokens = async (accessToken: string, refreshToken: string) => {
    try {
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);
      setSession({ accessToken, refreshToken });
    } catch (error) {
      console.error('Failed to persist tokens:', error);
    }
  };

  const retrieveTokens = async () => {
    try {
      const accessToken = await SecureStore.getItemAsync('accessToken');
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (accessToken && refreshToken) {
        setSession({ accessToken, refreshToken });
      }
    } catch (error) {
      console.error('Failed to retrieve tokens:', error);
    }
  };

  return { persistTokens, retrieveTokens, session };
};
```

**Rationale for Secure Store:**
- Tokens stored in OS-level encrypted keychain (iOS Keychain / Android Keystore).
- Tokens NOT stored in AsyncStorage (unencrypted, vulnerable to physical device access).
- Prevents token exposure if device is compromised.

---

### 7.7 QA, Testing, and Reliability Tooling

**Jest Unit & Integration Tests**

Configuration:
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  rootDir: 'src',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage'
};
```

**Example Unit Test (OTP Service)**

```typescript
// auth/otp.service.spec.ts
describe('OtpService', () => {
  let service: OtpService;
  let redisMock: jest.Mocked<Redis>;

  beforeEach(async () => {
    redisMock = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn()
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: REDIS_CLIENT, useValue: redisMock }
      ]
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  describe('sendOtp', () => {
    it('should generate and store OTP for 5 minutes', async () => {
      const destination = 'user@example.com';
      const purpose = 'LOGIN';

      await service.sendOtp(destination, 'email', purpose);

      expect(redisMock.setex).toHaveBeenCalledWith(
        `otp:${destination}:${purpose}`,
        300,
        expect.stringMatching(/^\d{6}$/)  // 6-digit code
      );
    });

    it('should throw if OTP already sent (within cooldown)', async () => {
      redisMock.exists = jest.fn().mockResolvedValue(1);

      await expect(
        service.sendOtp('user@example.com', 'sms', 'LOGIN')
      ).rejects.toThrow('OTP cooldown active');
    });
  });

  describe('verifyOtp', () => {
    it('should verify correct OTP and clear from Redis', async () => {
      const destination = 'user@example.com';
      const code = '123456';

      redisMock.get.mockResolvedValue(code);
      redisMock.del = jest.fn().mockResolvedValue(1);

      const result = await service.verifyOtp(destination, 'LOGIN', code);

      expect(result.success).toBe(true);
      expect(redisMock.del).toHaveBeenCalledWith(
        `otp:${destination}:LOGIN`
      );
    });

    it('should reject incorrect OTP', async () => {
      redisMock.get.mockResolvedValue('999999');

      await expect(
        service.verifyOtp('user@example.com', 'LOGIN', '123456')
      ).rejects.toThrow('Invalid OTP');
    });
  });
});
```

---

## 8. Architecture Overview

### 8.1 Logical Layers

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT LAYER                                                │
│ ├─ React Native Mobile App (iOS/Android)                   │
│ ├─ Web Dashboard (future)                                  │
│ └─ Third-party integrations                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ API LAYER                                                   │
│ ├─ NestJS Controllers (15 domain routes)                   │
│ ├─ Auth/JWT Guards                                         │
│ ├─ Global ValidationPipe (DTO normalization)               │
│ └─ Global ApiExceptionFilter (error standardization)       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ DOMAIN SERVICE LAYER                                        │
│ ├─ AuthService (JWT, OTP, refresh)                         │
│ ├─ UsersService (CRUD, profile)                            │
│ ├─ LedgerService (double-entry posting)                    │
│ ├─ PaymentsService (transfer, webhook)                     │
│ ├─ AjoService (group lifecycle, cycles)                    │
│ ├─ BillsService (catalog, purchase)                        │
│ ├─ KycService (vendor orchestration)                       │
│ ├─ RiskService (velocity, freezes)                         │
│ └─ 7 more domain services...                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ FINANCIAL POSTING LAYER                                     │
│ ├─ LedgerService (core authority)                          │
│ ├─ Account balance derivation (sum of lines)               │
│ ├─ Idempotency validation (reference + key dedup)          │
│ └─ Double-entry invariant enforcement                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ DATA LAYER                                                  │
│ ├─ PostgreSQL (system of record)                           │
│ ├─ TypeORM entities and migrations                         │
│ ├─ Transactions with REPEATABLE READ isolation             │
│ └─ Indexes on query-hot columns                            │
└──────────────────────────┬──────────────────────────────────┘

                           │
            ┌──────────────┼──────────────┐
            │              │              │
┌───────────▼────┐  ┌──────▼────────┐  ┌─▼──────────────┐
│ CACHE LAYER    │  │ ASYNC LAYER   │  │ OPS LAYER      │
│ Redis          │  │ BullMQ Queues │  │ QA Scripts     │
│ ├─ OTP codes   │  │ ├─ Ajo cycles │  │ ├─ p0-smoke    │
│ ├─ Sessions    │  │ └─ Reminders  │  │ ├─ reconcile   │
│ └─ Velocity    │  │               │  │ └─ certify     │
└────────────────┘  └───────────────┘  └────────────────┘
```

### 8.2 Critical Business Flows

#### Flow 1: User Registration

```
1. User submits POST /api/auth/register with email, password
2. ValidationPipe validates DTO (email format, password length)
3. AuthService checks email uniqueness (query User table)
4. AuthService hashes password with argon2
5. AuthService creates User record
6. AuthService calls AccountsService.ensureUserBaseAccounts()
   → Creates NGN wallet account (type: USER_WALLET)
   → Creates USD wallet account (type: USER_WALLET)
   → Generated accounts linked to user.id
7. AuthService sends OTP via notification provider
8. Return { userId, message: "Please verify email with OTP" }
```

#### Flow 2: P2P Transfer

```
1. User submits POST /api/transfers with recipientId, amountMinor, currency
2. JwtAuthGuard verifies access token; @CurrentUser injects sender
3. ValidationPipe validates amount > 0, currency in [NGN, USD]
4. PaymentsService calls LedgerService.transfer({
     sourceAccountId: senderWalletId,
     destinationAccountId: recipientWalletId,
     amountMinor,
     currency,
     idempotencyKey: ${senderId}-${recipientId}-${timestamp}
   })
5. LedgerService validates balanced entry (debit = credit)
6. LedgerService queries source account; checks balance sufficient
7. LedgerService begins database transaction
8. LedgerService posts JournalEntry with reference TRF-{nanotime}
9. LedgerService posts 2 JournalLines (DEBIT source, CREDIT recipient)
10. LedgerService updates both account balances
11. Transaction commits; entry immutable
12. PaymentsService publishes TransferCompleted event
13. NotificationsService async sends SMS/email receipt to both users
14. Return { transfId, status: "POSTED", senderBalance, recipientBalance }
```

#### Flow 3: Ajo Group Cycle

```
Setup:
- Group created: SavingsGroup with nextPayoutDate = T+7 days
- Members joined: GroupMember records with sequencing
- Contributions expected: GroupContribution records created

Execution (at nextPayoutDate):
1. BullMQ cycle job fires (scheduled via group.nextPayoutDate)
2. AjoService.executeGroupCycle(groupId) invoked
3. Fetch all members, sort by sequence, get first unpaid member
4. Sum all contributions for cycle (from GroupContribution table)
5. Post ledger transfer: groupEscrowAccount → member's wallet
6. Create GroupPayout record { groupId, memberId, amountMinor, status: POSTED }
7. Create GroupActivity record { groupId, action: "PAYOUT", memberId }
8. Update SavingsGroup.nextPayoutPosition to next member
9. Calculate nextPayoutDate = now + payoutIntervalDays
10. Schedule next cycle job
11. Schedule reminder job (24h before next cycle)
12. NotificationsService sends "Your payout completed" to member
13. NotificationsService sends "Next payout in 7 days" to all members

Handling Defaults:
- If member missed contributions, calculate penalty
- Post penalty entry: member's wallet → fees account
- Create GroupActivity { action: "PENALTY_APPLIED", memberId, reason }
- Move to next member in sequence (skip defaulter in current cycle)
```

#### Flow 4: Bank Transfer (Payout)

```
1. User submits POST /api/payments/bank-transfer with bankCode, accountNumber, amountMinor
2. PaymentsService calls provider.initiate() based on config
   → Internal: Creates Payout record, no external call
   → Paystack: Calls Paystack API, returns reference
   → Licensed: Calls licensed settlement rail
3. PaymentsService posts ledger transfer:
   - DEBIT: user's wallet account
   - CREDIT: settlement account (e.g., SYSTEM_SETTLEMENT_INTERNAL_NGN)
4. PaymentsService creates Payout record { userId, amountMinor, status: PENDING, reference }
5. Provider async settles transfer (webhook callback with status)
6. PaymentsService.creditWalletFromWebhook() processes webhook:
   - Verifies signature
   - Checks idempotency (prevent duplicate credits)
   - If success: updates Payout.status = COMPLETED
   - If failure: rolls back journal entry, Payout.status = FAILED
7. NotificationsService sends status SMS to user
8. Return { payoutId, status, estimatedTime }
```

#### Flow 5: KYC Verification

```
1. User submits POST /api/kyc/start-verification with docType (PASSPORT, NATIONAL_ID, etc.)
2. KycService determines vendor based on KYC_LEVEL and config
   → Stub provider: Returns mock verification (for dev/test)
   → Licensed provider: Calls vendor SDK
3. KycService creates UserKycData record { userId, status: PENDING, vendorReference }
4. Licensed provider returns verification result asynchronously via webhook
5. KycService.processKycWebhook() updates UserKycData.status ∈ [VERIFIED, REJECTED]
6. If VERIFIED: User unlocks higher transaction limits (config-driven)
7. If REJECTED: Risk service may freeze account pending manual review
8. NotificationsService sends "Verification complete" to user
9. RiskService audits KYC action in AuditLog
10. Return { kycId, status, nextSteps }
```

---

## 9. Security, Risk, and Control Framework

### 9.1 Authentication & Authorization

**Token Lifecycle**
- **Access Token:** 15 min expiry; stateless; contains `sub` (user ID), `email`, `roles`.
- **Refresh Token:** 7 days expiry; stored in database with JTI; enables token revocation on logout.
- **Logout:** Delete JTI from `RefreshToken` table; next refresh attempt fails.

**JWT Guard**

```typescript
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException();

    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
```

**Roles Guard**

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles) return true;  // No roles required

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// Usage
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Post('internal/fund')
async internalFund(...) { }
```

### 9.2 Risk Controls

**Velocity Checks**

```typescript
async checkTransactionVelocity(userId: string, amountMinor: string) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const hourKey = Math.floor(now / (60 * 60 * 1000));

  // Count check
  const countKey = `velocity:${userId}:txn:${hourKey}`;
  const count = await redis.incr(countKey);
  if (count === 1) await redis.expire(countKey, 3600);
  if (count > config.limits.maxTransactionsPerHour) {
    throw new RateLimitException();
  }

  // Value check
  const valueKey = `velocity:${userId}:val:${hourKey}`;
  const total = await redis.incrby(valueKey, parseInt(amountMinor));
  if (total === parseInt(amountMinor)) await redis.expire(valueKey, 3600);
  if (total > config.limits.maxValuePerHour) {
    throw new RateLimitException();
  }
}
```

**User Freezing**

```typescript
async freezeUser(userId: string, reason: string) {
  // Update user status
  await usersRepo.update(userId, { status: UserStatus.FROZEN });

  // Log audit event
  await auditLogRepo.save({
    userId: currentAdmin.id,
    action: 'FREEZE_USER',
    resourceType: 'User',
    resourceId: userId,
    changes: { before: { status: 'ACTIVE' }, after: { status: 'FROZEN' } },
    ipAddress: request.ip,
    userAgent: request.get('user-agent')
  });

  // Notify user
  await notificationsService.sendNotification({
    userId,
    message: `Account frozen: ${reason}. Contact support.`,
    channel: 'SMS'
  });
}

// Check before transfer
async transfer(...) {
  const sender = await usersService.findById(senderId);
  if (sender.status === UserStatus.FROZEN) {
    throw new ForbiddenException('Account frozen');
  }
  // ... proceed
}
```

### 9.3 Audit Logging

```typescript
// Every privileged action logged
async adminFundWallet(userId: string, amountMinor: string, adminUser: User) {
  const before = await accountsRepo.findOne(userId);

  // Post ledger entry
  const entry = await ledgerService.transfer({
    sourceAccountId: systemTreasuryAccount.id,
    destinationAccountId: userWallet.id,
    amountMinor
  });

  const after = await accountsRepo.findOne(userId);

  // Audit log
  await auditLogRepo.save({
    userId: adminUser.id,
    action: 'ADMIN_FUND',
    resourceType: 'Account',
    resourceId: userWallet.id,
    changes: {
      before: { balance: before.balanceMinor },
      after: { balance: after.balanceMinor }
    },
    ipAddress: request.ip,
    userAgent: request.get('user-agent')
  });

  return entry;
}
```

### 9.4 Input Validation

**DTO Validation Chain**

```typescript
// 1. Shape validation
export class TransferDto {
  @IsUUID()
  recipientId!: string;

  @IsString()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinor!: string;

  @IsEnum(['NGN', 'USD'])
  currency!: string;
}

// 2. Business validation
async transfer(senderId: string, dto: TransferDto) {
  const source = await accountsRepo.findOne(senderId, dto.currency);
  if (!source) throw new BadRequestException('Wallet not found');
  if (BigInt(source.balanceMinor) < BigInt(dto.amountMinor)) {
    throw new BadRequestException('Insufficient balance');
  }
  // ... proceed
}
```

---

## 10. QA, Testing, and Certification

### 10.1 Test Suite Overview

| Suite | File | Scope | Test Count | Exit Gate |
|-------|------|-------|------------|-----------|
| **P0 Smoke** | `p0-smoke.mjs` | Critical retail + community banking paths | 17 | Required for any release |
| **Domain Batch** | `domain-batch-smoke.mjs` | Extended feature coverage | 25+ | Required for feature releases |
| **Notifications** | `notifications-smoke.mjs` | Event notification system | 8 | Required for notification changes |
| **Security RBAC** | `security-rbac-smoke.mjs` | Authorization matrix; negative testing | 12 | Required for access control changes |
| **Reliability** | `reliability-smoke.mjs` | Stress, concurrency, edge cases | 15 | Required for production runbooks |
| **Load/Baseline** | `load-baseline.mjs` | API response time and throughput | 5 | Quarterly benchmark |
| **Reconciliation** | `reconciliation-check.mjs` | Ledger balance consistency | 3 | Nightly CI job; alerts if fail |
| **Full Certification** | `full-certification.mjs` | Orchestrates all suites | All | Pre-production acceptance test |

### 10.2 P0 Smoke Test Cases (17 Tests)

```
HEALTH-001:   Service availability (GET /api/health)
AUTH-001:     User registration with OTP
AUTH-002:     Login with correct credentials
AUTH-003:     Refresh token lifecycle
AUTH-006:     OTP verification for SMS channel
WALLET-001:   Fetch user wallets (statement)
WALLET-002:   Get account balance
PAY-003:      Webhook funding (internal provider)
PAY-001:      P2P transfer between users
LEDGER-001:   Direct journal entry posting
PAY-002:      Bank transfer initiation (internal provider)
AJO-003:      Create group
AJO-004:      Join group
AJO-005:      Contribute to group
AJO-010:      Execute group cycle (payout)
OPTIONAL-ADMIN:
  - PAY-005:  Admin fund endpoint
  - RISK-001: User freeze action
  - RISK-002: Velocity check enforcement
```

### 10.3 Test Execution

```bash
# Run individual suites
npm run qa:smoke:p0              # P0 critical paths
npm run qa:smoke:domain          # Full feature coverage
npm run qa:smoke:security        # RBAC negative tests
npm run qa:smoke:reliability     # Concurrency, edge cases

# Full certification (all suites in sequence)
npm run qa:certify

# Nightly reconciliation check (CI schedule)
npm run qa:reconcile

# Test configuration via environment
QA_BASE_URL=https://prod.api.example.com \
QA_CURRENCY=NGN \
QA_PASSWORD=testpass123 \
npm run qa:smoke:p0
```

### 10.4 Production Release Gates

```
Release Candidate → Run qa:certify
  ├─ P0 smoke: 100% pass (17/17)
  ├─ Domain batch: 100% pass (25+/25+)
  ├─ Security RBAC: 100% pass (12/12)
  ├─ Reliability: 100% pass (15/15)
  ├─ Reconciliation: Zero critical findings
  ├─ No unresolved high-severity bugs
  └─ Runbook smoke test: Documented, executed by ops

→ PASS: Promotion to production approved
→ FAIL: Block release; remediate & retry
```

---

## 11. Deployment and Operations Requirements

### 11.1 Infrastructure Prerequisites

**Database**
- Managed PostgreSQL 12+ (AWS RDS, Azure Database, Google Cloud SQL).
- Replication: Multi-AZ with automatic failover.
- Backups: Daily snapshots, 30-day retention, point-in-time recovery.
- Monitoring: CPU, RAM, IOPS, connection count, slow query log.
- SSL enforced for all connections.

**Redis**
- Managed Redis 6+ (AWS ElastiCache, Azure Cache, Google Memorystore).
- Replication: Multi-AZ for HA.
- Max memory policy: `allkeys-lru` (evict least-recently-used on memory pressure).
- Monitoring: Memory usage, evictions, replicas status.

**Application Servers**
- Container orchestration: Kubernetes (EKS, AKS, GKE) or Docker Compose (small deployments).
- Replicas: Minimum 3 for high availability.
- Service mesh: Istio optional (for advanced traffic management).
- Container registry: ECR, ACR, or GCR.

### 11.2 Environment Variables

```bash
# App
NODE_ENV=production
PORT=3000

# Database
POSTGRES_HOST=prod-db.region.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_USER=trumonie_app
POSTGRES_PASSWORD=<secure_password>
POSTGRES_DB=trumonie_prod
POSTGRES_SSL=true

# Redis
REDIS_HOST=prod-cache.region.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=<secure_password>

# Auth
JWT_SECRET=<random_256_bit_hex>
JWT_EXPIRES_IN=15m
REFRESH_JWT_SECRET=<random_256_bit_hex>
REFRESH_JWT_EXPIRES_IN=7d
PII_ENCRYPTION_KEY=<random_256_bit_hex>

# System Accounts (created via bootstrap script)
SYSTEM_TREASURY_NGN_ACCOUNT_ID=<uuid>
SYSTEM_TREASURY_USD_ACCOUNT_ID=<uuid>
SYSTEM_FEES_NGN_ACCOUNT_ID=<uuid>
SYSTEM_FEES_USD_ACCOUNT_ID=<uuid>
SYSTEM_SETTLEMENT_INTERNAL_NGN_ACCOUNT_ID=<uuid>
SYSTEM_SETTLEMENT_INTERNAL_USD_ACCOUNT_ID=<uuid>

# Providers (environment-specific)
PAYMENT_PROVIDER=internal|paystack|licensed
PAYSTACK_SECRET_KEY=<if_paystack>
KYC_PROVIDER=stub|licensed
KYC_VENDOR_API_KEY=<if_licensed>
NOTIFICATION_PROVIDER=internal|licensed

# Monitoring (optional)
SENTRY_DSN=<sentry_project_url>
NEW_RELIC_LICENSE_KEY=<license>
DATADOG_API_KEY=<key>
```

### 11.3 Deployment Checklist

- [ ] PostgreSQL migrated to latest schema (`npm run typeorm:migration:run`)
- [ ] Redis cache flushed and verified (`redis-cli PING`)
- [ ] System treasury/fees/settlement accounts bootstrapped (`npm run qa:bootstrap:system-accounts`)
- [ ] Provider secrets verified and rotated
- [ ] SSL certificates renewed (if self-signed)
- [ ] Load balancer health checks configured (HTTP GET /api/health)
- [ ] Monitoring dashboards created (error rate, latency, reconciliation)
- [ ] Alerts configured (transaction failure spike, reconciliation drift)
- [ ] Incident runbooks documented and reviewed
- [ ] Database backup verified (test restore)
- [ ] QA certification passed (qa:certify)
- [ ] Nightly reconciliation configured in CI/CD (cron job)

### 11.4 Operational Monitoring

**Critical Metrics**

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Request Latency (P95)** | < 200ms | > 500ms |
| **Error Rate** | < 0.5% | > 2% |
| **Reconciliation Exception Rate** | 0 | > 0 (hard fail) |
| **Journal Entry Post Success Rate** | > 99.9% | < 99% |
| **BullMQ Job Success Rate** | > 99% | < 95% |
| **Database Connection Pool** | < 80% utilization | > 90% utilization |
| **Redis Memory** | < 70% utilization | > 85% utilization |
| **Last Backup Age** | < 24h | > 36h |

**Dashboards**

1. **Transaction Dashboard:** Transfers, payouts, bills today; success rate; top errors.
2. **Ajo Dashboard:** Cycles run today; payout success rate; penalties applied.
3. **Financial Dashboard:** Total posted volume; fees collected; reconciliation status.
4. **Infrastructure Dashboard:** Database health; Redis health; API response times; error logs.

---

## 12. API Reference

### 12.1 Authentication Endpoints

#### POST /api/auth/register

Register a new user.

**Request**
```json
{
  "email": "user@example.com",
  "phoneNumber": "+2348012345678",
  "password": "SecurePass123!",
  "firstName": "Alice",
  "lastName": "Smith"
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "phoneNumber": "+2348012345678",
    "message": "Registration successful. Please verify your identity."
  }
}
```

**Errors**
- `400 VALIDATION_ERROR`: Email format invalid or password too weak
- `409 CONFLICT`: Email already registered

---

#### POST /api/auth/login

User login with email/phone and password.

**Request**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "roles": ["USER"]
    }
  }
}
```

**Errors**
- `400 VALIDATION_ERROR`: Missing email or password
- `401 UNAUTHORIZED`: Invalid credentials

---

#### POST /api/auth/otp/send

Request OTP for a destination.

**Request**
```json
{
  "destination": "user@example.com",
  "channel": "email",
  "purpose": "LOGIN"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "message": "OTP sent to user@example.com",
    "expiresIn": 300
  }
}
```

---

#### POST /api/auth/otp/verify

Verify OTP and complete authentication.

**Request**
```json
{
  "destination": "user@example.com",
  "code": "123456",
  "purpose": "LOGIN"
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

**Errors**
- `400 BAD_REQUEST`: Invalid or expired OTP
- `429 TOO_MANY_REQUESTS`: Max verification attempts exceeded

---

#### GET /api/auth/me

Get current authenticated user profile.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "phoneNumber": "+2348012345678",
    "firstName": "Alice",
    "lastName": "Smith",
    "roles": ["USER"],
    "status": "ACTIVE",
    "kycStatus": "VERIFIED",
    "createdAt": "2026-03-15T10:30:00Z"
  }
}
```

**Errors**
- `401 UNAUTHORIZED`: Missing or invalid token

---

### 12.2 Ledger / Wallets Endpoints

#### GET /api/wallets

List user's wallets for all currencies.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Query Parameters**
- `currency` (optional): Filter by currency (NGN, USD)
- `status` (optional): Filter by status (ACTIVE, CLOSED, FROZEN)

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "wallets": [
      {
        "id": "acc-001",
        "currency": "NGN",
        "type": "USER_WALLET",
        "balanceMinor": "150000",
        "balanceDisplay": "₦1,500.00",
        "status": "ACTIVE",
        "label": "Main NGN Wallet",
        "createdAt": "2026-03-15T10:30:00Z"
      },
      {
        "id": "acc-002",
        "currency": "USD",
        "type": "USER_WALLET",
        "balanceMinor": "50000",
        "balanceDisplay": "$500.00",
        "status": "ACTIVE",
        "label": "Main USD Wallet",
        "createdAt": "2026-03-15T10:30:00Z"
      }
    ]
  }
}
```

---

#### POST /api/ledger/transfer

P2P wallet transfer.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Request**
```json
{
  "recipientId": "550e8400-e29b-41d4-a716-446655440001",
  "amountMinor": "50000",
  "currency": "NGN",
  "description": "Lunch money",
  "idempotencyKey": "alice-bob-2026-03-29-001"
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "transactionId": "txn-002",
    "status": "POSTED",
    "sender": {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "balanceMinor": "100000",
      "balanceDisplay": "₦1,000.00"
    },
    "recipient": {
      "userId": "550e8400-e29b-41d4-a716-446655440001",
      "balanceMinor": "200000",
      "balanceDisplay": "₦2,000.00"
    },
    "amountMinor": "50000",
    "amountDisplay": "₦500.00",
    "timestamp": "2026-03-29T10:30:00Z"
  }
}
```

**Errors**
- `400 BAD_REQUEST`: Insufficient balance or invalid amount
- `404 NOT_FOUND`: Recipient not found
- `409 CONFLICT`: Idempotency key already posted with different amount

---

### 12.3 Payments Endpoints

#### POST /api/payments/bank-transfer

Initiate bank transfer (payout).

**Headers**
```
Authorization: Bearer <accessToken>
```

**Request**
```json
{
  "bankCode": "011",
  "accountNumber": "1234567890",
  "accountName": "JOHN DOE",
  "amountMinor": "100000",
  "currency": "NGN",
  "narration": "Monthly salary",
  "provider": "internal"
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "payoutId": "payout-001",
    "status": "PENDING",
    "amountMinor": "100000",
    "amountDisplay": "₦1,000.00",
    "recipientAccount": "1234567890",
    "estimatedCompletionTime": "2026-03-29T16:30:00Z",
    "reference": "PAYOUT-1711700400000"
  }
}
```

---

#### POST /api/payments/webhook/:provider

Handle provider webhook callbacks. (Used by payment providers; not called by client)

**Request (Example: Paystack)**
```json
{
  "event": "charge.success",
  "data": {
    "reference": "ref-001",
    "amount": 100000,
    "status": "success"
  }
}
```

---

### 12.4 Ajo Endpoints

#### GET /api/ajo/groups

List user's Ajo groups.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "grp-001",
        "name": "Saturday Savings",
        "creatorId": "550e8400-e29b-41d4-a716-446655440001",
        "currency": "NGN",
        "contributionAmountMinor": "50000",
        "contributionAmountDisplay": "₦500.00",
        "memberTarget": 5,
        "memberCount": 4,
        "status": "ACTIVE",
        "nextPayoutDate": "2026-04-05T14:00:00Z",
        "nextPayoutPosition": 2,
        "myPosition": 2,
        "createdAt": "2026-03-22T10:00:00Z"
      }
    ]
  }
}
```

---

#### POST /api/ajo/groups

Create a new Ajo group.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Request**
```json
{
  "name": "Saturday Savings Club",
  "currency": "NGN",
  "contributionAmountMinor": "50000",
  "memberTarget": 5,
  "payoutIntervalDays": 7,
  "description": "Weekly savings group"
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "groupId": "grp-001",
    "name": "Saturday Savings Club",
    "creatorId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "ACTIVE",
    "nextPayoutDate": "2026-04-05T14:00:00Z",
    "createdAt": "2026-03-29T10:30:00Z"
  }
}
```

---

#### POST /api/ajo/groups/:id/join

Join an existing Ajo group.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "groupId": "grp-001",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "MEMBER",
    "positionInQueue": 4,
    "joinedAt": "2026-03-29T10:30:00Z"
  }
}
```

---

#### POST /api/ajo/groups/:id/run-cycle

Manually trigger cycle execution (admin only).

**Headers**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "cycleId": "cycle-001",
    "groupId": "grp-001",
    "status": "EXECUTED",
    "recipientUserId": "550e8400-e29b-41d4-a716-446655440001",
    "amountPaidOutMinor": "200000",
    "amountPaidOutDisplay": "₦2,000.00",
    "nextPayoutDate": "2026-04-12T14:00:00Z",
    "executedAt": "2026-03-29T14:00:00Z"
  }
}
```

---

### 12.5 Bills Endpoints

#### GET /api/bills/catalog

List available billers.

**Query Parameters**
- `category` (optional): Filter by category (electricity, internet, airtime)
- `provider` (optional): Filter by provider

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "billers": [
      {
        "id": "biller-001",
        "name": "NEPA",
        "category": "electricity",
        "provider": "paystack",
        "icon": "https://...",
        "description": "Electricity bill payment"
      }
    ]
  }
}
```

---

#### POST /api/bills/purchase

Purchase a bill.

**Headers**
```
Authorization: Bearer <accessToken>
```

**Request**
```json
{
  "billerId": "biller-001",
  "accountNumber": "USER-123456",
  "amountMinor": "100000",
  "currency": "NGN",
  "idempotencyKey": "user001-nepa-2026-03-29-001"
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "billPaymentId": "bill-pay-001",
    "status": "PROCESSING",
    "billerId": "biller-001",
    "billerName": "NEPA",
    "amountMinor": "100000",
    "amountDisplay": "₦1,000.00",
    "accountNumber": "USER-123456",
    "reference": "BILL-NEPA-2026032910300000",
    "estimatedCompletionTime": "2026-03-29T10:35:00Z"
  }
}
```

---

## 13. Database Schema and Entity Relationships

### 13.1 Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────┐
│                            USERS DOMAIN                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌─────────────────┐               │
│  │ users        │         │ user_kyc_data   │               │
│  ├──────────────┤         ├─────────────────┤               │
│  │ id (PK)      │◄────────│ id              │               │
│  │ email        │  1:1    │ user_id (FK)    │               │
│  │ phone_number │         │ verification_..│               │
│  │ password_..  │         │ document_type  │               │
│  │ roles (enum) │         │ status         │               │
│  │ status (enum)│         └─────────────────┘               │
│  │ created_at   │                                            │
│  └──────────────┘                                            │
│       │ 1                                                    │
│       │ │                                                    │
│       └─┼──────────┐                                         │
│         │          │ M                                       │
│         │          ▼                                         │
│         │    ┌──────────────────┐                           │
│         │    │ user_devices     │                           │
│         │    ├──────────────────┤                           │
│         │    │ id               │                           │
│         │    │ user_id (FK)     │                           │
│         │    │ device_id        │                           │
│         │    │ last_ip_address  │                           │
│         │    │ is_trusted       │                           │
│         │    └──────────────────┘                           │
│         │                                                    │
│    ┌────┴────────────────────────┐                          │
│    │                             │                          │
│    ▼ M                           ▼ M                        │
│ ┌─────────────────┐    ┌──────────────────┐                │
│ │ refresh_tokens  │    │ accounts (wallet)│                │
│ ├─────────────────┤    ├──────────────────┤                │
│ │ id              │    │ id (PK)          │                │
│ │ user_id (FK)    │    │ user_id (FK/NULL)│                │
│ │ jti             │    │ currency         │                │
│ │ expires_at      │    │ type             │                │
│ │ revoked_at      │    │ status           │                │
│ └─────────────────┘    │ balance_minor    │                │
│                        └──────────────────┘                │
│                              ▲ 1                            │
│                              │                              │
└──────────────────────────────┼──────────────────────────────┘
                               │ M
                         ┌─────┴────────────────┐
                         │   LEDGER DOMAIN      │
                         │                      │
                   ┌─────▼──────────┐          │
                   │ journal_entries│          │
                   ├────────────────┤          │
                   │ id (PK)        │          │
                   │ reference      │──unique  │
                   │ status         │          │
                   │ description    │          │
                   │ metadata       │          │
                   └────┬───────────┘          │
                        │ 1                    │
                        │ │                    │
                        │ │ M                  │
                        ▼ ▼                    │
                   ┌────────────────┐          │
                   │ journal_lines  │          │
                   ├────────────────┤          │
                   │ id             │          │
                   │ journal_entry_id(FK)      │
                   │ account_id (FK)───────────┼──────────────┐
                   │ direction      │          │              │
                   │ amount_minor   │          │              │
                   │ currency       │          │              │
                   │ memo           │          │              │
                   └────────────────┘          │              │
                                              │              │
                         ┌────────────────────┘              │
                         │                                   │
┌────────────────────────┼───────────────────────────────────┘
│      PAYMENTS DOMAIN   │
├──────────────────────────────────────────────────────────┐
│                        │                                 │
│    ┌───────────────────▼────────┐                       │
│    │ funding_transactions       │                       │
│    ├────────────────────────────┤                       │
│    │ id                         │                       │
│    │ user_id (FK)───────┐       │                       │
│    │ provider_reference │       │                       │
│    │ amount_minor       │       │                       │
│    │ status             │       │                       │
│    │ created_at         │       │                       │
│    └────────────────────┘       │                       │
│                                  │                       │
│    ┌─────────────────────┐       │                       │
│    │ payouts             │       │                       │
│    ├─────────────────────┤       │                       │
│    │ id                  │       │                       │
│    │ user_id (FK)────────┼───────┼──────────┐           │
│    │ amount_minor        │       │          │           │
│    │ provider_reference  │       │          │           │
│    │ status              │       │          │           │
│    └─────────────────────┘       │          │           │
│                                  │          │           │
│    ┌─────────────────────┐       │          │           │
│    │ webhook_events      │       │          │           │
│    ├─────────────────────┤       │          │           │
│    │ id                  │       │          │           │
│    │ provider            │       │          │           │
│    │ event_type          │       │          │           │
│    │ payload             │       │          │           │
│    │ status              │       │          │           │
│    └─────────────────────┘       │          │           │
│                                  │          │           │
│                    ┌─────────────┴──────────┤           │
│                    │                        │           │
│                    M                        M           │
│                    │                        │           │
│                    ▼                        ▼           │
│                  accounts ◄─────────────────────────────┤
│                (system treasury,                        │
│                 settlement accts)                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 13.2 Key Entity Definitions

**Users Table**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  roles TEXT[] DEFAULT ARRAY['USER'],
  status ENUM ('ACTIVE', 'FROZEN', 'INACTIVE') DEFAULT 'ACTIVE',
  kyc_status ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED') DEFAULT 'UNVERIFIED',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Accounts Table**
```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL,
  type ENUM ('USER_WALLET', 'SYSTEM', 'FEE_COLLECTION', 'ESCROW', 'SETTLEMENT_INTERNAL', 'SETTLEMENT_LICENSED') NOT NULL,
  status ENUM ('ACTIVE', 'CLOSED', 'FROZEN') DEFAULT 'ACTIVE',
  label VARCHAR(128),
  balance_minor BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (user_id, currency),
  INDEX (user_id, created_at)
);
```

**Journal Entries Table**
```sql
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(64) UNIQUE NOT NULL,
  idempotency_key VARCHAR(128) UNIQUE,
  status ENUM ('POSTED') DEFAULT 'POSTED',
  description VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (reference),
  INDEX (idempotency_key),
  INDEX (created_at)
);
```

**Journal Lines Table**
```sql
CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  direction ENUM ('DEBIT', 'CREDIT') NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  memo VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (account_id, created_at),
  INDEX (journal_entry_id)
);
```

**Ajo Domain Tables**
```sql
CREATE TABLE savings_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  created_by_id UUID NOT NULL REFERENCES users(id),
  currency VARCHAR(3) NOT NULL,
  contribution_amount_minor BIGINT NOT NULL,
  member_target INT NOT NULL,
  status ENUM ('ACTIVE', 'COMPLETED', 'DISSOLVED') DEFAULT 'ACTIVE',
  escrow_account_id UUID REFERENCES accounts(id),
  payout_interval_days INT DEFAULT 7,
  next_payout_position INT DEFAULT 1,
  next_payout_date TIMESTAMP WITH TIME ZONE,
  last_cycle_ref VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (created_by_id),
  INDEX (next_payout_date)
);

CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES savings_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  position_in_queue INT NOT NULL,
  status ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (group_id, user_id),
  INDEX (group_id, position_in_queue)
);

CREATE TABLE group_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES savings_groups(id),
  member_id UUID NOT NULL REFERENCES group_members(id),
  cycle_number INT NOT NULL,
  amount_minor BIGINT NOT NULL,
  status ENUM ('CONTRIBUTED', 'DEFAULTED', 'PENALTY_APPLIED') DEFAULT 'CONTRIBUTED',
  posted_via_journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (group_id, cycle_number),
  INDEX (group_id, member_id)
);

CREATE TABLE group_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES savings_groups(id),
  recipient_member_id UUID NOT NULL REFERENCES group_members(id),
  cycle_number INT NOT NULL,
  amount_minor BIGINT NOT NULL,
  status ENUM ('PENDING', 'POSTED', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
  posted_via_journal_entry_id UUID REFERENCES journal_entries(id),
  scheduled_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  INDEX (group_id, cycle_number),
  INDEX (scheduled_date)
);

CREATE TABLE group_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES savings_groups(id),
  action VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (group_id, action),
  INDEX (group_id, created_at)
);
```

---

## 14. Performance & Scalability

### 14.1 Database Tuning

**Connection Pooling**

```sql
-- PostgreSQL postgresql.conf
max_connections = 200
shared_buffers = 256MB        -- 25% of system RAM
effective_cache_size = 1024MB -- 75% of system RAM
work_mem = 16MB               -- Per-query sort/hash memory
maintenance_work_mem = 64MB   -- For VACUUM, CREATE INDEX, etc.
checkpoint_completion_target = 0.9
wal_buffers = 16MB
random_page_cost = 1.1        -- For SSD
effective_io_concurrency = 200
```

**PgBouncer (Connection Proxy)**

```ini
[databases]
trumonie_prod = host=prod-db.region.rds.amazonaws.com port=5432 dbname=trumonie_prod

[pgbouncer]
pool_mode = transaction       # Return conn to pool after transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 10
timeout = 600
idle_in_transaction_session_timeout = 300000
```

**Key Indexes**

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone_number);

-- Account lookups (high frequency in statement queries)
CREATE INDEX idx_accounts_user_currency ON accounts(user_id, currency);
CREATE INDEX idx_accounts_type_status ON accounts(type, status);

-- Journal line queries (reconciliation, statements)
CREATE INDEX idx_journal_lines_account_date ON journal_lines(account_id, created_at DESC);
CREATE INDEX idx_journal_lines_currency ON journal_lines(currency);

-- Group queries (Ajo operations)
CREATE INDEX idx_savings_groups_next_payout ON savings_groups(next_payout_date)
  WHERE status = 'ACTIVE';
CREATE INDEX idx_group_members_position ON group_members(group_id, position_in_queue);
CREATE INDEX idx_group_payouts_scheduled ON group_payouts(scheduled_date)
  WHERE status IN ('PENDING', 'POSTED');

-- Velocity checks (real-time)
CREATE INDEX idx_transfers_user_created ON journal_lines(account_id, created_at DESC)
  WHERE direction = 'DEBIT';

-- Audit queries
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action, created_at DESC);
```

### 14.2 Redis Optimization

**Key Namespace Strategy**

```
otp:{destination}:{purpose}          → 5 min TTL
session:{jti}                          → 7 day TTL
velocity:{user_id}:txn:{hour}          → 1 hour TTL
velocity:{user_id}:val:{hour}          → 1 hour TTL
refresh-token-blacklist:{jti}          → 7 day TTL
device-trust:{user_id}:{device_id}     → 30 day TTL
cache:user:{user_id}                   → 5 min TTL
cache:wallets:{user_id}                → 5 min TTL
bq:ajo-cycle:{group_id}                → Job queue (BullMQ)
bq:ajo-reminder:{group_id}             → Job queue (BullMQ)
```

**Memory Configuration**

```bash
# Redis maxmemory and eviction policy
maxmemory 4gb
maxmemory-policy allkeys-lru      # Evict LRU key when full

# Monitor memory usage
redis-cli INFO memory
redis-cli --memkeys               # Identify heavy keys
```

### 14.3 API Performance Targets

| Endpoint | P95 Latency | P99 Latency | Throughput |
|----------|-------------|-------------|-----------|
| GET /api/wallets | 50ms | 150ms | 10k req/s |
| POST /api/ledger/transfer | 100ms | 300ms | 5k req/s |
| GET /api/ajo/groups | 40ms | 100ms | 8k req/s |
| POST /api/ajo/groups/:id/run-cycle | 500ms | 1500ms | 500 req/s |
| POST /api/payments/bank-transfer | 200ms | 500ms | 2k req/s |

### 14.4 Horizontal Scaling

**NestJS Application Scaling**
```
Stateless design → horizontal scaling via:
1. Kubernetes auto-scaling (HPA) based on CPU/memory
2. Load balancer distributes traffic to replicas
3. Session data in Redis, not in-memory
4. BullMQ jobs distributed across worker instances
5. Database as single bottleneck → optimize query patterns first

Target: 3-5 replicas per environment (HA), auto-scale 10-50 during peaks
```

**Database Scaling**
```
Read scaling:
- Read replicas for analytics/reporting queries
- Connection pooling to limit backend connection count
- Caching layer (Redis) reduces database load

Write scaling (limited):
- Write goes to single primary
- Partition by user_id or group_id for future horizontal partitioning
- Archive old transactions (> 1 year) to separate schema
```

---

## 15. Compliance and Regulatory Dependencies

### 15.1 Regulatory Requirements

**Not Addressed by Code Alone**

1. **Licensing & Approvals**
   - Operating license from Central Bank of Nigeria (CBN) or equivalent.
   - Approval for each provider integration (Paystack, Flutterwave, etc.).
   - Approval for KYC vendor partnership.

2. **KYC/AML Compliance**
   - Know-Your-Customer procedures (identity verification).
   - Anti-Money Laundering checks (transaction monitoring).
   - Sanctions list screening.
   - Customer Due Diligence (CDD) and Enhanced Due Diligence (EDD) workflows.

3. **Data Privacy**
   - Personal data encryption (PII_ENCRYPTION_KEY usage).
   - Data retention policies (backup/archive/delete schedules).
   - GDPR / Nigerian Data Protection Regulation compliance.
   - Right to erasure and data portability.

4. **Fraud & Risk Management**
   - Chargeback procedures.
   - Dispute resolution workflows.
   - Transaction monitoring for suspicious activity.
   - Risk assessment models (behavioral, device-based).

5. **Audit & Reporting**
   - Regulatory reporting (transaction volumes, customer counts, fraud incidents).
   - Financial audit trail for external auditors.
   - Incident reporting procedures (system breaches, outages).

### 15.2 Technical Compliance Enablers

**TruMonie provides infrastructure for compliance:**

| Technical Layer | Compliance Enabler | Responsibility |
|-----------------|------------------|-----------------|
| **Ledger** | Immutable audit trail of all transactions | Help demonstrate financial controls to regulators |
| **AuditLog Entity** | Logs all privileged actions (admin funding, freezes) | Provide evidence of operational controls |
| **UserKycData Entity** | Tracks KYC status per user, vendor information | Demonstrate KYC coverage and vendor rigor |
| **UserDevice Registry** | Device fingerprinting for transaction linking | Support fraud detection and investigation |
| **Velocity Checks** | Configure risk thresholds | Implement AML transaction monitoring |
| **Journal Reference** | Unique reference per transaction | Link to regulatory systems (if required) |
| **Notification History** | Log all customer communications | Audit trail of customer notifications |

---

## 16. KPI Framework

### 16.1 Product Health Metrics

| KPI | Target | Frequency | Owner |
|-----|--------|-----------|-------|
| **Funded Monthly Active Wallets (fMAW)** | Month-over-month growth | Monthly | Product |
| **P2P Transfer Success Rate** | > 99.9% | Daily | Operations |
| **P2P Transfer Completion Latency (P95)** | < 200ms | Continuous | Engineering |
| **Bank Payout Success Rate** | > 99% | Daily | Operations |
| **Bank Payout Pending Aging** | < 24h median | Daily | Finance |
| **Bills Purchase Success Rate** | > 95% | Daily | Operations |
| **Remittance Success Rate** | > 95% | Daily | Operations |
| **Ajo Group Activation Rate** | % of funded users | Monthly | Product |
| **Ajo Cycle Completion Rate** | > 95% | Monthly | Operations |
| **Ajo Payout Timeliness (Within 1h of scheduled)** | > 98% | Continuous | Operations |

### 16.2 Financial Integrity Metrics

| KPI | Target | Frequency | Owner |
|-----|--------|-----------|-------|
| **Reconciliation Critical Exceptions** | 0 | Daily | Finance |
| **Ledger Balance Mismatch** | 0 | Daily | Engineering |
| **Duplicate Transaction Rate** | 0 | Daily | Engineering |
| **Settlement Float (Pending Payouts)** | < 5% of transaction volume | Weekly | Finance |
| **Fee Collection Accuracy** | 100% vs. expected | Monthly | Finance |

### 16.3 Security & Risk Metrics

| KPI | Target | Frequency | Owner |
|-----|--------|-----------|-------|
| **Fraud Trigger Rate** | < 0.5% of transactions | Daily | Risk |
| **False Positive Rate (Velocity Checks)** | < 2% | Daily | Risk |
| **User Freeze Rate** | < 0.1% | Daily | Risk |
| **Mean Time to Detect Fraud** | < 1h | Continuous | Risk |
| **Mean Time to Respond to Fraud** | < 1h | Continuous | Risk |
| **Security Test Pass Rate (qa:smoke:security)** | 100% | Per release | Security |

---

## 17. Current Constraints and Risks

### 17.1 Known Constraints

1. **Licensed Cutover Dependency**
   - Platform is production-ready, but go-live requires external credentialing (CBN approval, provider contracts).
   - Regulatory review cycle can extend 3-6 months.
   - Parallel operation (internal/licensed) requires settlement account mapping during transition.

2. **Third-Party Provider Availability**
   - Paystack/Flutterwave outages directly affect payout success rates.
   - No built-in fallback (failover logic per business approval).
   - SLA quality varies; platform must be resilient to degraded modes.

3. **Organizational Processes Beyond Software**
   - KYC/AML operational team required to process escalations.
   - Dispute/chargeback workflows (operational procedures, not coded).
   - Compliance team required to manage regulatory relationships.

4. **Scaling Limits (Without Architecture Changes)**
   - Single PostgreSQL write node (primary scales to ~10k writes/sec).
   - Horizontal partitioning (by user_id) needed for multi-region scale.
   - Currently single-region deployment (HA within region).

5. **Frontend Release Readiness**
   - Mobile app must enforce production-safe auth settings (token expiry, secure store usage).
   - App store review cycles add 1-2 weeks to bug fixes.
   - Cannot hot-patch mobile app (unlike backend).

### 17.2 Risk Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Ledger Balance Drift** | Low | Critical | Double-entry enforcement, nightly reconciliation, immutability |
| **Payment Provider Outage** | Medium | High | Provider abstraction, fallback logic, SLA monitoring |
| **Account Freeze Mass Incident** | Low | High | Velocity thresholds tuned conservatively, manual override, rapid remediation |
| **Unauthorized Access (Breach)** | Low | Critical | JWT + argon2, DTO validation, audit logging, device registration |
| **Duplicate Posting (Race Condition)** | Low | High | Idempotency keys, unique constraints, transaction isolation |
| **Regulatory Non-Compliance** | Low | Critical | Audit logging, KYC tracking, AML thresholds, compliance team oversight |
| **Multi-Tenant Data Leakage** | Low | Critical | user_id validation on all queries, DTO filtering (no password hashes returned) |

---

## Appendix: Running TruMonie

### A1. Local Development Setup

```bash
# 1. Clone repository
git clone <repo>
cd TruMonie

# 2. Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with local PostgreSQL / Redis
npm run typeorm:migration:run
npm run start:dev

# 3. Frontend setup (in new terminal)
cd ../frontend
npm install
npm start
# Expo will open; press 'i' for iOS simulator or 'a' for Android emulator
```

### A2. QA Automation

```bash
# Run full certification (all test suites)
npm run qa:certify

# Run P0 smoke tests only
npm run qa:smoke:p0

# Run nightly reconciliation
npm run qa:reconcile

# Run with custom base URL
QA_BASE_URL=https://staging.api.example.com npm run qa:smoke:p0
```

### A3. Production Deployment

```bash
# 1. Build backend
cd backend
npm run build

# 2. Run migrations
npm run typeorm:migration:run

# 3. Start application
PORT=3000 npm start

# 4. Verify health
curl http://localhost:3000/api/health
```

---

**Document Version:** 1.2 (Comprehensive)  
**Last Updated:** March 29, 2026  
**Audience:** Technical Teams (Engineers, Architects, Operations)  
**Status:** Ready for Internal Review
