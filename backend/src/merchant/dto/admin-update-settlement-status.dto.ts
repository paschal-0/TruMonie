import { IsEnum } from 'class-validator';

import { SettlementStatus } from '../entities/settlement.entity';

export class AdminUpdateSettlementStatusDto {
  @IsEnum(SettlementStatus)
  status!: SettlementStatus;
}

