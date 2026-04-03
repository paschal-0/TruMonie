import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class AgentCashInDto {
  @IsUUID()
  agent_id!: string;

  @IsString()
  @Matches(/^\d{10}$/)
  customer_account!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  amount!: number;

  @IsString()
  @Matches(/^\d{4,6}$/)
  agent_pin!: string;

  @IsUUID()
  idempotency_key!: string;

  @IsString()
  @IsNotEmpty()
  @IsUUID()
  principal_id!: string;
}

