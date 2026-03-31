import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class VerifyGovernmentIdDto {
  @IsString()
  @IsIn(['INTERNATIONAL_PASSPORT', 'DRIVERS_LICENSE', 'VOTERS_CARD', 'NATIONAL_ID'])
  documentType!: string;

  @IsString()
  @IsNotEmpty()
  documentNumber!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  faceMatchScore!: number;

  @IsOptional()
  @IsString()
  selfieUrl?: string;
}
