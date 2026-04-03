import { IsEnum, IsOptional, IsString } from 'class-validator';

import { AgentStatus } from '../entities/agent.entity';

export class AdminUpdateAgentStatusDto {
  @IsEnum(AgentStatus)
  status!: AgentStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}

