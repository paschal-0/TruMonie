# Module 5 — Merchant & POS Ecosystem

> **Service:** `merchant-service` | **Regulatory Authority:** CBN, PTSA

---

## 1. Overview

Merchant onboarding requires BVN/NIN verification for business owners and TIN for corporates. All POS transactions route through a licensed **PTSA** (Payment Terminal Service Aggregator). Terminals are geo-fenced to registered locations (10 m tolerance). Settlement is offered as T+0 or T+1.

---

## 2. Merchant Onboarding

### 2.1 Flow

```
Business Owner Registration
    │
    ├── BVN/NIN verification (reuse kyc-service)
    ├── TIN verification (for corporate entities)
    ├── Business address verification
    ├── Settlement account validation
    │
    ▼
Merchant Account Created
    │
    ├── Merchant wallet auto-created
    ├── Terminal(s) provisioned
    └── Geo-fence configured
```

### 2.2 Data Model

```sql
CREATE TABLE merchants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id     UUID NOT NULL REFERENCES users(id),
    business_name     VARCHAR(200) NOT NULL,
    business_type     VARCHAR(20) NOT NULL,     -- 'SOLE_PROPRIETORSHIP' | 'LLC' | 'PLC'
    tin               VARCHAR(20),              -- Tax ID (required for corporates)
    rc_number         VARCHAR(20),              -- CAC registration number
    category_code     VARCHAR(10) NOT NULL,     -- MCC (Merchant Category Code)
    wallet_id         UUID REFERENCES wallets(id),
    settlement_account VARCHAR(10),
    settlement_bank   VARCHAR(10),
    address           JSONB NOT NULL,
    geo_location      JSONB NOT NULL,           -- { "lat": 6.5244, "lng": 3.3792 }
    geo_fence_radius  INTEGER NOT NULL DEFAULT 10, -- meters
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    approved_at       TIMESTAMPTZ,
    approved_by       UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.3 API

#### `POST /api/v1/merchants`

```json
// Request
{
  "business_name": "Mama Nkechi Stores",
  "business_type": "SOLE_PROPRIETORSHIP",
  "category_code": "5411",
  "address": { "street": "25 Broad Street", "city": "Lagos Island", "state": "Lagos" },
  "geo_location": { "lat": 6.4541, "lng": 3.4084 },
  "settlement_account": "0123456789",
  "settlement_bank": "058"
}

// Response (201)
{
  "merchant_id": "uuid",
  "status": "PENDING",
  "wallet_id": "uuid",
  "merchant_code": "MRC-20250601-001"
}
```

---

## 3. POS Terminal Management

### 3.1 Terminal Data Model

```sql
CREATE TABLE pos_terminals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    terminal_id     VARCHAR(8) NOT NULL UNIQUE,   -- 8-digit TID
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    serial_number   VARCHAR(50) NOT NULL,
    model           VARCHAR(50),
    ptsa_id         VARCHAR(20) NOT NULL,          -- licensed PTSA
    geo_location    JSONB NOT NULL,
    geo_fence_radius INTEGER NOT NULL DEFAULT 10,
    is_online       BOOLEAN NOT NULL DEFAULT true,
    last_heartbeat  TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 PTSA Routing

All POS transactions **must** route through a licensed PTSA:

```
POS Terminal ──► PTSA ──► Card Scheme (Verve/Visa/MC) ──► Issuing Bank
                  │
                  └──► Platform (merchant-service) for settlement
```

### 3.3 Geo-Fencing Enforcement

```typescript
function validateGeoFence(terminal: PosTerminal, txnLocation: GeoPoint): boolean {
  const distance = haversineDistance(
    terminal.geo_location,
    txnLocation
  );
  return distance <= terminal.geo_fence_radius; // default 10 meters
}
```

If `validateGeoFence` returns `false`, the transaction is declined with error `POS_004`.

---

## 4. Transaction Types

| Type | Description | Channel |
|------|-------------|---------|
| Card Payment | Chip & PIN, contactless (NFC) | Card via PTSA |
| Transfer Payment | Customer pays via NIP transfer to merchant | NIP |
| QR Payment | Customer scans merchant NQR code | NQR via NIP |

---

## 5. Settlement

### 5.1 Settlement Cycles

| Cycle | Description | Cut-off |
|-------|-------------|---------|
| **T+0** | Same-day settlement to merchant's settlement account | Batch at 22:00 WAT |
| **T+1** | Next business day settlement | Batch at 06:00 WAT |

### 5.2 Settlement Data Model

```sql
CREATE TABLE settlements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id),
    cycle           VARCHAR(5) NOT NULL,         -- 'T0' | 'T1'
    settlement_date DATE NOT NULL,
    total_amount    BIGINT NOT NULL,
    total_fee       BIGINT NOT NULL,
    net_amount      BIGINT NOT NULL,
    transaction_count INTEGER NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reference       VARCHAR(100) NOT NULL UNIQUE,
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. Offline POS Support

When network is unavailable, POS stores transactions locally with encryption.

### 6.1 Constraints

| Rule | Value |
|------|-------|
| Max offline transaction amount | ₦100 (₦10,000 kobo) |
| Max offline transactions stored | 50 |
| Encryption | AES-256-GCM with device-specific key |
| Sync window | Auto-sync within 5 minutes of reconnection |
| Offline mode timeout | 4 hours max |

### 6.2 Flow

```
Network down detected
    │
    ├── Switch to offline mode
    ├── Accept transactions ≤ ₦100
    ├── Encrypt & store in local SQLite
    │
Network restored
    │
    ├── Batch upload encrypted transactions
    ├── Server decrypts & validates
    ├── Process each transaction (validate geo-fence, check limits)
    ├── Return batch result
    └── Clear local store on success
```

---

## 7. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `MRC_001` | 400 | Invalid TIN |
| `MRC_002` | 400 | Business address verification failed |
| `MRC_003` | 409 | Merchant already registered |
| `POS_001` | 400 | Invalid terminal ID |
| `POS_002` | 503 | PTSA routing failed |
| `POS_003` | 400 | Card declined |
| `POS_004` | 403 | Geo-fence violation — transaction outside registered location |
| `POS_005` | 400 | Offline transaction limit exceeded |
| `STL_001` | 500 | Settlement batch processing error |
