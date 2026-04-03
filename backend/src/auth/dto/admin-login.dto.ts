import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'mfa_code must be 6 digits' })
  mfa_code?: string;
}

