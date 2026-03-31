import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetLoginPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  currentPassword?: string;
}
