import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendOtpDto {
  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  purpose!: string;

  @IsOptional()
  @IsIn(['sms', 'email'])
  channel?: 'sms' | 'email';
}
