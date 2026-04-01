import { LimitTier } from '../users/entities/user.entity';

export interface LimitProfile {
  daily: number;
  monthly: number;
  single: number;
  maxBalance: number | null;
}

export const LIMIT_PROFILES: Record<LimitTier, LimitProfile> = {
  [LimitTier.TIER0]: { daily: 10000, monthly: 50000, single: 5000, maxBalance: 100000 },
  [LimitTier.TIER1]: { daily: 30000, monthly: 300000, single: 30000, maxBalance: 300000 },
  [LimitTier.TIER2]: { daily: 100000, monthly: 1000000, single: 100000, maxBalance: 500000 },
  [LimitTier.TIER3]: { daily: 25000000, monthly: 250000000, single: 25000000, maxBalance: null }
};
