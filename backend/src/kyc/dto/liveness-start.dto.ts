import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LivenessStartDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  sessionType!: string;
}
