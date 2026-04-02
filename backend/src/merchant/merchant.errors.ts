import { HttpException, HttpStatus } from '@nestjs/common';

export enum MerchantErrorCode {
  INVALID_TIN = 'MRC_001',
  ADDRESS_VERIFICATION_FAILED = 'MRC_002',
  MERCHANT_ALREADY_REGISTERED = 'MRC_003',
  MERCHANT_NOT_FOUND = 'MRC_004',
  MERCHANT_NOT_APPROVED = 'MRC_005',
  INVALID_TERMINAL_ID = 'POS_001',
  PTSA_ROUTING_FAILED = 'POS_002',
  CARD_DECLINED = 'POS_003',
  GEO_FENCE_VIOLATION = 'POS_004',
  OFFLINE_LIMIT_EXCEEDED = 'POS_005',
  SETTLEMENT_BATCH_ERROR = 'STL_001'
}

export class MerchantException extends HttpException {
  constructor(
    code: MerchantErrorCode,
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
