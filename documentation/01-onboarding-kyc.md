# Module 1 — User Onboarding & KYC

> **Regulatory Authority:** CBN, NIBSS, NIMC
> **Service:** `auth-service`, `kyc-service`

---

## 1. Overview

User onboarding is the gateway to the platform. Every account begins with device binding, proceeds through OTP-based MFA, and is classified into a tiered KYC level that governs transaction limits. The platform must integrate directly with NIBSS (BVN) and NIMC (NIN) APIs, enforce liveness detection, and apply circuit-breaker caps on newly activated devices.

---

## 2. Registration Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Install  │───►│  Device  │───►│   OTP    │───►│   BVN/   │───►│  Tier 1  │
│   App     │    │ Binding  │    │  Verify  │    │   NIN    │    │ Account  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │                │               │               │
                     ▼                ▼               ▼               ▼
               Generate         Send OTP to       Call NIBSS/     Create NUBAN
               device           registered         NIMC APIs      wallet, apply
               fingerprint      mobile number                     Tier 1 limits
```

### 2.1 Step-by-Step

| Step | Action | Technical Detail |
|------|--------|------------------|
| 1 | **App Install** | User downloads from App Store / Play Store. |
| 2 | **Device Binding** | Collect device fingerprint (IMEI hash, OS version, hardware ID). Store as `device_binding` record linked to user. Only **one** active device per user at any time. |
| 3 | **Phone Registration** | Collect phone number. Generate 6-digit OTP (TOTP, 5-minute expiry). Send via SMS gateway. |
| 4 | **OTP Verification** | Validate OTP. Max 3 attempts before 30-minute lockout. |
| 5 | **Basic Info Collection** | Name, date of birth, passport photo upload. |
| 6 | **BVN/NIN Validation** | Call NIBSS BVN API and/or NIMC NIN API. Match name, DOB, and phone against national records. |
| 7 | **Tier 1 Account Creation** | On successful validation → auto-create NUBAN wallet → apply Tier 1 limits. |

---

## 3. Device Binding

### 3.1 Purpose

Prevent unauthorised access by tying a user's account to exactly one physical device at any time. If the user changes devices, they must go through a device transfer flow that re-validates identity.

### 3.2 Data Model

```sql
CREATE TABLE device_bindings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    device_hash     VARCHAR(128) NOT NULL,      -- SHA-256 of device fingerprint
    platform        VARCHAR(20) NOT NULL,        -- 'ios' | 'android'
    os_version      VARCHAR(20),
    app_version     VARCHAR(20),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    bound_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    unbound_at      TIMESTAMPTZ,
    CONSTRAINT uq_active_device UNIQUE (user_id) WHERE (is_active = true)
);

CREATE INDEX idx_device_user ON device_bindings(user_id);
```

### 3.3 Device Transfer Flow

```
User requests device change
        │
        ▼
Deactivate old device_binding (set is_active = false, unbound_at = now())
        │
        ▼
Send OTP to registered phone number
        │
        ▼
On OTP success → Re-validate BVN/NIN
        │
        ▼
Create new device_binding record
        │
        ▼
Apply 24-hour circuit breaker (₦20,000 cap on all inflows/outflows)
```

### 3.4 API Endpoints

#### `POST /api/v1/auth/device/bind`

Binds the current device to the authenticated user.

**Request:**
```json
{
  "device_fingerprint": {
    "hardware_id": "a1b2c3d4e5f6...",
    "platform": "android",
    "os_version": "14.0",
    "app_version": "2.3.1",
    "screen_resolution": "1080x2400"
  }
}
```

**Response (201):**
```json
{
  "binding_id": "uuid",
  "status": "ACTIVE",
  "bound_at": "2025-06-01T12:00:00Z",
  "circuit_breaker": {
    "active": true,
    "expires_at": "2025-06-02T12:00:00Z",
    "max_transaction_amount": 20000
  }
}
```

#### `POST /api/v1/auth/device/transfer`

Initiates a device transfer (requires old device or OTP verification).

**Request:**
```json
{
  "new_device_fingerprint": { "..." },
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "old_binding_id": "uuid",
  "new_binding_id": "uuid",
  "circuit_breaker": {
    "active": true,
    "expires_at": "2025-06-02T12:00:00Z",
    "max_transaction_amount": 20000
  }
}
```

---

## 4. Multi-Factor Authentication (MFA)

### 4.1 OTP Flow

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Client    │────►│  auth-svc  │────►│  SMS GW    │
│  requests  │     │  generates │     │  delivers  │
│  OTP       │     │  6-digit   │     │  OTP       │
└────────────┘     └────────────┘     └────────────┘
                         │
                         ▼
                   Store in Redis:
                   key: otp:{user_id}
                   value: {code, attempts: 0}
                   TTL: 300s (5 min)
```

### 4.2 OTP Data Model (Redis)

```json
{
  "key": "otp:user_123",
  "value": {
    "code": "482917",
    "purpose": "LOGIN | DEVICE_TRANSFER | TRANSACTION",
    "attempts": 0,
    "max_attempts": 3,
    "created_at": "2025-06-01T12:00:00Z"
  },
  "ttl": 300
}
```

### 4.3 API Endpoints

#### `POST /api/v1/auth/otp/send`

```json
// Request
{ "phone": "+2348012345678", "purpose": "LOGIN" }

// Response (200)
{
  "message": "OTP sent",
  "expires_in": 300,
  "resend_after": 60
}
```

#### `POST /api/v1/auth/otp/verify`

```json
// Request
{ "phone": "+2348012345678", "code": "482917", "purpose": "LOGIN" }

// Response (200)
{
  "verified": true,
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2g...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### 4.4 Security Rules

| Rule | Value |
|------|-------|
| OTP length | 6 digits |
| OTP expiry | 300 seconds |
| Max attempts | 3 per cycle |
| Lockout duration | 30 minutes after 3 failures |
| Resend cool-down | 60 seconds |
| OTP reuse | Prohibited (invalidated on first successful use) |

---

## 5. BVN & NIN Integration

### 5.1 Architecture

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  kyc-svc   │────►│  NIBSS     │     │  NIMC      │
│            │     │  BVN API   │     │  NIN API   │
│  (internal)│     │  (external)│     │  (external)│
└────────────┘     └────────────┘     └────────────┘
       │
       ▼
  Validate: name, DOB, phone, photo
  against national biometric databases
```

### 5.2 BVN Validation

#### `POST /api/v1/kyc/bvn/validate` (internal)

**Request:**
```json
{
  "user_id": "uuid",
  "bvn": "22012345678",
  "first_name": "Chukwuemeka",
  "last_name": "Okafor",
  "date_of_birth": "1990-05-15",
  "phone": "+2348012345678"
}
```

**NIBSS API Call (outbound):**
```http
POST https://api.nibss-plc.com.ng/bvn/v2/verify
Authorization: Bearer {nibss_token}
Content-Type: application/json

{
  "bvn": "22012345678"
}
```

**NIBSS Response:**
```json
{
  "responseCode": "00",
  "firstName": "CHUKWUEMEKA",
  "lastName": "OKAFOR",
  "dateOfBirth": "15-May-1990",
  "phoneNumber": "08012345678",
  "enrollmentBank": "057",
  "enrollmentBranch": "LAGOS ISLAND"
}
```

**Matching Logic:**
```
match_score = 0

if normalize(response.firstName) == normalize(request.first_name):
    match_score += 25
if normalize(response.lastName) == normalize(request.last_name):
    match_score += 25
if parse_date(response.dateOfBirth) == request.date_of_birth:
    match_score += 25
if normalize_phone(response.phoneNumber) == normalize_phone(request.phone):
    match_score += 25

PASS if match_score >= 75
FAIL if match_score < 75  →  flag for manual review
```

### 5.3 NIN Validation

#### `POST /api/v1/kyc/nin/validate` (internal)

**Request:**
```json
{
  "user_id": "uuid",
  "nin": "12345678901",
  "first_name": "Chukwuemeka",
  "last_name": "Okafor"
}
```

**NIMC API Call (outbound):**
```http
POST https://api.nimc.gov.ng/v1/nin/verify
Authorization: Bearer {nimc_token}

{ "nin": "12345678901" }
```

### 5.4 KYC Verification Record

```sql
CREATE TABLE kyc_verifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(20) NOT NULL,       -- 'BVN' | 'NIN' | 'LIVENESS' | 'ADDRESS' | 'GOVERNMENT_ID'
    provider        VARCHAR(30) NOT NULL,       -- 'NIBSS' | 'NIMC' | 'INTERNAL'
    reference_id    VARCHAR(100) NOT NULL,       -- BVN or NIN number (encrypted)
    match_score     INTEGER,                     -- 0-100
    status          VARCHAR(20) NOT NULL,       -- 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED'
    raw_response    JSONB,                       -- encrypted response from provider
    metadata        JSONB,                       -- additional context
    verified_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kyc_user ON kyc_verifications(user_id);
CREATE INDEX idx_kyc_status ON kyc_verifications(status);
```

---

## 6. Liveness Checks

### 6.1 Purpose

Defeat static photo attacks, printed masks, and deepfake videos by requiring the user to perform interactive actions in real-time on the device camera.

### 6.2 Challenge-Response Protocol

```
┌────────────┐     ┌────────────┐
│  Client    │◄───►│  kyc-svc   │
│  Camera    │     │  Liveness  │
└────────────┘     └────────────┘

1. Client requests liveness session   →  POST /api/v1/kyc/liveness/start
2. Server returns random challenge    ←  { challenges: ["SMILE", "BLINK", "TURN_LEFT"] }
3. Client captures video frames
4. Client submits frames + metadata   →  POST /api/v1/kyc/liveness/submit
5. Server runs AI analysis
6. Server returns verdict             ←  { passed: true, confidence: 0.97 }
```

### 6.3 Challenge Types

| Challenge | Detection Method | Min Confidence |
|-----------|-----------------|----------------|
| `SMILE` | Facial landmark AU12 activation | 0.85 |
| `BLINK` | Eye aspect ratio (EAR) < threshold | 0.90 |
| `TURN_LEFT` | Yaw angle > 20° | 0.85 |
| `TURN_RIGHT` | Yaw angle < -20° | 0.85 |
| `NOD` | Pitch angle variation > 15° | 0.85 |

### 6.4 Anti-Spoofing Layers

| Layer | Technique |
|-------|-----------|
| **Texture Analysis** | LBP (Local Binary Patterns) to detect printed photos vs. real skin |
| **Depth Estimation** | Monocular depth estimation to detect flat screens |
| **Motion Consistency** | Optical flow analysis to detect pre-recorded video playback |
| **Temporal Analysis** | Random timing between challenges to prevent scripted responses |
| **Device Sensors** | Cross-reference gyroscope/accelerometer data with head movement |

### 6.5 API Endpoints

#### `POST /api/v1/kyc/liveness/start`

```json
// Request
{ "user_id": "uuid", "session_type": "KYC_UPGRADE" }

// Response (200)
{
  "session_id": "uuid",
  "challenges": [
    { "type": "SMILE", "duration_ms": 3000 },
    { "type": "BLINK", "duration_ms": 2000 },
    { "type": "TURN_LEFT", "duration_ms": 3000 }
  ],
  "expires_at": "2025-06-01T12:05:00Z"
}
```

#### `POST /api/v1/kyc/liveness/submit`

```json
// Request (multipart/form-data)
{
  "session_id": "uuid",
  "frames": [/* base64-encoded video frames */],
  "device_sensors": {
    "gyroscope": [/* sensor readings */],
    "accelerometer": [/* sensor readings */]
  }
}

// Response (200)
{
  "session_id": "uuid",
  "passed": true,
  "confidence": 0.97,
  "challenge_results": [
    { "type": "SMILE", "passed": true, "confidence": 0.96 },
    { "type": "BLINK", "passed": true, "confidence": 0.98 },
    { "type": "TURN_LEFT", "passed": true, "confidence": 0.95 }
  ]
}
```

---

## 7. Tiered KYC Levels

### 7.1 Tier Definitions

| Tier | Requirements | Daily Limit | Max Balance |
|------|-------------|-------------|-------------|
| **Tier 1** | Passport photo, full name, phone number, BVN or NIN | ₦30,000 | ₦300,000 |
| **Tier 2** | Tier 1 + verified government-issued ID (International Passport, Driver's License, Voter's Card, National ID) | ₦100,000 | ₦500,000 |
| **Tier 3** | Tier 2 + physical address verification + liveness check | ₦25,000,000 (individuals) | Unlimited |

### 7.2 Tier Upgrade Flow

```
Tier 1 (auto on registration)
    │
    ├── Upload government ID ──► ID verification API ──► Match against BVN/NIN photo
    │                                                           │
    │                                                    ┌──────┴──────┐
    │                                                    │  Match?     │
    │                                                    │  ≥ 85%      │
    │                                                    └──────┬──────┘
    │                                                           │ YES
    │                                                     Tier 2 ✓
    │
    ├── Submit proof of address ──► Address verification service
    │   (Utility bill, bank statement)      │
    │                                   ┌───┴───┐
    │                                   │ Valid? │
    │                                   └───┬───┘
    │                                       │ YES
    ├── Complete liveness check ──► Confidence ≥ 0.85?
    │                                       │ YES
    │                                 Tier 3 ✓
```

### 7.3 Data Model

```sql
CREATE TABLE user_kyc_tiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    tier            INTEGER NOT NULL DEFAULT 1 CHECK (tier IN (1, 2, 3)),
    daily_limit     BIGINT NOT NULL,             -- in kobo (₦30,000 = 3000000)
    max_balance     BIGINT NOT NULL,             -- in kobo
    upgraded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    upgraded_by     VARCHAR(20) NOT NULL,        -- 'AUTO' | 'MANUAL_REVIEW' | 'SYSTEM'
    verification_ids UUID[],                      -- references to kyc_verifications
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tier limits configuration (rule engine)
CREATE TABLE tier_limits (
    tier            INTEGER PRIMARY KEY,
    daily_limit     BIGINT NOT NULL,             -- kobo
    max_balance     BIGINT NOT NULL,             -- kobo
    weekly_limit    BIGINT,
    monthly_limit   BIGINT,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tier_limits (tier, daily_limit, max_balance, effective_from) VALUES
(1,   3000000,    30000000,  '2025-01-01'),   -- ₦30,000 / ₦300,000
(2,  10000000,    50000000,  '2025-01-01'),   -- ₦100,000 / ₦500,000
(3, 2500000000,  NULL,       '2025-01-01');   -- ₦25,000,000 / Unlimited
```

### 7.4 API Endpoints

#### `GET /api/v1/kyc/tier`

```json
// Response
{
  "user_id": "uuid",
  "current_tier": 2,
  "daily_limit": 10000000,
  "max_balance": 50000000,
  "daily_spent": 2500000,
  "remaining_daily": 7500000,
  "upgrade_requirements": {
    "next_tier": 3,
    "missing": ["LIVENESS", "ADDRESS_VERIFICATION"],
    "completed": ["GOVERNMENT_ID"]
  }
}
```

#### `POST /api/v1/kyc/tier/upgrade`

```json
// Request
{
  "target_tier": 3,
  "verification_ids": ["uuid-liveness", "uuid-address"]
}

// Response (200)
{
  "previous_tier": 2,
  "new_tier": 3,
  "daily_limit": 2500000000,
  "max_balance": null,
  "upgraded_at": "2025-06-01T14:00:00Z"
}
```

---

## 8. New Device Circuit Breaker

### 8.1 Rule

All inflows and outflows are capped at **₦20,000** for the first **24 hours** after application activation on a new device.

### 8.2 Implementation

```sql
CREATE TABLE circuit_breakers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(30) NOT NULL,        -- 'NEW_DEVICE'
    max_amount      BIGINT NOT NULL,             -- kobo (₦20,000 = 2000000)
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 8.3 Middleware Check (Pseudocode)

```typescript
async function checkCircuitBreaker(userId: string, amount: number): Promise<void> {
  const breaker = await db.circuitBreakers.findActive(userId, 'NEW_DEVICE');

  if (!breaker) return; // no active breaker

  if (now() > breaker.expires_at) {
    await db.circuitBreakers.deactivate(breaker.id);
    return;
  }

  if (amount > breaker.max_amount) {
    throw new TransactionLimitError({
      code: 'CIRCUIT_BREAKER_EXCEEDED',
      message: `New device cap: max ₦${breaker.max_amount / 100} per transaction for ${remaining_hours} more hours`,
      max_amount: breaker.max_amount,
      expires_at: breaker.expires_at
    });
  }
}
```

---

## 9. User Data Model

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           VARCHAR(15) NOT NULL UNIQUE,
    email           VARCHAR(255),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    middle_name     VARCHAR(100),
    date_of_birth   DATE NOT NULL,
    gender          VARCHAR(10),
    bvn_hash        VARCHAR(128),                -- SHA-256 of BVN
    nin_hash        VARCHAR(128),                -- SHA-256 of NIN
    bvn_encrypted   BYTEA,                       -- AES-256 encrypted BVN
    nin_encrypted   BYTEA,                       -- AES-256 encrypted NIN
    passport_photo  VARCHAR(500),                -- S3/GCS URL
    kyc_tier        INTEGER NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'
    pin_hash        VARCHAR(255),                -- bcrypt/argon2id hash
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_bvn ON users(bvn_hash);
CREATE INDEX idx_users_status ON users(status);
```

---

## 10. Event Publishing

All onboarding events are published to Kafka for downstream consumption by the wallet engine, fraud engine, and audit service.

```json
// Topic: user.events
{
  "event_id": "uuid",
  "event_type": "USER_REGISTERED | DEVICE_BOUND | KYC_VERIFIED | TIER_UPGRADED | DEVICE_TRANSFERRED",
  "user_id": "uuid",
  "timestamp": "2025-06-01T12:00:00Z",
  "payload": {
    "tier": 1,
    "verification_type": "BVN",
    "device_hash": "a1b2c3..."
  },
  "metadata": {
    "ip_address": "102.89.xxx.xxx",
    "user_agent": "NigeriaFinApp/2.3.1 Android/14",
    "correlation_id": "uuid"
  }
}
```

---

## 11. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_001` | 400 | Invalid phone number format |
| `AUTH_002` | 400 | OTP expired |
| `AUTH_003` | 429 | Too many OTP attempts — locked for 30 min |
| `AUTH_004` | 409 | Device already bound to another user |
| `AUTH_005` | 403 | Circuit breaker active — transaction exceeds new device cap |
| `KYC_001` | 400 | BVN format invalid (must be 11 digits) |
| `KYC_002` | 400 | NIN format invalid (must be 11 digits) |
| `KYC_003` | 422 | BVN/NIN validation failed — name mismatch |
| `KYC_004` | 422 | Liveness check failed — confidence below threshold |
| `KYC_005` | 409 | BVN already associated with another account |
| `KYC_006` | 503 | NIBSS/NIMC service unavailable (circuit breaker open) |
| `KYC_007` | 400 | Government ID not readable or expired |
| `KYC_008` | 422 | Address verification failed |
