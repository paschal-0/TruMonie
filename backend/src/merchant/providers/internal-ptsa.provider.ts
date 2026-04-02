import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PtsaProvider } from '../interfaces/ptsa-provider.interface';

@Injectable()
export class InternalPtsaProvider implements PtsaProvider {
  readonly name = 'internal';

  async charge(params: {
    reference: string;
    amountMinor: string;
  }) {
    const amountMinor = Number(params.amountMinor);
    const failed = amountMinor <= 0 || !Number.isFinite(amountMinor);

    return {
      providerReference: `PTSA-INT-${randomUUID().slice(0, 12)}`,
      status: failed ? 'FAILED' : 'SUCCESS',
      responseCode: failed ? '96' : '00',
      responseMessage: failed ? 'Invalid amount' : 'Approved',
      authCode: failed ? undefined : 'AUTH00'
    } as const;
  }

  async queryStatus(_params: { reference: string; providerReference?: string }) {
    return {
      status: 'SUCCESS',
      responseCode: '00',
      responseMessage: 'Approved'
    } as const;
  }
}

