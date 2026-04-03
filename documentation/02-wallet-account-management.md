# Module 2 — Wallet & Account Management

> **Service:** `wallet-service` | **Regulatory Authority:** CBN

---

## 1. Overview

The wallet engine manages NUBAN-compliant accounts, processes real-time balance updates via event-driven architecture, supports multiple funding channels, issues virtual accounts (NGN/EUR/GBP), and maintains an immutable transaction history for 5+ years.

---

## 2. Wallet Auto-Creation

Triggered when a user achieves **Tier 1 KYC**. The `kyc-service` publishes a `TIER_UPGRADED` event; `wallet-service` consumes it and generates a NUBAN account.

```
kyc-service ──► Kafka (TIER_UPGRADED) ──► wallet-service ──► NUBAN Provider
                                                │
                                          Create wallet record
                                          Create opening ledger entry
                                                │
                                          Kafka (WALLET_CREATED) ──► notification-service
```

**NUBAN Check Digit:** `10 - MOD(Σ(weights × digits), 10)` using weights `[3,7,3,3,7,3,3,7,3]` over Bank Code (3) + Serial (6).

---

## 3. Data Model

```sql
CREATE TABLE wallets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id),
    account_number    VARCHAR(10) NOT NULL UNIQUE,
    account_name      VARCHAR(200) NOT NULL,
    currency          VARCHAR(3) NOT NULL DEFAULT 'NGN',
    wallet_type       VARCHAR(20) NOT NULL DEFAULT 'PERSONAL',
    balance           BIGINT NOT NULL DEFAULT 0,      -- kobo
    available_balance BIGINT NOT NULL DEFAULT 0,
    ledger_balance    BIGINT NOT NULL DEFAULT 0,
    status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    tier              INTEGER NOT NULL DEFAULT 1,
    daily_limit       BIGINT NOT NULL,
    max_balance       BIGINT,
    frozen_reason     TEXT,
    frozen_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Balance Types:**

| Field | Meaning |
|-------|---------|
| `balance` | Total confirmed balance (settled credits − debits) |
| `available_balance` | `balance` minus active holds — what the user can spend |
| `ledger_balance` | `balance` plus pending/uncleared credits — for reconciliation |

---

## 4. Real-Time Balance (Event-Driven)

```
NIP Credit Notification ──► Kafka (nip.credit) ──► wallet-service consumer
    │
    ├── 1. Validate & dedup (idempotency key)
    ├── 2. Acquire pg_advisory_xact_lock(wallet_id)
    ├── 3. INSERT ledger_entries (DEBIT + CREDIT pair)
    ├── 4. UPDATE wallet balance
    ├── 5. SET Redis balance cache
    └── 6. Publish Kafka (wallet.events → BALANCE_UPDATED)
              │
              ├── Push notification service
              └── Fraud engine
```

**Optimistic Locking:**
```sql
SELECT pg_advisory_xact_lock(hashtext(@wallet_id::text));
UPDATE wallets SET balance = balance - @amount, available_balance = available_balance - @amount
WHERE id = @wallet_id AND available_balance >= @amount AND status = 'ACTIVE'
RETURNING balance, available_balance;
```

---

## 5. Double-Entry Ledger

```sql
CREATE TABLE ledger_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id   UUID NOT NULL,
    wallet_id        UUID NOT NULL REFERENCES wallets(id),
    entry_type       VARCHAR(6) NOT NULL,     -- 'DEBIT' | 'CREDIT'
    amount           BIGINT NOT NULL CHECK (amount > 0),
    balance_before   BIGINT NOT NULL,
    balance_after    BIGINT NOT NULL,
    currency         VARCHAR(3) NOT NULL DEFAULT 'NGN',
    description      TEXT NOT NULL,
    reference        VARCHAR(100) NOT NULL,
    category         VARCHAR(30) NOT NULL,
    metadata         JSONB,
    posted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Invariant:** `SUM(credits) - SUM(debits) = 0` for every `transaction_id`.

---

## 6. Funding Channels

| Channel | Provider | Settlement |
|---------|----------|------------|
| Bank Transfer (NIP) | NIBSS | Instant |
| Card-to-Account | Paystack / Flutterwave | T+0 |
| USSD | NIBSS USSD | Instant |
| Virtual Account | Squad / Fincra / UfitPay | Instant |

#### `POST /api/v1/wallet/fund`
```json
// Request
{ "wallet_id": "uuid", "amount": 500000, "channel": "CARD", "card_token": "tok_abc", "idempotency_key": "uuid" }

// Response (200)
{ "transaction_id": "uuid", "reference": "FND-20250601-ABC", "amount": 500000, "status": "SUCCESS", "new_balance": 2500000 }
```

---

## 7. Virtual Accounts

Issue named virtual accounts in **NGN, EUR, GBP** for automated reconciliation.

```sql
CREATE TABLE virtual_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    account_number  VARCHAR(20) NOT NULL UNIQUE,
    account_name    VARCHAR(200) NOT NULL,
    bank_name       VARCHAR(100) NOT NULL,
    bank_code       VARCHAR(10) NOT NULL,
    currency        VARCHAR(3) NOT NULL,
    provider        VARCHAR(30) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `POST /api/v1/wallet/virtual-account`
```json
// Request
{ "wallet_id": "uuid", "currency": "NGN" }
// Response (201)
{ "account_number": "7812345678", "account_name": "CHUKWUEMEKA OKAFOR", "bank_name": "WEMA BANK", "currency": "NGN" }
```

---

## 8. Transaction History

Retained for **5 years** post-relationship. Every transaction has unique reference, timestamps, and full metadata.

```sql
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference       VARCHAR(100) NOT NULL UNIQUE,
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(20) NOT NULL,        -- 'CREDIT' | 'DEBIT'
    category        VARCHAR(30) NOT NULL,
    amount          BIGINT NOT NULL,
    fee             BIGINT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL,        -- 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED'
    description     TEXT NOT NULL,
    counterparty    JSONB,
    balance_before  BIGINT NOT NULL,
    balance_after   BIGINT NOT NULL,
    channel         VARCHAR(20),
    session_id      VARCHAR(100),
    metadata        JSONB,
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Partition by month for performance
```

#### `GET /api/v1/wallet/{wallet_id}/transactions`

Supports filters: `start_date`, `end_date`, `category`, `status`, `type`, `min_amount`, `max_amount`, pagination (`page`, `per_page`).

---

## 9. Limit Enforcement (Pseudocode)

```typescript
async function enforceWalletLimits(wallet: Wallet, amount: number, type: 'CREDIT' | 'DEBIT') {
  await checkCircuitBreaker(wallet.user_id, amount);                    // new device cap
  if (type === 'CREDIT' && wallet.max_balance && wallet.balance + amount > wallet.max_balance)
    throw new WalletLimitError('MAX_BALANCE_EXCEEDED');
  if (type === 'DEBIT') {
    const dailySpent = await getDailySpent(wallet.id);
    if (dailySpent + amount > wallet.daily_limit) throw new WalletLimitError('DAILY_LIMIT_EXCEEDED');
    if (wallet.available_balance < amount)         throw new InsufficientFundsError();
  }
}
```

---

## 10. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `WAL_001` | 404 | Wallet not found |
| `WAL_002` | 400 | Insufficient funds |
| `WAL_003` | 400 | Daily limit exceeded |
| `WAL_004` | 400 | Max balance exceeded |
| `WAL_005` | 403 | Wallet frozen / inactive |
| `WAL_006` | 409 | Duplicate (idempotency) |
| `WAL_007` | 503 | NUBAN service unavailable |
