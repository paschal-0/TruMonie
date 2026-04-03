# Module 8 — Agency Banking

> **Service:** `agent-service` | **Regulatory Authority:** CBN
> **Critical Date:** April 1, 2026 — Agent Exclusivity Rule takes effect

---

## 1. Overview

Agency banking extends financial services through physical agents. By **April 1, 2026**, agents must be tied to a single Principal and one Super Agent network. All transactions must flow through dedicated agent wallets — personal accounts are prohibited. Strict daily/weekly limits apply.

---

## 2. Agent Exclusivity Rule (2026)

### 2.1 Requirements

| Rule | Detail |
|------|--------|
| **Single Principal** | Each agent bound to exactly one bank/fintech (Principal) |
| **Single Super Agent** | Each agent uses one super-agent network only |
| **Effective Date** | April 1, 2026 |
| **Violation Penalty** | Agent termination + regulatory sanctions |

### 2.2 Implementation

```sql
CREATE TABLE agent_exclusivity (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agents(id),
    principal_id    UUID NOT NULL,               -- the bank/fintech
    super_agent_id  UUID NOT NULL,
    effective_date  DATE NOT NULL DEFAULT '2026-04-01',
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    verified_at     TIMESTAMPTZ,
    verified_by     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce uniqueness: one agent → one principal
CREATE UNIQUE INDEX idx_agent_exclusivity ON agent_exclusivity(agent_id) WHERE status = 'ACTIVE';
```

### 2.3 Exclusivity Validation Middleware

```typescript
async function validateExclusivity(agentId: string, principalId: string): Promise<void> {
  const record = await db.agentExclusivity.findActive(agentId);
  if (record && record.principal_id !== principalId) {
    throw new AgentExclusivityError({
      code: 'AGT_001',
      message: 'Agent is bound to a different Principal',
      bound_principal: record.principal_id
    });
  }
}
```

---

## 3. Agent Onboarding

### 3.1 Flow

```
Agent Application
    │
    ├── Owner BVN/NIN verification (via kyc-service)
    ├── Business location verification
    ├── Principal selection & agreement
    ├── Super Agent network assignment
    │
    ▼
Agent Account Created
    │
    ├── Dedicated agent wallet created
    ├── POS terminal(s) provisioned (if applicable)
    ├── Geo-fence configured for business location
    └── Training/certification recorded
```

### 3.2 Agent Data Model

```sql
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID NOT NULL REFERENCES users(id),
    agent_code      VARCHAR(20) NOT NULL UNIQUE,
    business_name   VARCHAR(200) NOT NULL,
    business_address JSONB NOT NULL,
    geo_location    JSONB NOT NULL,
    agent_type      VARCHAR(20) NOT NULL,        -- 'INDIVIDUAL' | 'CORPORATE'
    principal_id    UUID NOT NULL,
    super_agent_id  UUID NOT NULL,
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    tier            VARCHAR(10) NOT NULL DEFAULT 'BASIC',
    certified_at    TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    suspended_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. Agent Wallet Management

### 4.1 Rules

- All agent transactions **must** flow through the dedicated agent wallet.
- **Personal accounts are strictly prohibited** for agent transactions.
- Principal must monitor wallet balances in **real-time** to ensure liquidity.

### 4.2 Agent Wallet

```sql
-- Agent wallets use wallet_type = 'AGENT' in the wallets table
-- Additional agent-specific fields:
CREATE TABLE agent_wallet_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    agent_id        UUID NOT NULL REFERENCES agents(id),
    float_limit     BIGINT NOT NULL,             -- max float balance
    low_balance_threshold BIGINT NOT NULL,        -- alert when below this
    auto_fund_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_fund_source  UUID,                      -- source wallet for auto-funding
    auto_fund_amount  BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. Transaction Limits

### 5.1 Limits Table

| Type | Limit | Period |
|------|-------|--------|
| **Customer Cash-In** | ₦100,000 | Daily |
| **Customer Cash-Out** | ₦100,000 | Daily |
| **Customer Total** | ₦500,000 | Weekly |
| **Agent Cumulative Cash-Out** | ₦1,200,000 | Daily |
| **Single Transaction** | ₦100,000 | Per transaction |

### 5.2 Limits Data Model

```sql
CREATE TABLE agent_limits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    limit_type      VARCHAR(30) NOT NULL,
    period          VARCHAR(10) NOT NULL,        -- 'DAILY' | 'WEEKLY' | 'TRANSACTION'
    max_amount      BIGINT NOT NULL,             -- kobo
    applies_to      VARCHAR(20) NOT NULL,        -- 'CUSTOMER' | 'AGENT'
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO agent_limits (limit_type, period, max_amount, applies_to, effective_from) VALUES
('CASH_IN',            'DAILY',       10000000,  'CUSTOMER', '2025-01-01'),
('CASH_OUT',           'DAILY',       10000000,  'CUSTOMER', '2025-01-01'),
('TOTAL',              'WEEKLY',      50000000,  'CUSTOMER', '2025-01-01'),
('CUMULATIVE_CASH_OUT','DAILY',      120000000,  'AGENT',    '2025-01-01'),
('SINGLE_TXN',         'TRANSACTION', 10000000,  'CUSTOMER', '2025-01-01');
```

---

## 6. Cash-In / Cash-Out Operations

### 6.1 Cash-In (Customer Deposits)

```
Customer → Cash → Agent → Agent Wallet → Customer Wallet

POST /api/v1/agents/cash-in
```

```json
// Request
{
  "agent_id": "uuid",
  "customer_account": "0123456789",
  "amount": 5000000,            // ₦50,000
  "pin": "1234",
  "idempotency_key": "uuid"
}

// Response (200)
{
  "transaction_id": "uuid",
  "reference": "AGT-CI-20250601-001",
  "status": "SUCCESS",
  "amount": 5000000,
  "commission": 5000,           // ₦50 commission
  "agent_balance": 85000000,
  "customer_name": "CHUKWUEMEKA OKAFOR"
}
```

### 6.2 Cash-Out (Customer Withdrawals)

```
Customer Wallet → Agent Wallet → Cash → Customer

POST /api/v1/agents/cash-out
```

```json
// Request
{
  "agent_id": "uuid",
  "customer_account": "0123456789",
  "amount": 3000000,
  "customer_pin": "5678",       // customer authenticates
  "agent_pin": "1234",
  "idempotency_key": "uuid"
}

// Response (200)
{
  "transaction_id": "uuid",
  "reference": "AGT-CO-20250601-001",
  "status": "SUCCESS",
  "amount": 3000000,
  "commission": 5000,
  "agent_balance": 82000000
}
```

---

## 7. Agent Commissions

```sql
CREATE TABLE agent_commissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES agents(id),
    transaction_id  UUID NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,   -- 'CASH_IN' | 'CASH_OUT' | 'BILL_PAYMENT'
    transaction_amount BIGINT NOT NULL,
    commission_amount  BIGINT NOT NULL,
    rate            DECIMAL(5,4) NOT NULL,   -- e.g., 0.0010 (0.1%)
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.1 Commission Structure

| Transaction Type | Rate | Cap |
|-----------------|------|-----|
| Cash-In | 0.10% of amount | ₦100 max |
| Cash-Out | 0.10% of amount | ₦100 max |
| Bill Payment | ₦20 flat | — |
| Account Opening | ₦50 flat per Tier 1 | — |

---

## 8. Performance & Liquidity Monitoring

### 8.1 Real-Time Dashboard Metrics

```json
{
  "agent_id": "uuid",
  "agent_code": "AGT-001",
  "wallet_balance": 85000000,
  "low_balance_alert": false,
  "today": {
    "cash_in_count": 23,
    "cash_in_total": 45000000,
    "cash_out_count": 18,
    "cash_out_total": 38000000,
    "remaining_cash_out_limit": 82000000,
    "commission_earned": 81000
  },
  "this_week": {
    "total_transactions": 152,
    "total_volume": 320000000,
    "total_commission": 520000
  },
  "performance_score": 87,         // 0-100
  "uptime_percentage": 98.5,
  "last_transaction_at": "2025-06-01T14:30:00Z"
}
```

### 8.2 Liquidity Alerts

| Alert | Trigger |
|-------|---------|
| Low Balance Warning | Agent balance < `low_balance_threshold` |
| Critical Balance | Agent balance < ₦10,000 |
| Auto-Fund Trigger | Balance drops below threshold (if enabled) |
| Daily Limit Near | Agent has used 80% of daily cash-out cap |

---

## 9. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AGT_001` | 403 | Agent exclusivity violation |
| `AGT_002` | 400 | Customer daily limit exceeded |
| `AGT_003` | 400 | Agent daily cash-out limit exceeded |
| `AGT_004` | 400 | Insufficient agent wallet balance |
| `AGT_005` | 403 | Agent suspended |
| `AGT_006` | 403 | Personal account used for agent transaction |
| `AGT_007` | 400 | Customer weekly limit exceeded |
| `AGT_008` | 400 | Single transaction limit exceeded |
