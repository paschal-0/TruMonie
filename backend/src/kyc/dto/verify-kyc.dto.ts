import { IsDateString, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class VerifyKycDto {
  @IsString()
  @IsNotEmpty()
  @Length(11, 11)
  bvn!: string;

  @IsString()
  @IsNotEmpty()
  nin!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  selfieUrl?: string;
}
