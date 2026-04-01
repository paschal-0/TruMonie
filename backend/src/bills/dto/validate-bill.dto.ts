import {
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsString,
  MaxLength
} from 'class-validator';

export class ValidateBillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  biller_id!: string;

  @IsObject()
  @IsNotEmptyObject()
  fields!: Record<string, string>;
}

