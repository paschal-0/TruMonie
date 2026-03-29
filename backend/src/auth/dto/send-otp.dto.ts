import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  destination!: string;

  @IsString()
  @IsNotEmpty()
  purpose!: string;

  @IsIn(['sms', 'email'])
  channel!: 'sms' | 'email';
}
