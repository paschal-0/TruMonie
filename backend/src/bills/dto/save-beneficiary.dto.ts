import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SaveBeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  productCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  destination!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nickname!: string;
}
