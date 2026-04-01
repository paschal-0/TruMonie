import { HttpException, HttpStatus } from '@nestjs/common';

export enum TransferErrorCode {
  INVALID_BANK_CODE = 'TRF_001',
  NAME_ENQUIRY_FAILED = 'TRF_002',
  INSUFFICIENT_FUNDS = 'TRF_003',
  INVALID_PIN = 'TRF_004',
  NIP_UNAVAILABLE = 'TRF_005',
  TRANSFER_TIMEOUT = 'TRF_006',
  DUPLICATE_TRANSFER = 'TRF_007',
  NAME_MISMATCH = 'TRF_008'
}

export class TransferException extends HttpException {
  constructor(
    code: TransferErrorCode,
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
