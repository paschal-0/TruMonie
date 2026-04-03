# Module 3 — Transfers & Payments

> **Service:** `transfer-service` | **Rail:** NIBSS Instant Payment (NIP)

---

## 1. Overview

All domestic transfers use the **NIBSS Instant Payment (NIP)** rail for real-time finality. The mandatory API sequence is: **Name Enquiry → Direct Credit → TSQ** (Transaction Status Query). The platform supports saved beneficiaries and instant digital receipts.

---

## 2. Transfer Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  Client   │───►│ transfer-svc │───►│  NIBSS   │───►│  Dest.   │
│           │    │              │    │  NIP     │    │  Bank    │
└──────────┘    └──────────────┘    └──────────┘    └──────────┘

Step 1: Name Enquiry      POST /api/v1/transfers/name-enquiry
Step 2: Initiate Transfer  POST /api/v1/transfers
Step 3: TSQ (if needed)    GET  /api/v1/transfers/{id}/status
```

---

## 3. Name Enquiry (Step 1)

Validate the beneficiary before any funds move. This prevents errors and satisfies CBN's mandate.

#### `POST /api/v1/transfers/name-enquiry`

```json
// Request
{
  "destination_bank_code": "058",
  "account_number": "0123456789"
}

// Response (200)
{
  "account_name": "ADEWALE BABATUNDE OJO",
  "account_number": "0123456789",
  "bank_code": "058",
  "bank_name": "GUARANTY TRUST BANK",
  "session_id": "000015250601120000000001",
  "kyc_level": 3
}
```

**NIBSS NIP Call:**
```http
POST https://nip.nibss-plc.com.ng/v2/nameenquiry
X-Auth-Token: {nip_token}

{
  "destinationInstitutionCode": "058",
  "channelCode": "2",
  "accountNumber": "0123456789"
}
```

---

## 4. NIP Direct Credit Transfer (Step 2)

#### `POST /api/v1/transfers`

```json
// Request
{
  "source_wallet_id": "uuid",
  "destination_bank_code": "058",
  "destination_account": "0123456789",
  "destination_name": "ADEWALE BABATUNDE OJO",
  "amount": 500000,          // ₦5,000 in kobo
  "narration": "Invoice payment",
  "pin": "1234",
  "idempotency_key": "uuid"
}

// Response (202)
{
  "transfer_id": "uuid",
  "reference": "TRF-20250601-XYZ789",
  "session_id": "000015250601120000000002",
  "amount": 500000,
  "fee": 1060,
  "status": "PROCESSING",
  "estimated_completion": "2025-06-01T12:00:05Z"
}
```

### 4.1 Internal Processing

```
1. Validate PIN
2. enforceWalletLimits(wallet, amount + fee, 'DEBIT')
3. Acquire advisory lock on source wallet
4. Debit source wallet (amount + fee)
5. Create ledger entries
6. Call NIBSS NIP DirectCredit API
7. On success → set status = SUCCESS, publish event
8. On failure → reverse debit, set status = FAILED
9. On timeout → set status = PENDING, schedule TSQ retry
```

### 4.2 Fee Calculation

```typescript
function calculateTransferFee(amount: number): number {
  // CBN-regulated NIP fee tiers (in kobo)
  if (amount <= 500000)    return 1060;   // ₦10.60
  if (amount <= 5000000)   return 2650;   // ₦26.50
  return 5300;                             // ₦53.00
}
```

---

## 5. Transaction Status Query — TSQ (Step 3)

Resolve pending states during network lags. Implement with exponential backoff.

#### `GET /api/v1/transfers/{transfer_id}/status`

```json
// Response (200)
{
  "transfer_id": "uuid",
  "reference": "TRF-20250601-XYZ789",
  "status": "SUCCESS",
  "nip_response_code": "00",
  "nip_response_message": "Approved or completed successfully",
  "completed_at": "2025-06-01T12:00:03Z"
}
```

### 5.1 TSQ Retry Strategy

```
Attempt 1: Immediately after timeout
Attempt 2: +30 seconds
Attempt 3: +60 seconds
Attempt 4: +120 seconds
Attempt 5: +300 seconds (5 min)
After 5 failures → flag for manual resolution, notify user
```

### 5.2 NIP Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| `00` | Approved | Mark SUCCESS |
| `01` | Status Unknown (retry) | Schedule TSQ |
| `03` | Invalid Account | Reverse debit, mark FAILED |
| `12` | Invalid Transaction | Reverse debit, mark FAILED |
| `13` | Invalid Amount | Reverse debit, mark FAILED |
| `51` | Insufficient Funds | Reverse debit, mark FAILED |
| `91` | Beneficiary Bank Unavailable | Schedule TSQ |
| `96` | System Malfunction | Schedule TSQ |

---

## 6. Wallet-to-Wallet (Internal) Transfers

For transfers between wallets on the same platform — no NIP required.

#### `POST /api/v1/transfers/internal`

```json
// Request
{
  "source_wallet_id": "uuid",
  "destination_wallet_id": "uuid",
  "amount": 200000,
  "narration": "Split lunch bill",
  "pin": "1234",
  "idempotency_key": "uuid"
}

// Response (200)
{
  "transfer_id": "uuid",
  "reference": "INT-20250601-ABC",
  "status": "SUCCESS",
  "amount": 200000,
  "fee": 0,
  "completed_at": "2025-06-01T12:00:00Z"
}
```

---

## 7. Saved Beneficiaries

#### `POST /api/v1/beneficiaries`
```json
{ "account_number": "0123456789", "bank_code": "058", "account_name": "ADEWALE OJO", "alias": "Wale GTB" }
```

#### `GET /api/v1/beneficiaries`
```json
{
  "beneficiaries": [
    { "id": "uuid", "alias": "Wale GTB", "account_name": "ADEWALE OJO", "account_number": "0123456789", "bank_code": "058", "bank_name": "GTBank", "last_used_at": "2025-06-01T10:00:00Z" }
  ]
}
```

#### `DELETE /api/v1/beneficiaries/{id}` — soft delete

---

## 8. Digital Receipts

Auto-generated on every successful transaction. Available via API and push notification.

```json
{
  "receipt_id": "uuid",
  "reference": "TRF-20250601-XYZ789",
  "type": "TRANSFER",
  "from": { "name": "CHUKWUEMEKA OKAFOR", "account": "9876543210" },
  "to": { "name": "ADEWALE OJO", "account": "0123456789", "bank": "GTBank" },
  "amount": "₦5,000.00",
  "fee": "₦10.60",
  "total": "₦5,010.60",
  "status": "SUCCESSFUL",
  "timestamp": "2025-06-01T12:00:03Z",
  "session_id": "000015250601120000000002",
  "qr_code_url": "https://platform.ng/receipts/uuid/qr"
}
```

---

## 9. ISO 20022 Migration

Align all payment messages with ISO 20022 for cross-border interoperability (PAPSS — Pan-African Payment and Settlement System).

| Legacy Format | ISO 20022 Equivalent |
|---------------|---------------------|
| Name Enquiry | `acmt.024` |
| Direct Credit | `pacs.008` (FIToFICustomerCreditTransfer) |
| TSQ | `pacs.028` (FIToFIPaymentStatusRequest) |
| Credit Notification | `camt.054` (BankToCustomerDebitCreditNotification) |

---

## 10. Data Model — Transfers

```sql
CREATE TABLE transfers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference           VARCHAR(100) NOT NULL UNIQUE,
    session_id          VARCHAR(50),
    source_wallet_id    UUID NOT NULL REFERENCES wallets(id),
    source_user_id      UUID NOT NULL REFERENCES users(id),
    destination_type    VARCHAR(20) NOT NULL,    -- 'INTERNAL' | 'NIP'
    destination_account VARCHAR(20) NOT NULL,
    destination_bank    VARCHAR(10),
    destination_name    VARCHAR(200) NOT NULL,
    amount              BIGINT NOT NULL,
    fee                 BIGINT NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'NGN',
    narration           TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    nip_response_code   VARCHAR(5),
    nip_response_msg    TEXT,
    tsq_attempts        INTEGER NOT NULL DEFAULT 0,
    idempotency_key     UUID NOT NULL UNIQUE,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 11. Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `TRF_001` | 400 | Invalid bank code |
| `TRF_002` | 400 | Name enquiry failed — account not found |
| `TRF_003` | 400 | Insufficient funds |
| `TRF_004` | 400 | Invalid PIN |
| `TRF_005` | 503 | NIP service unavailable |
| `TRF_006` | 408 | Transaction timed out — TSQ scheduled |
| `TRF_007` | 409 | Duplicate transfer (idempotency) |
| `TRF_008` | 400 | Name mismatch (destination_name ≠ name enquiry) |
