import { IsNotEmpty, IsUUID, IsString } from 'class-validator';

export class ReplaceMemberDto {
  @IsUUID()
  memberId!: string;

  @IsString()
  @IsNotEmpty()
  newUserIdentifier!: string; // email/phone/username
}
