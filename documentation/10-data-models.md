# Shared Data Models & Enumerations

> Cross-module entity definitions used across all services.

---

## 1. Enumerations

### 1.1 Wallet Types
```
PERSONAL | AGENT | MERCHANT | VIRTUAL
```

### 1.2 Transaction Status
```
PENDING | PROCESSING | SUCCESS | FAILED | REVERSED | EXPIRED
```

### 1.3 Transaction Categories
```
TRANSFER_IN | TRANSFER_OUT | BILL_PAYMENT | CARD_FUNDING | BANK_FUNDING
REVERSAL | COMMISSION | FEE | SETTLEMENT | CASH_IN | CASH_OUT
```

### 1.4 KYC Tier
```
1 (Basic) | 2 (Standard) | 3 (Enhanced)
```

### 1.5 Account / Wallet Status
```
ACTIVE | FROZEN | CLOSED | PND (Post No Debit) | SUSPENDED
```

### 1.6 User Status
```
ACTIVE | SUSPENDED | BLOCKED | INACTIVE
```

### 1.7 Agent Status
```
PENDING | ACTIVE | SUSPENDED | TERMINATED
```

---

## 2. Common API Conventions

### 2.1 Base URL Format
```
https://api.platform.ng/v1/{resource}
```

### 2.2 Authentication
All endpoints require `Authorization: Bearer {jwt}`. Admin endpoints require additional admin JWT scope.

### 2.3 Standard Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Bearer JWT |
| `X-Idempotency-Key` | On POST/PUT | UUID for deduplication |
| `X-Device-Fingerprint` | Yes (mobile) | Device hash |
| `X-Request-Id` | Yes | Correlation ID for tracing |
| `Content-Type` | Yes | `application/json` |

### 2.4 Standard Error Response

```json
{
  "error": {
    "code": "TRF_003",
    "message": "Insufficient funds",
    "details": {
      "available_balance": 150000,
      "requested_amount": 500000
    }
  },
  "request_id": "uuid",
  "timestamp": "2025-06-01T12:00:00Z"
}
```

### 2.5 Pagination

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 142,
    "total_pages": 8,
    "has_next": true,
    "has_previous": false
  }
}
```

### 2.6 Monetary Amounts

All monetary amounts are in **kobo** (1 Naira = 100 kobo) as integers. This avoids floating-point precision issues.

```
₦1,000.00  =  100000 kobo
₦30,000    =  3000000 kobo
₦25,000,000 = 2500000000 kobo
```

---

## 3. Event Schema (Kafka)

All events follow this envelope:

```json
{
  "event_id": "uuid",
  "event_type": "DOMAIN.ACTION",
  "version": "1.0",
  "source": "service-name",
  "timestamp": "2025-06-01T12:00:00Z",
  "correlation_id": "uuid",
  "payload": { ... },
  "metadata": {
    "user_id": "uuid",
    "ip_address": "102.89.x.x",
    "device_hash": "abc123"
  }
}
```

### 3.1 Event Types

| Topic | Event Types |
|-------|-------------|
| `user.events` | USER_REGISTERED, DEVICE_BOUND, DEVICE_TRANSFERRED, KYC_VERIFIED, TIER_UPGRADED |
| `wallet.events` | WALLET_CREATED, BALANCE_UPDATED, WALLET_FROZEN, WALLET_UNFROZEN |
| `transfer.events` | TRANSFER_INITIATED, TRANSFER_COMPLETED, TRANSFER_FAILED, TRANSFER_REVERSED |
| `bill.events` | BILL_VALIDATED, BILL_PAID, BILL_FAILED |
| `agent.events` | AGENT_REGISTERED, CASH_IN, CASH_OUT, COMMISSION_EARNED |
| `fraud.events` | FRAUD_ALERT, FRAUD_REVIEWED, FRAUD_CLEARED, FRAUD_ESCALATED |
| `admin.events` | ACTION_CREATED, ACTION_APPROVED, ACTION_REJECTED, CONFIG_CHANGED |

---

## 4. Complete Error Code Registry

| Module | Prefix | Range |
|--------|--------|-------|
| Auth / Device | `AUTH_` | 001–010 |
| KYC | `KYC_` | 001–010 |
| Wallet | `WAL_` | 001–010 |
| Transfer | `TRF_` | 001–010 |
| Bill Payment | `BIL_` | 001–010 |
| Merchant / POS | `MRC_` / `POS_` | 001–010 |
| Security | `SEC_` | 001–010 |
| Fraud | `FRD_` | 001–010 |
| Core Banking | `CBE_` | 001–010 |
| Agent | `AGT_` | 001–010 |
| Admin | `ADM_` | 001–010 |
| Settlement | `STL_` | 001–010 |

---

## 5. Regulatory Reference Links

| Regulation | Issuer | Key Dates |
|------------|--------|-----------|
| Guidelines on Mobile Money Services | CBN | Updated 2024 |
| Tiered KYC Requirements | CBN | Effective 2024 |
| Agent Banking Guidelines | CBN | Agent exclusivity: April 1, 2026 |
| NIP Technical Specifications | NIBSS | ISO 20022 migration ongoing |
| NQR Merchant Payments | NIBSS | Active |
| NDPR/NDPC (Data Protection) | NDPC | Active |
| AML/CFT Regulations | CBN/NFIU | STR within 72 hours |
| APP Fraud Guidelines | CBN | 30-min notify, 48-hr resolve |
| SLSG Supervisory Portal | CBN | Active |
| Non-Interest Bank Guidelines | CBN | MMFBR 300 monthly |

---

## 6. Glossary

| Term | Definition |
|------|-----------|
| **BVN** | Bank Verification Number (11 digits, biometric-linked) |
| **NIN** | National Identification Number (11 digits, NIMC) |
| **NUBAN** | Nigerian Uniform Bank Account Number (10 digits) |
| **NIP** | NIBSS Instant Payment — real-time domestic transfer rail |
| **NQR** | Nigeria Quick Response — QR-code merchant payment system |
| **NIBSS** | Nigeria Inter-Bank Settlement System |
| **NIMC** | National Identity Management Commission |
| **PTSA** | Payment Terminal Service Aggregator |
| **TSQ** | Transaction Status Query |
| **MCC** | Merchant Category Code |
| **NFIU** | Nigerian Financial Intelligence Unit |
| **STR** | Suspicious Transaction Report |
| **CTR** | Currency Transaction Report |
| **APP** | Authorised Push Payment (fraud type) |
| **SLSG** | Smart Licensing & Supervisory Gateway |
| **PER** | Profit Equalisation Reserve |
| **PSR** | Profit Sharing Ratio |
| **PND** | Post No Debit |
| **T+0** | Same-day settlement |
| **T+1** | Next business day settlement |
| **Mudarabah** | Profit-sharing partnership (capital + labor) |
| **Musharakah** | Joint equity partnership |
| **Riba** | Interest (prohibited in Islamic finance) |
| **kobo** | Smallest unit of Nigerian Naira (1 NGN = 100 kobo) |
