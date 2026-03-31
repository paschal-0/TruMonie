import { IsDateString, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class ValidateNinDto {
  @IsString()
  @IsNotEmpty()
  @Length(11, 11)
  nin!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}
