import { BadRequestException, Injectable } from '@nestjs/common';

import { LimitTier } from '../users/entities/user.entity';
import { Currency } from '../ledger/enums/currency.enum';
import { SpendingService } from './spending.service';

export interface LimitProfile {
  daily: number;
  monthly: number;
  single: number;
}

@Injectable()
export class LimitsService {
  private readonly profiles: Record<LimitTier, LimitProfile> = {
    [LimitTier.TIER0]: { daily: 50000, monthly: 200000, single: 20000 },
    [LimitTier.TIER1]: { daily: 200000, monthly: 1000000, single: 100000 },
    [LimitTier.TIER2]: { daily: 500000, monthly: 5000000, single: 500000 }
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
}
