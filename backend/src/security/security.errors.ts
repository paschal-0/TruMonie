import { HttpException, HttpStatus } from '@nestjs/common';

export enum SecurityErrorCode {
  INVALID_PIN = 'SEC_001',
  ACCOUNT_LOCKED = 'SEC_002',
  BIOMETRIC_VERIFICATION_FAILED = 'SEC_003',
  TRANSACTION_BLOCKED_BY_FRAUD_ENGINE = 'SEC_004',
  MFA_REQUIRED = 'SEC_005',
  FRAUD_REPORT_RECEIVED = 'FRD_001',
  TRANSACTION_ALREADY_REPORTED = 'FRD_002',
  FRAUD_ENGINE_UNAVAILABLE = 'FRD_003'
}

export class SecurityException extends HttpException {
  constructor(
    code: SecurityErrorCode,
    message: string,
    status: HttpStatus,
    details?: Record<string, unknown>
  ) {
    super(
      {
        code,
        message,
        ...(details ? { details } : {})
      },
      status
    );
  }
}
