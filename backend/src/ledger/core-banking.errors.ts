import { HttpException, HttpStatus } from '@nestjs/common';

export enum CoreBankingErrorCode {
  GL_ACCOUNT_NOT_FOUND = 'CBE_001',
  LEDGER_IMBALANCE = 'CBE_002',
  INVALID_POSTING_RULE = 'CBE_003',
  PROFIT_SHARING_CALCULATION_ERROR = 'CBE_004',
  POOL_PERIOD_EXPIRED = 'CBE_005',
  REPORTING_ENGINE_UNAVAILABLE = 'CBE_006'
}

export class CoreBankingException extends HttpException {
  constructor(
    code: CoreBankingErrorCode,
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

