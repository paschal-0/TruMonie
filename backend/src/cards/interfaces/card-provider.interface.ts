import { Currency } from '../../ledger/enums/currency.enum';

export interface CardProvider {
  name: string;
  supportsCurrency?(currency: Currency): boolean;
  createCard(params: {
    userId: string;
    currency: Currency;
    fundingAccountId: string;
  }): Promise<{ providerReference: string; last4: string }>;
  blockCard(params: { providerReference: string }): Promise<void>;
  unblockCard(params: { providerReference: string }): Promise<void>;
}
