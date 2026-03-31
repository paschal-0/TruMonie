import { IsArray, IsEnum, IsUUID } from 'class-validator';

import { LimitTier } from '../../users/entities/user.entity';

export class TierUpgradeDto {
  @IsEnum(LimitTier)
  targetTier!: LimitTier;

  @IsArray()
  @IsUUID('4', { each: true })
  verificationIds!: string[];
}
