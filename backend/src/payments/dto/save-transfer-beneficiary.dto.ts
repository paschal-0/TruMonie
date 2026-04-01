import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SaveTransferBeneficiaryDto {
  @IsString()
  @Matches(/^\d{10}$/)
  account_number!: string;

  @IsString()
  @Matches(/^\d{3}$/)
  bank_code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  account_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  alias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_name?: string;
}
