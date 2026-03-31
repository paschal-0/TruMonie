import { BadRequestException, Injectable } from '@nestjs/common';

import { LimitTier } from '../users/entities/user.entity';
import { Currency } from '../ledger/enums/currency.enum';
import { SpendingService } from './spending.service';

export interface LimitProfile {
  daily: number;
  monthly: number;
  single: number;
  maxBalance: number | null;
}

@Injectable()
export class LimitsService {
  private readonly profiles: Record<LimitTier, LimitProfile> = {
    [LimitTier.TIER0]: { daily: 10000, monthly: 50000, single: 5000, maxBalance: 100000 },
    [LimitTier.TIER1]: { daily: 30000, monthly: 300000, single: 30000, maxBalance: 300000 },
    [LimitTier.TIER2]: { daily: 100000, monthly: 1000000, single: 100000, maxBalance: 500000 },
    [LimitTier.TIER3]: {
      daily: 25000000,
      monthly: 250000000,
      single: 25000000,
      maxBalance: null
    }
  };

  constructor(private readonly spendingService: SpendingService) {}

  getProfile(tier: LimitTier): LimitProfile {
    return this.profiles[tier] ?? this.profiles[LimitTier.TIER0];
  }

  async assertWithinLimits(userId: string, tier: LimitTier, amountMinor: string, currency: Currency) {
    const profile = this.getProfile(tier);
    const amount = BigInt(amountMinor);
    if (amount > BigInt(profile.single * 100)) {
      throw new BadRequestException('Amount exceeds single transaction limit');
    }
    const daily = await this.spendingService.getUserDailyDebit(userId, currency);
    if (daily + amount > BigInt(profile.daily * 100)) {
      throw new BadRequestException('Amount exceeds daily limit');
    }
  }

  assertWithinMaxBalance(tier: LimitTier, currentBalanceMinor: string, incomingAmountMinor: string) {
    const profile = this.getProfile(tier);
    if (profile.maxBalance === null) return;
    const projected = BigInt(currentBalanceMinor) + BigInt(incomingAmountMinor);
    if (projected > BigInt(profile.maxBalance * 100)) {
      throw new BadRequestException('Amount exceeds max wallet balance for tier');
    }
  }
}
