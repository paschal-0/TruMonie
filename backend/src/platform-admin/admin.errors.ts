import { HttpException, HttpStatus } from '@nestjs/common';

export enum AdminErrorCode {
  INSUFFICIENT_PERMISSIONS = 'ADM_001',
  MAKER_CHECKER_CONFLICT = 'ADM_002',
  ACTION_EXPIRED = 'ADM_003',
  ACTION_ALREADY_RESOLVED = 'ADM_004',
  SLSG_UNAVAILABLE = 'ADM_005',
  INVALID_SYSTEM_CONFIG_VALUE = 'ADM_006'
}

export class AdminException extends HttpException {
  constructor(
    code: AdminErrorCode,
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

