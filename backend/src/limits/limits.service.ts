import { BadRequestException, Injectable } from '@nestjs/common';

import { LimitTier } from '../users/entities/user.entity';
import { Currency } from '../ledger/enums/currency.enum';
import { SpendingService } from './spending.service';
import { LIMIT_PROFILES, LimitProfile } from './limit-profiles';
import { WalletErrorCode, WalletException } from '../ledger/wallet.errors';

@Injectable()
export class LimitsService {
  constructor(private readonly spendingService: SpendingService) {}

  getProfile(tier: LimitTier): LimitProfile {
    return LIMIT_PROFILES[tier] ?? LIMIT_PROFILES[LimitTier.TIER0];
  }

  async assertWithinLimits(userId: string, tier: LimitTier, amountMinor: string, currency: Currency) {
    const profile = this.getProfile(tier);
    const amount = BigInt(amountMinor);
    if (amount > BigInt(profile.single * 100)) {
      throw new BadRequestException('Amount exceeds single transaction limit');
    }
    const daily = await this.spendingService.getUserDailyDebit(userId, currency);
    if (daily + amount > BigInt(profile.daily * 100)) {
      throw new WalletException(
        WalletErrorCode.DAILY_LIMIT_EXCEEDED,
        'Amount exceeds daily wallet limit'
      );
    }
  }

  assertWithinMaxBalance(tier: LimitTier, currentBalanceMinor: string, incomingAmountMinor: string) {
    const profile = this.getProfile(tier);
    if (profile.maxBalance === null) return;
    const projected = BigInt(currentBalanceMinor) + BigInt(incomingAmountMinor);
    if (projected > BigInt(profile.maxBalance * 100)) {
      throw new WalletException(
        WalletErrorCode.MAX_BALANCE_EXCEEDED,
        'Amount exceeds max wallet balance for tier'
      );
    }
  }
}
