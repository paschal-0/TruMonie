import { IsDateString, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class ValidateBvnDto {
  @IsString()
  @IsNotEmpty()
  @Length(11, 11)
  bvn!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
