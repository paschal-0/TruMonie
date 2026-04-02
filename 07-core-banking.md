# Module 7 — Core Banking Functionality

> **Service:** `core-banking-engine` | **Regulatory Authority:** CBN

---

## 1. Overview

The core banking engine handles the General Ledger (GL), double-entry transaction posting, customer account management, and regulatory reporting. For Non-Interest Financial Institutions (NIFI), it implements Mudarabah and Musharakah profit-sharing engines while strictly excluding interest (Riba).

---

## 2. Cloud-Native Architecture

```
┌────────────────────────────────────────────┐
│           CORE BANKING ENGINE              │
│                                            │
│  ┌──────────────┐  ┌──────────────────┐   │
│  │ Customer     │  │ Account          │   │
│  │ Management   │  │ Management       │   │
│  └──────────────┘  └──────────────────┘   │
│                                            │
│  ┌──────────────┐  ┌──────────────────┐   │
│  │ General      │  │ Transaction      │   │
│  │ Ledger       │  │ Posting Engine   │   │
│  └──────────────┘  └──────────────────┘   │
│                                            │
│  ┌──────────────┐  ┌──────────────────┐   │
│  │ Profit-      │  │ Regulatory       │   │
│  │ Sharing      │  │ Reporting        │   │
│  │ Engine       │  │ Engine           │   │
│  └──────────────┘  └──────────────────┘   │
└────────────────────────────────────────────┘
```

**Requirements:** Modular microservices (e.g., SeaBaas, Mambu), elastic scaling, ≥ 99.95% availability.

---

## 3. General Ledger (GL)

### 3.1 Chart of Accounts

```
1000 - ASSETS
  1100 - Cash & Bank Balances
    1110 - Vault Cash
    1120 - Balances with CBN
    1130 - Commercial Bank Accounts
  1200 - Customer Assets (Financing)
    1210 - Murabaha Receivables
    1220 - Musharakah Investments
  1300 - Fixed Assets

2000 - LIABILITIES
  2100 - Customer Deposits
    2110 - Savings Accounts
    2120 - Current Accounts
    2130 - Agent Wallets
  2200 - Profit Payable to Depositors
  2300 - Regulatory Reserves

3000 - EQUITY
  3100 - Paid-up Capital
  3200 - Retained Earnings

4000 - INCOME
  4100 - Fee Income
  4200 - Commission Income
  4300 - Profit Share (from Mudarabah/Musharakah)

5000 - EXPENSES
  5100 - Operating Expenses
  5200 - Staff Costs
  5300 - Profit Distributed to Investors
```

### 3.2 GL Data Model

```sql
CREATE TABLE gl_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code    VARCHAR(10) NOT NULL UNIQUE,
    account_name    VARCHAR(200) NOT NULL,
    parent_code     VARCHAR(10),
    account_type    VARCHAR(20) NOT NULL,    -- 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
    normal_balance  VARCHAR(6) NOT NULL,     -- 'DEBIT' | 'CREDIT'
    currency        VARCHAR(3) NOT NULL DEFAULT 'NGN',
    balance         BIGINT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gl_postings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL,
    gl_account_code VARCHAR(10) NOT NULL REFERENCES gl_accounts(account_code),
    entry_type      VARCHAR(6) NOT NULL,     -- 'DEBIT' | 'CREDIT'
    amount          BIGINT NOT NULL CHECK (amount > 0),
    narration       TEXT NOT NULL,
    value_date      DATE NOT NULL,
    posted_by       VARCHAR(50) NOT NULL,    -- service name or user
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INVARIANT: For every transaction_id: SUM(debits) = SUM(credits)
```

---

## 4. Transaction Posting Engine

Every financial event generates GL postings automatically.

### 4.1 Posting Rules

| Event | Debit | Credit |
|-------|-------|--------|
| Customer deposit | 1130 (Bank) | 2110 (Savings) |
| Customer withdrawal | 2110 (Savings) | 1130 (Bank) |
| Transfer fee | 2110 (Savings) | 4100 (Fee Income) |
| NIP outbound | 2110 (Savings) | 1130 (Bank) |
| NIP inbound | 1130 (Bank) | 2110 (Savings) |
| Mudarabah profit (to investor) | 4300 (Profit Share) | 5300 (Distributed) |

### 4.2 Posting Pseudocode

```typescript
async function postTransaction(event: TransactionEvent): Promise<void> {
  const rules = await getPostingRules(event.type);

  const postings = rules.map(rule => ({
    transaction_id: event.transaction_id,
    gl_account_code: resolveAccount(rule, event),
    entry_type: rule.entry_type,
    amount: event.amount,
    narration: rule.narration_template.replace('{details}', event.description),
    value_date: event.value_date
  }));

  // Validate: total debits == total credits
  const totalDebits  = postings.filter(p => p.entry_type === 'DEBIT').reduce((s, p) => s + p.amount, 0);
  const totalCredits = postings.filter(p => p.entry_type === 'CREDIT').reduce((s, p) => s + p.amount, 0);
  if (totalDebits !== totalCredits) throw new LedgerImbalanceError();

  await db.glPostings.bulkInsert(postings);
  await updateGLBalances(postings);
}
```

---

## 5. Non-Interest (Islamic) Finance Engine

### 5.1 Mudarabah (Profit Sharing)

An arrangement where one party provides capital and the other provides labor/expertise. Profits are shared by agreed ratio; losses borne by the capital provider.

**Formula:**

```
P_investor = (A_pool − E_management − PER) × PSR_investor

Where:
  A_pool          = Total pool earnings during period
  E_management    = Management expenses
  PER             = Profit Equalization Reserve allocation
  PSR_investor    = Profit Sharing Ratio for investor (e.g., 0.60)
```

**Example:**
```
Pool earns ₦10,000,000
Management expenses: ₦500,000
PER allocation: ₦200,000

Distributable profit = ₦10,000,000 − ₦500,000 − ₦200,000 = ₦9,300,000

Investor (60:40 ratio):
  Investor share = ₦9,300,000 × 0.60 = ₦5,580,000
  Manager share  = ₦9,300,000 × 0.40 = ₦3,720,000
```

### 5.2 Musharakah (Joint Partnership)

Both parties contribute capital and share profits/losses according to agreed ratios.

```sql
CREATE TABLE profit_sharing_pools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_name       VARCHAR(100) NOT NULL,
    pool_type       VARCHAR(20) NOT NULL,    -- 'MUDARABAH' | 'MUSHARAKAH'
    total_capital   BIGINT NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    psr_investor    DECIMAL(5,4) NOT NULL,   -- e.g., 0.6000
    psr_manager     DECIMAL(5,4) NOT NULL,   -- e.g., 0.4000
    per_rate        DECIMAL(5,4) NOT NULL DEFAULT 0.0200,  -- 2%
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profit_distributions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES profit_sharing_pools(id),
    period          DATE NOT NULL,
    gross_earnings  BIGINT NOT NULL,
    expenses        BIGINT NOT NULL,
    per_allocation  BIGINT NOT NULL,
    distributable   BIGINT NOT NULL,
    investor_share  BIGINT NOT NULL,
    manager_share   BIGINT NOT NULL,
    distributed_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. Regulatory Reporting

### 6.1 Form MMFBR 300

Monthly return required by CBN. The GL is structured to auto-generate this.

```typescript
async function generateMMFBR300(month: Date): Promise<MMFBR300Report> {
  return {
    reporting_period: month,
    total_deposits: await getGLBalance('2100', month),
    total_assets: await getGLBalance('1000', month),
    total_liabilities: await getGLBalance('2000', month),
    equity: await getGLBalance('3000', month),
    income: await getGLBalance('4000', month),
    expenses: await getGLBalance('5000', month),
    transaction_volume: await getTransactionCount(month),
    transaction_value: await getTransactionValue(month),
    active_accounts: await getActiveAccountCount(month),
    agent_count: await getActiveAgentCount(month)
  };
}
```

### 6.2 Automated Reports

| Report | Frequency | Recipient |
|--------|-----------|-----------|
| MMFBR 300 | Monthly | CBN |
| Suspicious Transaction Report (STR) | As needed | NFIU |
| Currency Transaction Report (CTR) | Daily (for > ₦5M) | NFIU |
| Capital Adequacy | Quarterly | CBN |
| Liquidity Report | Weekly | CBN |

---

## 7. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `CBE_001` | 400 | GL account not found |
| `CBE_002` | 400 | Ledger imbalance — debits ≠ credits |
| `CBE_003` | 400 | Invalid posting rule |
| `CBE_004` | 500 | Profit sharing calculation error |
| `CBE_005` | 400 | Pool period expired |
| `CBE_006` | 503 | Reporting engine unavailable |
