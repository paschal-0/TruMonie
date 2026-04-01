import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVirtualAccountDto {
  @IsUUID()
  walletId!: string;

  @IsString()
  @IsIn(['NGN', 'EUR', 'GBP', 'USD'])
  currency!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
