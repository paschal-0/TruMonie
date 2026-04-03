import { IsOptional, IsString, Matches } from 'class-validator';

export class SetTransactionPinDto {
  @IsString()
  @Matches(/^(\d{4}|\d{6})$/, {
    message: 'pin must be exactly 4 or 6 digits'
  })
  pin!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{4}|\d{6})$/, {
    message: 'currentPin must be exactly 4 or 6 digits'
  })
  currentPin?: string;
}
