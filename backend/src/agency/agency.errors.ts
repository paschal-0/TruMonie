import { HttpException, HttpStatus } from '@nestjs/common';

export enum AgencyErrorCode {
  AGENT_EXCLUSIVITY_VIOLATION = 'AGT_001',
  CUSTOMER_DAILY_LIMIT_EXCEEDED = 'AGT_002',
  AGENT_DAILY_CASH_OUT_LIMIT_EXCEEDED = 'AGT_003',
  INSUFFICIENT_AGENT_WALLET_BALANCE = 'AGT_004',
  AGENT_SUSPENDED = 'AGT_005',
  PERSONAL_ACCOUNT_USED = 'AGT_006',
  CUSTOMER_WEEKLY_LIMIT_EXCEEDED = 'AGT_007',
  SINGLE_TRANSACTION_LIMIT_EXCEEDED = 'AGT_008'
}

export class AgencyException extends HttpException {
  constructor(
    code: AgencyErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
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

