import { IsBoolean } from 'class-validator';

export class UpdateAdminStatusDto {
  @IsBoolean()
  is_active!: boolean;
}

export class UpdateAdminMfaDto {
  @IsBoolean()
  mfa_enabled!: boolean;
}

