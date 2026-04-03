import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MinLength
} from 'class-validator';

export class CreateUserDto {
  @IsPhoneNumber('NG')
  phoneNumber!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{4}|\d{6})$/, {
    message: 'pin must be exactly 4 or 6 digits'
  })
  pin?: string;

  @IsOptional()
  @IsBoolean()
  usePhoneAsAccountNumber?: boolean;
}
