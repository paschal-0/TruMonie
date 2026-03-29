# Licensed Infrastructure Integration

This backend can run with internal/stub providers now and switch to your licensed infrastructure later through env vars.

## Provider Selection

- `DEFAULT_PAYMENT_PROVIDER`: `internal`, `licensed`, `paystack`, `flutterwave`
- `DEFAULT_BILLS_PROVIDER`: `stub`, `licensed`
- `DEFAULT_KYC_PROVIDER`: `stub`, `licensed`
- `DEFAULT_FX_PROVIDER`: `stub`, `licensed`
- `DEFAULT_CARDS_PROVIDER`: `stub`, `licensed`
- `DEFAULT_OTP_PROVIDER`: `internal`, `licensed`
- `DEFAULT_NOTIFICATION_PROVIDER`: `internal`, `licensed`

## Required Env For Licensed Providers

- `LICENSED_INFRA_BASE_URL`
- `LICENSED_INFRA_API_KEY`

Optional:

- `LICENSED_INFRA_TIMEOUT_MS` (default `10000`)
- `LICENSED_INFRA_WEBHOOK_SECRET`
- Path overrides:
  - `LICENSED_INFRA_PAYMENTS_VIRTUAL_ACCOUNT_PATH`
  - `LICENSED_INFRA_PAYMENTS_PAYOUT_PATH`
  - `LICENSED_INFRA_PAYMENTS_RESOLVE_PATH`
  - `LICENSED_INFRA_BILLS_CATALOG_PATH`
  - `LICENSED_INFRA_BILLS_PURCHASE_PATH`
  - `LICENSED_INFRA_KYC_VERIFY_PATH`
  - `LICENSED_INFRA_FX_RATE_PATH`
  - `LICENSED_INFRA_CARDS_CREATE_PATH`
  - `LICENSED_INFRA_CARDS_BLOCK_PATH`
  - `LICENSED_INFRA_CARDS_UNBLOCK_PATH`
  - `LICENSED_INFRA_OTP_SEND_PATH`
  - `LICENSED_INFRA_NOTIFICATIONS_SEND_PATH`

Settlement account routing (optional per provider/currency; falls back to treasury):

- `SYSTEM_SETTLEMENT_INTERNAL_NGN_ACCOUNT_ID`
- `SYSTEM_SETTLEMENT_INTERNAL_USD_ACCOUNT_ID`
- `SYSTEM_SETTLEMENT_LICENSED_NGN_ACCOUNT_ID`
- `SYSTEM_SETTLEMENT_LICENSED_USD_ACCOUNT_ID`
- `SYSTEM_SETTLEMENT_PAYSTACK_NGN_ACCOUNT_ID`
- `SYSTEM_SETTLEMENT_PAYSTACK_USD_ACCOUNT_ID`
- `SYSTEM_SETTLEMENT_FLUTTERWAVE_NGN_ACCOUNT_ID`
- `SYSTEM_SETTLEMENT_FLUTTERWAVE_USD_ACCOUNT_ID`

## Endpoint Contracts Expected By Adapters

### Payments Virtual Account (`POST`)

Request:

```json
{ "userId": "uuid" }
```

Response:

```json
{ "accountNumber": "0123456789", "bankName": "Bank Name" }
```

### Payments Payout (`POST`)

Request:

```json
{
  "userId": "uuid",
  "amountMinor": "10000",
  "currency": "NGN",
  "destination": { "bankCode": "058", "accountNumber": "0123456789", "accountName": "Jane Doe" },
  "narration": "optional"
}
```

Response:

```json
{ "providerReference": "abc-123", "status": "PENDING" }
```

### Payments Resolve (`POST`)

Request:

```json
{ "bankCode": "058", "accountNumber": "0123456789" }
```

Response:

```json
{ "bankCode": "058", "accountNumber": "0123456789", "accountName": "Jane Doe" }
```

### Bills Catalog (`GET`)

Response:

```json
[
  { "code": "AIRTIME_MTN", "name": "MTN Airtime", "category": "airtime", "amountType": "variable" }
]
```

### Bills Purchase (`POST`)

Request:

```json
{
  "productCode": "AIRTIME_MTN",
  "beneficiary": "08030000000",
  "amountMinor": "10000",
  "currency": "NGN",
  "reference": "BILL-123"
}
```

Response:

```json
{ "providerReference": "bill-123", "status": "PENDING" }
```

### KYC Verify (`POST`)

Request:

```json
{
  "bvn": "12345678901",
  "nin": "12345678901",
  "firstName": "Jane",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-01"
}
```

Response:

```json
{ "match": true, "reference": "kyc-123", "metadata": {} }
```

### FX Rate (`GET`)

Query params:

`base`, `quote`

Response:

```json
{ "rate": 1500.25 }
```

### Cards Create (`POST`)

Request:

```json
{ "userId": "uuid", "currency": "NGN", "fundingAccountId": "uuid" }
```

Response:

```json
{ "providerReference": "card-123", "last4": "1234" }
```

### Cards Block / Unblock (`POST`)

Request:

```json
{ "providerReference": "card-123" }
```

### OTP Send (`POST`)

Request:

```json
{
  "to": "user@example.com",
  "channel": "email",
  "purpose": "LOGIN",
  "code": "123456"
}
```

Response:

```json
{ "accepted": true, "reference": "otp-123" }
```

### Notifications Send (`POST`)

Request:

```json
{
  "userId": "uuid",
  "type": "PAYMENT_SUCCESS",
  "message": "Payment completed",
  "payload": { "amountMinor": "10000" }
}
```

Response:

```json
{ "delivered": true, "reference": "notify-123" }
```
