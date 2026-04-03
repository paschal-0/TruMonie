import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResolvePendingActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

