import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BankResolveDto {
  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  provider?: string;
}
