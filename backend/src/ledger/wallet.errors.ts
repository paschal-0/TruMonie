import { HttpException, HttpStatus } from '@nestjs/common';

export enum WalletErrorCode {
  WALLET_NOT_FOUND = 'WAL_001',
  INSUFFICIENT_FUNDS = 'WAL_002',
  DAILY_LIMIT_EXCEEDED = 'WAL_003',
  MAX_BALANCE_EXCEEDED = 'WAL_004',
  WALLET_INACTIVE = 'WAL_005',
  DUPLICATE_IDEMPOTENCY = 'WAL_006',
  NUBAN_UNAVAILABLE = 'WAL_007'
}

export class WalletException extends HttpException {
  constructor(
    code: WalletErrorCode,
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
