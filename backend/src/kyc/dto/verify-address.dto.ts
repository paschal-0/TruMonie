import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyAddressDto {
  @IsString()
  @IsIn(['UTILITY_BILL', 'BANK_STATEMENT', 'TENANCY_AGREEMENT'])
  proofType!: string;

  @IsString()
  @IsNotEmpty()
  proofReference!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
