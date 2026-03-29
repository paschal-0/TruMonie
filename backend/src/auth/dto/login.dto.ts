import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string; // email or phone

  @IsString()
  @MinLength(8)
  password!: string;
}
