import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class UpdateGroupScheduleDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  payoutIntervalDays?: number;
}
