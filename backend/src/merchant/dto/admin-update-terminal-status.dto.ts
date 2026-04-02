import { IsEnum } from 'class-validator';

import { PosTerminalStatus } from '../entities/pos-terminal.entity';

export class AdminUpdateTerminalStatusDto {
  @IsEnum(PosTerminalStatus)
  status!: PosTerminalStatus;
}

