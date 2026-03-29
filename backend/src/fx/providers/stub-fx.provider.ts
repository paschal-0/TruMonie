import { Injectable } from '@nestjs/common';

import { Currency } from '../../ledger/enums/currency.enum';
import { FxProvider } from '../interfaces/fx-provider.interface';

@Injectable()
export class StubFxProvider implements FxProvider {
  readonly name = 'stub';

  async getRate(base: Currency, quote: Currency): Promise<number | null> {
    if (base === quote) return 1;
    const table: Record<string, number> = {
      'USD:NGN': 1500,
      'NGN:USD': 1 / 1500
    };
    return table[`${base}:${quote}`] ?? null;
  }
}
