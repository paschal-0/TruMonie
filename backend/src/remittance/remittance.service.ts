import { Injectable, BadRequestException } from '@nestjs/common';

import { AccountsService } from '../ledger/accounts.service';
import { Currency } from '../ledger/enums/currency.enum';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class RemittanceService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly paymentsService: PaymentsService
  ) {}

  async outbound(
    userId: string,
    amountMinor: string,
    currency: Currency,
    destination: { country: string; bankCode: string; accountNumber: string; accountName?: string },
    provider?: string,
    narration?: string
  ) {
    const accounts = await this.accountsService.getUserAccounts(userId);
    const wallet = accounts.find((a) => a.currency === currency);
    if (!wallet) throw new BadRequestException('Wallet not found');
    // Payout service performs the balanced wallet->treasury posting and provider handoff.
    const targetProvider = provider ?? this.paymentsService.getDefaultProviderName();
    return this.paymentsService.initiatePayout(
      targetProvider,
      userId,
      wallet.id,
      amountMinor,
      currency,
      { bankCode: destination.bankCode, accountNumber: destination.accountNumber, accountName: destination.accountName },
      narration
    );
  }

  async inbound(
    userId: string,
    amountMinor: string,
    currency: Currency,
    provider?: string,
    reference?: string
  ) {
    return this.paymentsService.creditWallet({
      userId,
      amountMinor,
      currency,
      reference: reference ?? `REMIT-IN-${Date.now()}`,
      description: 'Remittance inbound',
      provider: provider ?? this.paymentsService.getDefaultProviderName(),
      metadata: {
        flow: 'remittance-inbound'
      }
    });
  }
}
