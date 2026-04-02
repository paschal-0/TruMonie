# Module 9 — Platform Administration

> **Service:** `admin-service`, `reporting-service` | **Portal:** SLSG

---

## 1. Overview

Platform administration covers role-based access control (RBAC), maker-checker protocols for sensitive operations, unified dashboards for transaction monitoring and fraud control, SLSG integration for regulatory reporting, and real-time analytics.

---

## 2. Role-Based Access Control (RBAC)

### 2.1 Role Hierarchy

```
SUPER_ADMIN
    │
    ├── COMPLIANCE_OFFICER
    │       ├── View all transactions
    │       ├── View fraud alerts
    │       ├── Generate regulatory reports
    │       └── Approve/reject STRs
    │
    ├── OPERATIONS_MANAGER
    │       ├── View dashboards
    │       ├── Manage agents
    │       ├── Override transaction limits (maker)
    │       └── Manage settlements
    │
    ├── FINANCE_OFFICER
    │       ├── GL management
    │       ├── Settlement reconciliation
    │       └── Generate financial reports
    │
    ├── CUSTOMER_SUPPORT
    │       ├── View customer profiles
    │       ├── Reset PINs (maker)
    │       ├── Freeze/unfreeze wallets (maker)
    │       └── View transaction history
    │
    └── AUDITOR (read-only)
            ├── View all audit logs
            ├── View all compliance events
            └── Export reports
```

### 2.2 Data Model

```sql
CREATE TABLE admin_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    role            VARCHAR(30) NOT NULL,
    department      VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    mfa_enabled     BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role            VARCHAR(30) NOT NULL,
    resource        VARCHAR(50) NOT NULL,        -- 'WALLET' | 'TRANSFER' | 'AGENT' | ...
    action          VARCHAR(20) NOT NULL,        -- 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE'
    requires_checker BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. Maker-Checker Controls

Sensitive operations require **two people**: a maker (initiator) and a checker (approver).

### 3.1 Operations Requiring Maker-Checker

| Operation | Maker Role | Checker Role |
|-----------|-----------|--------------|
| Freeze/unfreeze wallet | CUSTOMER_SUPPORT | OPERATIONS_MANAGER |
| Override transaction limit | OPERATIONS_MANAGER | SUPER_ADMIN |
| Manual credit/debit | FINANCE_OFFICER | SUPER_ADMIN |
| Agent suspension | OPERATIONS_MANAGER | COMPLIANCE_OFFICER |
| System configuration change | OPERATIONS_MANAGER | SUPER_ADMIN |
| User role assignment | SUPER_ADMIN | SUPER_ADMIN (different person) |

### 3.2 Maker-Checker Flow

```
Maker initiates action
    │
    ▼
┌──────────────────┐
│  Pending Action   │  status: PENDING_APPROVAL
│  (stored in DB)   │  maker_id, action, payload
└────────┬─────────┘
         │
    Checker reviews
         │
    ┌────┴────┐
    ▼         ▼
 APPROVE    REJECT
    │         │
    ▼         ▼
 Execute   Log rejection
 action    Notify maker
```

### 3.3 Data Model

```sql
CREATE TABLE pending_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type     VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     UUID NOT NULL,
    payload         JSONB NOT NULL,
    maker_id        UUID NOT NULL REFERENCES admin_users(id),
    maker_reason    TEXT NOT NULL,
    checker_id      UUID REFERENCES admin_users(id),
    checker_reason  TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    -- 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
    expires_at      TIMESTAMPTZ NOT NULL,        -- 24-hour expiry
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: maker ≠ checker
ALTER TABLE pending_actions ADD CONSTRAINT
  chk_maker_checker CHECK (maker_id != checker_id);
```

### 3.4 API

#### `POST /api/v1/admin/actions` (Maker)
```json
{
  "action_type": "FREEZE_WALLET",
  "resource_type": "WALLET",
  "resource_id": "uuid",
  "payload": { "reason": "Suspected fraud", "duration": "48h" },
  "reason": "Customer reported unauthorized transactions"
}
```

#### `POST /api/v1/admin/actions/{id}/approve` (Checker)
```json
{ "reason": "Confirmed with fraud team. Approved." }
```

#### `POST /api/v1/admin/actions/{id}/reject` (Checker)
```json
{ "reason": "Insufficient evidence. Need more investigation." }
```

---

## 4. SLSG Integration

The **Smart Licensing & Supervisory Gateway** is a shared portal coordinating reporting across CBN, SEC, NDIC, and other regulators.

### 4.1 Integration Points

| Function | SLSG API |
|----------|----------|
| License renewal | `POST /slsg/v1/licenses/renew` |
| Periodic returns | `POST /slsg/v1/returns/submit` |
| Incident reports | `POST /slsg/v1/incidents/report` |
| Compliance attestation | `POST /slsg/v1/attestations/submit` |

### 4.2 Automated Report Submission

```typescript
// Scheduled job: monthly
async function submitMonthlyReturns(month: Date) {
  const mmfbr300 = await generateMMFBR300(month);
  const response = await slsgClient.submitReturn({
    report_type: 'MMFBR_300',
    period: month,
    data: mmfbr300,
    institution_code: config.INSTITUTION_CODE
  });
  await db.regulatorySubmissions.create({
    report_type: 'MMFBR_300',
    period: month,
    slsg_reference: response.reference,
    status: response.status
  });
}
```

---

## 5. Dashboards

### 5.1 Transaction Monitoring Dashboard

```json
{
  "metrics": {
    "today": {
      "total_transactions": 45230,
      "total_value": 2850000000,
      "success_rate": 98.7,
      "avg_processing_time_ms": 340,
      "peak_tps": 125,
      "pending_count": 23
    },
    "by_channel": {
      "NIP": { "count": 18500, "value": 1200000000 },
      "INTERNAL": { "count": 12300, "value": 450000000 },
      "BILL_PAY": { "count": 8200, "value": 320000000 },
      "POS": { "count": 6230, "value": 880000000 }
    },
    "failures": {
      "total": 587,
      "by_reason": {
        "INSUFFICIENT_FUNDS": 234,
        "BENEFICIARY_BANK_DOWN": 189,
        "LIMIT_EXCEEDED": 98,
        "BLOCKED_BY_FRAUD": 66
      }
    }
  }
}
```

### 5.2 Fraud Control Dashboard

Links identity data with transactional behaviour:

```json
{
  "risk_overview": {
    "active_alerts": 12,
    "pending_reviews": 45,
    "blocked_transactions_today": 23,
    "total_blocked_value": 8500000,
    "false_positive_rate": 4.2
  },
  "recent_alerts": [
    {
      "alert_id": "uuid",
      "user_id": "uuid",
      "user_name": "JOHN DOE",
      "risk_score": 85,
      "reason": "Velocity anomaly + new beneficiary high amount",
      "transaction_amount": 450000,
      "status": "PENDING_REVIEW",
      "created_at": "2025-06-01T14:25:00Z"
    }
  ],
  "model_performance": {
    "precision": 0.92,
    "recall": 0.88,
    "f1_score": 0.90,
    "model_version": "fraud-v2.3.1"
  }
}
```

### 5.3 Agent Performance Dashboard

```json
{
  "summary": {
    "total_agents": 1250,
    "active_today": 1089,
    "suspended": 23,
    "low_balance_agents": 45,
    "total_daily_volume": 450000000
  },
  "top_agents": [
    { "agent_code": "AGT-001", "name": "Mama Nkechi", "txn_count": 89, "volume": 12500000, "score": 95 }
  ],
  "bottom_agents": [
    { "agent_code": "AGT-342", "name": "Emeka POS", "txn_count": 2, "volume": 150000, "score": 22 }
  ]
}
```

---

## 6. System Configuration

All configurable parameters stored centrally with version history:

```sql
CREATE TABLE system_config (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key      VARCHAR(100) NOT NULL,
    config_value    JSONB NOT NULL,
    description     TEXT,
    changed_by      UUID NOT NULL REFERENCES admin_users(id),
    approved_by     UUID REFERENCES admin_users(id),
    version         INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Example configs:
-- tier_1_daily_limit: 3000000
-- new_device_circuit_breaker_hours: 24
-- nip_retry_max_attempts: 5
-- agent_daily_cashout_limit: 120000000
```

---

## 7. Audit Log Viewer

| Filter | Options |
|--------|---------|
| Date Range | Start / End date picker |
| Actor | User ID, Admin ID, or SYSTEM |
| Resource Type | WALLET, TRANSFER, USER, AGENT, CONFIG |
| Action | CREATE, UPDATE, DELETE, VIEW, APPROVE |
| Correlation ID | Trace related events |

#### `GET /api/v1/admin/audit-logs`
```json
{
  "logs": [
    {
      "id": "uuid",
      "event_type": "WALLET_FROZEN",
      "actor": { "id": "uuid", "name": "Admin Name", "role": "OPERATIONS_MANAGER" },
      "resource": { "type": "WALLET", "id": "uuid" },
      "action": "UPDATE",
      "before": { "status": "ACTIVE" },
      "after": { "status": "FROZEN", "reason": "Fraud investigation" },
      "ip_address": "102.89.x.x",
      "created_at": "2025-06-01T10:30:00Z"
    }
  ]
}
```

---

## 8. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `ADM_001` | 403 | Insufficient permissions |
| `ADM_002` | 400 | Maker-checker: maker cannot approve own action |
| `ADM_003` | 400 | Pending action expired |
| `ADM_004` | 409 | Pending action already resolved |
| `ADM_005` | 503 | SLSG integration unavailable |
| `ADM_006` | 400 | Invalid system configuration value |
