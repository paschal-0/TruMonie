import { IsEnum } from 'class-validator';

import { SettlementCycle } from '../entities/settlement.entity';

export class AdminProcessSettlementDto {
  @IsEnum(SettlementCycle)
  cycle!: SettlementCycle;
}

