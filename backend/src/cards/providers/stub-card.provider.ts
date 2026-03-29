import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { Currency } from '../../ledger/enums/currency.enum';
import { CardProvider } from '../interfaces/card-provider.interface';

@Injectable()
export class StubCardProvider implements CardProvider {
  readonly name = 'stub';

  supportsCurrency(_currency: Currency): boolean {
    return true;
  }

  async createCard(_params: { userId: string; currency: Currency; fundingAccountId: string }) {
    const providerReference = uuidv4();
    const last4 = Math.floor(1000 + Math.random() * 9000).toString();
    return { providerReference, last4 };
  }

  async blockCard(_params: { providerReference: string }) {
    return;
  }

  async unblockCard(_params: { providerReference: string }) {
    return;
  }
}
