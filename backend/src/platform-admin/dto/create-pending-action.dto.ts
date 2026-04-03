import { IsNotEmpty, IsObject, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePendingActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  action_type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  resource_type!: string;

  @IsUUID()
  resource_id!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

