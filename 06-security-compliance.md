# Module 6 — Security & Compliance

> **Service:** `fraud-service`, `audit-service` | **Regulatory Authority:** CBN, NDPC, NFIU

---

## 1. Overview

Security is layered: MFA + biometrics for authentication, AI-driven monitoring for fraud, explainable alerts for regulatory reporting, and immutable audit trails retained for 5 years. The platform must respond to APP (Authorised Push Payment) fraud reports within 30 minutes and resolve within 48 hours.

---

## 2. Multi-Factor Authentication

### 2.1 MFA Matrix

| Action | PIN | OTP | Biometric |
|--------|-----|-----|-----------|
| Login | ✓ | ✓ (first login) | Optional |
| Transfer < ₦50,000 | ✓ | — | — |
| Transfer ≥ ₦50,000 | ✓ | ✓ | — |
| Transfer ≥ ₦500,000 | ✓ | ✓ | ✓ |
| Bill payment | ✓ | — | — |
| Device transfer | — | ✓ | ✓ |
| PIN reset | — | ✓ | ✓ |
| Profile changes | ✓ | ✓ | — |

### 2.2 Biometric Authentication

```typescript
// Biometric challenge types
type BiometricType = 'FINGERPRINT' | 'FACE_ID';

interface BiometricChallenge {
  challenge_id: string;
  type: BiometricType;
  expires_at: string;    // 60 seconds
}
```

Biometrics are processed **on-device** (Android BiometricPrompt / iOS LocalAuthentication). The server receives a signed attestation, not raw biometric data.

---

## 3. AI Fraud Monitoring

### 3.1 Detection Engine Architecture

```
Transaction Events (Kafka)
        │
        ▼
┌───────────────────────────┐
│  FRAUD ENGINE             │
│                           │
│  ┌─────────────────────┐  │
│  │ Rule Engine          │  │   Real-time rules:
│  │ (Velocity, Limits)   │  │   - > 5 transfers in 10 min
│  └──────────┬──────────┘  │   - Transaction > 3x avg
│             │              │   - New beneficiary + high amount
│  ┌──────────▼──────────┐  │
│  │ ML Model             │  │   Supervised model:
│  │ (Anomaly Detection)  │  │   - Random Forest / XGBoost
│  └──────────┬──────────┘  │   - Features: velocity, geo, device, time
│             │              │
│  ┌──────────▼──────────┐  │
│  │ Graph Analysis       │  │   Network analysis:
│  │ (Mule Detection)     │  │   - Connected component detection
│  └──────────┬──────────┘  │   - Ring/funnel patterns
│             │              │
└─────────────┼──────────────┘
              ▼
       Risk Score (0-100)
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  ALLOW    REVIEW    BLOCK
  (0-40)   (41-70)   (71-100)
```

### 3.2 Detection Rules

| Rule | Trigger | Risk Score |
|------|---------|------------|
| Velocity | > 5 transfers in 10 minutes | +30 |
| High Value | Transaction > 3× user's 30-day average | +20 |
| New Beneficiary | First-time beneficiary + amount > ₦100,000 | +15 |
| Geographic Anomaly | Transaction location > 100 km from usual | +25 |
| Time Anomaly | Transaction between 01:00–05:00 WAT | +10 |
| Device Mismatch | Transaction from unbound device | +40 |
| Rapid Drain | > 70% balance withdrawn in 1 hour | +35 |

### 3.3 API — Report Fraud

#### `POST /api/v1/fraud/reports`

```json
// Request
{
  "transaction_id": "uuid",
  "report_type": "APP_FRAUD",          // Authorised Push Payment
  "description": "I was tricked into sending money",
  "reported_amount": 500000
}

// Response (201)
{
  "report_id": "uuid",
  "status": "RECEIVED",
  "beneficiary_bank_notified": true,
  "notification_sent_at": "2025-06-01T12:05:00Z",    // < 30 min requirement
  "resolution_deadline": "2025-06-03T12:05:00Z"       // 48 hours
}
```

---

## 4. Explainable Alerts

AI must provide clear rationales for each flagged transaction (CBN "Apply and Explain"):

```json
{
  "alert_id": "uuid",
  "transaction_id": "uuid",
  "risk_score": 78,
  "decision": "BLOCKED",
  "reasons": [
    { "rule": "VELOCITY", "detail": "7 transfers in last 8 minutes (threshold: 5/10min)", "contribution": 30 },
    { "rule": "NEW_BENEFICIARY_HIGH_AMOUNT", "detail": "First transfer to this beneficiary; amount ₦250,000 exceeds ₦100,000 threshold", "contribution": 15 },
    { "rule": "GEOGRAPHIC_ANOMALY", "detail": "Transaction from Kano, Nigeria; usual location Lagos (distance: 850km)", "contribution": 25 },
    { "rule": "TIME_ANOMALY", "detail": "Transaction at 02:43 WAT; outside normal hours (06:00–23:00)", "contribution": 10 }
  ],
  "model_version": "fraud-v2.3.1",
  "feature_importances": {
    "transfer_velocity_10m": 0.32,
    "beneficiary_novelty": 0.18,
    "geo_distance_km": 0.28,
    "hour_of_day": 0.12,
    "amount_vs_avg_ratio": 0.10
  },
  "recommended_action": "HOLD_AND_CONTACT_CUSTOMER",
  "generated_at": "2025-06-01T02:43:15Z"
}
```

---

## 5. Fraud Response Timelines (CBN)

| Event | Deadline |
|-------|----------|
| Receive APP fraud report | — |
| Notify beneficiary bank | **30 minutes** |
| Freeze beneficiary funds (if available) | **Immediate** on notification |
| Complete investigation | **48 hours** |
| Report to NFIU (if suspicious) | **72 hours** |

---

## 6. Audit Trail

### 6.1 Immutable Log

All activity logs and compliance events are stored in an append-only audit table, retained for **5 years**.

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(50) NOT NULL,
    actor_id        UUID,                        -- user or system
    actor_type      VARCHAR(20) NOT NULL,        -- 'USER' | 'ADMIN' | 'SYSTEM'
    resource_type   VARCHAR(50) NOT NULL,        -- 'WALLET' | 'TRANSFER' | 'USER' | ...
    resource_id     UUID NOT NULL,
    action          VARCHAR(30) NOT NULL,        -- 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW'
    before_state    JSONB,                       -- previous state (for updates)
    after_state     JSONB,                       -- new state
    ip_address      INET,
    user_agent      TEXT,
    correlation_id  UUID NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only: no UPDATE or DELETE triggers allowed
-- Partition by month for archival
```

### 6.2 Compliance Events

```sql
CREATE TABLE compliance_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(50) NOT NULL,
    -- 'SUSPICIOUS_TRANSACTION' | 'PEP_MATCH' | 'SANCTION_MATCH'
    -- 'THRESHOLD_BREACH' | 'FRAUD_REPORT' | 'MANUAL_REVIEW'
    reference_id    UUID NOT NULL,
    user_id         UUID,
    risk_level      VARCHAR(10) NOT NULL,        -- 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    details         JSONB NOT NULL,
    resolution      VARCHAR(20),                 -- 'CLEARED' | 'ESCALATED' | 'REPORTED'
    resolved_by     UUID,
    resolved_at     TIMESTAMPTZ,
    nfiu_reported   BOOLEAN NOT NULL DEFAULT false,
    nfiu_report_ref VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. PIN Security

| Rule | Value |
|------|-------|
| PIN length | 4 or 6 digits (configurable) |
| Hash algorithm | Argon2id (memory: 64MB, iterations: 3, parallelism: 4) |
| Max wrong attempts | 5 before lockout |
| Lockout duration | 30 minutes (escalating: 1h, 24h) |
| PIN history | Cannot reuse last 3 PINs |
| PIN expiry | 90 days (prompt to change, not force) |

---

## 8. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `SEC_001` | 401 | Invalid PIN |
| `SEC_002` | 429 | Account locked — too many failed attempts |
| `SEC_003` | 403 | Biometric verification failed |
| `SEC_004` | 403 | Transaction blocked by fraud engine |
| `SEC_005` | 400 | MFA required for this transaction |
| `FRD_001` | 201 | Fraud report received |
| `FRD_002` | 400 | Transaction already reported |
| `FRD_003` | 503 | Fraud engine unavailable |
