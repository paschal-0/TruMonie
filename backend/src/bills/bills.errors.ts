import { HttpException, HttpStatus } from '@nestjs/common';

export enum BillErrorCode {
  INVALID_CUSTOMER_REF = 'BIL_001',
  VALIDATION_EXPIRED = 'BIL_002',
  AMOUNT_BELOW_MINIMUM = 'BIL_003',
  INSUFFICIENT_FUNDS = 'BIL_004',
  AGGREGATOR_UNAVAILABLE = 'BIL_005',
  TOKEN_GENERATION_FAILED = 'BIL_006',
  INVALID_QR = 'BIL_007'
}

export class BillException extends HttpException {
  constructor(
    code: BillErrorCode,
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

