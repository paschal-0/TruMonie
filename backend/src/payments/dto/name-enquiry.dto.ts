import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class NameEnquiryDto {
  @IsString()
  @Matches(/^\d{3}$/)
  destination_bank_code!: string;

  @IsString()
  @Matches(/^\d{10}$/)
  account_number!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  provider?: string;
}
