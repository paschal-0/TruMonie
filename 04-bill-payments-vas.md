# Module 4 — Bill Payments & Value-Added Services (VAS)

> **Service:** `billpay-service` | **Aggregators:** Interswitch, Remita

---

## 1. Overview

Bill payments follow a strict **Validation → Execution** workflow. The platform validates meter numbers, decoder IDs, or account references with aggregators *before* debiting the wallet. Tokens and service reactivation are delivered instantly.

---

## 2. Supported Services

| Category | Examples | Aggregator |
|----------|----------|------------|
| **Airtime** | MTN, Glo, Airtel, 9mobile | Interswitch / VTPass |
| **Data** | MTN Data, Glo Data, etc. | Interswitch / VTPass |
| **Electricity** | EKEDC, IKEDC, AEDC (prepaid/postpaid) | Interswitch / Remita |
| **Cable TV** | DSTV, GOtv, StarTimes | Interswitch |
| **Internet** | Spectranet, Smile, NTEL | VTPass |
| **Betting** | Bet9ja, SportyBet | Direct API |
| **NQR Payments** | Merchant QR codes | NIBSS NQR |

---

## 3. Validation-Execution Workflow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Client   │───►│ billpay-svc  │───►│ Aggregator   │
│           │    │              │    │ (Interswitch) │
└──────────┘    └──────────────┘    └──────────────┘

Phase 1: VALIDATE
  POST /api/v1/bills/validate
  → Send meter/decoder/phone to aggregator
  ← Receive customer name, outstanding balance, min amount

Phase 2: EXECUTE
  POST /api/v1/bills/pay
  → Debit wallet, send payment to aggregator
  ← Receive token/receipt, credit biller
```

---

## 4. API Endpoints

### 4.1 Get Available Billers

#### `GET /api/v1/bills/categories`

```json
{
  "categories": [
    {
      "id": "electricity",
      "name": "Electricity",
      "billers": [
        { "id": "ekedc-prepaid", "name": "EKEDC Prepaid", "requires_validation": true, "validation_fields": ["meter_number"] },
        { "id": "ekedc-postpaid", "name": "EKEDC Postpaid", "requires_validation": true, "validation_fields": ["account_number"] }
      ]
    },
    {
      "id": "airtime",
      "name": "Airtime",
      "billers": [
        { "id": "mtn-airtime", "name": "MTN Airtime", "requires_validation": false, "validation_fields": ["phone_number"] }
      ]
    }
  ]
}
```

### 4.2 Validate Bill

#### `POST /api/v1/bills/validate`

```json
// Request
{
  "biller_id": "ekedc-prepaid",
  "fields": { "meter_number": "45012345678" }
}

// Response (200)
{
  "validation_ref": "uuid",
  "customer_name": "OKOYE CHINEDU",
  "customer_address": "12 Allen Avenue, Ikeja",
  "meter_number": "45012345678",
  "outstanding_balance": 0,
  "minimum_amount": 100000,    // ₦1,000 in kobo
  "valid_until": "2025-06-01T12:10:00Z"
}
```

### 4.3 Execute Payment

#### `POST /api/v1/bills/pay`

```json
// Request
{
  "wallet_id": "uuid",
  "biller_id": "ekedc-prepaid",
  "validation_ref": "uuid",
  "amount": 500000,           // ₦5,000
  "pin": "1234",
  "idempotency_key": "uuid"
}

// Response (200)
{
  "payment_id": "uuid",
  "reference": "BIL-20250601-DEF456",
  "status": "SUCCESS",
  "amount": 500000,
  "fee": 10000,
  "token": "1234-5678-9012-3456-7890",     // electricity token
  "units": "52.3 kWh",
  "biller_reference": "ISW-REF-12345",
  "receipt": {
    "customer_name": "OKOYE CHINEDU",
    "meter_number": "45012345678",
    "amount": "₦5,000.00",
    "token": "1234-5678-9012-3456-7890",
    "units": "52.3 kWh",
    "timestamp": "2025-06-01T12:05:00Z"
  }
}
```

---

## 5. NQR Payments (Nigeria Quick Response)

QR-code-based merchant payments via the NIP rail.

```
Customer scans QR ──► Decode NQR payload ──► Name Enquiry ──► Direct Credit ──► Merchant notified
```

#### `POST /api/v1/bills/nqr/pay`

```json
// Request
{
  "wallet_id": "uuid",
  "qr_data": "00020101021...",   // EMVCo QR string
  "amount": 350000,
  "pin": "1234",
  "idempotency_key": "uuid"
}

// Response (200)
{
  "payment_id": "uuid",
  "merchant_name": "CHICKEN REPUBLIC IKEJA",
  "amount": 350000,
  "status": "SUCCESS",
  "session_id": "000015250601130000000005"
}
```

---

## 6. Data Model

```sql
CREATE TABLE bill_payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference         VARCHAR(100) NOT NULL UNIQUE,
    wallet_id         UUID NOT NULL REFERENCES wallets(id),
    user_id           UUID NOT NULL REFERENCES users(id),
    biller_id         VARCHAR(50) NOT NULL,
    category          VARCHAR(30) NOT NULL,
    validation_ref    VARCHAR(100),
    customer_name     VARCHAR(200),
    customer_ref      VARCHAR(100),       -- meter number, phone, decoder ID
    amount            BIGINT NOT NULL,
    fee               BIGINT NOT NULL DEFAULT 0,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    token             TEXT,               -- electricity token, data PIN
    units             VARCHAR(50),
    aggregator        VARCHAR(30) NOT NULL,
    aggregator_ref    VARCHAR(100),
    idempotency_key   UUID NOT NULL UNIQUE,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `BIL_001` | 400 | Invalid meter/account number |
| `BIL_002` | 400 | Validation expired — re-validate |
| `BIL_003` | 400 | Amount below biller minimum |
| `BIL_004` | 400 | Insufficient funds |
| `BIL_005` | 503 | Aggregator unavailable |
| `BIL_006` | 422 | Token generation failed |
| `BIL_007` | 400 | Invalid QR code format |
