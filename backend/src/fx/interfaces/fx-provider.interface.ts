import { Currency } from '../../ledger/enums/currency.enum';

export interface FxProvider {
  name: string;
  getRate(base: Currency, quote: Currency): Promise<number | null>;
}
