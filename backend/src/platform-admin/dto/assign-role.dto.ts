import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { UserRole } from '../../users/entities/user.entity';

export class AssignRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  department?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

